-- supabase/migrations/20261017100002_p5_02_shop_orders.sql — NEW FILE
-- Phase 5 (shop), part 2: customer addresses, carts, wishlists, orders, order items and the
-- tracking timeline. Orders are created and changed only by database functions (place_order in the
-- storefront step, set_order_status below), never by direct table writes.

create table if not exists addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  label text,
  recipient text not null,
  phone text not null,
  county text,
  town text,
  street text,
  notes text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_addresses_user on addresses (user_id);

create table if not exists carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  updated_at timestamptz not null default now(),
  unique (user_id, business_id)
);
create table if not exists cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references carts(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  unique (cart_id, product_id)
);

create table if not exists wishlists (
  user_id uuid not null references profiles(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid references profiles(id) on delete set null,
  order_number text not null unique default ('ORD-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5))),
  status text not null default 'pending_payment' check (status in ('pending_payment','paid','processing','shipped','ready_for_pickup','delivered','cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','refunded')),
  payment_method text not null default 'mpesa' check (payment_method in ('mpesa','cash_on_delivery')),
  fulfilment text not null default 'delivery' check (fulfilment in ('delivery','pickup')),
  subtotal numeric not null check (subtotal >= 0),
  delivery_fee numeric not null default 0 check (delivery_fee >= 0),
  total numeric not null check (total >= 0),
  customer_name text not null,
  customer_phone text not null,
  ship_county text,
  ship_town text,
  ship_street text,
  ship_notes text,
  notes text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_orders_business on orders (business_id, created_at desc);
create index if not exists idx_orders_customer on orders (customer_id, created_at desc);
drop trigger if exists trg_orders_touch on orders;
create trigger trg_orders_touch before update on orders for each row execute function shop_touch_updated_at();

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  name text not null,
  unit_price numeric not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric not null check (line_total >= 0)
);
create index if not exists idx_order_items_order on order_items (order_id);

create table if not exists order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  status text not null,
  note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_order_events_order on order_events (order_id, created_at);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'shop_stock_movements_order_fk') then
    alter table shop_stock_movements add constraint shop_stock_movements_order_fk foreign key (order_id) references orders(id) on delete set null;
  end if;
end $$;

-- Allow the new notification type for order updates (the full list from Phase 3, plus 'order').
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in
  ('billing','payment','complaint','announcement','system','invite','transfer','business_submitted','business_to_review',
   'business_approved','business_rejected','business_suspended','rental_request','offer','tenancy','worker','message','ticket','order'));

-- Seller: move an order along. Allowed steps only; cancelling puts the stock back; the customer is notified.
create or replace function set_order_status(p_order uuid, p_status text, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare o orders; ok boolean; it record;
begin
  select * into o from orders where id = p_order for update;
  if o.id is null then raise exception 'Order not found'; end if;
  perform _need_staff(o.business_id);
  ok := case o.status
    when 'pending_payment' then p_status in ('cancelled') or (o.payment_method = 'cash_on_delivery' and p_status = 'processing')
    when 'paid'            then p_status in ('processing','cancelled')
    when 'processing'      then p_status in ('shipped','ready_for_pickup','cancelled')
    when 'shipped'         then p_status in ('delivered')
    when 'ready_for_pickup' then p_status in ('delivered')
    else false end;
  if p_status = 'shipped' and o.fulfilment <> 'delivery' then ok := false; end if;
  if p_status = 'ready_for_pickup' and o.fulfilment <> 'pickup' then ok := false; end if;
  if not ok then raise exception 'An order that is % cannot be set to %', replace(o.status, '_', ' '), replace(p_status, '_', ' '); end if;

  if p_status = 'cancelled' then
    for it in select product_id, quantity from order_items where order_id = o.id and product_id is not null loop
      perform _shop_move_stock(it.product_id, it.quantity, 'return', 'Order ' || o.order_number || ' cancelled', o.id, auth.uid());
    end loop;
  end if;
  update orders set status = p_status,
         payment_status = case when p_status = 'delivered' and o.payment_method = 'cash_on_delivery' then 'paid' else payment_status end,
         paid_at = case when p_status = 'delivered' and o.payment_method = 'cash_on_delivery' then now() else paid_at end
   where id = o.id;
  insert into order_events (order_id, status, note, created_by) values (o.id, p_status, nullif(trim(p_note), ''), auth.uid());
  if o.customer_id is not null then
    -- notify() only reaches members of the business; a shop customer is not one, so insert directly.
    insert into notifications (user_id, tenant_id, type, title, body, link)
    values (o.customer_id, o.business_id, 'order', 'Order ' || o.order_number || ': ' || replace(p_status, '_', ' '),
            nullif(trim(p_note), ''), '/orders/' || o.id);
  end if;
  return p_status;
end $$;
revoke all on function set_order_status(uuid,text,text) from public, anon;
grant execute on function set_order_status(uuid,text,text) to authenticated;
