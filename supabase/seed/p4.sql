-- supabase/seed/p4.sql — NEW FILE
-- Phase 4 demo data — DEVELOPMENT PROJECTS ONLY. Never run this on production.
-- Run AFTER p1_demo.sql and the six p4 migrations. Safe to run twice.
-- Password for the demo account: Demo#1234
--   farmer.demo@example.com   owner of "Wanjiku Green Acres" (an active agriculture business in Nakuru)
-- Adds: 3 fields drawn on the map, 4 crops with work and harvests, 6 supplies (2 below their reorder level),
-- 2 livestock groups with events, a year of income and costs, and tasks (some due or overdue).

do $$
declare v_id uuid;
begin
  if not exists (select 1 from auth.users where email = 'farmer.demo@example.com') then
    v_id := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token)
    values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', 'farmer.demo@example.com',
      crypt('Demo#1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
      jsonb_build_object('full_name', 'Wanjiku Kamau', 'phone', '0722000040'), now(), now(), '', '', '', '', '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_id, v_id::text, 'email',
      jsonb_build_object('sub', v_id::text, 'email', 'farmer.demo@example.com', 'email_verified', true), now(), now(), now());
  end if;
end $$;

do $$
declare
  u uuid := (select id from auth.users where email = 'farmer.demo@example.com');
  b uuid;
  f1 uuid; f2 uuid; f3 uuid;
  c_maize uuid; c_beans uuid; c_tom uuid; c_kale uuid;
  g_cows uuid; g_layers uuid;
  i_dap uuid;
  m int;
begin
  if exists (select 1 from businesses where slug = 'wanjiku-green-acres') then return; end if;

  insert into businesses (name, slug, business_type, status, owner_user_id, description, county, phone, email, address, approved_at, submitted_at)
  values ('Wanjiku Green Acres', 'wanjiku-green-acres', 'agriculture', 'active', u,
          'A family farm growing maize, beans and vegetables, with dairy cows and layers.',
          'Nakuru', '0722000040', 'farmer.demo@example.com', 'Njoro, Nakuru', now(), now()) returning id into b;
  insert into business_members (business_id, user_id, role) values (b, u, 'owner') on conflict do nothing;

  insert into farm_fields (business_id, name, area_ha, boundary, notes) values
    (b, 'North plot', 3.0135, '{"type":"Polygon","coordinates":[[[36.08,-0.3031],[36.08,-0.3012913],[36.0813475,-0.3012913],[36.0813475,-0.3031],[36.08,-0.3031]]]}'::jsonb, 'Red loam, near the borehole') returning id into f1;
  insert into farm_fields (business_id, name, area_ha, boundary, notes) values
    (b, 'River field', 3.134, '{"type":"Polygon","coordinates":[[[36.0815,-0.3065],[36.0815,-0.3041486],[36.082578,-0.3041486],[36.082578,-0.3065],[36.0815,-0.3065]]]}'::jsonb, 'Next to the river, good for vegetables') returning id into f2;
  insert into farm_fields (business_id, name, area_ha, boundary, notes) values
    (b, 'Hill pasture', 1.6273, '{"type":"Polygon","coordinates":[[[36.083,-0.302],[36.083,-0.3003721],[36.0838085,-0.3003721],[36.0838085,-0.302],[36.083,-0.302]]]}'::jsonb, 'Grazing and napier grass') returning id into f3;

  insert into crops (business_id, field_id, name, variety, status, planted_date, expected_harvest, notes) values
    (b, f1, 'Maize', 'H614', 'growing', current_date - 95, current_date + 40, 'Long rains crop') returning id into c_maize;
  insert into crops (business_id, field_id, name, variety, status, planted_date, expected_harvest) values
    (b, f1, 'Beans', 'Rosecoco', 'harvested', current_date - 170, current_date - 80) returning id into c_beans;
  insert into crops (business_id, field_id, name, variety, status, planted_date, expected_harvest) values
    (b, f2, 'Tomatoes', 'Anna F1', 'planted', current_date - 20, current_date + 60) returning id into c_tom;
  insert into crops (business_id, field_id, name, variety, status, planned_date) values
    (b, f2, 'Kale', 'Sukuma wiki', 'planned', current_date + 14) returning id into c_kale;

  insert into crop_activities (business_id, crop_id, kind, activity_date, quantity, unit, notes) values
    (b, c_maize, 'planting',    current_date - 95, 25, 'kg',     'Seed at 25 kg per hectare'),
    (b, c_maize, 'fertilising', current_date - 94, 150, 'kg',    'DAP at planting'),
    (b, c_maize, 'weeding',     current_date - 60, null, null,   'First weeding'),
    (b, c_maize, 'fertilising', current_date - 45, 100, 'kg',    'CAN top dressing'),
    (b, c_beans, 'planting',    current_date - 170, 40, 'kg',    null),
    (b, c_tom,   'planting',    current_date - 20, 3000, 'seedlings', 'Transplanted'),
    (b, c_tom,   'spraying',    current_date - 6, 4, 'litres',   'Against blight');
  insert into harvests (business_id, crop_id, harvest_date, quantity_kg, notes) values
    (b, c_beans, current_date - 82, 620, 'First picking'),
    (b, c_beans, current_date - 78, 410, 'Second picking');

  insert into farm_inventory_items (business_id, name, category, unit, quantity, reorder_level, unit_cost) values
    (b, 'DAP fertiliser', 'fertiliser', 'kg', 40, 100, 120) returning id into i_dap;
  insert into farm_inventory_items (business_id, name, category, unit, quantity, reorder_level, unit_cost) values
    (b, 'CAN fertiliser', 'fertiliser', 'kg', 250, 100, 95),
    (b, 'Maize seed H614', 'seed', 'kg', 60, 25, 380),
    (b, 'Dairy meal', 'feed', 'kg', 15, 200, 62),
    (b, 'Diesel', 'fuel', 'litres', 80, 30, 190),
    (b, 'Fungicide', 'chemical', 'litres', 12, 5, 1450);
  insert into inventory_movements (business_id, item_id, kind, quantity, balance_after, note)
  values (b, i_dap, 'in', 200, 200, 'Opening stock'), (b, i_dap, 'out', 160, 40, 'Used on maize and tomatoes');

  insert into livestock_groups (business_id, name, species, breed, head_count) values (b, 'Dairy cows', 'cattle', 'Friesian', 8) returning id into g_cows;
  insert into livestock_groups (business_id, name, species, breed, head_count) values (b, 'Layers', 'poultry', 'Kenbro', 120) returning id into g_layers;
  insert into livestock_events (business_id, group_id, kind, event_date, head_change, amount, notes) values
    (b, g_cows,   'vaccination', current_date - 12, 0, null, 'Foot and mouth'),
    (b, g_cows,   'birth',       current_date - 30, 1, null, 'Heifer calf'),
    (b, g_layers, 'feeding',     current_date - 2,  0, null, 'Layers mash, 12 bags'),
    (b, g_layers, 'sale',        current_date - 20, -10, 15000, 'Culled hens');
  insert into farm_income (business_id, source, amount, income_date, group_id, description)
  values (b, 'livestock_sale', 15000, current_date - 20, g_layers, 'Sold 10 from Layers');

  -- a year of money: milk and egg sales each month, bean sales, regular costs
  for m in 0..11 loop
    insert into farm_income (business_id, source, amount, income_date, description) values
      (b, 'other', 42000 + (m * 1500), (date_trunc('month', current_date) - make_interval(months => m))::date + 9, 'Milk sales for the month'),
      (b, 'other', 18000 + ((m % 4) * 1200), (date_trunc('month', current_date) - make_interval(months => m))::date + 14, 'Egg sales for the month');
    insert into farm_expenses (business_id, category, amount, expense_date, description) values
      (b, 'feed',   24000 + ((m % 3) * 2000), (date_trunc('month', current_date) - make_interval(months => m))::date + 3, 'Dairy meal and layers mash'),
      (b, 'labour', 18000, (date_trunc('month', current_date) - make_interval(months => m))::date + 26, 'Farm hand wages'),
      (b, 'fuel',   3500 + ((m % 2) * 800), (date_trunc('month', current_date) - make_interval(months => m))::date + 11, 'Diesel and transport');
  end loop;
  insert into farm_income (business_id, source, amount, income_date, crop_id, description) values
    (b, 'crop_sale', 62000, current_date - 75, c_beans, 'Sold 1,000 kg of beans');
  insert into farm_expenses (business_id, category, amount, expense_date, crop_id, description) values
    (b, 'seeds',      9500,  current_date - 95, c_maize, 'Maize seed'),
    (b, 'fertiliser', 18000, current_date - 94, c_maize, 'DAP for maize'),
    (b, 'fertiliser', 9500,  current_date - 45, c_maize, 'CAN top dressing'),
    (b, 'seeds',      16000, current_date - 20, c_tom,   'Tomato seedlings'),
    (b, 'chemicals',  5800,  current_date - 6,  c_tom,   'Fungicide');

  insert into farm_tasks (business_id, title, due_date, field_id, crop_id) values
    (b, 'Spray the tomatoes again', current_date, f2, c_tom),
    (b, 'Order dairy meal', current_date - 2, null, null),
    (b, 'Prepare River field for kale', current_date + 7, f2, c_kale),
    (b, 'Service the water pump', current_date + 21, null, null);
  insert into farm_tasks (business_id, title, due_date, status, completed_at) values
    (b, 'Vaccinate the dairy cows', current_date - 12, 'done', now() - interval '12 days');
end $$;
