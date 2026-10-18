-- supabase/migrations/20261017100001_p5_01_shop_catalog.sql — NEW FILE
-- Phase 5 (shop), part 1: the catalogue. Categories and products of a shop business, and a stock
-- ledger. A product's stock changes only through record_shop_stock (the seller) or the internal
-- _shop_move_stock (orders), so it can never go below zero and every change leaves a record.

create or replace function shop_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create table if not exists product_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_product_category_name on product_categories (business_id, lower(name));

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  category_id uuid references product_categories(id) on delete set null,
  name text not null check (length(trim(name)) > 0),
  description text,
  price numeric not null check (price >= 0),
  compare_at_price numeric check (compare_at_price is null or compare_at_price > price),
  stock integer not null default 0 check (stock >= 0),
  low_stock_level integer not null default 5 check (low_stock_level >= 0),
  unit text not null default 'item',
  sku text,
  images text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_products_business_status on products (business_id, status);
create index if not exists idx_products_category on products (category_id);
create unique index if not exists uq_product_sku on products (business_id, lower(sku)) where sku is not null;
drop trigger if exists trg_products_touch on products;
create trigger trg_products_touch before update on products for each row execute function shop_touch_updated_at();

create table if not exists shop_stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  kind text not null check (kind in ('in','out','adjust','sale','return')),
  quantity integer not null,          -- positive; for 'adjust' it is the new counted total
  balance_after integer not null,
  note text,
  order_id uuid,                      -- set for 'sale' and 'return' (foreign key added in p5_02)
  moved_at timestamptz not null default now(),
  created_by uuid references profiles(id) on delete set null
);
create index if not exists idx_shop_moves_product on shop_stock_movements (product_id, moved_at desc);

-- A product may only sit in a category of the SAME business.
create or replace function shop_product_same_business() returns trigger language plpgsql as $$
begin
  if new.category_id is not null and not exists (select 1 from product_categories where id = new.category_id and business_id = new.business_id) then
    raise exception 'That category belongs to a different business';
  end if;
  return new;
end $$;
drop trigger if exists trg_product_same_business on products;
create trigger trg_product_same_business before insert or update of category_id, business_id on products
  for each row execute function shop_product_same_business();

-- Stock may not be edited by hand once a product exists (new products start with their opening stock).
create or replace function shop_guard_stock() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.stock is distinct from old.stock and current_setting('shop.allow_stock', true) is distinct from 'on' then
    raise exception 'Change stock with a stock in, stock out or recount entry';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_stock on products;
create trigger trg_guard_stock before update on products for each row execute function shop_guard_stock();

-- Internal: move stock and write the ledger. Used by record_shop_stock and by orders. Not callable by users.
create or replace function _shop_move_stock(p_product uuid, p_delta integer, p_kind text, p_note text, p_order uuid, p_by uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare p products; v_new integer; v_qty integer;
begin
  select * into p from products where id = p_product for update;
  if p.id is null then raise exception 'Product not found'; end if;
  v_new := p.stock + p_delta;
  if v_new < 0 then raise exception 'Only % in stock for %', p.stock, p.name; end if;
  perform set_config('shop.allow_stock', 'on', true);
  update products set stock = v_new where id = p_product;
  perform set_config('shop.allow_stock', 'off', true);
  v_qty := case when p_kind = 'adjust' then v_new else abs(p_delta) end;
  insert into shop_stock_movements (business_id, product_id, kind, quantity, balance_after, note, order_id, created_by)
  values (p.business_id, p_product, p_kind, v_qty, v_new, nullif(trim(p_note), ''), p_order, p_by);
  return v_new;
end $$;
revoke all on function _shop_move_stock(uuid,integer,text,text,uuid,uuid) from public, anon, authenticated;

-- Seller: stock in, stock out, or a recount (p_quantity is the counted total).
create or replace function record_shop_stock(p_product uuid, p_kind text, p_quantity integer, p_note text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare p products; v_delta integer;
begin
  select * into p from products where id = p_product;
  if p.id is null then raise exception 'Product not found'; end if;
  perform _need_staff(p.business_id);
  if p_kind not in ('in','out','adjust') then raise exception 'Choose stock in, stock out or a recount'; end if;
  if p_quantity is null or p_quantity < 0 or (p_kind <> 'adjust' and p_quantity = 0) then raise exception 'Enter a quantity above zero'; end if;
  v_delta := case p_kind when 'in' then p_quantity when 'out' then -p_quantity else p_quantity - p.stock end;
  return _shop_move_stock(p_product, v_delta, p_kind, p_note, null, auth.uid());
end $$;
revoke all on function record_shop_stock(uuid,text,integer,text) from public, anon;
grant execute on function record_shop_stock(uuid,text,integer,text) to authenticated;
