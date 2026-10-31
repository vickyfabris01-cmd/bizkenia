-- supabase/tests/maintenance_levels_tests.sql — NEW FILE
-- AIM: proves the maintenance-levels rules as real signed-in users: anyone (even with no sign-in) can read the
-- settings through get_maintenance(); only a super admin can change them; every change is cleaned, audited and
-- stamped with updated_at; and the helper that cleans the values is not callable by visitors.
-- Run on a SCRATCH Supabase project (never production) after supabase/migrations/20261027100003_maintenance_levels.sql,
-- with p1_demo.sql + p2.sql seeded and ONE real super admin account (profiles.role = 'super_admin').
-- HOW TO RUN: paste the whole file into the Supabase SQL editor (or psql -f) and run it.
--   1. Edit the two emails in the "SET THESE TWO EMAILS" line below (an existing super admin, and an ordinary account).
--   2. Success = the last result shows "ALL MAINTENANCE CHECKS PASSED". Any failure shows an error that starts with "FAILED".
-- Everything runs inside one transaction that is rolled back at the end, so nothing is left behind.
begin;
create or replace function pg_temp.as_user(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  reset role;
  if p_email is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    set local role anon;
  else
    select id into v_id from auth.users where email = p_email;
    if v_id is null then raise exception 'No such account: %', p_email; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'email', p_email, 'role', 'authenticated')::text, true);
    set local role authenticated;
  end if;
end $$;
create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FAILED: %', p_msg; end if;
  raise notice 'ok  - %', p_msg;
end $$;
create or replace function pg_temp.fails(p_sql text, p_msg text) returns void language plpgsql as $$
begin
  begin execute p_sql; exception when others then raise notice 'ok  - % (%)', p_msg, sqlerrm; return; end;
  raise exception 'FAILED (should have been refused): %', p_msg;
end $$;
grant execute on function pg_temp.as_user(text), pg_temp.ok(boolean, text), pg_temp.fails(text, text) to public;
-- SET THESE TWO EMAILS (accounts that exist in auth.users on the scratch project):
select set_config('maint.admin_email', 'YOUR_SUPER_ADMIN_EMAIL', true), set_config('maint.owner_email', 'owner.active@example.com', true);

do $$
declare
  v_admin text := current_setting('maint.admin_email');
  v_owner text := current_setting('maint.owner_email');
  v_biz   text := 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
  n bigint; g jsonb; v jsonb; v_stamp text; v_audit bigint;
begin
  -- ---- readable by everyone -----------------------------------------------------------------------------
  perform pg_temp.as_user(null);
  g := get_maintenance();
  perform pg_temp.ok(g ?& array['system','allDashboards','types','pages','payments','businesses','message','updated_at'],
                     'a visitor with no sign-in can read all keys through get_maintenance()');
  perform pg_temp.fails($q$select maintenance_normalize('{}'::jsonb)$q$, 'a visitor cannot call the internal maintenance_normalize()');
  select count(*) into n from platform_settings where key = 'finance';
  perform pg_temp.ok(n = 0, 'get_maintenance() does not open the private finance setting');

  -- ---- not writable by anyone but a super admin -----------------------------------------------------------
  update platform_settings set value = '{"system": true}' where key = 'maintenance';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'a visitor cannot change maintenance (0 rows changed)');
  perform pg_temp.as_user(v_owner);
  update platform_settings set value = '{"payments": true}' where key = 'maintenance';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'a business owner cannot change maintenance (0 rows changed)');
  perform pg_temp.fails($q$insert into platform_settings (key, value) values ('maintenance_x', '{}')$q$, 'a business owner cannot add settings');

  -- ---- the super admin writes; values are cleaned; the change is audited ----------------------------------------
  perform pg_temp.as_user(v_admin);
  select count(*) into v_audit from audit_log where entity_id = 'maintenance';
  update platform_settings set value = jsonb_build_object(
      'system', 'yes', 'allDashboards', true, 'types', jsonb_build_array('rental', 'shop', 'bogus', 'rental'),
      'pages', jsonb_build_array('pricing', 'Bad Key', 'explore'), 'payments', true,
      'businesses', jsonb_build_array(v_biz, 'not-a-uuid', lower(v_biz)), 'message', repeat('m', 400), 'evil', 'x')
    where key = 'maintenance';
  v := (select value from platform_settings where key = 'maintenance');
  perform pg_temp.ok((v ->> 'system')::boolean = false, 'a value that is not true/false is ignored');
  perform pg_temp.ok(v -> 'types' = '["rental","shop"]'::jsonb, 'unknown business types are dropped');
  perform pg_temp.ok(v -> 'pages' = '["explore","pricing"]'::jsonb, 'invalid page keys are dropped');
  perform pg_temp.ok(v -> 'businesses' = jsonb_build_array(lower(v_biz)), 'only valid business ids stay, once, in lower case');
  perform pg_temp.ok(length(v ->> 'message') = 300 and not (v ? 'evil'), 'the message is cut to 300 characters and unknown keys are dropped');
  select count(*) into n from audit_log where entity_id = 'maintenance';
  perform pg_temp.ok(n = v_audit + 1, 'the change wrote an audit entry');

  v_stamp := v ->> 'updated_at';
  perform pg_sleep(0.02);
  update platform_settings set value = v where key = 'maintenance';
  perform pg_temp.ok((select value ->> 'updated_at' from platform_settings where key = 'maintenance') = v_stamp,
                     'saving the same settings keeps updated_at, so a dismissed banner stays dismissed');
  perform pg_sleep(0.02);
  update platform_settings set value = jsonb_set(value, '{payments}', 'false') where key = 'maintenance';
  perform pg_temp.ok((select value ->> 'updated_at' from platform_settings where key = 'maintenance') > v_stamp,
                     'a real change moves updated_at, so the banner comes back');

  -- ---- visitors see what the admin saved ----------------------------------------------------------------------
  perform pg_temp.as_user(null);
  g := get_maintenance();
  perform pg_temp.ok((g ->> 'allDashboards')::boolean and not (g ->> 'payments')::boolean, 'a visitor sees the saved levels');

  -- ---- a legacy value is understood -------------------------------------------------------------------------
  perform pg_temp.as_user(v_admin);
  perform pg_temp.ok((maintenance_normalize('{"enabled": true, "message": "hi"}'::jsonb) ->> 'system')::boolean,
                     'an old { enabled: true } value means system maintenance');
  raise notice 'all maintenance level checks passed';
end $$;
rollback;
select 'ALL MAINTENANCE CHECKS PASSED' as result;
