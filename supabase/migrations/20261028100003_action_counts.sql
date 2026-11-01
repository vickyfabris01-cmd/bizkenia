-- 20261028100003_action_counts.sql — NEW FILE (Part 8, action count badges)
-- AIM: the small floating numbers on the menu ("3 pending") for the super admin and for each business dashboard.
--   1. nav_seen          which menu pages a person has already opened (so "new app errors" can clear itself).
--   2. admin_scan_state  the result of the latest "Unused files" scan, saved by the scan itself (the menu never scans R2).
--   3. admin_action_counts()                 super admin only: one count per admin menu item.
--   4. business_action_counts(p_business)    members only: one count per menu item of that business (staff see counts, a resident sees none).
--   5. mark_nav_seen(p_key) / save_scan_state(p_key, p_value)   the two writes the pages make.
--   6. log_client_error redefined (same signature): the same message on the same page within 60 seconds is ignored,
--      so a loop in one browser cannot fill the log and hide real errors. purge_client_errors(days) removes old rows.
-- Re-runnable. Run order: after 20261028100002* (whatever Part 7 adds) or straight after 20261027100005_login_attempts.sql.
-- Needs: is_super_admin(), is_staff(uuid), client_errors (20261019100001_p5_08_hardening.sql). Nothing is dropped.

-- 1. nav_seen ----------------------------------------------------------------------------------------------------
create table if not exists public.nav_seen (
  user_id uuid not null references auth.users(id) on delete cascade,
  key     text not null,
  seen_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.nav_seen enable row level security;
drop policy if exists nav_seen_own_read on public.nav_seen;
create policy nav_seen_own_read on public.nav_seen for select to authenticated using (user_id = auth.uid());
revoke all on public.nav_seen from public, anon, authenticated;
grant select on public.nav_seen to authenticated;
-- writes go through mark_nav_seen() only (no insert/update policy on purpose).

-- 2. admin_scan_state --------------------------------------------------------------------------------------------
create table if not exists public.admin_scan_state (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.admin_scan_state enable row level security;
drop policy if exists admin_scan_state_admin_read on public.admin_scan_state;
create policy admin_scan_state_admin_read on public.admin_scan_state for select to authenticated using (coalesce(public.is_super_admin(), false));
revoke all on public.admin_scan_state from public, anon, authenticated;
grant select on public.admin_scan_state to authenticated;

-- Saves the outcome of a scan, e.g. save_scan_state('unused_files', '{"count": 12, "bytes": 3400000}').
create or replace function public.save_scan_state(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(public.is_super_admin(), false) then raise exception 'Only a super admin can do this' using errcode = '42501'; end if;
  if p_key is null or p_key not in ('unused_files') then raise exception 'Unknown scan key' using errcode = '22023'; end if;
  insert into public.admin_scan_state (key, value, updated_at) values (p_key, coalesce(p_value, '{}'::jsonb), now())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;
end $$;
revoke all on function public.save_scan_state(text, jsonb) from public, anon;
grant execute on function public.save_scan_state(text, jsonb) to authenticated;

-- 3. mark_nav_seen -----------------------------------------------------------------------------------------------
-- "I have looked at this page": errors and files are the two pages whose badge clears when opened.
create or replace function public.mark_nav_seen(p_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in' using errcode = '42501'; end if;
  if not coalesce(public.is_super_admin(), false) then raise exception 'Only a super admin can do this' using errcode = '42501'; end if;
  if p_key is null or p_key not in ('errors', 'files') then raise exception 'Unknown menu key' using errcode = '22023'; end if;
  insert into public.nav_seen (user_id, key, seen_at) values (auth.uid(), p_key, now())
  on conflict (user_id, key) do update set seen_at = excluded.seen_at;
end $$;
revoke all on function public.mark_nav_seen(text) from public, anon;
grant execute on function public.mark_nav_seen(text) to authenticated;

-- 4. admin_action_counts -----------------------------------------------------------------------------------------
--   businesses  businesses waiting for approval (status 'pending')
--   errors      different app errors reported since the admin last opened the errors page (first time: last 7 days)
--   files       unused files found by the latest scan, until the admin opens the page (never scans storage itself)
--   support     support tickets that are still open (waiting for an answer from support)
create or replace function public.admin_action_counts()
returns table (nav_key text, n bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_err_seen   timestamptz;
  v_files_seen timestamptz;
  v_scan       record;
begin
  if not coalesce(public.is_super_admin(), false) then raise exception 'Only a super admin can do this' using errcode = '42501'; end if;
  select seen_at into v_err_seen   from public.nav_seen where user_id = auth.uid() and key = 'errors';
  select seen_at into v_files_seen from public.nav_seen where user_id = auth.uid() and key = 'files';
  select value, updated_at into v_scan from public.admin_scan_state where key = 'unused_files';

  return query select 'businesses'::text, (select count(*) from public.businesses where status = 'pending');
  return query select 'errors'::text,
    (select count(distinct e.message) from public.client_errors e
      where e.created_at > coalesce(v_err_seen, now() - interval '7 days') and e.created_at > now() - interval '30 days');
  return query select 'files'::text,
    case when v_scan.updated_at is not null and (v_files_seen is null or v_scan.updated_at > v_files_seen)
         then greatest(coalesce((v_scan.value ->> 'count')::bigint, 0), 0) else 0 end;
  return query select 'support'::text, (select count(*) from public.support_tickets where status = 'open');
end $$;
revoke all on function public.admin_action_counts() from public, anon;
grant execute on function public.admin_action_counts() to authenticated;

-- 5. business_action_counts --------------------------------------------------------------------------------------
-- The nav_key is the id of the menu item in src/modules/<type>/index.js.
--   rental-requests  rental requests waiting for a decision (pending)
--   invoices         invoices marked overdue
--   complaints       complaints that are open or in progress
--   transfers        room transfer requests waiting (pending)
--   orders           new orders: awaiting payment or paid but not yet taken on (shop and farm)
--   tasks            farm tasks still open that are due today or earlier (Nairobi date)
-- Only owners and managers get numbers. A resident or worker is a member but gets an empty answer.
create or replace function public.business_action_counts(p_business uuid)
returns table (nav_key text, n bigint)
language plpgsql stable security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Africa/Nairobi')::date;
begin
  if auth.uid() is null then raise exception 'Please sign in' using errcode = '42501'; end if;
  if not exists (select 1 from public.business_members where business_id = p_business and user_id = auth.uid() and status = 'active') then
    raise exception 'Only members of this business can do this' using errcode = '42501';
  end if;
  if not coalesce(public.is_staff(p_business), false) then return; end if;

  return query select 'rental-requests'::text, (select count(*) from public.rental_requests where tenant_id = p_business and status = 'pending');
  return query select 'invoices'::text,        (select count(*) from public.billing_cycles  where tenant_id = p_business and status = 'overdue');
  return query select 'complaints'::text,      (select count(*) from public.complaints      where tenant_id = p_business and status in ('open', 'in_progress'));
  return query select 'transfers'::text,       (select count(*) from public.room_transfers  where tenant_id = p_business and status = 'pending');
  return query select 'orders'::text,          (select count(*) from public.orders          where business_id = p_business and status in ('pending_payment', 'paid'));
  return query select 'tasks'::text,           (select count(*) from public.farm_tasks      where business_id = p_business and status = 'open' and due_date is not null and due_date <= v_today);
end $$;
revoke all on function public.business_action_counts(uuid) from public, anon;
grant execute on function public.business_action_counts(uuid) to authenticated;

-- 6. log_client_error: ignore a repeat, keep every other rule ------------------------------------------------------
create index if not exists idx_client_errors_msg_url on public.client_errors (message, url, created_at desc);

create or replace function log_client_error(p_message text, p_stack text default null, p_url text default null, p_agent text default null, p_release text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_recent int; v_msg text := left(p_message, 500); v_url text := left(p_url, 300);
begin
  if coalesce(trim(p_message), '') = '' then return; end if;
  -- two requests carrying the same error are taken one at a time, so both cannot slip past the repeat check
  perform pg_advisory_xact_lock(hashtextextended('client_error:' || v_msg || '|' || coalesce(v_url, ''), 0));
  if exists (select 1 from client_errors where message = v_msg and url is not distinct from v_url and created_at > now() - interval '60 seconds') then return; end if;
  select count(*) into v_recent from client_errors where created_at > now() - interval '1 minute';
  if v_recent >= 100 then return; end if;
  if auth.uid() is not null and (select count(*) from client_errors where user_id = auth.uid() and created_at > now() - interval '1 minute') >= 10 then return; end if;
  insert into client_errors (user_id, message, stack, url, user_agent, release)
  values (auth.uid(), v_msg, left(p_stack, 4000), v_url, left(p_agent, 300), left(p_release, 40));
end $$;
revoke all on function log_client_error(text,text,text,text,text) from public;
grant execute on function log_client_error(text,text,text,text,text) to anon, authenticated;

-- Super admin: removes error rows older than p_days days (at least 1). Returns how many were removed.
create or replace function public.purge_client_errors(p_days int default 30)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if not coalesce(public.is_super_admin(), false) then raise exception 'Only a super admin can do this' using errcode = '42501'; end if;
  delete from public.client_errors where created_at < now() - make_interval(days => greatest(coalesce(p_days, 30), 1));
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.purge_client_errors(int) from public, anon;
grant execute on function public.purge_client_errors(int) to authenticated;
