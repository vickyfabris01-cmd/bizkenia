-- Phase 1 demo data — DEVELOPMENT PROJECTS ONLY. Never run this on production.
-- Password for every demo account: Demo#1234
-- Super admin: use your real account (profiles.role = 'super_admin'); no demo super admin is created on purpose.

do $$
declare
  r record; v_id uuid;
begin
  for r in select * from (values
    ('owner.active@example.com',   'Amina Wanjiru',  '0711000001'),
    ('owner.two@example.com',      'Peter Otieno',   '0711000002'),
    ('owner.pending@example.com',  'Grace Mutua',    '0711000003'),
    ('owner.rejected@example.com', 'Samuel Kiptoo',  '0711000004'),
    ('visitor@example.com',        'Visiting Vera',  '0711000005')
  ) as t(email, name, phone)
  loop
    if not exists (select 1 from auth.users where email = r.email) then
      v_id := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
        phone_change, phone_change_token, reauthentication_token)
      values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', r.email,
        crypt('Demo#1234', gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object('full_name', r.name, 'phone', r.phone), now(), now(),
        '', '', '', '', '', '', '', '');
      insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), v_id, v_id::text, 'email',
        jsonb_build_object('sub', v_id::text, 'email', r.email, 'email_verified', true), now(), now(), now());
    end if;
  end loop;
end $$;

do $$
declare
  u_active uuid := (select id from auth.users where email = 'owner.active@example.com');
  u_two uuid := (select id from auth.users where email = 'owner.two@example.com');
  u_pending uuid := (select id from auth.users where email = 'owner.pending@example.com');
  u_rejected uuid := (select id from auth.users where email = 'owner.rejected@example.com');
  v_plan uuid := (select id from subscription_plans where code = 'rental_monthly');
  b uuid;
begin
  if exists (select 1 from businesses where slug = 'sunrise-apartments') then return; end if;

  insert into businesses (name, slug, business_type, status, owner_user_id, description, county, phone, email, address, approved_at, submitted_at)
  values ('Sunrise Apartments', 'sunrise-apartments', 'rental', 'active', u_active,
          'Bright bedsitters and one-bedroom homes close to the Thika Road bus stage. Water and security included.',
          'Nairobi', '0711000001', 'owner.active@example.com', 'Roysambu, Nairobi', now(), now()) returning id into b;
  insert into business_members (business_id, user_id, role) values (b, u_active, 'owner');
  insert into business_subscriptions (business_id, plan_id, amount_kes, period_end) values (b, v_plan, 1500, now() + interval '30 days');

  insert into businesses (name, slug, business_type, status, owner_user_id, description, county, phone, email, address, approved_at, submitted_at)
  values ('Greenview Hostels', 'greenview-hostels', 'rental', 'active', u_active,
          'Student hostel with single and shared rooms, study room and Wi-Fi.',
          'Nakuru', '0711000001', 'owner.active@example.com', 'Njoro Road, Nakuru', now(), now()) returning id into b;
  insert into business_members (business_id, user_id, role) values (b, u_active, 'owner');
  insert into business_subscriptions (business_id, plan_id, amount_kes, period_end) values (b, v_plan, 1500, now() + interval '30 days');

  insert into businesses (name, slug, business_type, status, owner_user_id, description, county, phone, email, address, approved_at, submitted_at)
  values ('Coastline Stays', 'coastline-stays', 'rental', 'active', u_two,
          'Furnished studio and two-bedroom units a short walk from Nyali beach.',
          'Mombasa', '0711000002', 'owner.two@example.com', 'Nyali, Mombasa', now(), now()) returning id into b;
  insert into business_members (business_id, user_id, role) values (b, u_two, 'owner');
  insert into business_subscriptions (business_id, plan_id, amount_kes, period_end) values (b, v_plan, 1500, now() + interval '30 days');

  insert into businesses (name, slug, business_type, status, owner_user_id, description, county, phone, email, submitted_at)
  values ('Lakeview Rentals', 'lakeview-rentals', 'rental', 'pending', u_pending,
          'Family homes with a view of Lake Victoria.', 'Kisumu', '0711000003', 'owner.pending@example.com', now()) returning id into b;
  insert into business_members (business_id, user_id, role) values (b, u_pending, 'owner');
  insert into business_subscriptions (business_id, plan_id, amount_kes, period_end) values (b, v_plan, 1500, now() + interval '30 days');

  insert into businesses (name, slug, business_type, status, owner_user_id, description, county, phone, email, submitted_at, rejection_reason)
  values ('Hilltop Hostel', 'hilltop-hostel', 'rental', 'rejected', u_rejected,
          'Hostel rooms.', 'Eldoret', '0711000004', 'owner.rejected@example.com', now(),
          'Please add a full description and the physical address of the property.') returning id into b;
  insert into business_members (business_id, user_id, role) values (b, u_rejected, 'owner');
  insert into business_subscriptions (business_id, plan_id, amount_kes, period_end) values (b, v_plan, 1500, now() + interval '30 days');

  update profiles set role = 'owner', tenant_id = (select id from businesses where slug = 'sunrise-apartments') where id = u_active;
  update profiles set role = 'owner', tenant_id = (select id from businesses where slug = 'coastline-stays') where id = u_two;
end $$;
