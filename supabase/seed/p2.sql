-- supabase/seed/p2.sql — NEW FILE
-- Phase 2 demo data — DEVELOPMENT PROJECTS ONLY. Never run this on production.
-- Run AFTER supabase/seed/p1_demo.sql and the three p2 migrations. Safe to run twice.
-- Password for every demo account: Demo#1234
--   owner.active@example.com   owner of Sunrise Apartments
--   manager.demo@example.com   manager of Sunrise Apartments
--   resident01..14@example.com residents of Sunrise Apartments (states listed below)
--   visitor@example.com        has an open request for room B105
-- Residents: 01-06 paid up · 07-08 partly paid this month · 09-11 overdue last month · 12-14 unpaid this month (overdue once the due date + grace days pass)
-- Two M-Pesa payments are left unmatched so the "Unmatched" tab has something to show.

do $$
declare r record; v_id uuid;
begin
  for r in select * from (values
    ('manager.demo@example.com', 'Mark Njoroge', '0722000000'),
    ('resident01@example.com', 'Faith Achieng', '0722000001'), ('resident02@example.com', 'Brian Kamau', '0722000002'),
    ('resident03@example.com', 'Lucy Wambui', '0722000003'),  ('resident04@example.com', 'Kevin Odhiambo', '0722000004'),
    ('resident05@example.com', 'Mercy Chebet', '0722000005'), ('resident06@example.com', 'Dennis Mwangi', '0722000006'),
    ('resident07@example.com', 'Joy Naliaka', '0722000007'),  ('resident08@example.com', 'Samuel Ouma', '0722000008'),
    ('resident09@example.com', 'Esther Wairimu', '0722000009'), ('resident10@example.com', 'Victor Kiprop', '0722000010'),
    ('resident11@example.com', 'Naomi Atieno', '0722000011'), ('resident12@example.com', 'Peter Mutiso', '0722000012'),
    ('resident13@example.com', 'Ann Njeri', '0722000013'),    ('resident14@example.com', 'Hassan Ali', '0722000014')
  ) as t(email, name, phone)
  loop
    if not exists (select 1 from auth.users where email = r.email) then
      v_id := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
        phone_change, phone_change_token, reauthentication_token)
      values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', r.email,
        crypt('Demo#1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
        jsonb_build_object('full_name', r.name, 'phone', r.phone), now(), now(), '', '', '', '', '', '', '', '');
      insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), v_id, v_id::text, 'email',
        jsonb_build_object('sub', v_id::text, 'email', r.email, 'email_verified', true), now(), now(), now());
    end if;
  end loop;
end $$;

do $$
declare
  b uuid := (select id from businesses where slug = 'sunrise-apartments');
  u_mgr uuid := (select id from auth.users where email = 'manager.demo@example.com');
  u_vis uuid := (select id from auth.users where email = 'visitor@example.com');
  bl_a uuid; bl_b uuid; v_room uuid; v_user uuid; v_ten uuid; v_cyc uuid; v_price numeric;
  i int; m int; v_start date; v_status text; v_amt numeric; v_n int := 0;
begin
  if b is null then raise exception 'Run supabase/seed/p1_demo.sql first'; end if;
  if exists (select 1 from buildings where tenant_id = b) then return; end if;

  insert into tenant_settings (tenant_id, billing_due_day, grace_period_days, late_fee_amount, mpesa_shortcode)
  values (b, 5, 3, 500, '174379') on conflict (tenant_id) do update set mpesa_shortcode = '174379';
  insert into business_members (business_id, user_id, role) values (b, u_mgr, 'manager') on conflict do nothing;

  insert into buildings (tenant_id, name, address, description, total_floors) values
    (b, 'Block A', 'Roysambu, Nairobi', 'Bedsitters and singles, ground to 3rd floor', 4) returning id into bl_a;
  insert into buildings (tenant_id, name, address, description, total_floors) values
    (b, 'Block B', 'Roysambu, Nairobi', 'One-bedroom and studio homes, ground to 3rd floor', 4) returning id into bl_b;

  for i in 1..12 loop
    insert into rooms (tenant_id, building_id, room_number, room_type, capacity, monthly_price, semester_price, status, description, amenities)
    values (b, bl_a, 'A' || (100 + i), case when i <= 6 then 'bedsitter' else 'single' end, 1,
            case when i <= 6 then 8500 else 6500 end, case when i <= 6 then 48000 else 36000 end, 'available',
            'Tiled floor, window grille, shared water point.', '["Water","Security","Wi-Fi"]');
    insert into rooms (tenant_id, building_id, room_number, room_type, capacity, monthly_price, semester_price, status, description, amenities)
    values (b, bl_b, 'B' || (100 + i), case when i <= 6 then 'studio' else 'double' end, case when i <= 6 then 1 else 2 end,
            case when i <= 6 then 9500 else 12000 end, null, 'available',
            'Own kitchenette and bathroom.', '["Water","Security","Own bathroom"]');
  end loop;
  update rooms set status = 'maintenance' where tenant_id = b and room_number = 'B112';

  -- 14 residents: A101..A112 then B101, B102
  for i in 1..14 loop
    v_user := (select id from auth.users where email = 'resident' || lpad(i::text, 2, '0') || '@example.com');
    v_room := (select id from rooms where tenant_id = b and room_number = case when i <= 12 then 'A' || (100 + i) else 'B' || (100 + i - 12) end);
    v_price := (select monthly_price from rooms where id = v_room);
    insert into tenancies (tenant_id, client_id, room_id, billing_type, agreed_price, move_in_date, status)
    values (b, v_user, v_room, 'monthly', v_price, (date_trunc('month', current_date) - interval '2 months')::date, 'active') returning id into v_ten;
    insert into business_members (business_id, user_id, role) values (b, v_user, 'resident') on conflict do nothing;

    for m in -2..0 loop
      v_start := (date_trunc('month', current_date) + make_interval(months => m))::date;
      v_n := v_n + 1;
      insert into billing_cycles (tenant_id, tenancy_id, client_id, room_id, billing_type, period_start, period_end, amount_due, late_fee, amount_paid, balance, status, due_date, invoice_number)
      values (b, v_ten, v_user, v_room, 'monthly', v_start, (v_start + interval '1 month' - interval '1 day')::date, v_price, 0, 0, v_price, 'unpaid',
              v_start + 4, 'SUNR-' || to_char(v_start, 'YYYYMM') || '-' || lpad(v_n::text, 4, '0'))
      returning id into v_cyc;
      -- who pays what
      v_amt := case
        when i <= 6 then v_price                                  -- paid up: every month in full
        when i in (7, 8) and m < 0 then v_price                   -- partly paid: old months full, this month half
        when i in (7, 8) and m = 0 then round(v_price / 2)
        when i in (9, 10, 11) and m = -2 then v_price             -- overdue: last month not paid at all
        when i in (9, 10, 11) and m = -1 then 0
        when i in (9, 10, 11) and m = 0 then 0
        when m < 0 then v_price else 0 end;                       -- 12-14: older months paid, this month unpaid
      if v_amt > 0 then
        insert into payments (tenant_id, billing_cycle_id, client_id, amount, payment_method, payment_status, mpesa_receipt, reference, paid_at, notes, payer_phone)
        values (b, v_cyc, v_user, v_amt, case when i % 3 = 0 then 'cash' when i % 3 = 1 then 'mpesa' else 'bank_transfer' end, 'confirmed',
                case when i % 3 = 1 then 'SEED' || lpad(v_n::text, 6, '0') end, case when i % 3 <> 1 then 'REF' || v_n end,
                v_start + 2 + (i % 3), 'Demo payment', '0722000' || lpad(i::text, 3, '0'));
      end if;
    end loop;
  end loop;

  -- last month overdue + late fee for residents 9-11
  update billing_cycles set late_fee = 500 where tenant_id = b and period_start = (date_trunc('month', current_date) - interval '1 month')::date
    and client_id in (select id from auth.users where email in ('resident09@example.com','resident10@example.com','resident11@example.com'));
  for v_cyc in select id from billing_cycles where tenant_id = b loop perform _reconcile_cycle(v_cyc); end loop;

  -- two unmatched M-Pesa payments + one reversed
  insert into payments (tenant_id, client_id, amount, payment_method, payment_status, mpesa_receipt, paid_at, payer_phone, payer_name, notes)
  values (b, null, 8500, 'mpesa', 'confirmed', 'SEEDUNM001', now() - interval '2 days', '0733111222', 'JOHN K MWANGI', 'Paid to paybill with no invoice number'),
         (b, null, 4000, 'mpesa', 'confirmed', 'SEEDUNM002', now() - interval '1 day', '0733222333', 'GRACE W', 'Paid to paybill with no invoice number');
  insert into payments (tenant_id, billing_cycle_id, client_id, amount, payment_method, payment_status, mpesa_receipt, paid_at, reversed_at, notes)
  select b, c.id, c.client_id, 2000, 'mpesa', 'reversed', 'SEEDREV001', now() - interval '5 days', now() - interval '4 days', 'Entered twice. Reversed: duplicate'
  from billing_cycles c where c.tenant_id = b and c.client_id = (select id from auth.users where email = 'resident12@example.com') and c.period_start = date_trunc('month', current_date)::date;

  -- requests: one pending (visitor), one offered
  insert into rental_requests (tenant_id, room_id, requester_id, status, message, preferred_move_in)
  values (b, (select id from rooms where tenant_id = b and room_number = 'B105'), u_vis, 'pending', 'I work nearby and would like to move in next month.', (current_date + 20));
end $$;
