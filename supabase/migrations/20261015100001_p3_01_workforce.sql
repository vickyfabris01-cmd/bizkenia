-- supabase/migrations/20261015100001_p3_01_workforce.sql — NEW FILE
--
-- AIM
-- Phase 3, step 1: workers (security, cleaners, maintenance ...) of a rental business.
--  * a new member role "worker" (is_staff() stays owner/manager only, so workers see no business data)
--  * the old workers / attendance / worker_payments tables get business-membership rules
--  * staff manage workers; a worker reads only their own rows and checks themselves in and out
--  * every multi-row write goes through a SECURITY DEFINER function
-- Tables keep the column name tenant_id (it holds the business id), like the other rental tables.

alter table business_members drop constraint if exists business_members_role_check;
alter table business_members add constraint business_members_role_check
  check (role in ('owner','manager','resident','worker'));

alter table workers add column if not exists email text;
alter table attendance add column if not exists check_in timestamptz;
alter table attendance add column if not exists check_out timestamptz;
create unique index if not exists uq_worker_user_business on workers (tenant_id, user_id) where user_id is not null and status = 'active';

-- Phase 3 notification types (workers, messages, support tickets)
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in
  ('billing','payment','complaint','announcement','system','invite','transfer','business_submitted','business_to_review',
   'business_approved','business_rejected','business_suspended','rental_request','offer','tenancy','worker','message','ticket'));

-- helper: is the caller a worker of this business?
create or replace function is_worker_of(bid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from business_members where business_id = bid and user_id = auth.uid()
                 and status = 'active' and role = 'worker');
$$;

-- ---------- row level security ----------
drop policy if exists workers_manager on workers;
drop policy if exists workers_self on workers;
drop policy if exists worker_payments_manager on worker_payments;
drop policy if exists worker_payments_self on worker_payments;
drop policy if exists attendance_manager on attendance;
drop policy if exists attendance_self on attendance;

drop policy if exists workers_staff on workers; drop policy if exists worker_payments_staff on worker_payments; drop policy if exists attendance_staff on attendance;
create policy workers_staff on workers for all to authenticated
  using (is_staff(tenant_id)) with check (is_staff(tenant_id));
create policy workers_self on workers for select to authenticated using (user_id = auth.uid());
create policy worker_payments_staff on worker_payments for all to authenticated
  using (is_staff(tenant_id)) with check (is_staff(tenant_id));
create policy worker_payments_self on worker_payments for select to authenticated
  using (worker_id in (select id from workers where user_id = auth.uid()));
create policy attendance_staff on attendance for all to authenticated
  using (is_staff(tenant_id)) with check (is_staff(tenant_id));
create policy attendance_self on attendance for select to authenticated
  using (worker_id in (select id from workers where user_id = auth.uid()));

-- ---------- functions ----------
create or replace function add_worker(p_business uuid, p_email text, p_name text, p_phone text, p_role text,
                                      p_salary numeric, p_pay_cycle text, p_start date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_email text := nullif(lower(trim(coalesce(p_email,''))), ''); v_user uuid; v_id uuid;
begin
  perform _need_staff(p_business);
  if coalesce(trim(p_name),'') = '' then raise exception 'Enter the worker''s name'; end if;
  if p_salary is null or p_salary < 0 then raise exception 'Enter the salary'; end if;
  if v_email is not null then
    select id into v_user from profiles where lower(email) = v_email;
    if v_user is not null and exists (select 1 from business_members where business_id = p_business and user_id = v_user
                                      and status = 'active' and role in ('owner','manager','resident')) then
      raise exception 'That person is already an owner, manager or resident here';
    end if;
  end if;
  insert into workers (tenant_id, user_id, full_name, phone, email, role, salary, pay_cycle, status, start_date)
  values (p_business, v_user, trim(p_name), nullif(trim(coalesce(p_phone,'')),''), v_email, p_role, p_salary,
          coalesce(p_pay_cycle,'monthly'), 'active', coalesce(p_start, current_date))
  returning id into v_id;
  if v_user is not null then
    insert into business_members (business_id, user_id, role, status) values (p_business, v_user, 'worker', 'active')
    on conflict (business_id, user_id) do update set role = 'worker', status = 'active';
    perform _note(v_user, p_business, 'worker', 'You have been added as a worker',
                  'Open your worker portal to check in and see your pay.', '/app/' || _slug(p_business));
  end if;
  return v_id;
end $$;

-- called after sign-in: links a worker row created with an email before the person had an account
create or replace function claim_worker_links() returns integer
language plpgsql security definer set search_path = public as $$
declare v_email text; r record; n integer := 0;
begin
  if auth.uid() is null then return 0; end if;
  select lower(email) into v_email from profiles where id = auth.uid();
  if v_email is null then return 0; end if;
  for r in select * from workers where user_id is null and lower(email) = v_email and status = 'active' loop
    if exists (select 1 from business_members where business_id = r.tenant_id and user_id = auth.uid()
               and status = 'active' and role in ('owner','manager','resident')) then continue; end if;
    update workers set user_id = auth.uid() where id = r.id;
    insert into business_members (business_id, user_id, role, status) values (r.tenant_id, auth.uid(), 'worker', 'active')
    on conflict (business_id, user_id) do update set role = 'worker', status = 'active';
    perform _note(auth.uid(), r.tenant_id, 'worker', 'You have been added as a worker',
                  'Open your worker portal to check in and see your pay.', '/app/' || _slug(r.tenant_id));
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function set_worker_status(p_worker uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare w workers;
begin
  select * into w from workers where id = p_worker for update;
  if w.id is null then raise exception 'Worker not found'; end if;
  perform _need_staff(w.tenant_id);
  if p_status not in ('active','inactive','terminated') then raise exception 'Unknown status'; end if;
  update workers set status = p_status, end_date = case when p_status = 'active' then null else coalesce(end_date, current_date) end
   where id = p_worker;
  if w.user_id is not null then
    update business_members set status = case when p_status = 'active' then 'active' else 'removed' end
     where business_id = w.tenant_id and user_id = w.user_id and role = 'worker';
  end if;
end $$;

create or replace function mark_attendance(p_worker uuid, p_date date, p_status text, p_notes text default null) returns void
language plpgsql security definer set search_path = public as $$
declare w workers;
begin
  select * into w from workers where id = p_worker;
  if w.id is null then raise exception 'Worker not found'; end if;
  perform _need_staff(w.tenant_id);
  if p_status not in ('present','absent','half_day','leave') then raise exception 'Unknown attendance status'; end if;
  insert into attendance (tenant_id, worker_id, date, status, notes, recorded_by)
  values (w.tenant_id, p_worker, coalesce(p_date, current_date), p_status, p_notes, auth.uid())
  on conflict (worker_id, date) do update set status = excluded.status, notes = excluded.notes, recorded_by = auth.uid();
end $$;

create or replace function pay_worker(p_worker uuid, p_amount numeric, p_start date, p_end date, p_method text, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare w workers; v_id uuid;
begin
  select * into w from workers where id = p_worker;
  if w.id is null then raise exception 'Worker not found'; end if;
  perform _need_staff(w.tenant_id);
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount above zero'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'Choose the pay period'; end if;
  if p_method not in ('mpesa','cash','bank_transfer','other') then raise exception 'Unknown payment method'; end if;
  insert into worker_payments (tenant_id, worker_id, amount, period_start, period_end, payment_method, payment_status, paid_at, recorded_by, notes)
  values (w.tenant_id, p_worker, p_amount, p_start, p_end, p_method, 'paid', now(), auth.uid(), p_notes)
  returning id into v_id;
  if w.user_id is not null then
    perform _note(w.user_id, w.tenant_id, 'worker', 'Salary paid',
                  'KSh ' || to_char(p_amount, 'FM999,999,999') || ' for ' || to_char(p_start, 'DD Mon') || ' to ' || to_char(p_end, 'DD Mon YYYY'), null);
  end if;
  return v_id;
end $$;

-- worker checks themselves in / out for today
create or replace function worker_check_in(p_business uuid) returns void
language plpgsql security definer set search_path = public as $$
declare w workers;
begin
  select * into w from workers where tenant_id = p_business and user_id = auth.uid() and status = 'active';
  if w.id is null then raise exception 'You are not an active worker here'; end if;
  insert into attendance (tenant_id, worker_id, date, status, check_in, recorded_by)
  values (p_business, w.id, current_date, 'present', now(), auth.uid())
  on conflict (worker_id, date) do update
    set check_in = coalesce(attendance.check_in, now()), status = 'present'
    where attendance.check_out is null;
end $$;

create or replace function worker_check_out(p_business uuid) returns void
language plpgsql security definer set search_path = public as $$
declare w workers; n integer;
begin
  select * into w from workers where tenant_id = p_business and user_id = auth.uid() and status = 'active';
  if w.id is null then raise exception 'You are not an active worker here'; end if;
  update attendance set check_out = now() where worker_id = w.id and date = current_date and check_in is not null and check_out is null;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Check in first'; end if;
end $$;

-- payroll for one month: what each worker is owed, what was paid
create or replace function payroll_summary(p_business uuid, p_month date default current_date)
returns table (worker_id uuid, full_name text, role text, status text, salary numeric, pay_cycle text,
               days_present integer, days_absent integer, paid numeric, outstanding numeric)
language plpgsql stable security definer set search_path = public as $$
declare m0 date := date_trunc('month', p_month)::date; m1 date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  perform _need_staff(p_business);
  return query
  select w.id, w.full_name, w.role, w.status, w.salary, w.pay_cycle,
         coalesce((select count(*)::int from attendance a where a.worker_id = w.id and a.date between m0 and m1 and a.status in ('present','half_day')), 0),
         coalesce((select count(*)::int from attendance a where a.worker_id = w.id and a.date between m0 and m1 and a.status = 'absent'), 0),
         coalesce((select sum(p.amount) from worker_payments p where p.worker_id = w.id and p.payment_status = 'paid'
                    and p.paid_at::date between m0 and m1), 0),
         greatest(case when w.status = 'active' then
           w.salary * (case w.pay_cycle when 'weekly' then 4 when 'biweekly' then 2 else 1 end) else 0 end
           - coalesce((select sum(p.amount) from worker_payments p where p.worker_id = w.id and p.payment_status = 'paid'
                        and p.paid_at::date between m0 and m1), 0), 0)
  from workers w where w.tenant_id = p_business and (w.status = 'active' or exists
        (select 1 from worker_payments p where p.worker_id = w.id and p.paid_at::date between m0 and m1))
  order by w.full_name;
end $$;

revoke all on function add_worker(uuid,text,text,text,text,numeric,text,date), claim_worker_links(),
  set_worker_status(uuid,text), mark_attendance(uuid,date,text,text), pay_worker(uuid,numeric,date,date,text,text),
  worker_check_in(uuid), worker_check_out(uuid), payroll_summary(uuid,date), is_worker_of(uuid) from public, anon;
grant execute on function add_worker(uuid,text,text,text,text,numeric,text,date), claim_worker_links(),
  set_worker_status(uuid,text), mark_attendance(uuid,date,text,text), pay_worker(uuid,numeric,date,date,text,text),
  worker_check_in(uuid), worker_check_out(uuid), payroll_summary(uuid,date), is_worker_of(uuid) to authenticated;
