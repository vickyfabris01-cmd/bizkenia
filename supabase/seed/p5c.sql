-- supabase/seed/p5c.sql — NEW FILE
-- Phase 5 step 3 demo data (platform finance) — DEVELOPMENT PROJECTS ONLY. Never run this on production.
-- Run AFTER p1_demo.sql, p2.sql and p5.sql and the seven p5 migrations (p5_01 to p5_07). Safe to run twice.
-- Adds history so the admin screens have something to show:
--   * six months of subscription payments for every active business (so Revenue and Reports have a trend),
--     plus one failed and one pending attempt
--   * a running subscription for each of those businesses (one ends within 7 days)
--   * cash and bank rent payments for active rental businesses (listed under Transactions as "Rent")
-- Every row carries the note "demo-5c", which is how a second run knows to stop.

do $$
declare
  b record; m int; v_plan uuid; v_price int; v_days int;
begin
  if exists (select 1 from payment_intents where note = 'demo-5c') then
    raise notice 'p5c demo data already there, skipping';
    return;
  end if;

  for b in select id, owner_user_id, business_type, created_at from businesses where status = 'active' and owner_user_id is not null loop
    select id, price_kes, period_days into v_plan, v_price, v_days
      from subscription_plans where business_type = b.business_type and is_active order by sort limit 1;
    if v_plan is null then continue; end if;

    for m in 0..5 loop
      insert into payment_intents (user_id, business_id, plan_id, purpose, method, amount_kes, phone, status, mpesa_receipt, note, created_at, updated_at)
      values (b.owner_user_id, b.id, v_plan, 'subscription', case when m = 5 then 'manual' else 'mpesa_stk' end, v_price, '254711000001', 'success',
              'DEMO' || upper(substr(md5(b.id::text || m), 1, 7)), 'demo-5c',
              date_trunc('month', now()) - make_interval(months => m) + interval '3 days' + make_interval(hours => (m * 5) % 24),
              date_trunc('month', now()) - make_interval(months => m) + interval '3 days');
    end loop;

    insert into payment_intents (user_id, business_id, plan_id, purpose, method, amount_kes, phone, status, result_desc, note, created_at)
    values (b.owner_user_id, b.id, v_plan, 'subscription', 'mpesa_stk', v_price, '254711000001', 'failed', 'Request cancelled by user', 'demo-5c', now() - interval '12 days'),
           (b.owner_user_id, b.id, v_plan, 'subscription', 'mpesa_stk', v_price, '254711000001', 'pending', null, 'demo-5c', now() - interval '20 minutes');

    if not exists (select 1 from business_subscriptions where business_id = b.id and status = 'active' and period_end > now()) then
      insert into business_subscriptions (business_id, plan_id, status, amount_kes, period_start, period_end)
      values (b.id, v_plan, 'active', v_price, now() - make_interval(days => v_days - 5), now() + interval '5 days');
    end if;

    if b.business_type = 'rental' then
      for m in 0..3 loop
        insert into payments (tenant_id, client_id, amount, payment_method, payment_status, paid_at, notes)
        values (b.id, null, 6500 + m * 500, case when m % 2 = 0 then 'cash' else 'bank_transfer' end, 'confirmed',
                date_trunc('month', now()) - make_interval(months => m) + interval '6 days', 'demo-5c');
      end loop;
    end if;
  end loop;
end $$;
