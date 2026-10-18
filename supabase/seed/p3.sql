-- supabase/seed/p3.sql — NEW FILE
-- Phase 3 demo data — DEVELOPMENT PROJECTS ONLY. Never run this on production.
-- Run AFTER p1_demo.sql, p2.sql and the seven p3 migrations. Safe to run twice.
-- Password for every demo account: Demo#1234
--   worker.guard@example.com   security guard at Sunrise Apartments (has an account: worker portal)
--   (also a cleaner and a gardener with no account: they only appear in the manager's workforce screens)
-- Adds: floors, 3 workers with attendance and salary payments, complaints with replies, a transfer request,
-- announcements (all / Block A / floor), a conversation, a support ticket.

do $$
declare v_id uuid;
begin
  if not exists (select 1 from auth.users where email = 'worker.guard@example.com') then
    v_id := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token)
    values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', 'worker.guard@example.com',
      crypt('Demo#1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
      jsonb_build_object('full_name', 'Joseph Kariuki', 'phone', '0722000030'), now(), now(), '', '', '', '', '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_id, v_id::text, 'email',
      jsonb_build_object('sub', v_id::text, 'email', 'worker.guard@example.com', 'email_verified', true), now(), now(), now());
  end if;
end $$;

do $$
declare
  b uuid := (select id from businesses where slug = 'sunrise-apartments');
  u_own uuid := (select id from auth.users where email = 'owner.active@example.com');
  u_mgr uuid := (select id from auth.users where email = 'manager.demo@example.com');
  u_grd uuid := (select id from auth.users where email = 'worker.guard@example.com');
  u_vis uuid := (select id from auth.users where email = 'visitor@example.com');
  r1 uuid := (select id from auth.users where email = 'resident01@example.com');
  r2 uuid := (select id from auth.users where email = 'resident02@example.com');
  r9 uuid := (select id from auth.users where email = 'resident09@example.com');
  bl_a uuid; bl_b uuid; f record; w_g uuid; w_c uuid; w_n uuid; v_c uuid; v_conv uuid; v_t uuid; v_tk uuid; d int;
begin
  if b is null then raise exception 'Run p1_demo.sql and p2.sql first'; end if;
  if exists (select 1 from workers where tenant_id = b) then return; end if;
  select id into bl_a from buildings where tenant_id = b and name = 'Block A';
  select id into bl_b from buildings where tenant_id = b and name = 'Block B';

  -- floors 0..3 in each block; room x101..x112 are spread 3 per floor
  for f in select id, name from buildings where tenant_id = b loop
    for d in 0..3 loop
      insert into floors (tenant_id, building_id, floor_number, floor_name)
      values (b, f.id, d, case d when 0 then 'Ground floor' when 1 then '1st floor' when 2 then '2nd floor' else '3rd floor' end);
    end loop;
  end loop;
  update rooms r set floor_id = (select fl.id from floors fl where fl.building_id = r.building_id
                                   and fl.floor_number = ((substring(r.room_number from 2)::int - 101) / 3))
   where r.tenant_id = b;

  -- workers
  insert into business_members (business_id, user_id, role) values (b, u_grd, 'worker') on conflict do nothing;
  insert into workers (tenant_id, user_id, full_name, phone, email, role, salary, pay_cycle, status, start_date)
  values (b, u_grd, 'Joseph Kariuki', '0722000030', 'worker.guard@example.com', 'security', 15000, 'monthly', 'active', current_date - 200) returning id into w_g;
  insert into workers (tenant_id, full_name, phone, role, salary, pay_cycle, status, start_date)
  values (b, 'Grace Wanjiru', '0722000031', 'cleaner', 9000, 'monthly', 'active', current_date - 150) returning id into w_c;
  insert into workers (tenant_id, full_name, phone, role, salary, pay_cycle, status, start_date)
  values (b, 'Moses Otieno', '0722000032', 'gardener', 2500, 'weekly', 'active', current_date - 90) returning id into w_n;
  for d in 1..10 loop
    insert into attendance (tenant_id, worker_id, date, status, check_in, check_out, recorded_by)
    values (b, w_g, current_date - d, case when d % 7 = 0 then 'absent' else 'present' end,
            case when d % 7 = 0 then null else (current_date - d) + time '06:55' end,
            case when d % 7 = 0 then null else (current_date - d) + time '18:05' end, u_mgr) on conflict do nothing;
    insert into attendance (tenant_id, worker_id, date, status, recorded_by)
    values (b, w_c, current_date - d, case when d % 5 = 0 then 'leave' else 'present' end, u_mgr) on conflict do nothing;
  end loop;
  insert into worker_payments (tenant_id, worker_id, amount, period_start, period_end, payment_method, payment_status, paid_at, recorded_by)
  values (b, w_g, 15000, date_trunc('month', current_date - 31)::date, (date_trunc('month', current_date) - interval '1 day')::date, 'mpesa', 'paid', date_trunc('month', current_date) + interval '2 days', u_own),
         (b, w_c, 9000, date_trunc('month', current_date - 31)::date, (date_trunc('month', current_date) - interval '1 day')::date, 'cash', 'paid', date_trunc('month', current_date) + interval '2 days', u_own);

  -- complaints
  insert into complaints (tenant_id, tenancy_id, submitted_by, title, body, category, priority, status)
  values (b, (select id from tenancies where client_id = r1 and status = 'active'), r1, 'Tap leaks in the corridor',
          'The shared tap outside A101 has been dripping for three days.', 'maintenance', 'normal', 'open') returning id into v_c;
  insert into complaint_messages (tenant_id, complaint_id, sender_id, body, is_staff) values (b, v_c, r1, 'Please send someone, the floor is always wet.', false);
  insert into complaints (tenant_id, tenancy_id, submitted_by, title, body, category, priority, status, assigned_to)
  values (b, (select id from tenancies where client_id = r2 and status = 'active'), r2, 'Loud music at night',
          'Loud music from the next block after 11pm on weekends.', 'noise', 'high', 'in_progress', u_mgr) returning id into v_c;
  insert into complaint_messages (tenant_id, complaint_id, sender_id, body, is_staff) values
    (b, v_c, r2, 'It happens every Friday and Saturday.', false),
    (b, v_c, u_mgr, 'Thank you. The guard will do a round at 11pm this weekend.', true);
  insert into complaints (tenant_id, tenancy_id, submitted_by, title, body, category, priority, status, resolved_at)
  values (b, (select id from tenancies where client_id = r9 and status = 'active'), r9, 'Window latch broken', 'Latch does not close.', 'maintenance', 'low', 'resolved', now() - interval '2 days');

  -- a transfer request
  insert into room_transfers (tenant_id, tenancy_id, from_room_id, requested_by, reason, status)
  select b, t.id, t.room_id, r2, 'I would like a quieter room on the ground floor.', 'pending' from tenancies t where t.client_id = r2 and t.status = 'active';

  -- announcements
  insert into announcements (business_id, author_id, title, body, audience, pinned) values
    (b, u_own, 'Welcome to Sunrise Apartments', 'Rent is due on the 5th of every month. Pay with M-Pesa from My invoices.', 'all', true);
  insert into announcements (business_id, author_id, title, body, audience, building_id) values
    (b, u_mgr, 'Water shut-off in Block A', 'Water will be off in Block A on Saturday from 9am to 1pm for tank cleaning.', 'building', bl_a);
  insert into announcements (business_id, author_id, title, body, audience, building_id, floor_id)
  select b, u_mgr, 'Corridor painting, Block B ground floor', 'Please keep shoes off the fresh paint until Monday.', 'floor', bl_b, id
    from floors where building_id = bl_b and floor_number = 0;

  -- a conversation between resident01 and the manager
  insert into conversations (business_id, user_a, user_b, last_message_at, last_message_preview)
  values (b, least(r1, u_mgr), greatest(r1, u_mgr), now() - interval '1 hour', 'Sure, I will check it this afternoon.') returning id into v_conv;
  insert into conversation_members (conversation_id, user_id, last_read_at) values (v_conv, r1, now()), (v_conv, u_mgr, now() - interval '2 hours');
  insert into messages (conversation_id, sender_id, body, created_at) values
    (v_conv, r1, 'Hello Mark, can the leaking tap be fixed this week?', now() - interval '2 hours'),
    (v_conv, u_mgr, 'Sure, I will check it this afternoon.', now() - interval '1 hour');

  -- a support ticket from the visitor
  insert into support_tickets (user_id, subject, category, status) values (u_vis, 'How long does a request take?', 'general', 'open') returning id into v_tk;
  insert into ticket_messages (ticket_id, sender_id, body) values (v_tk, u_vis, 'I sent a request for room B105 two days ago. When will I hear back?');
end $$;
