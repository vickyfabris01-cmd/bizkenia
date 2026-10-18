-- 20261018100002_p5_06_storefront_checkout.sql — Phase 5 step 2
-- Storefront checkout: place_order, cancel_my_order, paying an order with M-Pesa, order help tickets.
-- The cart itself lives in the browser; everything that matters (price, stock, delivery fee) is
-- decided here from the database, never from what the browser sends.

-- ---- payment intents can belong to an order -----------------------------------------------
alter table payment_intents add column if not exists order_id uuid references orders(id) on delete set null;
create index if not exists payment_intents_order_idx on payment_intents (order_id);

-- ---- order help tickets -------------------------------------------------------------------
alter table support_tickets add column if not exists order_id uuid references orders(id) on delete set null;
alter table support_tickets drop constraint if exists support_tickets_category_check;
alter table support_tickets add constraint support_tickets_category_check
  check (category in ('general','account','billing','business','technical','other','order'));

-- ---- place_order --------------------------------------------------------------------------
-- p_items: [{ "product_id": "...", "quantity": 2 }, ...]
create or replace function place_order(
  p_business uuid, p_items jsonb, p_fulfilment text, p_method text,
  p_name text, p_phone text, p_county text default null, p_town text default null,
  p_street text default null, p_ship_notes text default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  s shop_settings; b businesses; o_id uuid; o_num text; it jsonb; p products;
  v_qty integer; v_sub numeric := 0; v_fee numeric := 0; v_ids uuid[] := '{}'; v_phone text;
begin
  if auth.uid() is null then raise exception 'Sign in to place an order' using errcode = '28000'; end if;
  if not account_active() then raise exception 'This account is switched off. Contact support.'; end if;
  select * into b from businesses where id = p_business;
  if b.id is null or b.status <> 'active' or b.business_type <> 'shop' then raise exception 'This shop is not open for orders'; end if;
  if is_staff(p_business) then raise exception 'You cannot order from your own shop'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Your cart is empty'; end if;
  if jsonb_array_length(p_items) > 50 then raise exception 'Too many different items in one order'; end if;
  if p_fulfilment not in ('delivery','pickup') then raise exception 'Choose delivery or pickup'; end if;
  if p_method not in ('mpesa','cash_on_delivery') then raise exception 'Choose how you will pay'; end if;
  if length(trim(coalesce(p_name,''))) < 2 then raise exception 'Enter the name of the person receiving the order'; end if;
  v_phone := normalize_phone(p_phone);
  if v_phone is null then raise exception 'Enter a valid phone number'; end if;

  select * into s from shop_settings where business_id = p_business;
  if not found then s.delivery_enabled := true; s.delivery_fee := 0; s.pickup_enabled := false; s.pay_on_delivery := false; end if;
  if p_fulfilment = 'delivery' and not s.delivery_enabled then raise exception 'This shop does not deliver. Choose pickup.'; end if;
  if p_fulfilment = 'pickup' and not s.pickup_enabled then raise exception 'This shop does not offer pickup. Choose delivery.'; end if;
  if p_fulfilment = 'delivery' and length(trim(coalesce(p_town,''))) = 0 and length(trim(coalesce(p_street,''))) = 0 then
    raise exception 'Enter the delivery address';
  end if;
  if p_method = 'cash_on_delivery' and not s.pay_on_delivery then raise exception 'This shop does not accept pay on delivery'; end if;

  -- validate lines and lock the products in a fixed order, so two buyers cannot oversell
  for it in select value from jsonb_array_elements(p_items) loop
    begin v_ids := v_ids || (it ->> 'product_id')::uuid; exception when others then raise exception 'An item in your cart is not valid'; end;
  end loop;
  if (select count(distinct x) from unnest(v_ids) x) <> array_length(v_ids, 1) then raise exception 'The same item appears twice in your cart'; end if;

  insert into orders (business_id, customer_id, status, payment_status, payment_method, fulfilment, subtotal, delivery_fee, total,
                      customer_name, customer_phone, ship_county, ship_town, ship_street, ship_notes, notes)
  values (p_business, auth.uid(), 'pending_payment', 'unpaid', p_method, p_fulfilment, 0, 0, 0,
          trim(p_name), v_phone, nullif(trim(p_county),''), nullif(trim(p_town),''), nullif(trim(p_street),''),
          nullif(trim(p_ship_notes),''), nullif(trim(p_notes),''))
  returning id, order_number into o_id, o_num;

  for it in select value from jsonb_array_elements(p_items) order by (value ->> 'product_id') loop
    v_qty := coalesce((it ->> 'quantity')::integer, 0);
    if v_qty < 1 or v_qty > 999 then raise exception 'Enter a quantity between 1 and 999'; end if;
    select * into p from products where id = (it ->> 'product_id')::uuid and business_id = p_business;
    if p.id is null or p.status <> 'active' then raise exception 'An item in your cart is no longer on sale'; end if;
    perform _shop_move_stock(p.id, -v_qty, 'sale', 'Order ' || o_num, o_id, auth.uid());   -- raises "Only N in stock for X"
    insert into order_items (order_id, product_id, name, unit_price, quantity, line_total)
    values (o_id, p.id, p.name, p.price, v_qty, p.price * v_qty);
    v_sub := v_sub + p.price * v_qty;
  end loop;

  if p_fulfilment = 'delivery' then
    v_fee := case when s.free_delivery_over is not null and v_sub >= s.free_delivery_over then 0 else coalesce(s.delivery_fee, 0) end;
  end if;
  update orders set subtotal = v_sub, delivery_fee = v_fee, total = v_sub + v_fee where id = o_id;
  insert into order_events (order_id, status, note, created_by)
  values (o_id, 'pending_payment', case when p_method = 'mpesa' then 'Order placed. Waiting for M-Pesa payment.' else 'Order placed. Pay on delivery.' end, auth.uid());
  perform _notify_staff(p_business, 'order', 'New order ' || o_num, 'KES ' || (v_sub + v_fee) || ' from ' || trim(p_name), '/app/' || b.slug || '/orders');
  return o_id;
end $$;
revoke all on function place_order(uuid,jsonb,text,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function place_order(uuid,jsonb,text,text,text,text,text,text,text,text,text) to authenticated;

-- ---- customer cancels an order that has not been paid ---------------------------------------
create or replace function cancel_my_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o orders; it record;
begin
  select * into o from orders where id = p_order for update;
  if o.id is null or o.customer_id is distinct from auth.uid() then raise exception 'Order not found' using errcode = '42501'; end if;
  if o.status <> 'pending_payment' or o.payment_status <> 'unpaid' then raise exception 'Only an order that is still waiting for payment can be cancelled here. Ask for help instead.'; end if;
  if exists (select 1 from payment_intents where order_id = o.id and status = 'pending' and created_at > now() - interval '3 minutes') then
    raise exception 'A payment prompt was just sent. Wait a minute, then try again.';
  end if;
  for it in select product_id, quantity from order_items where order_id = o.id and product_id is not null loop
    perform _shop_move_stock(it.product_id, it.quantity, 'return', 'Order ' || o.order_number || ' cancelled by customer', o.id, auth.uid());
  end loop;
  update orders set status = 'cancelled' where id = o.id;
  insert into order_events (order_id, status, note, created_by) values (o.id, 'cancelled', 'Cancelled by the customer', auth.uid());
  perform _notify_staff(o.business_id, 'order', 'Order ' || o.order_number || ' cancelled', 'The customer cancelled before paying.', '/app/' || _slug(o.business_id) || '/orders');
end $$;
revoke all on function cancel_my_order(uuid) from public, anon;
grant execute on function cancel_my_order(uuid) to authenticated;

-- ---- M-Pesa payment of an order -------------------------------------------------------------
create or replace function mark_intent_paid(p_intent uuid, p_receipt text default null) returns text
language plpgsql security definer set search_path = public as $$
declare v_i payment_intents; c billing_cycles; o orders;
begin
  select * into v_i from payment_intents where id = p_intent for update;
  if v_i.id is null then raise exception 'Payment not found'; end if;
  if v_i.status = 'success' then return 'already_paid'; end if;
  update payment_intents set status = 'success', mpesa_receipt = coalesce(p_receipt, mpesa_receipt) where id = p_intent;
  if v_i.purpose = 'rent' then
    select * into c from billing_cycles where id = v_i.billing_cycle_id;
    if c.id is not null then
      insert into payments (tenant_id, billing_cycle_id, client_id, amount, payment_method, payment_status, mpesa_receipt,
                            paid_at, payer_phone, intent_id, notes)
      values (c.tenant_id, c.id, c.client_id, v_i.amount_kes, 'mpesa', 'confirmed', coalesce(p_receipt, v_i.mpesa_receipt),
              now(), v_i.phone, v_i.id, 'Paid by STK push')
      on conflict do nothing;
      perform _note(c.client_id, c.tenant_id, 'payment', 'Payment received', 'KES ' || v_i.amount_kes || ' for invoice ' || c.invoice_number || '.', null);
      perform _notify_staff(c.tenant_id, 'payment', 'Rent payment received', 'KES ' || v_i.amount_kes || ' for invoice ' || c.invoice_number || '.',
                            '/app/' || _slug(c.tenant_id) || '/payments');
    end if;
    return 'rent_recorded';
  end if;
  if v_i.purpose = 'order' then
    select * into o from orders where id = v_i.order_id for update;
    if o.id is not null and o.payment_status = 'unpaid' and o.status <> 'cancelled' then
      update orders set status = 'paid', payment_status = 'paid', paid_at = now() where id = o.id;
      insert into order_events (order_id, status, note) values (o.id, 'paid', 'Paid with M-Pesa' || coalesce(' (' || coalesce(p_receipt, v_i.mpesa_receipt) || ')', ''));
      perform _note(o.customer_id, o.business_id, 'order', 'Payment received for ' || o.order_number, 'KES ' || v_i.amount_kes || '. The shop will prepare your order.', '/orders/' || o.id);
      perform _notify_staff(o.business_id, 'order', 'Order ' || o.order_number || ' is paid', 'KES ' || v_i.amount_kes || ' received by M-Pesa.', '/app/' || _slug(o.business_id) || '/orders');
    end if;
    return 'order_paid';
  end if;
  return _subscription_paid(v_i.business_id, v_i.plan_id, p_intent);
end $$;
revoke execute on function mark_intent_paid(uuid, text) from public, anon, authenticated;
grant execute on function mark_intent_paid(uuid, text) to service_role;

-- ---- a customer's view of a pending payment (used to poll) ----------------------------------
create or replace function my_order_payment(p_order uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('payment_status', o.payment_status, 'status', o.status,
    'last_attempt', (select jsonb_build_object('status', i.status, 'result_desc', i.result_desc)
                     from payment_intents i where i.order_id = o.id order by i.created_at desc limit 1))
  from orders o where o.id = p_order and o.customer_id = auth.uid();
$$;
grant execute on function my_order_payment(uuid) to authenticated;

-- ---- order help ticket ------------------------------------------------------------------------
create or replace function create_order_ticket(p_order uuid, p_subject text, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare o orders; v_id uuid; v_name text; r record;
begin
  select * into o from orders where id = p_order;
  if o.id is null or o.customer_id is distinct from auth.uid() then raise exception 'Order not found' using errcode = '42501'; end if;
  if coalesce(trim(p_subject),'') = '' or coalesce(trim(p_body),'') = '' then raise exception 'Write a subject and describe the problem'; end if;
  insert into support_tickets (user_id, business_id, order_id, subject, category)
  values (auth.uid(), o.business_id, o.id, left(trim(p_subject), 140) || ' (' || o.order_number || ')', 'order') returning id into v_id;
  insert into ticket_messages (ticket_id, sender_id, body) values (v_id, auth.uid(), trim(p_body));
  select coalesce(full_name, email) into v_name from profiles where id = auth.uid();
  for r in select id from profiles where role = 'super_admin' loop
    insert into notifications (user_id, type, title, body, link)
    values (r.id, 'ticket', 'Order help: ' || o.order_number, 'From ' || coalesce(v_name, 'a customer'), '/admin/support?t=' || v_id);
  end loop;
  perform _notify_staff(o.business_id, 'ticket', 'A customer asked for help with ' || o.order_number, left(trim(p_subject), 140), '/app/' || _slug(o.business_id) || '/orders');
  return v_id;
end $$;
revoke all on function create_order_ticket(uuid,text,text) from public, anon;
grant execute on function create_order_ticket(uuid,text,text) to authenticated;

-- ---- seller confirms an M-Pesa payment received outside the prompt (till / paybill statement) ----
create or replace function seller_mark_order_paid(p_order uuid, p_receipt text default null) returns void
language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  select * into o from orders where id = p_order for update;
  if o.id is null then raise exception 'Order not found'; end if;
  perform _need_staff(o.business_id);
  if o.payment_method <> 'mpesa' or o.status <> 'pending_payment' or o.payment_status <> 'unpaid' then
    raise exception 'This order is not waiting for an M-Pesa payment';
  end if;
  update orders set status = 'paid', payment_status = 'paid', paid_at = now() where id = o.id;
  insert into order_events (order_id, status, note, created_by)
  values (o.id, 'paid', 'Payment confirmed by the shop' || coalesce(' (M-Pesa ' || nullif(trim(p_receipt), '') || ')', ''), auth.uid());
  if o.customer_id is not null then
    perform _note(o.customer_id, o.business_id, 'order', 'Payment received for ' || o.order_number, 'The shop confirmed your payment.', '/orders/' || o.id);
  end if;
end $$;
revoke all on function seller_mark_order_paid(uuid,text) from public, anon;
grant execute on function seller_mark_order_paid(uuid,text) to authenticated;
