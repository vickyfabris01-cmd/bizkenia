-- supabase/migrations/20261021100003_holdings_listings_sales.sql
--
-- AIM
-- Everything a farm or shop sells must come from something it really holds, and every sale
-- (online, recorded by hand, or a walk-in for something never listed) takes the quantity out of
-- that holding, so the farm's records keep themselves.
--
--   HOLDINGS   a store item (produce in store, inputs, tools, machinery), a crop in the field
--              (its field quantity), or a livestock group (head count).
--   LISTINGS   a product is a quantity OFFERED from one holding. The total offered from a holding
--              can never exceed what is on hand: 10 bulls cannot be listed when 5 exist. A listing
--              may use a different unit and ratio ("maize fodder, 1 bundle = 5 kg of the maize crop").
--              A shop product with no holding is its own store: store_quantity is what the shop
--              has, stock is what is listed ("list everything", or only some).
--   SALES      online orders and recorded sales both go through the same engine. record_sale takes
--              a sale made outside the system, from a listing or from the holding directly (an
--              unlisted walk-in sale), reduces the holding and the listing, and for a farm adds the
--              income. void_sale reverses it.
--   FIELD      move_field_to_store moves a harvested quantity from the field into a store item.
--   PAYMENT    place_order now also accepts farms: M-Pesa only, collected by pickup, no delivery.
-- Safe to run more than once. Needs the farm (p4) and shop (p5) migrations.

-- ============================================================================================
-- 1. Columns and tables
-- ============================================================================================
alter table farm_inventory_items drop constraint if exists farm_inventory_items_category_check;
alter table farm_inventory_items add constraint farm_inventory_items_category_check
  check (category in ('seed','fertiliser','chemical','feed','tool','machinery','fuel','produce','other'));
alter table farm_inventory_items add column if not exists serial_no text;
alter table farm_inventory_items add column if not exists condition text
  check (condition is null or condition in ('good','fair','needs_repair','out_of_use'));

alter table inventory_movements drop constraint if exists inventory_movements_kind_check;
alter table inventory_movements add constraint inventory_movements_kind_check check (kind in ('in','out','adjust','sale','return'));

alter table crops add column if not exists field_quantity numeric check (field_quantity is null or field_quantity >= 0);
alter table crops add column if not exists field_unit text not null default 'kg';

alter table livestock_groups add column if not exists animal_class text;

create table if not exists field_stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  crop_id uuid not null references crops(id) on delete cascade,
  kind text not null check (kind in ('sale','return','moved_to_store','adjust')),
  quantity numeric not null,
  balance_after numeric not null,
  note text,
  moved_at timestamptz not null default now(),
  created_by uuid references profiles(id) on delete set null
);
create index if not exists idx_field_moves_crop on field_stock_movements (crop_id, moved_at desc);

alter table products add column if not exists store_quantity integer not null default 0 check (store_quantity >= 0);
alter table products add column if not exists list_all boolean not null default true;
alter table products add column if not exists source_kind text check (source_kind is null or source_kind in ('item','crop','livestock'));
alter table products add column if not exists source_id uuid;
alter table products add column if not exists per_unit numeric not null default 1 check (per_unit > 0);
alter table products add column if not exists available_until date;
alter table products drop constraint if exists products_source_pair;
alter table products add constraint products_source_pair check ((source_kind is null) = (source_id is null));
create index if not exists idx_products_source on products (source_kind, source_id) where source_kind is not null;

-- products that already exist keep their stock: it becomes what they have in store, all listed
update products set store_quantity = stock where source_kind is null and store_quantity = 0 and stock > 0;
alter table products drop constraint if exists products_listed_within_store;
alter table products add constraint products_listed_within_store check (source_kind is not null or stock <= store_quantity);

alter table shop_stock_movements add column if not exists store_after integer;

create table if not exists recorded_sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  source_kind text check (source_kind is null or source_kind in ('item','crop','livestock','product')),
  source_id uuid,
  item_name text not null,
  unit text,
  quantity numeric not null check (quantity > 0),
  unit_price numeric not null check (unit_price >= 0),
  total numeric not null check (total >= 0),
  buyer_name text,
  buyer_phone text,
  sold_on date not null default current_date,
  note text,
  from_listing numeric not null default 0,      -- units that came off the listing
  source_units numeric not null default 0,      -- amount taken off the holding, in the holding's unit
  voided_at timestamptz,
  void_reason text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_recorded_sales_business on recorded_sales (business_id, sold_on desc, created_at desc);

alter table farm_income add column if not exists sale_id uuid references recorded_sales(id) on delete cascade;
alter table farm_income add column if not exists order_id uuid references orders(id) on delete cascade;
create unique index if not exists uq_farm_income_order on farm_income (order_id) where order_id is not null;

alter table recorded_sales enable row level security;
alter table field_stock_movements enable row level security;
drop policy if exists recorded_sales_read on recorded_sales;
create policy recorded_sales_read on recorded_sales for select to authenticated using (is_staff(business_id) or coalesce(is_super_admin(), false));
drop policy if exists field_stock_movements_read on field_stock_movements;
create policy field_stock_movements_read on field_stock_movements for select to authenticated using (is_staff(business_id) or coalesce(is_super_admin(), false));

-- produce can be hidden on a date (greens and vegetables do not keep): a listing past its date is not shown to shoppers
drop policy if exists products_read on products;
create policy products_read on products for select using (
  (status = 'active' and shop_is_live(business_id) and (available_until is null or available_until >= current_date))
  or is_staff(business_id) or coalesce(is_super_admin(), false));

-- ============================================================================================
-- 2. Reading a holding
-- ============================================================================================
create or replace function _src_onhand(p_kind text, p_id uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select case p_kind
    when 'item'      then (select quantity from farm_inventory_items where id = p_id)
    when 'crop'      then (select coalesce(field_quantity, 0) from crops where id = p_id)
    when 'livestock' then (select head_count::numeric from livestock_groups where id = p_id) end;
$$;

create or replace function _src_business(p_kind text, p_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select case p_kind
    when 'item'      then (select business_id from farm_inventory_items where id = p_id)
    when 'crop'      then (select business_id from crops where id = p_id)
    when 'livestock' then (select business_id from livestock_groups where id = p_id) end;
$$;

create or replace function _src_name(p_kind text, p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select case p_kind
    when 'item'      then (select name from farm_inventory_items where id = p_id)
    when 'crop'      then (select name from crops where id = p_id)
    when 'livestock' then (select name from livestock_groups where id = p_id) end;
$$;

create or replace function _src_unit(p_kind text, p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select case p_kind
    when 'item'      then (select unit from farm_inventory_items where id = p_id)
    when 'crop'      then (select field_unit from crops where id = p_id)
    when 'livestock' then 'head' end;
$$;

-- how much of a holding is currently offered (on sale) in listings, in the holding's unit
create or replace function _src_use(p_kind text, p_id uuid, p_except uuid default null) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(stock * per_unit), 0) from products
   where source_kind = p_kind and source_id = p_id and status = 'active' and (p_except is null or id <> p_except);
$$;

create or replace function _src_lock(p_kind text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_kind = 'item' then perform 1 from farm_inventory_items where id = p_id for update;
  elsif p_kind = 'crop' then perform 1 from crops where id = p_id for update;
  elsif p_kind = 'livestock' then perform 1 from livestock_groups where id = p_id for update; end if;
end $$;

create or replace function _listing_snapshot(p_kind text, p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(id::text, jsonb_build_object('name', name, 'stock', stock)), '{}'::jsonb)
    from products where source_kind = p_kind and source_id = p_id and status = 'active';
$$;

-- ============================================================================================
-- 3. Moving a holding (internal): writes the holding's own history
-- ============================================================================================
-- p_ledger: 'sale' | 'return' | 'in' | 'moved_to_store'
create or replace function _src_adjust(p_kind text, p_id uuid, p_delta numeric, p_ledger text, p_note text, p_by uuid, p_amount numeric default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare i farm_inventory_items; c crops; g livestock_groups; v_new numeric;
begin
  perform set_config('farm.allow_qty', 'on', true);
  if p_kind = 'item' then
    select * into i from farm_inventory_items where id = p_id for update;
    if i.id is null then raise exception 'Item not found'; end if;
    v_new := i.quantity + p_delta;
    if v_new < 0 then raise exception 'Only % % of % available', i.quantity, i.unit, i.name; end if;
    update farm_inventory_items set quantity = v_new where id = p_id;
    insert into inventory_movements (business_id, item_id, kind, quantity, balance_after, note, created_by)
    values (i.business_id, p_id, p_ledger, abs(p_delta), v_new, nullif(trim(p_note), ''), p_by);
  elsif p_kind = 'crop' then
    select * into c from crops where id = p_id for update;
    if c.id is null then raise exception 'Crop not found'; end if;
    v_new := coalesce(c.field_quantity, 0) + p_delta;
    if v_new < 0 then raise exception 'Only % % of % in the field', coalesce(c.field_quantity, 0), c.field_unit, c.name; end if;
    update crops set field_quantity = v_new where id = p_id;
    insert into field_stock_movements (business_id, crop_id, kind, quantity, balance_after, note, created_by)
    values (c.business_id, p_id, case when p_ledger = 'in' then 'return' else p_ledger end, abs(p_delta), v_new, nullif(trim(p_note), ''), p_by);
  elsif p_kind = 'livestock' then
    if p_delta <> trunc(p_delta) then raise exception 'Animals are counted in whole heads'; end if;
    select * into g from livestock_groups where id = p_id for update;
    if g.id is null then raise exception 'Livestock group not found'; end if;
    v_new := g.head_count + p_delta;
    if v_new < 0 then raise exception 'The group % only has % animals', g.name, g.head_count; end if;
    update livestock_groups set head_count = v_new::integer where id = p_id;
    insert into livestock_events (business_id, group_id, kind, event_date, head_change, amount, notes, created_by)
    values (g.business_id, p_id, case when p_delta < 0 then 'sale' else 'other' end, current_date, p_delta::integer, p_amount, nullif(trim(p_note), ''), p_by);
  else
    raise exception 'Unknown holding';
  end if;
  perform set_config('farm.allow_qty', 'off', true);
  return v_new;
end $$;

-- If a holding drops below what is offered, the newest listings are cut back so nothing is oversold.
create or replace function _trim_listings(p_kind text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_on numeric; v_use numeric; r record; v_cut integer; v_biz uuid; v_cut_any boolean := false;
begin
  v_on := _src_onhand(p_kind, p_id);
  v_use := _src_use(p_kind, p_id, null);
  if v_use <= v_on then return; end if;
  v_biz := _src_business(p_kind, p_id);
  for r in select id, name, stock, per_unit from products
            where source_kind = p_kind and source_id = p_id and status = 'active' and stock > 0
            order by created_at desc, id loop
    exit when v_use <= v_on;
    v_cut := least(r.stock, ceil((v_use - v_on) / r.per_unit)::integer);
    perform set_config('shop.allow_stock', 'on', true);
    update products set stock = stock - v_cut where id = r.id;
    perform set_config('shop.allow_stock', 'off', true);
    v_use := v_use - v_cut * r.per_unit;
    v_cut_any := true;
  end loop;
  if v_cut_any and v_biz is not null then
    perform _notify_staff(v_biz, 'system', 'A listing was reduced', 'Your stock of ' || _src_name(p_kind, p_id) || ' went down, so what is offered for sale was cut back to match.', null);
  end if;
end $$;

create or replace function _trg_trim_item() returns trigger language plpgsql security definer set search_path = public as $$
begin if new.quantity < old.quantity then perform _trim_listings('item', new.id); end if; return null; end $$;
create or replace function _trg_trim_crop() returns trigger language plpgsql security definer set search_path = public as $$
begin if coalesce(new.field_quantity, 0) < coalesce(old.field_quantity, 0) then perform _trim_listings('crop', new.id); end if; return null; end $$;
create or replace function _trg_trim_group() returns trigger language plpgsql security definer set search_path = public as $$
begin if new.head_count < old.head_count then perform _trim_listings('livestock', new.id); end if; return null; end $$;
drop function if exists _trg_src_trim();
drop trigger if exists trg_src_trim on farm_inventory_items;
create trigger trg_src_trim after update of quantity on farm_inventory_items for each row execute function _trg_trim_item();
drop trigger if exists trg_src_trim on crops;
create trigger trg_src_trim after update of field_quantity on crops for each row execute function _trg_trim_crop();
drop trigger if exists trg_src_trim on livestock_groups;
create trigger trg_src_trim after update of head_count on livestock_groups for each row execute function _trg_trim_group();

-- ============================================================================================
-- 4. A listing may only offer what the holding has
-- ============================================================================================
create or replace function shop_validate_listing() returns trigger language plpgsql security definer set search_path = public as $$
declare v_on numeric; v_others numeric; v_type text; v_free numeric;
begin
  if new.source_kind is not null then
    if _src_business(new.source_kind, new.source_id) is distinct from new.business_id then
      raise exception 'That item, crop or livestock group belongs to a different business';
    end if;
    if new.status = 'active' and new.stock > 0 then
      perform _src_lock(new.source_kind, new.source_id);
      v_on := _src_onhand(new.source_kind, new.source_id);
      v_others := _src_use(new.source_kind, new.source_id, new.id);
      if v_others + new.stock * new.per_unit > v_on then
        v_free := greatest(0, floor((v_on - v_others) / new.per_unit));
        raise exception 'You can list at most % of this: % has % in total and % is already offered elsewhere',
          v_free, _src_name(new.source_kind, new.source_id), v_on, v_others;
      end if;
    end if;
  elsif tg_op = 'INSERT' then
    select business_type into v_type from businesses where id = new.business_id;
    if v_type = 'agriculture' then
      raise exception 'Choose where this comes from: an item in your store, a crop in the field or your livestock';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_validate_listing on products;
create trigger trg_validate_listing before insert or update on products for each row execute function shop_validate_listing();

create or replace function shop_guard_stock() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (new.stock is distinct from old.stock or new.store_quantity is distinct from old.store_quantity)
     and current_setting('shop.allow_stock', true) is distinct from 'on' then
    raise exception 'Change stock with a stock in, stock out or recount entry';
  end if;
  return new;
end $$;

-- ============================================================================================
-- 5. Writing a self-stocked product (internal) and the shop stock functions
-- ============================================================================================
create or replace function _shop_write(p_product uuid, p_stock integer, p_store integer, p_kind text, p_qty integer, p_note text, p_order uuid, p_by uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p products;
begin
  select * into p from products where id = p_product;
  perform set_config('shop.allow_stock', 'on', true);
  update products set stock = p_stock, store_quantity = p_store where id = p_product;
  perform set_config('shop.allow_stock', 'off', true);
  insert into shop_stock_movements (business_id, product_id, kind, quantity, balance_after, store_after, note, order_id, created_by)
  values (p.business_id, p_product, p_kind, p_qty, p_stock, p_store, nullif(trim(p_note), ''), p_order, p_by);
end $$;
revoke all on function _shop_write(uuid,integer,integer,text,integer,text,uuid,uuid) from public, anon, authenticated;

-- Orders and cancellations. A delta below zero is a sale, above zero a return.
create or replace function _shop_move_stock(p_product uuid, p_delta integer, p_kind text, p_note text, p_order uuid, p_by uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare p products; v_new integer; v_store integer;
begin
  select * into p from products where id = p_product for update;
  if p.id is null then raise exception 'Product not found'; end if;
  v_new := p.stock + p_delta;
  if v_new < 0 then raise exception 'Only % in stock for %', p.stock, p.name; end if;
  if p.source_kind is null then
    v_store := p.store_quantity + p_delta;
    perform _shop_write(p.id, v_new, v_store, p_kind, abs(p_delta), p_note, p_order, p_by);
  elsif p_delta < 0 then
    perform _src_lock(p.source_kind, p.source_id);
    perform _shop_write(p.id, v_new, p.store_quantity, p_kind, abs(p_delta), p_note, p_order, p_by);   -- listing first, then the holding
    perform _src_adjust(p.source_kind, p.source_id, p_delta * p.per_unit, 'sale', p_note, p_by);
  else
    perform _src_adjust(p.source_kind, p.source_id, p_delta * p.per_unit, 'return', p_note, p_by);    -- holding first, then the listing
    perform _shop_write(p.id, v_new, p.store_quantity, p_kind, abs(p_delta), p_note, p_order, p_by);
  end if;
  return v_new;
end $$;
revoke all on function _shop_move_stock(uuid,integer,text,text,uuid,uuid) from public, anon, authenticated;

-- Seller: stock in, stock out or a recount of a product that is its own store.
create or replace function record_shop_stock(p_product uuid, p_kind text, p_quantity integer, p_note text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare p products; v_store integer; v_stock integer;
begin
  select * into p from products where id = p_product for update;
  if p.id is null then raise exception 'Product not found'; end if;
  perform _need_staff(p.business_id);
  if p.source_kind is not null then
    raise exception 'This item comes from your % (%). Change the stock there, then choose how much to list.',
      case p.source_kind when 'item' then 'store' when 'crop' then 'field crop' else 'livestock' end, _src_name(p.source_kind, p.source_id);
  end if;
  if p_kind not in ('in','out','adjust') then raise exception 'Choose stock in, stock out or a recount'; end if;
  if p_quantity is null or p_quantity < 0 or (p_kind <> 'adjust' and p_quantity = 0) then raise exception 'Enter a quantity above zero'; end if;
  v_store := case p_kind when 'in' then p.store_quantity + p_quantity when 'out' then p.store_quantity - p_quantity else p_quantity end;
  if v_store < 0 then raise exception 'Only % in your store for %', p.store_quantity, p.name; end if;
  v_stock := case when p.list_all then v_store else least(p.stock, v_store) end;
  perform _shop_write(p.id, v_stock, v_store, p_kind, p_quantity, p_note, null, auth.uid());
  return v_store;
end $$;
revoke all on function record_shop_stock(uuid,text,integer,text) from public, anon;
grant execute on function record_shop_stock(uuid,text,integer,text) to authenticated;

-- Seller: decide how much of an item to put on sale. p_list_all lists everything the shop has.
create or replace function set_listing(p_product uuid, p_quantity integer default null, p_list_all boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare p products; v_on numeric; v_others numeric; v_q integer;
begin
  select * into p from products where id = p_product for update;
  if p.id is null then raise exception 'Product not found'; end if;
  perform _need_staff(p.business_id);
  perform set_config('shop.allow_stock', 'on', true);
  if p.source_kind is null then
    v_q := case when p_list_all then p.store_quantity else p_quantity end;
    if v_q is null or v_q < 0 then raise exception 'Enter how many to list'; end if;
    if v_q > p.store_quantity then raise exception 'You only have % in your store', p.store_quantity; end if;
    update products set stock = v_q, list_all = coalesce(p_list_all, false) where id = p.id;
  else
    perform _src_lock(p.source_kind, p.source_id);
    v_on := _src_onhand(p.source_kind, p.source_id);
    v_others := _src_use(p.source_kind, p.source_id, p.id);
    v_q := case when p_list_all then floor((v_on - v_others) / p.per_unit)::integer else p_quantity end;
    if v_q is null or v_q < 0 then raise exception 'Enter how many to list'; end if;
    if v_others + v_q * p.per_unit > v_on then
      raise exception 'You can list at most % of this', greatest(0, floor((v_on - v_others) / p.per_unit));
    end if;
    update products set stock = v_q where id = p.id;
  end if;
  perform set_config('shop.allow_stock', 'off', true);
  return v_q;
end $$;
revoke all on function set_listing(uuid,integer,boolean) from public, anon;
grant execute on function set_listing(uuid,integer,boolean) to authenticated;

-- ============================================================================================
-- 6. A sale made outside the system
-- ============================================================================================
-- Pass p_product (a listing) or p_source_kind + p_source_id (a holding, for something never listed).
-- p_from_listing: sold "from the listing" (default) takes the listing down first; false takes from what
-- was not listed first.
create or replace function record_sale(
  p_business uuid, p_product uuid default null, p_source_kind text default null, p_source_id uuid default null,
  p_quantity numeric default null, p_unit_price numeric default null, p_buyer_name text default null, p_buyer_phone text default null,
  p_sold_on date default null, p_note text default null, p_from_listing boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p products; v_type text; v_date date := coalesce(p_sold_on, current_date);
  v_name text; v_unit text; v_kind text; v_id uuid; v_units numeric := 0; v_from_listing numeric := 0;
  v_on numeric; v_use numeric; v_unlisted numeric; q integer; take_l integer; take_u integer; v_new_stock integer; v_new_store integer;
  v_before jsonb := '{}'::jsonb; v_after jsonb; v_sale uuid; v_total numeric; v_income text; v_crop uuid; v_group uuid; v_cat text; v_trim jsonb := '[]'::jsonb; k text;
begin
  perform _need_staff(p_business);
  if p_quantity is null or p_quantity <= 0 then raise exception 'Enter how many were sold'; end if;
  if p_unit_price is null or p_unit_price < 0 then raise exception 'Enter the price for each'; end if;
  if v_date > current_date + 1 then raise exception 'The sale date cannot be in the future'; end if;   -- one day of room for local time
  select business_type into v_type from businesses where id = p_business;

  if p_product is not null then
    select * into p from products where id = p_product and business_id = p_business for update;
    if p.id is null then raise exception 'Item not found'; end if;
    if p_quantity <> trunc(p_quantity) then raise exception 'Listed items are sold in whole units. To sell part of a unit, record it from your store or field instead.'; end if;
    q := p_quantity::integer; v_name := p.name; v_unit := p.unit;
    if p.source_kind is null then
      if q > p.store_quantity then raise exception 'Only % of % in your store', p.store_quantity, p.name; end if;
      take_l := case when p_from_listing then least(q, p.stock) else greatest(0, q - (p.store_quantity - p.stock)) end;
      v_new_stock := p.stock - take_l; v_new_store := p.store_quantity - q;
      if v_new_stock > v_new_store then v_new_stock := v_new_store; end if;
      perform _shop_write(p.id, v_new_stock, v_new_store, 'sale', q, 'Sale recorded by hand', null, auth.uid());
      v_kind := 'product'; v_id := p.id; v_units := q; v_from_listing := p.stock - v_new_stock;
    else
      v_kind := p.source_kind; v_id := p.source_id;
      perform _src_lock(v_kind, v_id);
      v_on := _src_onhand(v_kind, v_id); v_use := _src_use(v_kind, v_id, null);
      take_l := least(q, p.stock); take_u := q - take_l;
      if take_u * p.per_unit > v_on - v_use then
        raise exception 'Only % of % are available to sell', take_l + greatest(0, floor((v_on - v_use) / p.per_unit)), p.name;
      end if;
      perform set_config('shop.allow_stock', 'on', true);
      update products set stock = stock - take_l where id = p.id;
      perform set_config('shop.allow_stock', 'off', true);
      v_units := q * p.per_unit; v_from_listing := take_l;
      perform _src_adjust(v_kind, v_id, -v_units, 'sale', coalesce(nullif(trim(p_note), ''), 'Sale recorded by hand') , auth.uid(), p_quantity * p_unit_price);
    end if;
  else
    if p_source_kind not in ('item','crop','livestock') or p_source_id is null then raise exception 'Choose what was sold'; end if;
    if _src_business(p_source_kind, p_source_id) is distinct from p_business then raise exception 'Item not found'; end if;
    v_kind := p_source_kind; v_id := p_source_id;
    perform _src_lock(v_kind, v_id);
    v_on := _src_onhand(v_kind, v_id);
    if p_quantity > v_on then raise exception 'Only % % of % available', v_on, _src_unit(v_kind, v_id), _src_name(v_kind, v_id); end if;
    if v_kind = 'livestock' and p_quantity <> trunc(p_quantity) then raise exception 'Animals are sold in whole heads'; end if;
    v_name := _src_name(v_kind, v_id); v_unit := _src_unit(v_kind, v_id);
    v_before := _listing_snapshot(v_kind, v_id);
    perform _src_adjust(v_kind, v_id, -p_quantity, 'sale', coalesce(nullif(trim(p_note), ''), 'Sale recorded by hand'), auth.uid(), p_quantity * p_unit_price);
    v_units := p_quantity;
    v_after := _listing_snapshot(v_kind, v_id);
    for k in select jsonb_object_keys(v_before) loop
      if (v_before -> k ->> 'stock')::integer <> coalesce((v_after -> k ->> 'stock')::integer, 0) then
        v_trim := v_trim || jsonb_build_array(jsonb_build_object('name', v_before -> k ->> 'name', 'was', (v_before -> k ->> 'stock')::integer, 'now', coalesce((v_after -> k ->> 'stock')::integer, 0)));
      end if;
    end loop;
  end if;

  v_total := round(p_quantity * p_unit_price, 2);
  insert into recorded_sales (business_id, product_id, source_kind, source_id, item_name, unit, quantity, unit_price, total,
                              buyer_name, buyer_phone, sold_on, note, from_listing, source_units, created_by)
  values (p_business, p_product, v_kind, v_id, v_name, v_unit, p_quantity, p_unit_price, v_total,
          nullif(trim(p_buyer_name), ''), nullif(trim(p_buyer_phone), ''), v_date, nullif(trim(p_note), ''), v_from_listing, v_units, auth.uid())
  returning id into v_sale;

  if v_type = 'agriculture' and v_total > 0 then
    v_crop := case when v_kind = 'crop' then v_id end;
    v_group := case when v_kind = 'livestock' then v_id end;
    v_income := case when v_kind = 'livestock' then 'livestock_sale' when v_kind = 'crop' then 'crop_sale' else
                 case when exists (select 1 from farm_inventory_items where id = v_id and category = 'produce') then 'crop_sale' else 'other' end end;
    insert into farm_income (business_id, source, amount, income_date, crop_id, group_id, description, created_by, sale_id)
    values (p_business, v_income, v_total, v_date, v_crop, v_group, 'Sold ' || p_quantity || ' ' || coalesce(v_unit, '') || ' ' || v_name, auth.uid(), v_sale);
  end if;
  return jsonb_build_object('sale_id', v_sale, 'total', v_total, 'trimmed', v_trim);
end $$;
revoke all on function record_sale(uuid,uuid,text,uuid,numeric,numeric,text,text,date,text,boolean) from public, anon;
grant execute on function record_sale(uuid,uuid,text,uuid,numeric,numeric,text,text,date,text,boolean) to authenticated;

-- Reverse a recorded sale: the stock goes back, the income is removed, the sale stays in the list marked void.
create or replace function void_sale(p_sale uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare s recorded_sales; p products; v_q integer;
begin
  select * into s from recorded_sales where id = p_sale for update;
  if s.id is null then raise exception 'Sale not found'; end if;
  perform _need_staff(s.business_id);
  if s.voided_at is not null then raise exception 'This sale is already void'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Say why you are voiding this sale'; end if;

  if s.source_kind = 'product' then
    select * into p from products where id = s.source_id for update;
    if p.id is not null then
      v_q := s.source_units::integer;
      perform _shop_write(p.id, least(p.stock + s.from_listing::integer, p.store_quantity + v_q), p.store_quantity + v_q, 'return', v_q, 'Sale voided: ' || trim(p_reason), null, auth.uid());
    end if;
  else
    perform _src_lock(s.source_kind, s.source_id);
    perform _src_adjust(s.source_kind, s.source_id, s.source_units, 'return', 'Sale voided: ' || trim(p_reason), auth.uid());
    if s.product_id is not null and s.from_listing > 0 then
      select * into p from products where id = s.product_id for update;
      if p.id is not null and p.source_id = s.source_id then
        perform set_config('shop.allow_stock', 'on', true);
        update products set stock = stock + s.from_listing::integer where id = p.id;
        perform set_config('shop.allow_stock', 'off', true);
      end if;
    end if;
  end if;
  delete from farm_income where sale_id = s.id;
  update recorded_sales set voided_at = now(), void_reason = trim(p_reason) where id = s.id;
end $$;
revoke all on function void_sale(uuid,text) from public, anon;
grant execute on function void_sale(uuid,text) to authenticated;

-- ============================================================================================
-- 7. Harvest: move a quantity from the field into the store
-- ============================================================================================
create or replace function move_field_to_store(p_crop uuid, p_quantity numeric, p_item uuid default null, p_item_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare c crops; i farm_inventory_items; v_item uuid := p_item;
begin
  select * into c from crops where id = p_crop for update;
  if c.id is null then raise exception 'Crop not found'; end if;
  perform _need_staff(c.business_id);
  if p_quantity is null or p_quantity <= 0 then raise exception 'Enter a quantity above zero'; end if;
  if v_item is null then
    insert into farm_inventory_items (business_id, name, category, unit, quantity)
    values (c.business_id, coalesce(nullif(trim(p_item_name), ''), c.name), 'produce', c.field_unit, 0) returning id into v_item;
  else
    select * into i from farm_inventory_items where id = v_item and business_id = c.business_id;
    if i.id is null then raise exception 'Store item not found'; end if;
    if i.unit is distinct from c.field_unit then raise exception 'The store item is counted in % but the crop in %', i.unit, c.field_unit; end if;
  end if;
  perform _src_adjust('crop', p_crop, -p_quantity, 'moved_to_store', 'Moved to the store', auth.uid());
  perform _src_adjust('item', v_item, p_quantity, 'in', 'Moved from the field: ' || c.name, auth.uid());
  return v_item;
end $$;
revoke all on function move_field_to_store(uuid,numeric,uuid,text) from public, anon;
grant execute on function move_field_to_store(uuid,numeric,uuid,text) to authenticated;

revoke all on function _src_adjust(text,uuid,numeric,text,text,uuid,numeric) from public, anon, authenticated;
revoke all on function _trim_listings(text,uuid) from public, anon, authenticated;
revoke all on function _src_lock(text,uuid) from public, anon, authenticated;
revoke all on function _src_onhand(text,uuid), _src_business(text,uuid), _src_name(text,uuid), _src_unit(text,uuid), _src_use(text,uuid,uuid), _listing_snapshot(text,uuid) from public, anon, authenticated;

-- ============================================================================================
-- 8. Farms can take M-Pesa payment for produce (pickup only, no delivery)
-- ============================================================================================
create or replace function place_order(
  p_business uuid, p_items jsonb, p_fulfilment text, p_method text,
  p_name text, p_phone text, p_county text default null, p_town text default null,
  p_street text default null, p_ship_notes text default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  s shop_settings; b businesses; o_id uuid; o_num text; it jsonb; p products;
  v_qty integer; v_sub numeric := 0; v_fee numeric := 0; v_ids uuid[] := '{}'; v_phone text; v_farm boolean; v_fulfil text := p_fulfilment;
begin
  if auth.uid() is null then raise exception 'Sign in to place an order' using errcode = '28000'; end if;
  if not account_active() then raise exception 'This account is switched off. Contact support.'; end if;
  select * into b from businesses where id = p_business;
  if b.id is null or b.status <> 'active' or b.business_type not in ('shop','agriculture') then raise exception 'This shop is not open for orders'; end if;
  v_farm := b.business_type = 'agriculture';
  if is_staff(p_business) then raise exception 'You cannot order from your own shop'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Your cart is empty'; end if;
  if jsonb_array_length(p_items) > 50 then raise exception 'Too many different items in one order'; end if;
  if v_farm then
    v_fulfil := 'pickup';                                   -- farms hand produce over by pickup; there are no delivery settings
    if p_method <> 'mpesa' then raise exception 'Farm produce is paid by M-Pesa'; end if;
  else
    if p_fulfilment not in ('delivery','pickup') then raise exception 'Choose delivery or pickup'; end if;
    if p_method not in ('mpesa','cash_on_delivery') then raise exception 'Choose how you will pay'; end if;
  end if;
  if length(trim(coalesce(p_name,''))) < 2 then raise exception 'Enter the name of the person receiving the order'; end if;
  v_phone := normalize_phone(p_phone);
  if v_phone is null then raise exception 'Enter a valid phone number'; end if;

  if not v_farm then
    select * into s from shop_settings where business_id = p_business;
    if not found then s.delivery_enabled := true; s.delivery_fee := 0; s.pickup_enabled := false; s.pay_on_delivery := false; end if;
    if v_fulfil = 'delivery' and not s.delivery_enabled then raise exception 'This shop does not deliver. Choose pickup.'; end if;
    if v_fulfil = 'pickup' and not s.pickup_enabled then raise exception 'This shop does not offer pickup. Choose delivery.'; end if;
    if v_fulfil = 'delivery' and length(trim(coalesce(p_town,''))) = 0 and length(trim(coalesce(p_street,''))) = 0 then
      raise exception 'Enter the delivery address';
    end if;
    if p_method = 'cash_on_delivery' and not s.pay_on_delivery then raise exception 'This shop does not accept pay on delivery'; end if;
  end if;

  -- validate lines and lock the products in a fixed order, so two buyers cannot oversell
  for it in select value from jsonb_array_elements(p_items) loop
    begin v_ids := v_ids || (it ->> 'product_id')::uuid; exception when others then raise exception 'An item in your cart is not valid'; end;
  end loop;
  if (select count(distinct x) from unnest(v_ids) x) <> array_length(v_ids, 1) then raise exception 'The same item appears twice in your cart'; end if;

  insert into orders (business_id, customer_id, status, payment_status, payment_method, fulfilment, subtotal, delivery_fee, total,
                      customer_name, customer_phone, ship_county, ship_town, ship_street, ship_notes, notes)
  values (p_business, auth.uid(), 'pending_payment', 'unpaid', p_method, v_fulfil, 0, 0, 0,
          trim(p_name), v_phone, case when v_farm then null else nullif(trim(p_county),'') end, case when v_farm then null else nullif(trim(p_town),'') end,
          case when v_farm then null else nullif(trim(p_street),'') end, case when v_farm then null else nullif(trim(p_ship_notes),'') end, nullif(trim(p_notes),''))
  returning id, order_number into o_id, o_num;

  for it in select value from jsonb_array_elements(p_items) order by (value ->> 'product_id') loop
    v_qty := coalesce((it ->> 'quantity')::integer, 0);
    if v_qty < 1 or v_qty > 999 then raise exception 'Enter a quantity between 1 and 999'; end if;
    select * into p from products where id = (it ->> 'product_id')::uuid and business_id = p_business;
    if p.id is null or p.status <> 'active' or (p.available_until is not null and p.available_until < current_date) then raise exception 'An item in your cart is no longer on sale'; end if;
    perform _shop_move_stock(p.id, -v_qty, 'sale', 'Order ' || o_num, o_id, auth.uid());   -- raises "Only N in stock for X"
    insert into order_items (order_id, product_id, name, unit_price, quantity, line_total)
    values (o_id, p.id, p.name, p.price, v_qty, p.price * v_qty);
    v_sub := v_sub + p.price * v_qty;
  end loop;

  if v_fulfil = 'delivery' then
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

-- A farm's paid online order becomes income by itself (and goes away again if the payment is refunded).
create or replace function farm_order_income() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select business_type from businesses where id = new.business_id) <> 'agriculture' then return new; end if;
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' and new.total > 0 then
    insert into farm_income (business_id, source, amount, income_date, description, order_id)
    values (new.business_id, 'crop_sale', new.total, current_date, 'Online order ' || new.order_number, new.id)
    on conflict do nothing;
  elsif new.payment_status = 'refunded' and old.payment_status is distinct from 'refunded' then
    delete from farm_income where order_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists trg_farm_order_income on orders;
create trigger trg_farm_order_income after update of payment_status on orders for each row execute function farm_order_income();
