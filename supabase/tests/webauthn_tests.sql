-- supabase/tests/webauthn_tests.sql — NEW FILE (Part 7, job B)
-- AIM: proves the permissions of the fingerprint sign-in tables (migration 20261028100002_webauthn.sql):
--   * a signed-in person can list and delete ONLY their own enrolled devices, never anyone else's;
--   * nobody can read the public key or the signature counter from the browser, and nobody can add or change a device;
--   * visitors with no sign-in see nothing; challenges cannot be touched by any browser role;
--   * a challenge works once only, expires after 5 minutes, and is tied to its purpose (and, for enrolment, to its person);
--   * the helper functions are for the service role only.
-- Run on a SCRATCH Supabase project (never production) after the migration. HOW TO RUN: paste the whole file into the Supabase
-- SQL editor (or psql -f). Needs TWO existing accounts in auth.users: edit the two emails in the "SET THESE TWO EMAILS" line.
-- Success = the last result row says ALL WEBAUTHN CHECKS PASS. Any failure aborts with an error that starts with "FAILED".
-- Everything runs in one transaction that is rolled back, so nothing is left behind.
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
-- Runs p_sql and passes when it is REFUSED (an error). A statement that runs without error fails the check.
create or replace function pg_temp.fails(p_sql text, p_msg text) returns void language plpgsql as $$
begin
  begin execute p_sql; exception when others then raise notice 'ok  - % (%)', p_msg, sqlerrm; return; end;
  raise exception 'FAILED (should have been refused): %', p_msg;
end $$;
grant execute on function pg_temp.as_user(text), pg_temp.ok(boolean, text), pg_temp.fails(text, text) to public;
-- SET THESE TWO EMAILS (two different accounts that exist in auth.users on the scratch project):
select set_config('wa.email_a', 'YOUR_FIRST_ACCOUNT_EMAIL', true), set_config('wa.email_b', 'YOUR_SECOND_ACCOUNT_EMAIL', true);

do $$
declare
  v_ea text := current_setting('wa.email_a');
  v_eb text := current_setting('wa.email_b');
  v_a uuid; v_b uuid; v_cred_a uuid; v_cred_b uuid;
  n bigint; r boolean; v_id uuid;
begin
  select id into v_a from auth.users where email = v_ea;
  select id into v_b from auth.users where email = v_eb;
  if v_a is null or v_b is null or v_a = v_b then raise exception 'Set two different existing accounts in the SET THESE TWO EMAILS line'; end if;

  -- Set-up as the service role (the Edge Functions run like this): one device each, one challenge of each kind.
  reset role;
  insert into public.webauthn_credentials (user_id, credential_id, public_key, counter, transports, device_label)
    values (v_a, 'test-cred-a', 'pk-a', 7, '{internal}', 'Phone A') returning id into v_cred_a;
  insert into public.webauthn_credentials (user_id, credential_id, public_key, counter, transports, device_label)
    values (v_b, 'test-cred-b', 'pk-b', 3, '{internal}', 'Phone B') returning id into v_cred_b;

  -- 1. visitors ---------------------------------------------------------------------------------------------------
  perform pg_temp.as_user(null);
  perform pg_temp.fails('select count(*) from public.webauthn_credentials', 'a visitor cannot read enrolled devices');
  perform pg_temp.fails('select count(*) from public.webauthn_challenges', 'a visitor cannot read challenges');
  perform pg_temp.fails($q$insert into public.webauthn_challenges (challenge, purpose) values ('x', 'login')$q$, 'a visitor cannot create a challenge');
  perform pg_temp.fails($q$select public.webauthn_consume_challenge('x', 'login', null)$q$, 'a visitor cannot call webauthn_consume_challenge');
  perform pg_temp.fails('select public.webauthn_purge_challenges()', 'a visitor cannot call webauthn_purge_challenges');

  -- 2. a signed-in person sees and removes only their own devices -------------------------------------------------------
  perform pg_temp.as_user(v_ea);
  select count(*) into n from public.webauthn_credentials;
  perform pg_temp.ok(n = 1, 'person A sees exactly one device (their own)');
  select count(*) into n from public.webauthn_credentials where user_id = v_b;
  perform pg_temp.ok(n = 0, 'person A cannot see person B''s device');
  perform pg_temp.fails('select public_key from public.webauthn_credentials', 'the public key cannot be read from the browser');
  perform pg_temp.fails('select counter from public.webauthn_credentials', 'the signature counter cannot be read from the browser');
  perform pg_temp.fails('select * from public.webauthn_credentials', 'select * is refused because it includes the public key');
  perform pg_temp.fails($q$insert into public.webauthn_credentials (user_id, credential_id, public_key) values (auth.uid(), 'forged', 'pk')$q$, 'a person cannot add a device themselves');
  perform pg_temp.fails($q$update public.webauthn_credentials set device_label = 'renamed' where credential_id = 'test-cred-a'$q$, 'a person cannot change a device row');
  perform pg_temp.fails($q$update public.webauthn_credentials set counter = 0 where credential_id = 'test-cred-a'$q$, 'a person cannot reset a counter');
  perform pg_temp.fails('select count(*) from public.webauthn_challenges', 'a signed-in person cannot read challenges');
  perform pg_temp.fails($q$insert into public.webauthn_challenges (challenge, purpose) values ('y', 'login')$q$, 'a signed-in person cannot create a challenge');
  perform pg_temp.fails($q$select public.webauthn_consume_challenge('y', 'login', null)$q$, 'a signed-in person cannot call webauthn_consume_challenge');

  delete from public.webauthn_credentials where id = v_cred_b;
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'person A cannot delete person B''s device (0 rows)');
  delete from public.webauthn_credentials where id = v_cred_a;
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1, 'person A can delete their own device');

  perform pg_temp.as_user(v_eb);
  select count(*) into n from public.webauthn_credentials;
  perform pg_temp.ok(n = 1, 'person B still has their device after A''s actions');

  -- 3. challenges: single use, purpose, owner and expiry ----------------------------------------------------------------
  reset role;
  insert into public.webauthn_challenges (challenge, purpose, user_id) values ('c-login', 'login', null), ('c-reg', 'register', v_a);
  insert into public.webauthn_challenges (challenge, purpose, user_id, expires_at) values ('c-old', 'login', null, now() - interval '1 minute');
  select count(*) into n from public.webauthn_challenges where challenge = 'c-login' and expires_at > now() + interval '4 minutes';
  perform pg_temp.ok(n = 1, 'a new challenge lasts about 5 minutes');

  r := public.webauthn_consume_challenge('c-login', 'login', null);
  perform pg_temp.ok(r, 'a fresh login challenge works once');
  r := public.webauthn_consume_challenge('c-login', 'login', null);
  perform pg_temp.ok(r is false, 'the same login challenge cannot be used a second time (replay refused)');
  r := public.webauthn_consume_challenge('c-old', 'login', null);
  perform pg_temp.ok(r is false, 'an expired challenge is refused');
  r := public.webauthn_consume_challenge('c-reg', 'login', null);
  perform pg_temp.ok(r is false, 'a register challenge cannot be used for sign-in');
  r := public.webauthn_consume_challenge('c-reg', 'register', v_b);
  perform pg_temp.ok(r is false, 'a register challenge cannot be used by another person');
  r := public.webauthn_consume_challenge('c-reg', 'register', v_a);
  perform pg_temp.ok(r, 'a register challenge works for the person it was issued to');
  r := public.webauthn_consume_challenge('c-reg', 'register', v_a);
  perform pg_temp.ok(r is false, 'a register challenge cannot be used twice');
  r := public.webauthn_consume_challenge('does-not-exist', 'login', null);
  perform pg_temp.ok(r is false, 'an unknown challenge is refused');

  -- 4. housekeeping removes only challenges that are more than an hour past their expiry ---------------------------------
  insert into public.webauthn_challenges (challenge, purpose, expires_at) values ('c-ancient', 'login', now() - interval '2 hours');
  insert into public.webauthn_challenges (challenge, purpose, expires_at) values ('c-recent', 'login', now() - interval '10 minutes');
  n := public.webauthn_purge_challenges();
  perform pg_temp.ok(n >= 1, 'purge removes the ancient challenge');
  select count(*) into n from public.webauthn_challenges where challenge = 'c-ancient';
  perform pg_temp.ok(n = 0, 'the ancient challenge is gone');
  select count(*) into n from public.webauthn_challenges where challenge = 'c-recent';
  perform pg_temp.ok(n = 1, 'a challenge that expired 10 minutes ago is kept');

  -- 5. one device id cannot be enrolled twice ----------------------------------------------------------------------------
  reset role;
  perform pg_temp.fails(format($q$insert into public.webauthn_credentials (user_id, credential_id, public_key) values (%L, 'test-cred-b', 'pk')$q$, v_a),
                        'the same credential id cannot be saved a second time, even for another person');
end $$;

reset role;
select 'ALL WEBAUTHN CHECKS PASS' as result;
rollback;
