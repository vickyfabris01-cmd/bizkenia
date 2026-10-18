-- supabase/migrations/20261016100002_p4_02_farm_stock.sql — NEW FILE
-- Phase 4: supplies (inventory with movements) and livestock (groups with events).
-- Quantities change only through the two functions at the bottom, so stock can never go negative
-- and every change leaves a record.

create table if not exists farm_inventory_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  category text not null default 'other' check (category in ('seed','fertiliser','chemical','feed','tool','fuel','other')),
  unit text not null default 'kg',
  quantity numeric not null default 0 check (quantity >= 0),
  reorder_level numeric not null default 0 check (reorder_level >= 0),
  unit_cost numeric check (unit_cost is null or unit_cost >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_farm_item_name on farm_inventory_items (business_id, lower(name));

create table if not exists inventory_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  item_id uuid not null references farm_inventory_items(id) on delete cascade,
  kind text not null check (kind in ('in','out','adjust')),
  quantity numeric not null,            -- always positive; for 'adjust' it is the new counted total
  balance_after numeric not null,
  note text,
  moved_at timestamptz not null default now(),
  created_by uuid references profiles(id) on delete set null
);
create index if not exists idx_inventory_movements_item on inventory_movements (item_id, moved_at desc);

create table if not exists livestock_groups (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  species text not null default 'cattle',
  breed text,
  head_count integer not null default 0 check (head_count >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_livestock_group_name on livestock_groups (business_id, lower(name));

create table if not exists livestock_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  group_id uuid not null references livestock_groups(id) on delete cascade,
  kind text not null check (kind in ('vaccination','feeding','treatment','birth','sale','loss','other')),
  event_date date not null default current_date,
  head_change integer not null default 0,
  amount numeric check (amount is null or amount >= 0),   -- sale price, or cost of the treatment
  notes text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_livestock_events_group on livestock_events (group_id, event_date desc);
create index if not exists idx_livestock_events_business on livestock_events (business_id, event_date desc);

drop trigger if exists trg_farm_items_touch on farm_inventory_items;
create trigger trg_farm_items_touch before update on farm_inventory_items for each row execute function farm_touch_updated_at();
drop trigger if exists trg_livestock_groups_touch on livestock_groups;
create trigger trg_livestock_groups_touch before update on livestock_groups for each row execute function farm_touch_updated_at();

-- ---- stock movement ---------------------------------------------------------------------
create or replace function record_stock_movement(p_item uuid, p_kind text, p_quantity numeric, p_note text default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare i farm_inventory_items; v_new numeric;
begin
  select * into i from farm_inventory_items where id = p_item for update;
  if i.id is null then raise exception 'Item not found'; end if;
  perform _need_staff(i.business_id);
  if p_kind not in ('in','out','adjust') then raise exception 'Choose stock in, stock out or a recount'; end if;
  if p_quantity is null or p_quantity < 0 or (p_kind <> 'adjust' and p_quantity = 0) then raise exception 'Enter a quantity above zero'; end if;
  v_new := case p_kind when 'in' then i.quantity + p_quantity
                       when 'out' then i.quantity - p_quantity
                       else p_quantity end;
  if v_new < 0 then raise exception 'Only % % in stock', i.quantity, i.unit; end if;
  update farm_inventory_items set quantity = v_new where id = p_item;
  insert into inventory_movements (business_id, item_id, kind, quantity, balance_after, note, created_by)
  values (i.business_id, p_item, p_kind, p_quantity, v_new, nullif(trim(p_note), ''), auth.uid());
  return v_new;
end $$;

-- ---- livestock event --------------------------------------------------------------------
-- p_heads is how many animals: added for a birth, taken off for a sale or a loss, ignored otherwise.
-- A sale with an amount also records the income, so the money screen and reports stay right.
create or replace function record_livestock_event(p_group uuid, p_kind text, p_date date default null, p_heads integer default 0,
                                                  p_amount numeric default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare g livestock_groups; v_change integer := 0; v_id uuid; v_date date := coalesce(p_date, current_date);
begin
  select * into g from livestock_groups where id = p_group for update;
  if g.id is null then raise exception 'Group not found'; end if;
  perform _need_staff(g.business_id);
  if p_kind not in ('vaccination','feeding','treatment','birth','sale','loss','other') then raise exception 'Unknown event'; end if;
  if p_kind in ('birth','sale','loss') then
    if p_heads is null or p_heads <= 0 then raise exception 'Enter how many animals'; end if;
    v_change := case when p_kind = 'birth' then p_heads else -p_heads end;
    if g.head_count + v_change < 0 then raise exception 'The group only has % animals', g.head_count; end if;
  end if;
  if p_amount is not null and p_amount < 0 then raise exception 'The amount cannot be negative'; end if;
  insert into livestock_events (business_id, group_id, kind, event_date, head_change, amount, notes, created_by)
  values (g.business_id, p_group, p_kind, v_date, v_change, p_amount, nullif(trim(p_notes), ''), auth.uid())
  returning id into v_id;
  if v_change <> 0 then update livestock_groups set head_count = head_count + v_change where id = p_group; end if;
  if p_kind = 'sale' and coalesce(p_amount, 0) > 0 then
    insert into farm_income (business_id, source, amount, income_date, group_id, description, created_by)
    values (g.business_id, 'livestock_sale', p_amount, v_date, p_group, 'Sold ' || p_heads || ' from ' || g.name, auth.uid());
  end if;
  return v_id;
end $$;

revoke all on function record_stock_movement(uuid,text,numeric,text), record_livestock_event(uuid,text,date,integer,numeric,text) from public, anon;
grant execute on function record_stock_movement(uuid,text,numeric,text), record_livestock_event(uuid,text,date,integer,numeric,text) to authenticated;
