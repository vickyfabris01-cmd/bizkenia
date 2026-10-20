-- supabase/tests/p5e_record_payment_tests.sql — NEW FILE
-- AIM: proves admin_record_payment (migration p5_14) refuses a plan of the wrong business type and a plan that is
-- not on sale, still records a good payment at the plan price, and stays closed to everyone except a super admin.
-- Run in the Supabase SQL editor (or psql) on a DEV database after migrations p5_13 and p5_14, with at least one
-- super admin account (profiles.role = 'super_admin'). Everything runs in one transaction that is rolled back.
-- The last result row says ALL RECORD-PAYMENT CHECKS PASS, or the first failure aborts with its reason.
begin;
create or replace function pg_temp.as_user(p_id uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;
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
grant execute on function pg_temp.as_user(uuid), pg_temp.ok(boolean, text), pg_temp.err_of(text) to public;

do $$
declare
  v_admin uuid; v_owner uuid;
  v_biz uuid; v_type text; v_other text;
  v_good uuid; v_good_off uuid; v_wrong uuid;
  v_e text; n integer; v_amount integer;
begin
  select id into v_admin from profiles where role = 'super_admin' limit 1;
  if v_admin is null then raise exception 'No super admin account found (profiles.role = super_admin).'; end if;
  select id into v_owner from profiles where role <> 'super_admin' limit 1;
  if v_owner is null then v_owner := v_admin; end if;

  -- use any existing business (nothing is created; everything is rolled back at the end)
  reset role;
  select id, business_type into v_biz, v_type from businesses where business_type in ('shop','agriculture','rental') limit 1;
  if v_biz is null then raise exception 'There is no business to test with. Create one first.'; end if;
  v_other := case when v_type = 'shop' then 'rental' else 'shop' end;

  select id into v_good     from subscription_plans where business_type = v_type  and kind = 'standard' and duration_code = 'monthly';
  select id into v_good_off from subscription_plans where business_type = v_type  and kind = 'standard' and duration_code = 'quarterly';
  select id into v_wrong    from subscription_plans where business_type = v_other and kind = 'standard' and duration_code = 'monthly';

  -- as the super admin: this type monthly on at 900, its quarterly priced but OFF, the other type monthly on at 700
  perform pg_temp.as_user(v_admin);
  update subscription_plans set price_kes = 900, is_active = true  where id = v_good;
  update subscription_plans set price_kes = 700, is_active = true  where id = v_wrong;
  update subscription_plans set price_kes = 2000, is_active = false where id = v_good_off;

  -- 1. wrong type
  v_e := pg_temp.err_of(format('select admin_record_payment(%L, %L)', v_biz, v_wrong));
  perform pg_temp.ok(v_e ilike '%different type of business%', 'a plan of another business type is refused (got: ' || coalesce(v_e, 'no error') || ')');

  -- 2. switched off
  v_e := pg_temp.err_of(format('select admin_record_payment(%L, %L)', v_biz, v_good_off));
  perform pg_temp.ok(v_e ilike '%not on sale%', 'a plan that is switched off is refused (got: ' || coalesce(v_e, 'no error') || ')');

  -- 3. unknown plan
  v_e := pg_temp.err_of(format('select admin_record_payment(%L, %L)', v_biz, gen_random_uuid()));
  perform pg_temp.ok(v_e ilike '%not found%', 'an unknown plan is refused (got: ' || coalesce(v_e, 'no error') || ')');

  -- 4. nothing was recorded by the refusals
  reset role;
  select count(*) into n from payment_intents where business_id = v_biz and method = 'manual' and note = 'p5e test';
  perform pg_temp.ok(n = 0, 'refused attempts leave no payment behind');

  -- 5. a good payment goes through at the plan price
  perform pg_temp.as_user(v_admin);
  perform admin_record_payment(v_biz, v_good, 'TEST-P5E', 'p5e test');
  reset role;
  select amount_kes into v_amount from payment_intents where business_id = v_biz and method = 'manual' and note = 'p5e test';
  perform pg_temp.ok(v_amount = 900, 'a valid payment is recorded at the plan price (900), got ' || coalesce(v_amount::text, 'none'));

  -- 6. not a super admin: refused (an ordinary account when there is one, and always a visitor)
  if v_owner <> v_admin then
    perform pg_temp.as_user(v_owner);
    v_e := pg_temp.err_of(format('select admin_record_payment(%L, %L)', v_biz, v_good));
    perform pg_temp.ok(v_e ilike '%Only a super admin%', 'an ordinary account cannot record a payment (got: ' || coalesce(v_e, 'no error') || ')');
  end if;
  reset role;
  set local role anon;
  v_e := pg_temp.err_of(format('select admin_record_payment(%L, %L)', v_biz, v_good));
  perform pg_temp.ok(v_e is not null, 'a visitor with no sign-in cannot record a payment');
  reset role;
end $$;

select 'ALL RECORD-PAYMENT CHECKS PASS' as result;
rollback;
