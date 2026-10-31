-- 20261027100005_login_attempts.sql — NEW FILE (Part 6, login throttling)
-- AIM: lets the resolve-login function (phone sign-in) slow down password guessing by itself, per phone number and
-- per client IP, instead of relying on Supabase Auth's limits (which are per IP of the function and shared by everyone).
-- login_attempts holds one row per sign-in attempt. Nobody can read or write it from the browser; only the three
-- functions below (service role only) touch it. Re-runnable.
-- Run order: after 20261027100004_payment_reconcile.sql, and BEFORE deploying the new resolve-login.
-- NOTE: the brief asked for 20261027100002_login_attempts.sql, but that version number is already used by
-- 20261027100002_orphan_function_all_refs.sql on main. Two files with one version number break `supabase db push`.
create table if not exists public.login_attempts (
  id          uuid primary key default gen_random_uuid(),
  identifier  text not null,                       -- the phone number (2547...), or another key the caller chooses
  ip          text,                                -- null when the function could not tell the client IP
  success     boolean not null default false,      -- an attempt counts as a failure until it is marked successful
  created_at  timestamptz not null default now()
);
create index if not exists login_attempts_identifier_created_idx on public.login_attempts (identifier, created_at);
create index if not exists login_attempts_ip_created_idx on public.login_attempts (ip, created_at);
alter table public.login_attempts enable row level security;
revoke all on public.login_attempts from public, anon, authenticated;
-- no policies on purpose: with RLS on and no policy, no browser role can see or change a row.

-- Asks "may this attempt go ahead?" and, when it may, records it as a failure in the same step.
-- Blocked when the identifier has p_identifier_max failures, or the IP has p_ip_max failures, inside the window.
-- A successful sign-in clears the identifier's earlier failures (they stop counting). Attempts that are refused are not
-- recorded, so a blocked person cannot extend their own block. Returns
--   { "allowed": true,  "attempt_id": "<uuid>" }   or   { "allowed": false, "retry_after": <seconds> }
-- Concurrent requests for the same identifier or IP are taken one at a time (advisory locks, always identifier first),
-- so a burst of parallel guesses cannot all slip past the count.
create or replace function public.login_throttle_begin(
  p_identifier text, p_ip text default null,
  p_identifier_max integer default 5, p_ip_max integer default 20, p_window_seconds integer default 900)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window interval := make_interval(secs => greatest(coalesce(p_window_seconds, 900), 1));
  v_last_ok timestamptz; v_since timestamptz;
  v_n integer; v_ts timestamptz; v_retry integer := 0; v_id uuid;
begin
  if coalesce(btrim(p_identifier), '') = '' then raise exception 'identifier required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('login:id:' || p_identifier, 0));
  if p_ip is not null then perform pg_advisory_xact_lock(hashtextextended('login:ip:' || p_ip, 0)); end if;

  select max(created_at) into v_last_ok from public.login_attempts where identifier = p_identifier and success;
  v_since := greatest(v_now - v_window, coalesce(v_last_ok, '-infinity'::timestamptz));
  select count(*) into v_n from public.login_attempts where identifier = p_identifier and not success and created_at > v_since;
  if v_n >= p_identifier_max then
    -- free again when enough of the counted failures have aged out of the window
    select created_at into v_ts from public.login_attempts
     where identifier = p_identifier and not success and created_at > v_since
     order by created_at offset (v_n - p_identifier_max) limit 1;
    v_retry := greatest(v_retry, ceil(extract(epoch from (v_ts + v_window - v_now)))::integer);
  end if;

  if p_ip is not null then
    select count(*) into v_n from public.login_attempts where ip = p_ip and not success and created_at > v_now - v_window;
    if v_n >= p_ip_max then
      select created_at into v_ts from public.login_attempts
       where ip = p_ip and not success and created_at > v_now - v_window
       order by created_at offset (v_n - p_ip_max) limit 1;
      v_retry := greatest(v_retry, ceil(extract(epoch from (v_ts + v_window - v_now)))::integer);
    end if;
  end if;

  if v_retry > 0 then
    return jsonb_build_object('allowed', false, 'retry_after', greatest(v_retry, 1));
  end if;
  insert into public.login_attempts (identifier, ip, success, created_at)
  values (p_identifier, nullif(left(p_ip, 64), ''), false, clock_timestamp()) returning id into v_id;
  return jsonb_build_object('allowed', true, 'attempt_id', v_id);
end $$;
revoke all on function public.login_throttle_begin(text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.login_throttle_begin(text, text, integer, integer, integer) to service_role;

-- Marks an attempt that login_throttle_begin allowed as successful (or leaves it a failure).
create or replace function public.login_throttle_finish(p_attempt uuid, p_success boolean)
returns void language sql security definer set search_path = public as $$
  update public.login_attempts set success = coalesce(p_success, false) where id = p_attempt;
$$;
revoke all on function public.login_throttle_finish(uuid, boolean) from public, anon, authenticated;
grant execute on function public.login_throttle_finish(uuid, boolean) to service_role;

-- Deletes attempts older than p_days (default 7). Returns how many rows went. Schedule it daily (see the Part 6 report).
create or replace function public.purge_login_attempts(p_days integer default 7)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  delete from public.login_attempts where created_at < now() - make_interval(days => greatest(coalesce(p_days, 7), 1));
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.purge_login_attempts(integer) from public, anon, authenticated;
grant execute on function public.purge_login_attempts(integer) to service_role;
