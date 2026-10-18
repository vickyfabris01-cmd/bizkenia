-- supabase/migrations/20261018100003_p5_07_platform_views.sql — NEW FILE
-- Runs AFTER 20261018100001_p5_05 and 20261018100002_p5_06 (phase 5 step 2): it reads payment_intents.order_id from p5_06.
-- Phase 5, step 3 (platform finance): the numbers behind /admin/transactions, /admin/revenue,
-- /admin/reports and /admin/audit, the maintenance and commission settings, the audit trail for
-- money and account changes, and the report views for the shop owner's Reports screen.
-- Safe to run twice. Nothing here changes an existing table's columns.
--
-- WHY FUNCTIONS AND NOT PLAIN VIEWS FOR THE ADMIN SCREENS
-- Money lives in three places (payment_intents, the rental payments table, shop orders) and the
-- rental policies do not let a super admin read another business's payments. So the admin screens
-- read through functions that (1) check the caller is a super admin, then (2) read the tables with
-- the function owner's rights. Nobody else can call them, and no table policy is loosened.

-- ---- 1. settings ------------------------------------------------------------------------
-- maintenance: public (the site must know to show the maintenance page before anyone signs in).
-- finance:     private. The commission percent is STORED AND SHOWN ONLY; nothing is charged from it
--              (revenue is subscription only, as the build plan's defaults say).
insert into platform_settings (key, value, is_public) values
  ('maintenance', '{"enabled": false, "message": ""}', true),
  ('finance',     '{"commission_percent": 0}',          false)
on conflict (key) do nothing;

-- ---- 2. one internal list of every money event ---------------------------------------------
-- kind    subscription | rent | order
-- status  success | pending | failed | reversed      (reversed also covers refunded)
-- A rent payment made by STK push exists twice in the database (the payment intent and the rental
-- payment it created). Only the intent is listed; rental payments are listed only when they have no
-- intent (cash, bank transfer, paybill recorded by staff). Shop orders are listed here only when
-- they were paid on delivery; an M-Pesa order is listed through its payment intent (purpose 'order').
create or replace view _platform_money as
  select 'i:' || pi.id::text as id,
         pi.purpose::text as kind,
         pi.business_id,
         pr.full_name::text as payer_name,
         pi.phone::text as payer_phone,
         pi.amount_kes::numeric as amount,
         (case when exists (select 1 from payments rp where rp.intent_id = pi.id and rp.payment_status = 'reversed') then 'reversed'
               when pi.status = 'success' then 'success'
               when pi.status = 'pending' then 'pending'
               else 'failed' end)::text as status,
         pi.method::text as method,
         pi.mpesa_receipt::text as receipt,
         null::text as reference,
         coalesce(pi.result_desc, pi.note)::text as note,
         pi.created_at as occurred_at,
         'payment_intent'::text as source
    from payment_intents pi
    left join profiles pr on pr.id = pi.user_id
  union all
  select 'p:' || p.id::text,
         'rent',
         p.tenant_id,
         coalesce(p.payer_name, pr.full_name)::text,
         p.payer_phone::text,
         p.amount::numeric,
         (case p.payment_status when 'confirmed' then 'success' when 'pending' then 'pending' when 'reversed' then 'reversed' else 'failed' end)::text,
         p.payment_method::text,
         p.mpesa_receipt::text,
         p.reference::text,
         p.notes::text,
         coalesce(p.paid_at, p.created_at),
         'rental_payment'
    from payments p
    left join profiles pr on pr.id = p.client_id
   where p.intent_id is null
  union all
  select 'o:' || o.id::text,
         'order',
         o.business_id,
         o.customer_name::text,
         o.customer_phone::text,
         o.total::numeric,
         (case o.payment_status when 'paid' then 'success' else 'reversed' end)::text,
         o.payment_method::text,
         null::text,
         o.order_number::text,
         null::text,
         coalesce(o.paid_at, o.created_at),
         'order'
    from orders o
   where o.payment_status in ('paid', 'refunded')
     and (o.payment_method = 'cash_on_delivery'
          -- an M-Pesa order the shop confirmed by hand (seller_mark_order_paid) has no successful intent
          or not exists (select 1 from payment_intents x where x.order_id = o.id and x.status = 'success'));

revoke all on _platform_money from public, anon, authenticated;

-- ---- 3. transactions ------------------------------------------------------------------------
create or replace function admin_transactions(
  p_kind text default null, p_status text default null,
  p_from date default null, p_to date default null,
  p_search text default null, p_limit int default 25, p_offset int default 0)
returns table (id text, kind text, business_id uuid, business_name text, business_type text,
               payer_name text, payer_phone text, amount numeric, status text, method text,
               receipt text, reference text, note text, occurred_at timestamptz, source text, total_count bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare term text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not coalesce(is_super_admin(), false) then raise exception 'Only a super admin can do this' using errcode = '42501'; end if;
  return query
  select m.id, m.kind, m.business_id, b.name::text, b.business_type::text, m.payer_name, m.payer_phone, m.amount, m.status,
         m.method, m.receipt, m.reference, m.note, m.occurred_at, m.source, count(*) over()
    from _platform_money m
    left join businesses b on b.id = m.business_id
   where (nullif(p_kind, '') is null or m.kind = p_kind)
     and (nullif(p_status, '') is null or m.status = p_status)
     and (p_from is null or m.occurred_at >= p_from::timestamptz)
     and (p_to is null or m.occurred_at < (p_to + 1)::timestamptz)
     and (term is null or b.name ilike '%' || term || '%' or m.receipt ilike '%' || term || '%'
          or m.payer_name ilike '%' || term || '%' or m.payer_phone ilike '%' || term || '%' or m.reference ilike '%' || term || '%')
   order by m.occurred_at desc, m.id
   limit least(greatest(coalesce(p_limit, 25), 1), 5000) offset greatest(coalesce(p_offset, 0), 0);
end $$;

-- Totals for the tiles above the list. Date and kind filters apply; status and search do not.
create or replace function admin_transaction_totals(p_from date default null, p_to date default null, p_kind text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not coalesce(is_super_admin(), false) then raise exception 'Only a super admin can do this' using errcode = '42501'; end if;
  with f as (
    select m.kind, m.status, m.amount from _platform_money m
     where (nullif(p_kind, '') is null or m.kind = p_kind)
       and (p_from is null or m.occurred_at >= p_from::timestamptz)
       and (p_to is null or m.occurred_at < (p_to + 1)::timestamptz))
  select jsonb_build_object(
    'count',          (select count(*) from f),
    'volume',         (select coalesce(sum(amount), 0) from f where status = 'success'),
    'success_count',  (select count(*) from f where status = 'success'),
    'pending_count',  (select count(*) from f where status = 'pending'),
    'pending_amount', (select coalesce(sum(amount), 0) from f where status = 'pending'),
    'failed_count',   (select count(*) from f where status = 'failed'),
    'reversed_count', (select count(*) from f where status = 'reversed'),
    'reversed_amount',(select coalesce(sum(amount), 0) from f where status = 'reversed'),
    'by_kind', (select coalesce(jsonb_object_agg(k.kind, jsonb_build_object('count', k.n, 'volume', k.v)), '{}'::jsonb)
                  from (select kind, count(*) as n, coalesce(sum(amount) filter (where status = 'success'), 0) as v from f group by kind) k)
  ) into r;
  return r;
end $$;

-- ---- 4. subscription revenue -----------------------------------------------------------------
create or replace function admin_revenue_summary()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb; v_month timestamptz := date_trunc('month', now());
begin
  if not coalesce(is_super_admin(), false) then raise exception 'Only a super admin can do this' using errcode = '42501'; end if;
  with s as (select m.business_id, m.amount, m.occurred_at from _platform_money m where m.kind = 'subscription' and m.status = 'success')
  select jsonb_build_object(
    'this_month',   (select coalesce(sum(amount), 0) from s where occurred_at >= v_month),
    'last_month',   (select coalesce(sum(amount), 0) from s where occurred_at >= v_month - interval '1 month' and occurred_at < v_month),
    'twelve_months',(select coalesce(sum(amount), 0) from s where occurred_at >= v_month - interval '11 months'),
    'all_time',     (select coalesce(sum(amount), 0) from s),
    'payments',     (select count(*) from s),
    'paying_businesses', (select count(distinct business_id) from s),
    'active_subscriptions', (select count(*) from business_subscriptions where status = 'active' and period_end > now()),
    'expiring_soon',        (select count(*) from business_subscriptions where status = 'active' and period_end > now() and period_end <= now() + interval '7 days')
  ) into r;
  return r;
end $$;

create or replace function admin_revenue_monthly(p_months int default 12)
returns table (month date, revenue numeric, payments bigint, paying_businesses bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not coalesce(is_super_admin(), false) then raise exception 'Only a super admin can do this' using errcode = '42501'; end if;
  return query
  select g.month, coalesce(sum(x.amount), 0), count(x.id), count(distinct x.business_id)
    from (select generate_series(date_trunc('month', now()) - make_interval(months => least(greatest(coalesce(p_months, 12), 1), 36) - 1),
                                 date_trunc('month', now()), interval '1 month')::date as month) g
    left join _platform_money x on date_trunc('month', x.occurred_at)::date = g.month and x.kind = 'subscription' and x.status = 'success'
   group by g.month order by g.month;
end $$;

create or replace function admin_revenue_by_type(p_months int default 12)
returns table (business_type text, revenue numeric, payments bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not coalesce(is_super_admin(), false) then raise exception 'Only a super admin can do this' using errcode = '42501'; end if;
  return query
  select coalesce(b.business_type, 'unknown')::text, coalesce(sum(x.amount), 0), count(*)
    from _platform_money x left join businesses b on b.id = x.business_id
   where x.kind = 'subscription' and x.status = 'success'
     and x.occurred_at >= date_trunc('month', now()) - make_interval(months => least(greatest(coalesce(p_months, 12), 1), 36) - 1)
   group by 1 order by 2 desc;
end $$;

-- ---- 5. growth, mix, volume, top businesses (Reports and analytics) ----------------------------------
create or replace function admin_growth_monthly(p_months int default 12)
returns table (month date, new_users bigint, new_businesses bigint, approved_businesses bigint, users_total bigint, businesses_total bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not coalesce(is_super_admin(), false) then raise exception 'Only a super admin can do this' using errcode = '42501'; end if;
  return query
  select g.month,
         (select count(*) from profiles p where date_trunc('month', p.created_at)::date = g.month),
         (select count(*) from businesses b where date_trunc('month', b.created_at)::date = g.month),
         (select count(*) from businesses b where b.approved_at is not null and date_trunc('month', b.approved_at)::date = g.month),
         (select count(*) from profiles p where p.created_at < g.month + interval '1 month'),
         (select count(*) from businesses b where b.created_at < g.month + interval '1 month')
    from (select generate_series(date_trunc('month', now()) - make_interval(months => least(greatest(coalesce(p_months, 12), 1), 36) - 1),
                                 date_trunc('month', now()), interval '1 month')::date as month) g
   order by g.month;
end $$;

create or replace function admin_business_mix()
returns table (business_type text, status text, businesses bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not coalesce(is_super_admin(), false) then raise exception 'Only a super admin can do this' using errcode = '42501'; end if;
  return query
  select b.business_type::text, b.status::text, count(*) from businesses b group by 1, 2 order by 1, 2;
end $$;

create or replace function admin_monthly_volume(p_months int default 12)
returns table (month date, subscription numeric, rent numeric, shop_orders numeric, payments bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not coalesce(is_super_admin(), false) then raise exception 'Only a super admin can do this' using errcode = '42501'; end if;
  return query
  select g.month,
         coalesce(sum(x.amount) filter (where x.kind = 'subscription'), 0),
         coalesce(sum(x.amount) filter (where x.kind = 'rent'), 0),
         coalesce(sum(x.amount) filter (where x.kind = 'order'), 0),
         count(x.id)
    from (select generate_series(date_trunc('month', now()) - make_interval(months => least(greatest(coalesce(p_months, 12), 1), 36) - 1),
                                 date_trunc('month', now()), interval '1 month')::date as month) g
    left join _platform_money x on date_trunc('month', x.occurred_at)::date = g.month and x.status = 'success'
   group by g.month order by g.month;
end $$;

-- Money that passed through each business (rent collected, shop sales paid) in the last p_months,
-- plus what it paid the platform in subscriptions. The platform keeps only the subscription.
create or replace function admin_top_businesses(p_limit int default 10, p_months int default 12)
returns table (business_id uuid, name text, business_type text, county text, money_handled numeric, payments bigint, subscription_paid numeric, last_payment timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not coalesce(is_super_admin(), false) then raise exception 'Only a super admin can do this' using errcode = '42501'; end if;
  return query
  select b.id, b.name::text, b.business_type::text, b.county::text,
         coalesce(sum(x.amount) filter (where x.kind in ('rent', 'order')), 0),
         count(*) filter (where x.kind in ('rent', 'order')),
         coalesce(sum(x.amount) filter (where x.kind = 'subscription'), 0),
         max(x.occurred_at)
    from businesses b
    join _platform_money x on x.business_id = b.id and x.status = 'success'
     and x.occurred_at >= date_trunc('month', now()) - make_interval(months => least(greatest(coalesce(p_months, 12), 1), 36) - 1)
   group by b.id, b.name, b.business_type, b.county
   order by 5 desc, 7 desc
   limit least(greatest(coalesce(p_limit, 10), 1), 100);
end $$;

-- ---- 6. audit log feed ------------------------------------------------------------------------------
create or replace function admin_audit_feed(
  p_entity text default null, p_action text default null,
  p_from date default null, p_to date default null,
  p_search text default null, p_limit int default 25, p_offset int default 0)
returns table (id uuid, actor_id uuid, actor_name text, actor_email text, action text, entity text, entity_id text,
               entity_label text, before jsonb, after jsonb, created_at timestamptz, total_count bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare term text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not coalesce(is_super_admin(), false) then raise exception 'Only a super admin can do this' using errcode = '42501'; end if;
  return query
  select a.id, a.actor_id, ap.full_name::text, ap.email::text, a.action, a.entity, a.entity_id,
         coalesce(b.name, up.full_name, up.email, sp.name, pb.name)::text,
         a.before, a.after, a.created_at, count(*) over()
    from audit_log a
    left join profiles ap on ap.id = a.actor_id
    left join businesses b on a.entity = 'business' and b.id::text = a.entity_id
    left join profiles up on a.entity = 'user' and up.id::text = a.entity_id
    left join subscription_plans sp on a.entity = 'subscription_plan' and sp.id::text = a.entity_id
    left join businesses pb on a.entity = 'payment' and pb.id::text = coalesce(a.after ->> 'business_id', a.before ->> 'business_id')
   where (nullif(p_entity, '') is null or a.entity = p_entity)
     and (nullif(p_action, '') is null or a.action = p_action)
     and (p_from is null or a.created_at >= p_from::timestamptz)
     and (p_to is null or a.created_at < (p_to + 1)::timestamptz)
     and (term is null or a.action ilike '%' || term || '%' or ap.full_name ilike '%' || term || '%' or ap.email ilike '%' || term || '%'
          or coalesce(b.name, up.full_name, up.email, sp.name, pb.name, a.entity_id) ilike '%' || term || '%')
   order by a.created_at desc, a.id
   limit least(greatest(coalesce(p_limit, 25), 1), 5000) offset greatest(coalesce(p_offset, 0), 0);
end $$;

grant execute on function admin_transactions(text, text, date, date, text, int, int),
  admin_transaction_totals(date, date, text), admin_revenue_summary(), admin_revenue_monthly(int), admin_revenue_by_type(int),
  admin_growth_monthly(int), admin_business_mix(), admin_monthly_volume(int), admin_top_businesses(int, int),
  admin_audit_feed(text, text, date, date, text, int, int) to authenticated;
revoke execute on function admin_transactions(text, text, date, date, text, int, int),
  admin_transaction_totals(date, date, text), admin_revenue_summary(), admin_revenue_monthly(int), admin_revenue_by_type(int),
  admin_growth_monthly(int), admin_business_mix(), admin_monthly_volume(int), admin_top_businesses(int, int),
  admin_audit_feed(text, text, date, date, text, int, int) from public, anon;

-- ---- 7. more of the platform's history goes into the audit log ------------------------------------------
-- Phase 1 already records business status changes and platform setting changes. These add plan prices,
-- money events and account changes. actor_id is empty when the change came from the M-Pesa callback
-- (the screen shows it as "System").
create or replace function _jsonb_changed(a jsonb, b jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(a) e where b -> e.key is distinct from e.value;
$$;

create or replace function audit_plan_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into audit_log (actor_id, action, entity, entity_id, before, after)
    values (auth.uid(), 'plan.create', 'subscription_plan', new.id::text, null,
            jsonb_build_object('name', new.name, 'business_type', new.business_type, 'price_kes', new.price_kes, 'period_days', new.period_days, 'is_active', new.is_active));
  elsif to_jsonb(new) is distinct from to_jsonb(old) then
    insert into audit_log (actor_id, action, entity, entity_id, before, after)
    values (auth.uid(), 'plan.update', 'subscription_plan', new.id::text,
            _jsonb_changed(to_jsonb(old), to_jsonb(new)), _jsonb_changed(to_jsonb(new), to_jsonb(old)));
  end if;
  return new;
end $$;
drop trigger if exists trg_audit_plan on subscription_plans;
create trigger trg_audit_plan after insert or update on subscription_plans for each row execute function audit_plan_change();

create or replace function audit_payment_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.method = 'manual' then
    insert into audit_log (actor_id, action, entity, entity_id, before, after)
    values (auth.uid(), 'payment.recorded', 'payment', new.id::text, null,
            jsonb_build_object('business_id', new.business_id, 'purpose', new.purpose, 'amount_kes', new.amount_kes, 'receipt', new.mpesa_receipt, 'note', new.note));
  end if;
  return new;
end $$;
drop trigger if exists trg_audit_payment_insert on payment_intents;
create trigger trg_audit_payment_insert after insert on payment_intents for each row execute function audit_payment_insert();

create or replace function audit_payment_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into audit_log (actor_id, action, entity, entity_id, before, after)
    values (auth.uid(), 'payment.status', 'payment', new.id::text,
            jsonb_build_object('status', old.status, 'business_id', new.business_id),
            jsonb_build_object('status', new.status, 'business_id', new.business_id, 'purpose', new.purpose, 'amount_kes', new.amount_kes,
                               'receipt', new.mpesa_receipt, 'reason', new.result_desc));
  end if;
  return new;
end $$;
drop trigger if exists trg_audit_payment_status on payment_intents;
create trigger trg_audit_payment_status after update on payment_intents for each row execute function audit_payment_status();

create or replace function audit_profile_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_active is distinct from old.is_active then
    insert into audit_log (actor_id, action, entity, entity_id, before, after)
    values (auth.uid(), 'user.active', 'user', new.id::text, jsonb_build_object('is_active', old.is_active), jsonb_build_object('is_active', new.is_active));
  end if;
  if new.role is distinct from old.role then
    insert into audit_log (actor_id, action, entity, entity_id, before, after)
    values (auth.uid(), 'user.role', 'user', new.id::text, jsonb_build_object('role', old.role), jsonb_build_object('role', new.role));
  end if;
  return new;
end $$;
drop trigger if exists trg_audit_profile on profiles;
create trigger trg_audit_profile after update of is_active, role on profiles for each row execute function audit_profile_change();

-- ---- 8. shop reports (the owner's Reports screen) ---------------------------------------------------------
-- Same pattern as the Phase 4 report views: they run with the caller's rights (security_invoker), so the
-- orders policies still decide who sees what; the screens always filter by business_id.
-- "Sales" leaves out cancelled orders (same rule as the shop dashboard). "Received" is money already paid.
create or replace view report_shop_monthly with (security_invoker = true) as
select business_id, date_trunc('month', created_at)::date as month,
       count(*) filter (where status <> 'cancelled') as orders,
       coalesce(sum(total) filter (where status <> 'cancelled'), 0) as sales,
       coalesce(sum(total) filter (where payment_status = 'paid'), 0) as received,
       count(*) filter (where status = 'cancelled') as cancelled
  from orders group by business_id, date_trunc('month', created_at);

create or replace view report_shop_status with (security_invoker = true) as
select business_id, status, count(*) as orders, coalesce(sum(total), 0) as total
  from orders group by business_id, status;

create or replace view report_shop_top_products with (security_invoker = true) as
select o.business_id, i.product_id, i.name, sum(i.quantity) as units, sum(i.line_total) as revenue, count(distinct o.id) as orders
  from order_items i join orders o on o.id = i.order_id
 where o.status <> 'cancelled'
 group by o.business_id, i.product_id, i.name;

grant select on report_shop_monthly, report_shop_status, report_shop_top_products to authenticated;
revoke all on report_shop_monthly, report_shop_status, report_shop_top_products from anon;
