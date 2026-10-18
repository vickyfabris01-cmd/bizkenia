-- supabase/seed/p5.sql — NEW FILE
-- Phase 5 demo data (seller side) — DEVELOPMENT PROJECTS ONLY. Never run this on production.
-- Run AFTER p1_demo.sql and the four p5 migrations (p5_01 to p5_04). Safe to run twice.
-- Password for the demo accounts: Demo#1234
--   shop.demo@example.com    owner of "Mama Njeri Mart" (an active shop business in Nakuru)
--   buyer.demo@example.com   a customer with orders in the shop
-- Adds: 5 categories, 12 products (2 drafts, 1 archived, 2 low on stock, 2 out of stock), delivery
-- settings, and 7 orders in every state with their items and timelines. (The shopper-facing
-- storefront and checkout arrive in the next Phase 5 step; until then these orders are the only
-- way to see the Orders, Customers and Dashboard screens with data.)

do $$
declare v_id uuid; e text;
begin
  foreach e in array array['shop.demo@example.com', 'buyer.demo@example.com'] loop
    if not exists (select 1 from auth.users where email = e) then
      v_id := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
        phone_change, phone_change_token, reauthentication_token)
      values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', e,
        crypt('Demo#1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
        jsonb_build_object('full_name', case when e like 'shop%' then 'Njeri Mwangi' else 'Brian Otieno' end,
                           'phone', case when e like 'shop%' then '0722000050' else '0722000051' end),
        now(), now(), '', '', '', '', '', '', '', '');
      insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), v_id, v_id::text, 'email',
        jsonb_build_object('sub', v_id::text, 'email', e, 'email_verified', true), now(), now(), now());
    end if;
  end loop;
end $$;

do $$
declare
  u uuid := (select id from auth.users where email = 'shop.demo@example.com');
  c uuid := (select id from auth.users where email = 'buyer.demo@example.com');
  b uuid;
  k_food uuid; k_drinks uuid; k_home uuid; k_beauty uuid; k_stat uuid;
  p_rice uuid; p_juice uuid; p_soap uuid; p_pens uuid; p_sugar uuid; p_cream uuid;
  o uuid;
begin
  if exists (select 1 from businesses where slug = 'mama-njeri-mart') then return; end if;

  insert into businesses (name, slug, business_type, status, owner_user_id, description, county, phone, email, address, approved_at, submitted_at)
  values ('Mama Njeri Mart', 'mama-njeri-mart', 'shop', 'active', u,
          'Groceries, drinks and household items, delivered across Nakuru town.',
          'Nakuru', '0722000050', 'shop.demo@example.com', 'Moi Avenue, Nakuru', now(), now()) returning id into b;
  insert into business_members (business_id, user_id, role) values (b, u, 'owner') on conflict do nothing;

  insert into product_categories (business_id, name, sort_order) values (b, 'Food', 1) returning id into k_food;
  insert into product_categories (business_id, name, sort_order) values (b, 'Drinks', 2) returning id into k_drinks;
  insert into product_categories (business_id, name, sort_order) values (b, 'Household', 3) returning id into k_home;
  insert into product_categories (business_id, name, sort_order) values (b, 'Beauty', 4) returning id into k_beauty;
  insert into product_categories (business_id, name, sort_order) values (b, 'Stationery', 5) returning id into k_stat;

  insert into products (business_id, category_id, name, description, price, compare_at_price, stock, low_stock_level, unit, sku, status) values
    (b, k_food,   'Pishori rice 2 kg',      'Long-grain aromatic rice.',           420, 480, 40, 10, 'pack',  'RICE-2KG',  'active') returning id into p_rice;
  insert into products (business_id, category_id, name, description, price, stock, low_stock_level, unit, sku, status) values
    (b, k_food,   'Maize flour 2 kg',       'Sifted ugali flour.',                 190, 60, 15, 'pack',  'FLOUR-2KG', 'active'),
    (b, k_food,   'White sugar 1 kg',       'Refined sugar.',                      165, 4,  10, 'pack',  'SUGAR-1KG', 'active'),
    (b, k_food,   'Cooking oil 1 L',        'Vegetable cooking oil.',              310, 0,  8,  'bottle','OIL-1L',    'active');
  select id into p_sugar from products where business_id = b and sku = 'SUGAR-1KG';
  insert into products (business_id, category_id, name, description, price, stock, low_stock_level, unit, sku, status) values
    (b, k_drinks, 'Fresh orange juice 1 L', 'Pressed, no added sugar.',            150, 24, 6,  'bottle','JUICE-1L',  'active') returning id into p_juice;
  insert into products (business_id, category_id, name, price, stock, low_stock_level, unit, sku, status) values
    (b, k_drinks, 'Mineral water 500 ml',   50,  120, 24, 'bottle','WATER-500', 'active'),
    (b, k_home,   'Bar soap (3 pack)',      180, 35, 8,  'pack',  'SOAP-3',    'active');
  select id into p_soap from products where business_id = b and sku = 'SOAP-3';
  insert into products (business_id, category_id, name, price, stock, low_stock_level, unit, sku, status) values
    (b, k_home,   'Laundry powder 1 kg',    260, 3,  8,  'pack',  'POWDER-1',  'active'),
    (b, k_beauty, 'Shea body cream 250 ml', 350, 18, 5,  'jar',   'CREAM-250', 'draft'),
    (b, k_stat,   'Ballpoint pens (10)',    120, 50, 10, 'pack',  'PENS-10',   'active');
  select id into p_pens from products where business_id = b and sku = 'PENS-10';
  insert into products (business_id, category_id, name, price, stock, low_stock_level, unit, sku, status) values
    (b, k_beauty, 'Hair oil 200 ml',        280, 0,  5,  'bottle','HAIROIL',   'draft'),
    (b, k_stat,   'Exercise books (5)',     200, 12, 6,  'pack',  'BOOKS-5',   'archived');
  select id into p_cream from products where business_id = b and sku = 'CREAM-250';

  insert into shop_settings (business_id, delivery_enabled, delivery_fee, free_delivery_over, pickup_enabled, pickup_address, pay_on_delivery, delivery_note)
  values (b, true, 150, 3000, true, 'Moi Avenue, opposite the market, Nakuru', false, 'Delivery within Nakuru town the same day for orders before 3 pm.');

  -- 1 awaiting payment (M-Pesa)
  insert into orders (business_id, customer_id, status, payment_status, payment_method, fulfilment, subtotal, delivery_fee, total, customer_name, customer_phone, ship_county, ship_town, ship_street, created_at)
  values (b, c, 'pending_payment', 'unpaid', 'mpesa', 'delivery', 300, 150, 450, 'Brian Otieno', '+254722000051', 'Nakuru', 'Nakuru', 'Section 58, Bondeni', now() - interval '20 minutes') returning id into o;
  insert into order_items (order_id, product_id, name, unit_price, quantity, line_total) values (o, p_juice, 'Fresh orange juice 1 L', 150, 2, 300);

  -- 2 paid, waiting to be processed
  insert into orders (business_id, customer_id, status, payment_status, payment_method, fulfilment, subtotal, delivery_fee, total, customer_name, customer_phone, ship_county, ship_town, ship_street, paid_at, created_at)
  values (b, c, 'paid', 'paid', 'mpesa', 'delivery', 840, 150, 990, 'Brian Otieno', '+254722000051', 'Nakuru', 'Nakuru', 'Section 58, Bondeni', now() - interval '2 hours', now() - interval '2 hours') returning id into o;
  insert into order_items (order_id, product_id, name, unit_price, quantity, line_total) values (o, p_rice, 'Pishori rice 2 kg', 420, 2, 840);
  insert into order_events (order_id, status, note) values (o, 'paid', null);

  -- 3 processing (pickup)
  insert into orders (business_id, customer_id, status, payment_status, payment_method, fulfilment, subtotal, delivery_fee, total, customer_name, customer_phone, paid_at, created_at)
  values (b, c, 'processing', 'paid', 'mpesa', 'pickup', 360, 0, 360, 'Brian Otieno', '+254722000051', now() - interval '1 day', now() - interval '1 day') returning id into o;
  insert into order_items (order_id, product_id, name, unit_price, quantity, line_total) values (o, p_soap, 'Bar soap (3 pack)', 180, 2, 360);
  insert into order_events (order_id, status, note, created_by) values (o, 'paid', null, null), (o, 'processing', 'Packing your order', u);

  -- 4 shipped
  insert into orders (business_id, customer_id, status, payment_status, payment_method, fulfilment, subtotal, delivery_fee, total, customer_name, customer_phone, ship_county, ship_town, ship_street, paid_at, created_at)
  values (b, c, 'shipped', 'paid', 'mpesa', 'delivery', 240, 150, 390, 'Brian Otieno', '+254722000051', 'Nakuru', 'Nakuru', 'Section 58, Bondeni', now() - interval '2 days', now() - interval '2 days') returning id into o;
  insert into order_items (order_id, product_id, name, unit_price, quantity, line_total) values (o, p_pens, 'Ballpoint pens (10)', 120, 2, 240);
  insert into order_events (order_id, status, note, created_by) values (o, 'paid', null, null), (o, 'processing', null, u), (o, 'shipped', 'Rider will call before arriving', u);

  -- 5 delivered (M-Pesa) and 6 delivered (pay on delivery)
  insert into orders (business_id, customer_id, status, payment_status, payment_method, fulfilment, subtotal, delivery_fee, total, customer_name, customer_phone, ship_county, ship_town, ship_street, paid_at, created_at)
  values (b, c, 'delivered', 'paid', 'mpesa', 'delivery', 1260, 0, 1260, 'Brian Otieno', '+254722000051', 'Nakuru', 'Nakuru', 'Section 58, Bondeni', now() - interval '6 days', now() - interval '6 days') returning id into o;
  insert into order_items (order_id, product_id, name, unit_price, quantity, line_total) values (o, p_rice, 'Pishori rice 2 kg', 420, 3, 1260);
  insert into order_events (order_id, status, note, created_by) values (o, 'paid', null, null), (o, 'processing', null, u), (o, 'shipped', null, u), (o, 'delivered', 'Left with the gate guard', u);
  insert into orders (business_id, customer_id, status, payment_status, payment_method, fulfilment, subtotal, delivery_fee, total, customer_name, customer_phone, ship_county, ship_town, ship_street, paid_at, created_at)
  values (b, c, 'delivered', 'paid', 'cash_on_delivery', 'delivery', 150, 150, 300, 'Brian Otieno', '+254722000051', 'Nakuru', 'Nakuru', 'Section 58, Bondeni', now() - interval '9 days', now() - interval '9 days') returning id into o;
  insert into order_items (order_id, product_id, name, unit_price, quantity, line_total) values (o, p_juice, 'Fresh orange juice 1 L', 150, 1, 150);
  insert into order_events (order_id, status, note, created_by) values (o, 'processing', null, u), (o, 'shipped', null, u), (o, 'delivered', 'Paid cash to the rider', u);

  -- 7 cancelled
  insert into orders (business_id, customer_id, status, payment_status, payment_method, fulfilment, subtotal, delivery_fee, total, customer_name, customer_phone, ship_county, ship_town, ship_street, created_at)
  values (b, c, 'cancelled', 'unpaid', 'mpesa', 'delivery', 165, 150, 315, 'Brian Otieno', '+254722000051', 'Nakuru', 'Nakuru', 'Section 58, Bondeni', now() - interval '12 days') returning id into o;
  insert into order_items (order_id, product_id, name, unit_price, quantity, line_total) values (o, p_sugar, 'White sugar 1 kg', 165, 1, 165);
  insert into order_events (order_id, status, note, created_by) values (o, 'cancelled', 'Customer changed their mind', u);
end $$;
