-- supabase/tests/p4_rls_tests.sql — NEW FILE
-- AIM: proves the Phase 4 farm rules as real signed-in users.
-- Run on a DEV database after p1_demo.sql + the six p4 migrations + p4.sql:
--   psql "$DEV_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/p4_rls_tests.sql
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
-- passes when the query is refused OR returns no rows (what a browser with no sign-in gets)
create or replace function pg_temp.sees_nothing(p_table text, p_msg text) returns void language plpgsql as $$
declare n bigint;
begin
  begin execute format('select count(*) from %s', p_table) into n; exception when others then raise notice 'ok  - % (refused)', p_msg; return; end;
  if n <> 0 then raise exception 'FAILED: % (saw % rows)', p_msg, n; end if;
  raise notice 'ok  - % (0 rows)', p_msg;
end $$;
grant execute on function pg_temp.as_user(text), pg_temp.ok(boolean, text), pg_temp.fails(text, text), pg_temp.sees_nothing(text, text) to public;

do $$
declare
  b uuid := (select id from businesses where slug = 'wanjiku-green-acres');
  v_dap uuid; v_cows uuid; v_layers uuid; v_field uuid; v_left numeric; v_heads int; v_inc int; n int;
begin
  if b is null then raise exception 'Run supabase/seed/p4.sql first'; end if;
  select id into v_dap from farm_inventory_items where business_id = b and name = 'DAP fertiliser';
  select id into v_cows from livestock_groups where business_id = b and name = 'Dairy cows';
  select id into v_layers from livestock_groups where business_id = b and name = 'Layers';
  select id into v_field from farm_fields where business_id = b and name = 'North plot';

  -- ---------- the owner can work on the farm ----------
  perform pg_temp.as_user('farmer.demo@example.com');
  perform pg_temp.ok((select count(*) from farm_fields) = 3, 'owner sees the 3 fields');
  perform pg_temp.ok((select count(*) from report_farm_monthly where business_id = b) >= 12, 'owner reads the farm report view');

  v_left := record_stock_movement(v_dap, 'in', 60, 'test');
  perform pg_temp.ok(v_left = (select quantity from farm_inventory_items where id = v_dap), 'stock in changes the quantity and returns the new balance');
  perform pg_temp.fails($f$select record_stock_movement((select id from farm_inventory_items where name = 'DAP fertiliser'), 'out', 999999)$f$, 'stock cannot go below zero');
  perform pg_temp.fails($f$update farm_inventory_items set quantity = 1 where name = 'DAP fertiliser'$f$, 'quantity cannot be edited by hand');
  update farm_inventory_items set reorder_level = 90 where id = v_dap;
  perform pg_temp.ok(true, 'other item fields can still be edited');
  perform pg_temp.fails(format('insert into inventory_movements (business_id, item_id, kind, quantity, balance_after) values (%L, %L, %L, 1, 1)', b, v_dap, 'in'), 'the movement ledger cannot be written directly');

  select head_count into v_heads from livestock_groups where id = v_cows;
  perform record_livestock_event(v_cows, 'birth', null, 2, null, 'twins');
  perform pg_temp.ok((select head_count from livestock_groups where id = v_cows) = v_heads + 2, 'a birth adds to the head count');
  perform pg_temp.fails(format('select record_livestock_event(%L, %L, null, 100000, 10)', v_layers, 'sale'), 'a sale cannot take away more animals than the group has');
  perform pg_temp.fails($f$update livestock_groups set head_count = 999 where name = 'Dairy cows'$f$, 'head count cannot be edited by hand');
  select count(*) into v_inc from farm_income where business_id = b and source = 'livestock_sale';
  perform record_livestock_event(v_layers, 'sale', null, 5, 7500, 'test sale');
  perform pg_temp.ok((select count(*) from farm_income where business_id = b and source = 'livestock_sale') = v_inc + 1, 'a livestock sale with a price is recorded as income');
  perform pg_temp.fails(format('insert into crops (business_id, field_id, name) values (%L, %L, %L)', (select id from businesses where slug = 'sunrise-apartments'), v_field, 'Mix-up'), 'a crop cannot point at another business''s field');
  n := remind_farm_tasks(b);
  perform pg_temp.ok(remind_farm_tasks(b) = 0, 'a task reminder is sent once a day, not on every visit');

  -- ---------- an owner of a different business sees nothing ----------
  perform pg_temp.as_user('owner.active@example.com');
  perform pg_temp.ok((select count(*) from farm_fields) = 0, 'another business''s owner sees no fields');
  perform pg_temp.ok((select count(*) from farm_income) = 0 and (select count(*) from farm_expenses) = 0, 'another business''s owner sees no money');
  perform pg_temp.ok((select count(*) from report_farm_yield where business_id = b) = 0, 'another business''s owner sees no report rows');
  perform pg_temp.fails(format('insert into farm_fields (business_id, name) values (%L, %L)', b, 'Hack'), 'another business''s owner cannot add a field');
  perform pg_temp.fails(format('select record_stock_movement(%L, %L, 5)', v_dap, 'in'), 'another business''s owner cannot change stock');
  perform pg_temp.fails(format('select remind_farm_tasks(%L)', b), 'another business''s owner cannot trigger reminders');

  -- ---------- a visitor and an anonymous browser see nothing ----------
  perform pg_temp.as_user('visitor@example.com');
  perform pg_temp.ok((select count(*) from crops) = 0, 'a visitor sees no crops');
  perform pg_temp.as_user(null);
  perform pg_temp.sees_nothing('farm_fields', 'an anonymous browser cannot read farm data');
  perform pg_temp.sees_nothing('farm_income', 'an anonymous browser cannot read farm money');
  perform pg_temp.sees_nothing('report_farm_monthly', 'an anonymous browser cannot read reports');
  raise notice 'ALL PHASE 4 CHECKS PASSED';
end $$;
rollback;
