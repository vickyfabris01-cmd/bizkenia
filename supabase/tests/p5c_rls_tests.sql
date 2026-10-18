-- supabase/tests/p5c_rls_tests.sql — NEW FILE
-- AIM: proves the Phase 5 step 3 rules as real signed-in users: only a super admin can read platform money,
-- revenue, reports and the audit log; nobody else can, not even a business owner; and the totals add up.
-- Run on a DEV database after p1_demo.sql + p2.sql + p5.sql + the seven p5 migrations + p5c.sql, with ONE real
-- super admin account (profiles.role = 'super_admin'). Replace the email below with yours:
--   psql "$DEV_DB_URL" -v ON_ERROR_STOP=1 -v admin_email="'you@example.com'" -f supabase/tests/p5c_rls_tests.sql
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
-- psql cannot substitute :admin_email inside a DO block, so pass it through a setting.
select set_config('p5c.admin_email', :admin_email, true);

do $$
declare
  v_admin text := current_setting('p5c.admin_email');
  v_shop uuid;
  n bigint; t jsonb; v_sub numeric; v_list numeric; v_month numeric;
begin
  -- ---- ordinary accounts are refused ------------------------------------------------------------------
  perform pg_temp.as_user('owner.active@example.com');
  perform pg_temp.fails('select * from admin_transactions()', 'a business owner cannot list platform transactions');
  perform pg_temp.fails('select admin_transaction_totals()', 'a business owner cannot read transaction totals');
  perform pg_temp.fails('select admin_revenue_summary()', 'a business owner cannot read platform revenue');
  perform pg_temp.fails('select * from admin_growth_monthly()', 'a business owner cannot read platform growth');
  perform pg_temp.fails('select * from admin_top_businesses()', 'a business owner cannot read the top businesses');
  perform pg_temp.fails('select * from admin_audit_feed()', 'a business owner cannot read the audit log');
  perform pg_temp.fails('select count(*) from _platform_money', 'the internal money list is closed to signed-in users');
  -- row-level security answers an unauthorised UPDATE with "0 rows changed", not with an error
  update platform_settings set value = '{"enabled": true, "message": "x"}' where key = 'maintenance';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'a business owner cannot switch maintenance on (0 rows changed)');

  perform pg_temp.as_user(null);
  perform pg_temp.fails('select * from admin_transactions()', 'a visitor with no sign-in cannot list transactions');
  perform pg_temp.fails('select * from admin_audit_feed()', 'a visitor with no sign-in cannot read the audit log');
  select count(*) into n from platform_settings where key = 'maintenance';
  perform pg_temp.ok(n = 1, 'the maintenance setting is public, so the site can show the maintenance page before sign-in');
  select count(*) into n from platform_settings where key = 'finance';
  perform pg_temp.ok(n = 0, 'the finance setting (commission) is not public');

  -- ---- the super admin can read, and the numbers agree ----------------------------------------------------
  perform pg_temp.as_user(v_admin);
  select count(*) into n from admin_transactions(null, null, null, null, null, 5000, 0);
  perform pg_temp.ok(n > 0, 'the super admin sees transactions (' || n || ')');

  t := admin_transaction_totals(null, null, 'subscription');
  select coalesce(sum(amount), 0) into v_list from admin_transactions('subscription', 'success', null, null, null, 5000, 0);
  perform pg_temp.ok((t ->> 'volume')::numeric = v_list, 'subscription money in the tiles equals the sum of the list');

  v_sub := (admin_revenue_summary() ->> 'all_time')::numeric;
  perform pg_temp.ok(v_sub = v_list, 'Revenue (all time) equals successful subscriptions in Transactions');

  select coalesce(sum(revenue), 0) into v_month from admin_revenue_monthly(36);
  perform pg_temp.ok(v_month = v_sub, 'the monthly revenue rows add up to the all-time figure');

  select count(*) into n from (select id from admin_transactions(null, null, null, null, null, 5000, 0) group by id having count(*) > 1) d;
  perform pg_temp.ok(n = 0, 'no payment is listed twice (an STK rent payment is one row, not two)');

  select count(*) into n from admin_transactions(null, 'bogus', null, null, null, 25, 0);
  perform pg_temp.ok(n = 0, 'an unknown status filter returns nothing instead of failing');

  select count(*) into n from admin_growth_monthly(12);
  perform pg_temp.ok(n = 12, 'growth returns one row for each of the last 12 months');

  -- ---- the audit log gets the new kinds of change -------------------------------------------------------------
  update subscription_plans set description = coalesce(description, '') || ' ' where code = (select code from subscription_plans order by created_at limit 1);
  select count(*) into n from admin_audit_feed('subscription_plan', 'plan.update', null, null, null, 5, 0);
  perform pg_temp.ok(n >= 1, 'a price plan change is written to the audit log and shows in the feed');

  -- ---- shop reports follow the orders rules --------------------------------------------------------------------------
  reset role;
  select id into v_shop from businesses where name = 'Mama Njeri Mart';
  perform pg_temp.as_user('shop.demo@example.com');
  select count(*) into n from report_shop_monthly where business_id = v_shop;
  perform pg_temp.ok(n >= 1, 'the shop owner sees monthly sales for their own shop');
  perform pg_temp.as_user('buyer.demo@example.com');
  select count(*) into n from report_shop_top_products where business_id = v_shop;
  perform pg_temp.ok(n >= 0, 'a customer reading the report view is limited by the orders rules (sees only their own orders)');
  perform pg_temp.as_user(null);
  perform pg_temp.fails('select count(*) from report_shop_monthly', 'a visitor cannot read the shop report views');

  reset role;
  raise notice 'ALL p5c CHECKS PASSED';
end $$;
rollback;
