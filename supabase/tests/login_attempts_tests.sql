-- supabase/tests/login_attempts_tests.sql — NEW FILE
-- AIM: proves the login throttle (migration 20261027100005_login_attempts): browsers cannot touch login_attempts or its
-- functions; 5 failures for one phone block the next attempt with a sensible retry_after; another phone is unaffected;
-- a success clears the phone's failures; the block ends after the 15-minute window; 20 failures from one IP block
-- that IP only; an unknown IP is never blocked by the IP rule; the purge removes only rows older than 7 days.
-- Run in the Supabase SQL editor (or psql) on a DEV database after the migration. Everything runs in one
-- transaction that is rolled back. The last result row says ALL LOGIN-THROTTLE CHECKS PASS, or the first failure aborts with its reason.
begin;
create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FAILED: %', p_msg; end if;
end $$;
-- Runs p_sql and returns the error text, or null when it was NOT refused.
create or replace function pg_temp.err_of(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then return sqlerrm;
end $$;
-- One sign-in attempt that is wrong (stays a failure) or right (marked successful). Returns the answer.
create or replace function pg_temp.try(p_id text, p_ip text, p_good boolean default false) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  r := public.login_throttle_begin(p_id, p_ip);
  if (r->>'allowed')::boolean and p_good then perform public.login_throttle_finish((r->>'attempt_id')::uuid, true); end if;
  return r;
end $$;
grant execute on function pg_temp.ok(boolean, text), pg_temp.err_of(text), pg_temp.try(text, text, boolean) to public;

do $$
declare r jsonb; i integer; v_e text; n integer;
begin
  -- 1. closed to browsers ----------------------------------------------------------------------------------------
  foreach v_e in array array['anon', 'authenticated'] loop
    execute format('set local role %I', v_e);
    perform pg_temp.ok(pg_temp.err_of('select count(*) from public.login_attempts') is not null, v_e || ' cannot read login_attempts');
    perform pg_temp.ok(pg_temp.err_of('insert into public.login_attempts (identifier) values (''x'')') is not null, v_e || ' cannot write login_attempts');
    perform pg_temp.ok(pg_temp.err_of('select public.login_throttle_begin(''254700000001'', ''1.1.1.1'')') is not null, v_e || ' cannot call login_throttle_begin');
    perform pg_temp.ok(pg_temp.err_of('select public.login_throttle_finish(gen_random_uuid(), true)') is not null, v_e || ' cannot call login_throttle_finish');
    perform pg_temp.ok(pg_temp.err_of('select public.purge_login_attempts()') is not null, v_e || ' cannot call purge_login_attempts');
    reset role;
  end loop;

  -- the function itself runs as the service role from here on
  set local role service_role;

  -- 2. five wrong passwords, then a block -----------------------------------------------------------------------
  for i in 1..5 loop
    r := pg_temp.try('254700000001', '10.0.0.1');
    perform pg_temp.ok((r->>'allowed')::boolean, 'attempt ' || i || ' for the phone is allowed');
  end loop;
  r := pg_temp.try('254700000001', '10.0.0.1');
  perform pg_temp.ok(not (r->>'allowed')::boolean, 'the 6th attempt for the same phone is blocked');
  perform pg_temp.ok((r->>'retry_after')::integer between 800 and 900, 'retry_after is about 15 minutes (got ' || (r->>'retry_after') || ')');
  r := pg_temp.try('254700000001', '10.0.0.1', true);
  perform pg_temp.ok(not (r->>'allowed')::boolean, 'even the right password is refused while blocked');
  reset role; select count(*) into n from public.login_attempts where identifier = '254700000001';
  perform pg_temp.ok(n = 5, 'refused attempts are not recorded (rows: ' || n || ')');
  set local role service_role;

  -- 3. a different phone, from the same IP, is not affected ------------------------------------------------------
  r := pg_temp.try('254700000002', '10.0.0.1');
  perform pg_temp.ok((r->>'allowed')::boolean, 'a different phone is unaffected');

  -- 4. the block ends after the window; retry_after follows the oldest failure ------------------------------------
  reset role;
  update public.login_attempts set created_at = clock_timestamp() - interval '14 minutes' where identifier = '254700000001';
  set local role service_role;
  r := pg_temp.try('254700000001', '10.0.0.1');
  perform pg_temp.ok(not (r->>'allowed')::boolean and (r->>'retry_after')::integer between 1 and 70, 'still blocked, about a minute to go (got ' || r::text || ')');
  reset role;
  update public.login_attempts set created_at = clock_timestamp() - interval '16 minutes' where identifier = '254700000001';
  set local role service_role;
  r := pg_temp.try('254700000001', '10.0.0.1', true);
  perform pg_temp.ok((r->>'allowed')::boolean, 'allowed again after the 15-minute window, and the right password works');

  -- 5. a success clears the phone's failures --------------------------------------------------------------------
  for i in 1..4 loop perform pg_temp.try('254700000003', '10.0.0.3'); end loop;
  r := pg_temp.try('254700000003', '10.0.0.3', true);
  perform pg_temp.ok((r->>'allowed')::boolean, 'the 5th attempt (the right password) is allowed');
  for i in 1..5 loop
    r := pg_temp.try('254700000003', '10.0.0.3');
    perform pg_temp.ok((r->>'allowed')::boolean, 'after a success, wrong attempt ' || i || ' counts from zero');
  end loop;
  r := pg_temp.try('254700000003', '10.0.0.3');
  perform pg_temp.ok(not (r->>'allowed')::boolean, 'and the block comes again after 5 more failures');

  -- 6. 20 failures from one IP block that IP, whichever phone is tried; another IP is fine ----------------------------
  for i in 1..20 loop
    r := pg_temp.try('2547110000' || lpad(i::text, 2, '0'), '10.9.9.9');
    perform pg_temp.ok((r->>'allowed')::boolean, 'IP attempt ' || i || ' is allowed');
  end loop;
  r := pg_temp.try('254711999999', '10.9.9.9');
  perform pg_temp.ok(not (r->>'allowed')::boolean and (r->>'retry_after')::integer > 0, 'the 21st attempt from the same IP is blocked');
  r := pg_temp.try('254711999999', '10.8.8.8');
  perform pg_temp.ok((r->>'allowed')::boolean, 'the same phone from another IP is allowed');

  -- 7. an unknown IP (null) is never blocked by the IP rule ----------------------------------------------------------
  for i in 1..25 loop
    r := pg_temp.try('2547220000' || lpad(i::text, 2, '0'), null);
    perform pg_temp.ok((r->>'allowed')::boolean, 'attempt ' || i || ' with no known IP is allowed');
  end loop;

  -- 8. purge keeps recent rows, removes rows older than 7 days ---------------------------------------------------------
  reset role;
  insert into public.login_attempts (identifier, ip, created_at) values ('254733000001', '10.5.5.5', now() - interval '8 days'), ('254733000002', '10.5.5.5', now() - interval '6 days');
  set local role service_role;
  n := public.purge_login_attempts();
  perform pg_temp.ok(n = 1, 'purge removed exactly the one old row (removed ' || n || ')');
  reset role;
  perform pg_temp.ok(not exists (select 1 from public.login_attempts where identifier = '254733000001'), 'the 8-day-old row is gone');
  perform pg_temp.ok(exists (select 1 from public.login_attempts where identifier = '254733000002'), 'the 6-day-old row stays');
end $$;

select 'ALL LOGIN-THROTTLE CHECKS PASS' as result;
rollback;
