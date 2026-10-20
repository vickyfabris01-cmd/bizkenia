-- supabase/tests/p5d_plan_slots_tests.sql — NEW FILE
-- AIM: proves the Phase 5 step 5 plan rules: the four durations are a locked lookup; there are exactly 12
-- standard plan slots (3 business types x 4 durations) whose code, name, period and order come from the
-- lookup; a longer plan or an offer must save the owner money against the monthly price; an offer is only
-- visible while it is on, priced and inside its dates; and only a super admin can change prices.
-- Run on a DEV database after the Phase 5 migrations (including 20261020100004_p5_13_fixed_plan_slots.sql).
-- It needs at least one super admin account (profiles.role = 'super_admin') and finds it by itself, so there is
-- nothing to edit. Paste the whole file into the Supabase SQL editor and run it
-- (or: psql "$DEV_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/p5d_plan_slots_tests.sql).
-- Everything runs inside one transaction that is rolled back at the end, so no data is changed.
-- PASS = the last result reads ALL PLAN SLOT CHECKS PASSED. FAIL = an error starting with FAILED that names the rule.
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
-- like fails(), but the refusal must come from the rule named in p_pattern (so a test cannot pass for the wrong reason)
create or replace function pg_temp.fails_with(p_sql text, p_pattern text, p_msg text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_pattern || '%' then raise notice 'ok  - % (%)', p_msg, sqlerrm; return; end if;
    raise exception 'FAILED (refused, but by the wrong rule: %): %', sqlerrm, p_msg;
  end;
  raise exception 'FAILED (should have been refused): %', p_msg;
end $$;
-- A change someone is not allowed to make is stopped in one of two ways: an error ("permission denied", or one of
-- our own rules) or row-level security quietly changing 0 rows. Either is a pass; a change that goes through is not.
create or replace function pg_temp.cannot_change(p_sql text, p_msg text) returns void language plpgsql as $$
declare n bigint;
begin
  begin
    execute p_sql;
    get diagnostics n = row_count;
  exception when others then
    raise notice 'ok  - % (refused: %)', p_msg, sqlerrm; return;
  end;
  if n > 0 then raise exception 'FAILED (the change went through, % row(s)): %', n, p_msg; end if;
  raise notice 'ok  - % (0 rows changed)', p_msg;
end $$;
grant execute on function pg_temp.as_user(text), pg_temp.ok(boolean, text), pg_temp.fails(text, text), pg_temp.fails_with(text, text, text), pg_temp.cannot_change(text, text) to public;
-- the super admin used for the "who can do what" checks: the oldest account flagged as super_admin
select set_config('p5d.admin_email', coalesce(
  (select u.email from auth.users u join public.profiles p on p.id = u.id
    where p.role = 'super_admin' order by u.created_at limit 1), ''), true);

do $$
declare
  v_admin text := current_setting('p5d.admin_email');
  -- any ordinary account (not a super admin), if the database has one
  v_user  text := (select u.email from auth.users u join public.profiles p on p.id = u.id
                    where p.role is distinct from 'super_admin' order by u.created_at limit 1);
  n bigint; r record;
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
begin
  if v_admin = '' then
    raise exception 'FAILED: no super admin account found (profiles.role = super_admin), so the admin checks cannot run.';
  end if;

  -- ---- the lookup ---------------------------------------------------------------------------------------
  perform pg_temp.ok((select string_agg(code || ':' || period_days, ',' order by sort) from plan_durations)
                     = 'monthly:30,quarterly:90,half_yearly:180,yearly:365', 'the four fixed durations exist with the right lengths');
  perform pg_temp.fails($q$insert into plan_durations (code, label, months, period_days, sort) values ('weekly', 'Weekly', 1, 7, 5)$q$, 'a fifth duration cannot be added');
  perform pg_temp.fails($q$update plan_durations set period_days = 31 where code = 'monthly'$q$, 'a duration cannot be changed');
  perform pg_temp.fails($q$delete from plan_durations where code = 'yearly'$q$, 'a duration cannot be removed');
  perform pg_temp.fails($q$truncate plan_durations$q$, 'the lookup cannot be emptied');

  -- ---- the 12 slots -------------------------------------------------------------------------------------
  select count(*) into n from subscription_plans where kind = 'standard';
  perform pg_temp.ok(n = 12, 'there are exactly 12 standard plan slots');
  select count(distinct (business_type, duration_code)) into n from subscription_plans where kind = 'standard';
  perform pg_temp.ok(n = 12, 'each business type has each duration exactly once');

  -- start from a clean grid whatever the dev data was: longer plans and offers off first, monthly last
  update subscription_plans set is_active = false, price_kes = 0, offer_starts_on = null, offer_ends_on = null
   where kind = 'offer' or duration_code <> 'monthly';
  update subscription_plans set is_active = false, price_kes = 0 where duration_code = 'monthly' and kind = 'standard';

  perform pg_temp.fails($q$update subscription_plans set is_active = true where code = 'rental_monthly'$q$, 'a plan with no price cannot be switched on');
  perform pg_temp.fails($q$update subscription_plans set price_kes = 4000 where code = 'rental_quarterly'$q$, 'a quarterly price is refused while there is no monthly price');

  update subscription_plans set price_kes = 1500, is_active = true where code = 'rental_monthly';
  update subscription_plans set price_kes = 4000, is_active = true where code = 'rental_quarterly';
  update subscription_plans set price_kes = 8000, is_active = true where code = 'rental_half_yearly';
  update subscription_plans set price_kes = 15000, is_active = true where code = 'rental_yearly';
  perform pg_temp.ok(true, 'monthly 1500, quarterly 4000, half a year 8000 and yearly 15000 are accepted');

  perform pg_temp.fails($q$update subscription_plans set price_kes = 4600 where code = 'rental_quarterly'$q$, 'a quarterly price above 3 x monthly is refused');
  perform pg_temp.fails($q$update subscription_plans set price_kes = 18100 where code = 'rental_yearly'$q$, 'a yearly price above 12 x monthly is refused');

  -- code, name, period and order cannot be set by hand
  update subscription_plans set period_days = 7, name = 'Whatever', code = 'whatever', sort = 99 where business_type = 'rental' and duration_code = 'quarterly';
  select * into r from subscription_plans where business_type = 'rental' and duration_code = 'quarterly';
  perform pg_temp.ok(r.period_days = 90 and r.code = 'rental_quarterly' and r.name = 'Rental, quarterly' and r.sort = 2,
                     'period, code, name and order come from the lookup, not from the caller');
  perform pg_temp.fails($q$update subscription_plans set business_type = 'shop' where code = 'rental_quarterly'$q$, 'a plan cannot move to another business type');
  perform pg_temp.fails($q$update subscription_plans set duration_code = 'yearly' where code = 'rental_quarterly'$q$, 'a standard plan cannot change its duration');
  perform pg_temp.fails_with($q$insert into subscription_plans (business_type, duration_code, price_kes, is_active) values ('rental', 'monthly', 0, false)$q$,
                             'duplicate key', 'a second monthly rental plan cannot be added');
  perform pg_temp.fails($q$insert into subscription_plans (business_type, duration_code, price_kes) values ('rental', 'weekly', 0)$q$, 'a duration outside the lookup cannot be used');
  perform pg_temp.fails($q$delete from subscription_plans where code = 'rental_yearly'$q$, 'a plan cannot be deleted');

  -- ---- the catalogue and the savings --------------------------------------------------------------------
  select count(*) into n from plan_catalog() where business_type = 'rental' and kind = 'standard';
  perform pg_temp.ok(n = 4, 'the catalogue lists all four rental slots');
  select * into r from plan_catalog() where business_type = 'rental' and duration_code = 'quarterly';
  perform pg_temp.ok(r.available and r.price_kes = 4000 and r.monthly_price_kes = 1500 and r.full_price_kes = 4500
                     and r.saving_kes = 500 and r.saving_percent = 11, 'quarterly saves KSh 500 (11%) against 3 months monthly');
  select * into r from plan_catalog() where business_type = 'rental' and duration_code = 'half_yearly';
  perform pg_temp.ok(r.saving_kes = 1000 and r.saving_percent = 11, 'half a year saves KSh 1000 (11%)');
  select * into r from plan_catalog() where business_type = 'rental' and duration_code = 'yearly';
  perform pg_temp.ok(r.saving_kes = 3000 and r.saving_percent = 17, 'yearly saves KSh 3000 (17%)');
  select * into r from plan_catalog() where business_type = 'rental' and duration_code = 'monthly';
  perform pg_temp.ok(r.saving_kes = 0 and r.price_kes = 1500, 'monthly itself shows no saving');
  select * into r from plan_catalog() where business_type = 'agriculture' and duration_code = 'quarterly';
  perform pg_temp.ok(not r.available and r.price_kes is null and r.saving_kes is null, 'a slot with no price shows as not available and hides its price');

  -- lowering the monthly price may not break the longer plans
  perform pg_temp.fails($q$update subscription_plans set price_kes = 1000 where code = 'rental_monthly'$q$, 'monthly cannot drop below what the longer plans allow');
  update subscription_plans set price_kes = 1400 where code = 'rental_monthly';
  perform pg_temp.ok(true, 'monthly can drop to 1400 while every longer plan still saves money');
  update subscription_plans set price_kes = 1500 where code = 'rental_monthly';

  -- ---- the offer ----------------------------------------------------------------------------------------
  perform pg_temp.fails($q$insert into subscription_plans (business_type, kind, duration_code, name, price_kes, is_active)
                            values ('shop', 'offer', 'quarterly', 'Launch offer', 2000, true)$q$, 'an offer is refused while the business type has no monthly price');
  update subscription_plans set price_kes = 1000, is_active = true where code = 'agriculture_monthly';
  perform pg_temp.fails($q$insert into subscription_plans (business_type, kind, duration_code, name, price_kes, is_active)
                            values ('agriculture', 'offer', 'quarterly', 'Too dear', 3500, true)$q$, 'an offer dearer than its months at the monthly price is refused');
  insert into subscription_plans (business_type, kind, duration_code, name, description, price_kes, is_active, offer_ends_on)
  values ('agriculture', 'offer', 'quarterly', 'Launch offer', 'Three months for less', 2000, true, v_today + 10);
  select * into r from plan_catalog() where business_type = 'agriculture' and kind = 'offer';
  perform pg_temp.ok(r.available and r.name = 'Launch offer' and r.period_days = 90 and r.saving_kes = 1000 and r.saving_percent = 33,
                     'an open offer shows in the catalogue with its saving');
  perform pg_temp.fails_with($q$insert into subscription_plans (business_type, kind, duration_code, name, price_kes, is_active) values ('agriculture', 'offer', 'yearly', 'Second', 0, false)$q$,
                             'duplicate key', 'a business type can have only one offer');
  perform pg_temp.fails($q$update subscription_plans set offer_starts_on = current_date + 5, offer_ends_on = current_date + 1 where code = 'agriculture_offer'$q$,
                        'an offer cannot end before it starts');

  update subscription_plans set offer_ends_on = v_today - 1 where code = 'agriculture_offer';
  select count(*) into n from plan_catalog() where kind = 'offer';
  perform pg_temp.ok(n = 0, 'an offer past its end date disappears from the catalogue');
  perform pg_temp.ok(not plan_is_available((select id from subscription_plans where code = 'agriculture_offer')), 'an expired offer cannot be bought');
  update subscription_plans set offer_starts_on = v_today + 3, offer_ends_on = v_today + 30 where code = 'agriculture_offer';
  select count(*) into n from plan_catalog() where kind = 'offer';
  perform pg_temp.ok(n = 0, 'an offer that has not started yet is hidden');
  update subscription_plans set offer_starts_on = null, offer_ends_on = null where code = 'agriculture_offer';
  select count(*) into n from plan_catalog() where kind = 'offer';
  perform pg_temp.ok(n = 1, 'an offer with no dates shows while it is on');
  update subscription_plans set is_active = false where code = 'agriculture_offer';
  select count(*) into n from plan_catalog() where kind = 'offer';
  perform pg_temp.ok(n = 0, 'a switched-off offer is hidden');

  -- ---- who can do what ----------------------------------------------------------------------------------
  perform pg_temp.as_user(null);
  select count(*) into n from plan_catalog();
  perform pg_temp.ok(n = 12, 'a visitor with no sign-in can read the catalogue (12 slots, the offer is off)');
  select count(*) into n from subscription_plans;
  perform pg_temp.ok(n = (select count(*) from plan_catalog() where available), 'a visitor sees only plans that are on sale in the table');
  -- 1499 is a price the plan rules accept (see "monthly can drop to 1400" above), so only permissions can refuse it
  perform pg_temp.cannot_change($q$update subscription_plans set price_kes = 1499 where code = 'rental_monthly'$q$, 'a visitor cannot change a price');
  perform pg_temp.cannot_change($q$update subscription_plans set description = 'changed by a visitor' where code = 'rental_monthly'$q$, 'a visitor cannot change a plan description');
  perform pg_temp.cannot_change($q$insert into subscription_plans (business_type, kind, duration_code, name, price_kes, is_active) values ('rental', 'offer', 'quarterly', 'Sneaky', 100, true)$q$, 'a visitor cannot add an offer');
  perform pg_temp.ok((select price_kes from subscription_plans where code = 'rental_monthly') = 1500, 'the price is still 1500 after the visitor tried');
  perform pg_temp.fails($q$insert into plan_durations (code, label, months, period_days, sort) values ('weekly', 'Weekly', 1, 7, 5)$q$, 'a visitor cannot touch the lookup');

  if v_user is not null then
    perform pg_temp.as_user(v_user);
    select count(*) into n from subscription_plans;
    perform pg_temp.ok(n = (select count(*) from plan_catalog() where available), 'a signed-in person who is not a super admin sees only plans that are on sale');
    perform pg_temp.cannot_change($q$update subscription_plans set price_kes = 1499 where code = 'rental_monthly'$q$, 'a signed-in person who is not a super admin cannot change a price');
    perform pg_temp.cannot_change($q$update subscription_plans set description = 'changed by a member' where code = 'rental_monthly'$q$, 'a signed-in person who is not a super admin cannot change a plan description');
    perform pg_temp.cannot_change($q$insert into subscription_plans (business_type, kind, duration_code, name, price_kes, is_active) values ('rental', 'offer', 'quarterly', 'Sneaky', 100, true)$q$, 'a signed-in person who is not a super admin cannot add an offer');
    perform pg_temp.ok((select price_kes from subscription_plans where code = 'rental_monthly') = 1500, 'the price is still 1500 after that person tried');
  else
    raise notice 'skipped - this database has no ordinary account to test with';
  end if;

  perform pg_temp.as_user(v_admin);
  select count(*) into n from subscription_plans;
  perform pg_temp.ok(n >= 13, 'the super admin sees every slot and the offer, on or off');
  update subscription_plans set price_kes = 1450 where code = 'rental_monthly';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1, 'the super admin can change a price');
  perform pg_temp.fails($q$delete from subscription_plans where code = 'rental_monthly'$q$, 'not even the super admin can delete a plan');
  perform pg_temp.fails($q$update plan_durations set months = 2 where code = 'monthly'$q$, 'not even the super admin can change the lookup');

  reset role;
  raise notice 'ALL PLAN SLOT CHECKS PASSED';
end $$;
rollback;

-- Reached only if every check above passed (a failed check stops the script with an error).
select 'ALL PLAN SLOT CHECKS PASSED' as result;