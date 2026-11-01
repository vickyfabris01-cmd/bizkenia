-- supabase/tests/action_counts_tests.sql — NEW FILE
-- AIM: proves the action-count badges (migration 20261028100003_action_counts): only a super admin gets the admin
-- counts; only members of a business get its counts and only owners/managers get numbers; a user sees only their own
-- nav_seen rows; opening the errors / unused-files page clears that badge; log_client_error ignores a repeat of the
-- same message and page within 60 seconds (but not a different message or page); purge_client_errors is super-admin only.
-- Run on a SCRATCH Supabase project (never production) after the migration, with the demo seed loaded and:
--   a super admin account, a business OWNER account (of an active business) and an ordinary account with no business.
-- HOW TO RUN: paste the whole file into the Supabase SQL editor (or psql -f).
--   1. Edit the THREE emails in the "SET THESE EMAILS" line below.
--   2. Success = the last notice says "ALL ACTION-COUNT CHECKS PASSED". A failure aborts with an error starting "FAILED".
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
-- SET THESE EMAILS (accounts that exist in auth.users on the scratch project):
select set_config('ac.admin_email', 'YOUR_SUPER_ADMIN_EMAIL', true),
       set_config('ac.owner_email', 'owner.active@example.com', true),
       set_config('ac.plain_email', 'YOUR_ORDINARY_ACCOUNT_EMAIL', true);

do $$
declare
  v_admin text := current_setting('ac.admin_email');
  v_owner text := current_setting('ac.owner_email');
  v_plain text := current_setting('ac.plain_email');
  v_biz uuid;
  v_before bigint; v_after bigint; v_n bigint; v_rows int;
  v_admin_id uuid; v_owner_id uuid;
begin
  reset role;
  select id into v_admin_id from auth.users where email = v_admin;
  select id into v_owner_id from auth.users where email = v_owner;
  select business_id into v_biz from public.business_members where user_id = v_owner_id and status = 'active' and role = 'owner' limit 1;
  if v_biz is null then raise exception 'The owner account must own a business on the scratch project'; end if;

  -- 1. admin counts: only a super admin ---------------------------------------------------------------------
  perform pg_temp.as_user(null);
  perform pg_temp.fails('select * from public.admin_action_counts()', 'a visitor cannot call admin_action_counts');
  perform pg_temp.as_user(v_owner);
  perform pg_temp.fails('select * from public.admin_action_counts()', 'a business owner cannot call admin_action_counts');
  perform pg_temp.as_user(v_plain);
  perform pg_temp.fails('select * from public.admin_action_counts()', 'an ordinary account cannot call admin_action_counts');
  perform pg_temp.as_user(v_admin);
  select count(*) into v_rows from public.admin_action_counts();
  perform pg_temp.ok(v_rows = 4, 'the super admin gets four keys (businesses, errors, files, support); got ' || v_rows);

  -- 2. a pending business shows as 1 more, and clears when it is decided ------------------------------------
  --    (uses the owner's own ACTIVE business: it is set to pending and back, all inside this rolled-back transaction)
  select n into v_before from public.admin_action_counts() where nav_key = 'businesses';
  reset role;
  update public.businesses set status = 'pending' where id = v_biz and status = 'active';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'The owner''s business must be active for this test'; end if;
  perform pg_temp.as_user(v_admin);
  select n into v_after from public.admin_action_counts() where nav_key = 'businesses';
  perform pg_temp.ok(v_after = v_before + 1, 'a business that becomes pending adds 1 to the businesses badge (' || v_before || ' -> ' || v_after || ')');
  reset role;
  update public.businesses set status = 'active' where id = v_biz;
  perform pg_temp.as_user(v_admin);
  select n into v_after from public.admin_action_counts() where nav_key = 'businesses';
  perform pg_temp.ok(v_after = v_before, 'approving it takes the badge back to ' || v_before);

  -- 3. errors badge: new errors count, opening the page clears it -------------------------------------------
  perform pg_temp.as_user(v_admin);
  perform public.mark_nav_seen('errors');
  select n into v_before from public.admin_action_counts() where nav_key = 'errors';
  perform pg_temp.ok(v_before = 0, 'right after opening the errors page the badge is 0');
  perform pg_temp.as_user(null);
  perform public.log_client_error('ZZ test error one', 'stack', '/zz/page', 'agent', 'r1');
  perform pg_temp.as_user(v_admin);
  select n into v_after from public.admin_action_counts() where nav_key = 'errors';
  perform pg_temp.ok(v_after = 1, 'one new error shows 1 (got ' || v_after || ')');
  perform public.mark_nav_seen('errors');
  select n into v_after from public.admin_action_counts() where nav_key = 'errors';
  perform pg_temp.ok(v_after = 0, 'opening the errors page clears the badge');

  -- 4. log_client_error: a repeat within 60 seconds is ignored ----------------------------------------------
  perform pg_temp.as_user(null);
  perform public.log_client_error('ZZ test error one', 'stack', '/zz/page', 'agent', 'r1');
  perform public.log_client_error('ZZ test error one', 'stack', '/zz/page', 'agent', 'r1');
  reset role;
  select count(*) into v_n from public.client_errors where message = 'ZZ test error one' and url = '/zz/page';
  perform pg_temp.ok(v_n = 1, 'the same message and page three times in a row is stored once (rows: ' || v_n || ')');
  perform pg_temp.as_user(null);
  perform public.log_client_error('ZZ test error one', 'stack', '/zz/other', 'agent', 'r1');
  perform public.log_client_error('ZZ test error two', 'stack', '/zz/page', 'agent', 'r1');
  reset role;
  select count(*) into v_n from public.client_errors where message like 'ZZ test error%';
  perform pg_temp.ok(v_n = 3, 'a different page, or a different message, is still stored (rows: ' || v_n || ')');
  -- the same error is accepted again once the old row is older than 60 seconds
  update public.client_errors set created_at = now() - interval '61 seconds' where message = 'ZZ test error one' and url = '/zz/page';
  perform pg_temp.as_user(null);
  perform public.log_client_error('ZZ test error one', 'stack', '/zz/page', 'agent', 'r1');
  reset role;
  select count(*) into v_n from public.client_errors where message = 'ZZ test error one' and url = '/zz/page';
  perform pg_temp.ok(v_n = 2, 'after 60 seconds the same error is stored again (rows: ' || v_n || ')');

  -- 5. purge_client_errors: super admin only ---------------------------------------------------------------
  perform pg_temp.as_user(v_owner);
  perform pg_temp.fails('select public.purge_client_errors(30)', 'a business owner cannot purge errors');
  perform pg_temp.as_user(null);
  perform pg_temp.fails('select public.purge_client_errors(30)', 'a visitor cannot purge errors');
  reset role;
  update public.client_errors set created_at = now() - interval '40 days' where message = 'ZZ test error two';
  perform pg_temp.as_user(v_admin);
  select public.purge_client_errors(30) into v_n;
  perform pg_temp.ok(v_n >= 1, 'the super admin purge removes rows older than 30 days (removed ' || v_n || ')');
  reset role;
  select count(*) into v_n from public.client_errors where message = 'ZZ test error two';
  perform pg_temp.ok(v_n = 0, 'the old row is gone');
  select count(*) into v_n from public.client_errors where message = 'ZZ test error one';
  perform pg_temp.ok(v_n >= 1, 'recent rows are kept');

  -- 6. files badge: comes from the saved scan, clears when the page is opened ---------------------------------
  perform pg_temp.as_user(v_owner);
  perform pg_temp.fails($q$select public.save_scan_state('unused_files', '{"count": 5}')$q$, 'a business owner cannot save a scan result');
  perform pg_temp.as_user(v_admin);
  perform public.mark_nav_seen('files');
  perform public.save_scan_state('unused_files', '{"count": 7, "bytes": 1000}');
  select n into v_n from public.admin_action_counts() where nav_key = 'files';
  perform pg_temp.ok(v_n = 7, 'a scan that found 7 files shows 7 (got ' || v_n || ')');
  perform public.mark_nav_seen('files');
  select n into v_n from public.admin_action_counts() where nav_key = 'files';
  perform pg_temp.ok(v_n = 0, 'opening the unused-files page clears the badge');
  perform pg_temp.fails($q$select public.save_scan_state('something_else', '{}')$q$, 'an unknown scan key is refused');
  perform pg_temp.fails($q$select public.mark_nav_seen('businesses')$q$, 'an unknown menu key is refused');

  -- 7. nav_seen is private ---------------------------------------------------------------------------------
  perform pg_temp.as_user(v_admin);
  select count(*) into v_n from public.nav_seen;
  perform pg_temp.ok(v_n >= 1 and not exists (select 1 from public.nav_seen where user_id <> v_admin_id), 'the admin sees only their own nav_seen rows');
  perform pg_temp.as_user(v_owner);
  select count(*) into v_n from public.nav_seen;
  perform pg_temp.ok(v_n = 0, 'the owner sees none of the admin''s nav_seen rows');
  perform pg_temp.fails($q$insert into public.nav_seen (user_id, key) values (auth.uid(), 'errors')$q$, 'nobody writes nav_seen directly');
  perform pg_temp.fails('select * from public.admin_scan_state', 'a business owner cannot read admin_scan_state');

  -- 8. business counts: members only, staff get numbers ---------------------------------------------------
  perform pg_temp.as_user(null);
  perform pg_temp.fails(format('select * from public.business_action_counts(%L)', v_biz), 'a visitor cannot call business_action_counts');
  perform pg_temp.as_user(v_plain);
  perform pg_temp.fails(format('select * from public.business_action_counts(%L)', v_biz), 'a non-member cannot call business_action_counts');
  perform pg_temp.as_user(v_owner);
  select count(*) into v_rows from public.business_action_counts(v_biz);
  perform pg_temp.ok(v_rows = 6, 'an owner gets six keys; got ' || v_rows);
  perform pg_temp.ok(not exists (select 1 from public.business_action_counts(v_biz) where n < 0), 'no count is negative');

  raise notice 'ALL ACTION-COUNT CHECKS PASSED';
end $$;
rollback;
