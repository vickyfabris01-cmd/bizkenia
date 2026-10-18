-- supabase/tests/p3_rls_tests.sql — NEW FILE
-- AIM: proves the Phase 3 people and communication rules as real signed-in users.
-- Run on a DEV database after p1_demo.sql + p2 + p3 migrations + p2.sql + p3.sql:
--   psql "$DEV_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/p3_rls_tests.sql
-- Everything runs inside one transaction that is rolled back at the end. Any failure aborts with a message.
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
create temp table uids as select email, id from auth.users;
grant select on uids to public;
grant execute on function pg_temp.as_user(text), pg_temp.ok(boolean, text), pg_temp.fails(text, text) to public;

do $$
declare
  b uuid := (select id from businesses where slug = 'sunrise-apartments');
  n int; v_c uuid; v_conv uuid; v_tk uuid; v_tr uuid; v_a uuid; v_room uuid; v_w uuid;
begin
  -- ---------- workforce ----------
  perform pg_temp.as_user('worker.guard@example.com');
  select count(*) into n from workers;            perform pg_temp.ok(n = 1, 'a worker sees only their own worker row');
  select count(*) into n from tenancies;          perform pg_temp.ok(n = 0, 'a worker sees no tenancies');
  select count(*) into n from payments;           perform pg_temp.ok(n = 0, 'a worker sees no rent payments');
  perform pg_temp.fails(format($q$select add_worker(%L,'x@example.com','X','',  'cleaner', 100, 'monthly', null)$q$, b), 'a worker cannot add workers');
  perform worker_check_in(b);
  select count(*) into n from attendance where date = current_date and check_in is not null; perform pg_temp.ok(n = 1, 'a worker can check in');
  perform worker_check_out(b);
  select count(*) into n from attendance where date = current_date and check_out is not null; perform pg_temp.ok(n = 1, 'a worker can check out');
  update workers set salary = 999999;
  select count(*) into n from workers where salary = 999999; perform pg_temp.ok(n = 0, 'a worker cannot edit their salary');
  perform pg_temp.as_user('resident01@example.com');
  select count(*) into n from workers;            perform pg_temp.ok(n = 0, 'a resident sees no workers');
  perform pg_temp.fails(format($q$select pay_worker((select id from workers limit 1),100,current_date,current_date,'cash')$q$), 'a resident cannot pay workers');
  perform pg_temp.as_user('manager.demo@example.com');
  select count(*) into n from workers;            perform pg_temp.ok(n = 3, 'a manager sees all workers');
  select count(*) into n from payroll_summary(b); perform pg_temp.ok(n = 3, 'payroll summary lists the workers');
  v_w := add_worker(b, 'newhire@example.com', 'New Hire', '0700000000', 'cleaner', 8000, 'monthly', null);
  perform pg_temp.ok(v_w is not null, 'a manager can add a worker without an account');
  perform pay_worker(v_w, 8000, current_date - 30, current_date, 'cash');
  select count(*) into n from worker_payments where worker_id = v_w; perform pg_temp.ok(n = 1, 'a manager can pay a worker');
  perform pg_temp.fails(format($q$select add_worker(%L,'owner.active@example.com','O','', 'cleaner', 1,'monthly',null)$q$, b), 'an owner cannot also be added as a worker');

  -- ---------- complaints ----------
  perform pg_temp.as_user('resident01@example.com');
  select count(*) into n from complaints;         perform pg_temp.ok(n = 1, 'a resident sees only their own complaints');
  v_c := create_complaint(b, 'Broken light', 'Corridor light is out', 'maintenance');
  perform pg_temp.ok(v_c is not null, 'a resident can raise a complaint');
  perform post_complaint_message(v_c, 'It is dark at night.');
  perform pg_temp.as_user('resident02@example.com');
  select count(*) into n from complaints where id = v_c; perform pg_temp.ok(n = 0, 'another resident cannot read it');
  perform pg_temp.fails(format($q$select post_complaint_message(%L, 'hi')$q$, v_c), 'another resident cannot reply to it');
  perform pg_temp.as_user('manager.demo@example.com');
  select count(*) into n from complaints where id = v_c; perform pg_temp.ok(n = 1, 'a manager sees it');
  perform post_complaint_message(v_c, 'We will fix it today.');
  perform update_complaint(v_c, 'resolved');
  select count(*) into n from complaints where id = v_c and status = 'resolved' and resolved_at is not null; perform pg_temp.ok(n = 1, 'a manager can resolve it');
  perform pg_temp.as_user('resident01@example.com');
  select count(*) into n from notifications where type = 'complaint' and title like 'Your complaint is now%'; perform pg_temp.ok(n >= 1, 'the resident was notified');
  update complaints set status = 'closed';
  select count(*) into n from complaints where status = 'closed'; perform pg_temp.ok(n = 0, 'a resident cannot edit complaints directly');
  perform pg_temp.as_user('owner.pending@example.com');
  perform pg_temp.fails(format($q$select create_complaint(%L,'x','y','general')$q$, b), 'a non-resident cannot raise a complaint');

  -- ---------- transfers ----------
  perform pg_temp.as_user('resident02@example.com');
  select count(*) into n from room_transfers;     perform pg_temp.ok(n = 1, 'a resident sees only their own transfer request');
  perform pg_temp.fails(format($q$select request_transfer(%L, null, 'again')$q$, b), 'only one pending transfer at a time');
  perform pg_temp.as_user('manager.demo@example.com');
  select id into v_tr from room_transfers where status = 'pending';
  select id into v_room from rooms where tenant_id = b and status = 'available' limit 1;
  perform decide_transfer(v_tr, true, v_room);
  select count(*) into n from tenancies t where t.room_id = v_room and t.status = 'active'; perform pg_temp.ok(n = 1, 'approving moves the resident into the new room');

  -- ---------- announcements ----------
  perform pg_temp.as_user('resident01@example.com');
  select count(*) into n from announcements; perform pg_temp.ok(n = 2, 'resident in Block A sees "all" and Block A notices, not Block B floor');
  perform pg_temp.as_user('resident13@example.com');
  select count(*) into n from announcements; perform pg_temp.ok(n = 2, 'resident in Block B ground floor sees "all" and their floor notice');
  perform pg_temp.as_user('worker.guard@example.com');
  select count(*) into n from announcements; perform pg_temp.ok(n = 1, 'a worker sees only notices for everyone');
  perform pg_temp.fails(format($q$select post_announcement(%L,'t','b','all')$q$, b), 'a worker cannot post notices');
  perform pg_temp.as_user('manager.demo@example.com');
  v_a := post_announcement(b, 'Test notice', 'Hello everyone', 'all');
  perform pg_temp.as_user('resident05@example.com');
  select count(*) into n from notifications where title = 'Test notice'; perform pg_temp.ok(n = 1, 'a notice sends a notification');
  perform mark_announcement_read(v_a);
  select count(*) into n from announcement_reads; perform pg_temp.ok(n = 1, 'a read receipt is stored');

  -- ---------- messaging ----------
  perform pg_temp.as_user('resident01@example.com');
  select count(*) into n from conversations; perform pg_temp.ok(n = 1, 'a resident sees only their own conversation');
  perform pg_temp.fails(format($q$select start_conversation(%L, (select id from uids where email='resident02@example.com'))$q$, b), 'a resident cannot message another resident');
  v_conv := start_conversation(b, (select id from uids where email = 'owner.active@example.com'));
  perform send_message(v_conv, 'Hello owner');
  perform pg_temp.as_user('manager.demo@example.com');
  select count(*) into n from messages where conversation_id = v_conv; perform pg_temp.ok(n = 0, 'a manager cannot read a thread they are not in');
  perform pg_temp.as_user('owner.active@example.com');
  select count(*) into n from my_conversations(b) where unread = 1; perform pg_temp.ok(n = 1, 'the owner has one unread conversation');
  perform mark_conversation_read(v_conv);
  select count(*) into n from my_conversations(b) where unread = 0 and id = v_conv; perform pg_temp.ok(n = 1, 'reading clears the unread count');
  perform start_conversation(b, (select id from uids where email = 'resident02@example.com'));
  perform pg_temp.ok(true, 'the owner can message any member');

  -- ---------- notification preferences ----------
  perform pg_temp.as_user('resident03@example.com');
  insert into notification_preferences (user_id, category, enabled) values (auth.uid(), 'notices', false);
  perform pg_temp.as_user('manager.demo@example.com');
  perform post_announcement(b, 'Quiet notice', 'x', 'all');
  perform pg_temp.as_user('resident03@example.com');
  select count(*) into n from notifications where title = 'Quiet notice'; perform pg_temp.ok(n = 0, 'a switched-off category is not delivered');
  perform pg_temp.as_user('resident04@example.com');
  select count(*) into n from notifications where title = 'Quiet notice'; perform pg_temp.ok(n = 1, 'others still receive it');

  -- ---------- help desk ----------
  perform pg_temp.as_user(null);
  select count(*) into n from help_articles; perform pg_temp.ok(n >= 5, 'anyone can read the help centre');
  select count(*) into n from support_tickets; perform pg_temp.ok(n = 0, 'anonymous sees no tickets');
  perform pg_temp.as_user('visitor@example.com');
  select count(*) into n from support_tickets; perform pg_temp.ok(n = 1, 'a visitor sees their own ticket');
  v_tk := create_ticket('Need help', 'Cannot see my request', 'account');
  perform pg_temp.as_user('resident01@example.com');
  select count(*) into n from support_tickets; perform pg_temp.ok(n = 0, 'another person sees no tickets');
  perform pg_temp.fails(format($q$select reply_ticket(%L, 'hi')$q$, v_tk), 'another person cannot reply to a ticket');
  perform pg_temp.fails($q$insert into help_articles (slug,title,body) values ('x','x','x')$q$, 'a normal person cannot write help articles');

  -- ---------- super admin: support yes, business data no ----------
  reset role;
  update profiles set role = 'super_admin' where email = 'owner.two@example.com';
  perform pg_temp.as_user('owner.two@example.com');
  select count(*) into n from support_tickets; perform pg_temp.ok(n = 2, 'the super admin sees all tickets');
  perform reply_ticket(v_tk, 'We are on it.', 'solved');
  perform pg_temp.as_user('visitor@example.com');
  select count(*) into n from support_tickets where status = 'solved'; perform pg_temp.ok(n = 1, 'the ticket owner sees the support reply and status');
  perform pg_temp.as_user('owner.two@example.com');
  select count(*) into n from complaints;     perform pg_temp.ok(n = 0, 'super admin cannot read complaints');
  select count(*) into n from workers;        perform pg_temp.ok(n = 0, 'super admin cannot read workers');
  select count(*) into n from messages;       perform pg_temp.ok(n = 0, 'super admin cannot read messages');
  select count(*) into n from announcements;  perform pg_temp.ok(n = 0, 'super admin cannot read announcements');

  -- ---------- legacy access removed ----------
  reset role;
  select count(*) into n from pg_proc where proname in ('assign_role','my_role','same_tenant','elevate_to_manager') and pronamespace = 'public'::regnamespace;
  perform pg_temp.ok(n = 0, 'old role-switching functions are gone');
  raise notice 'ALL CHECKS PASSED';
end $$;
rollback;
