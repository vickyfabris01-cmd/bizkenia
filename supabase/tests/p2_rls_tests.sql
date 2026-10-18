-- supabase/tests/p2_rls_tests.sql — NEW FILE
-- AIM: proves the Phase 2 access rules and money rules as real signed-in users.
-- Run on a DEV database after p1_demo.sql + the p2 migrations + p2.sql:
--   psql "$DEV_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/p2_rls_tests.sql
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
  b_pending uuid := (select id from businesses where slug = 'lakeview-rentals');
  n int; v_req uuid; v_ten uuid; v_pay uuid; v_cyc uuid; v_room uuid; v_tok text; v_json jsonb; v_unm uuid;
begin
  -- ---------- reading ----------
  perform pg_temp.as_user(null);
  select count(*) into n from rooms where tenant_id = b;        perform pg_temp.ok(n = 24, 'anyone can see the rooms of a live business');
  select count(*) into n from rooms where tenant_id = b_pending; perform pg_temp.ok(n = 0, 'nobody sees rooms of a business that is not live');
  select count(*) into n from tenancies;                         perform pg_temp.ok(n = 0, 'anonymous sees no tenancies');
  select count(*) into n from payments;                          perform pg_temp.ok(n = 0, 'anonymous sees no payments');

  perform pg_temp.as_user('resident01@example.com');
  select count(*) into n from billing_cycles;                    perform pg_temp.ok(n = 3, 'a resident sees only their own 3 invoices');
  select count(*) into n from tenancies;                         perform pg_temp.ok(n = 1, 'a resident sees only their own tenancy');
  select count(*) into n from business_members;                  perform pg_temp.ok(n = 1, 'a resident sees only their own membership');
  select count(*) into n from buildings where tenant_id = b;     perform pg_temp.ok(n = 2, 'a resident can browse buildings');
  begin update billing_cycles set amount_paid = 99999; exception when others then null; end;
  select count(*) into n from billing_cycles where amount_paid = 99999; perform pg_temp.ok(n = 0, 'invoice edit changed nothing');
  perform pg_temp.fails($q$insert into payments (tenant_id, client_id, amount) select tenant_id, client_id, 100 from billing_cycles limit 1$q$, 'a resident cannot insert payments');
  perform pg_temp.fails($q$insert into rooms (tenant_id, building_id, room_number) select tenant_id, id, 'Z1' from buildings limit 1$q$, 'a resident cannot add rooms');
  perform pg_temp.fails(format($q$select record_payment(%L, null, 100, 'cash')$q$, b), 'a resident cannot record payments');
  perform pg_temp.fails(format($q$select rental_dashboard(%L)$q$, b), 'a resident cannot open the dashboard figures');
  select count(*) into n from tenant_secrets;                    perform pg_temp.ok(n = 0, 'secrets are never readable');

  perform pg_temp.as_user('owner.two@example.com');
  select count(*) into n from tenancies;                         perform pg_temp.ok(n = 0, 'another business owner sees none of these tenancies');
  select count(*) into n from payments;                          perform pg_temp.ok(n = 0, 'another business owner sees none of these payments');
  perform pg_temp.fails(format($q$select record_payment(%L, null, 100, 'cash')$q$, b), 'another owner cannot record payments here');

  perform pg_temp.as_user('manager.demo@example.com');
  select count(*) into n from tenancies;                         perform pg_temp.ok(n = 14, 'the manager sees all 14 tenancies');
  select count(*) into n from profiles where email like 'resident%'; perform pg_temp.ok(n = 14, 'the manager can read resident profiles');
  perform pg_temp.fails(format($q$select save_mpesa_details(%L, '123456', 'x')$q$, b), 'a manager cannot change M-Pesa details');
  perform pg_temp.fails(format($q$select invite_manager(%L, 'x@example.com')$q$, b), 'a manager cannot invite managers');
  select count(*) into n from manager_invites;                   perform pg_temp.ok(n = 0, 'a manager cannot list invites');

  -- ---------- money ----------
  select id into v_cyc from billing_cycles where tenant_id = b and status = 'overdue' and client_id = (select id from pg_temp.uids where email = 'resident09@example.com') order by period_start limit 1;
  perform pg_temp.fails(format($q$select record_payment(%L, %L, 999999, 'cash')$q$, b, v_cyc), 'cannot pay more than the balance');
  perform pg_temp.fails(format($q$select record_payment(%L, %L, 100, 'mpesa')$q$, b, v_cyc), 'an M-Pesa payment needs its code');
  perform record_payment(b, v_cyc, 1000, 'mpesa', 'qwe123abc9', now(), 'part');
  perform pg_temp.ok((select amount_paid from billing_cycles where id = v_cyc) = 1000, 'a part payment is added to the invoice');
  perform pg_temp.fails(format($q$select record_payment(%L, %L, 100, 'mpesa', 'QWE123ABC9')$q$, b, v_cyc), 'the same M-Pesa code cannot be used twice');
  select id into v_pay from payments where mpesa_receipt = 'QWE123ABC9';
  perform reverse_payment(v_pay, 'test');
  perform pg_temp.ok((select amount_paid from billing_cycles where id = v_cyc) = 0, 'reversing a payment puts the money back on the invoice');
  perform pg_temp.fails(format($q$select reverse_payment(%L)$q$, v_pay), 'a reversed payment cannot be reversed again');

  select id into v_unm from payments where mpesa_receipt = 'SEEDUNM001';
  select id into v_cyc from billing_cycles where tenant_id = b and status = 'overdue' and balance >= 8500 limit 1;
  perform assign_payment(v_unm, v_cyc);
  perform pg_temp.ok((select client_id from payments where id = v_unm) is not null, 'an unmatched payment can be matched to an invoice');
  perform pg_temp.fails(format($q$select assign_payment(%L, %L)$q$, v_unm, v_cyc), 'a matched payment cannot be matched again');

  v_json := rental_dashboard(b);
  perform pg_temp.ok((v_json->'rooms'->>'total')::int = 24, 'dashboard counts the rooms');
  perform pg_temp.ok((v_json->>'residents')::int = 14, 'dashboard counts the residents');
  perform pg_temp.ok((v_json->>'unmatched')::int = 1, 'dashboard counts the one unmatched payment left');

  -- ---------- request -> offer -> tenancy ----------
  perform pg_temp.as_user('visitor@example.com');
  select count(*) into n from rental_requests; perform pg_temp.ok(n = 1, 'the visitor sees their own request only');
  select id into v_room from rooms where tenant_id = b and room_number = 'B106';
  perform pg_temp.fails(format($q$select submit_rental_request(%L, %L)$q$, b, (select id from rooms where tenant_id = b and room_number = 'A101')), 'cannot request an occupied room');
  perform pg_temp.fails(format($q$select submit_rental_request(%L, %L)$q$, b_pending, (select id from rooms where tenant_id = b_pending limit 1)), 'cannot request from a business that is not live');
  v_req := submit_rental_request(b, v_room, 'Hello', current_date + 7);
  perform pg_temp.fails(format($q$select submit_rental_request(%L, %L)$q$, b, v_room), 'cannot send the same request twice');
  perform pg_temp.fails(format($q$select respond_request(%L, 'offer', 9000, 'monthly')$q$, v_req), 'the requester cannot answer their own request');

  perform pg_temp.as_user('owner.active@example.com');
  perform pg_temp.fails(format($q$select submit_rental_request(%L, %L)$q$, b, v_room), 'the owner cannot request a room in their own business');
  perform respond_request(v_req, 'offer', 9500, 'monthly', current_date + 5, 'Welcome', 48);
  perform pg_temp.ok((select status from rooms where id = v_room) = 'reserved', 'an offer reserves the room');
  perform pg_temp.fails(format($q$select respond_request(%L, 'reject')$q$, v_req), 'an answered request cannot be answered again');

  perform pg_temp.as_user('visitor@example.com');
  v_ten := respond_offer(v_req, true);
  perform pg_temp.ok(v_ten is not null, 'accepting the offer creates a tenancy');
  perform pg_temp.ok((select status from rooms where id = v_room) = 'occupied', 'the room becomes occupied');
  perform pg_temp.ok((select role from business_members where user_id = (select id from pg_temp.uids where email = 'visitor@example.com') and business_id = b) = 'resident', 'the visitor becomes a resident of that business');
  select count(*) into n from billing_cycles; perform pg_temp.ok(n = 1, 'the new resident already has the first invoice');

  perform pg_temp.as_user('owner.active@example.com');
  perform pg_temp.ok((select count(*) from payments where billing_cycle_id is null) = 1, 'owner still sees the other unmatched payment');
  perform end_tenancy(v_ten, 'completed', current_date);
  perform pg_temp.ok((select status from rooms where id = v_room) = 'available', 'ending a tenancy frees the room');
  perform pg_temp.ok((select status from business_members where user_id = (select id from pg_temp.uids where email = 'visitor@example.com') and business_id = b) = 'removed', 'ending a tenancy removes the resident role');

  -- ---------- invites ----------
  v_tok := invite_manager(b, 'visitor@example.com');
  perform pg_temp.as_user('resident02@example.com');
  perform pg_temp.fails(format($q$select accept_manager_invite(%L)$q$, v_tok), 'an invite cannot be accepted from a different email');
  perform pg_temp.as_user('visitor@example.com');
  perform accept_manager_invite(v_tok, 'Visiting Vera');
  perform pg_temp.ok(is_staff(b), 'accepting the invite makes them a manager');
  perform pg_temp.fails(format($q$select accept_manager_invite(%L)$q$, v_tok), 'an invite works only once');
  perform pg_temp.as_user('owner.active@example.com');
  perform remove_manager(b, (select id from pg_temp.uids where email = 'visitor@example.com'));
  perform pg_temp.as_user('visitor@example.com');
  perform pg_temp.ok(not is_staff(b), 'a removed manager loses access');

  -- ---------- public invoice ----------
  perform pg_temp.as_user('owner.active@example.com');
  select share_token into v_tok from billing_cycles where tenant_id = b limit 1;
  perform pg_temp.as_user(null);
  v_json := get_public_invoice(v_tok);
  perform pg_temp.ok(v_json->>'invoice_number' is not null, 'anyone with the link can open one invoice');
  perform pg_temp.ok(get_public_invoice('nope') is null, 'a wrong link shows nothing');
  select count(*) into n from billing_cycles; perform pg_temp.ok(n = 0, 'the link does not open the rest of the invoices');

  -- ---------- super admin is a no-go zone ----------
  reset role;
  update profiles set role = 'super_admin' where email = 'owner.two@example.com';
  perform pg_temp.as_user('owner.two@example.com');
  select count(*) into n from tenancies; perform pg_temp.ok(n = 0, 'super admin cannot read tenancies');
  select count(*) into n from payments;  perform pg_temp.ok(n = 0, 'super admin cannot read payments');
  perform pg_temp.fails(format($q$select record_payment(%L, null, 100, 'cash')$q$, b), 'super admin cannot record payments');
  raise notice 'ALL CHECKS PASSED';
end $$;
rollback;
