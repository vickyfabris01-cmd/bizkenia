-- supabase/migrations/20261016100004_p4_04_farm_rls.sql — NEW FILE
-- Phase 4: row-level security on every farm table. The owner and managers of a business can read
-- and write its farm data (is_staff); the super admin can read it. Nobody else sees anything.
-- Stock quantities and livestock head counts are protected from direct edits by the two guard
-- triggers below, so they only ever change through record_stock_movement / record_livestock_event.

do $$
declare t text;
begin
  foreach t in array array['farm_fields','crops','crop_activities','harvests','farm_inventory_items','inventory_movements',
                           'livestock_groups','livestock_events','farm_income','farm_expenses','farm_tasks']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('drop policy if exists %I on %I', t || '_write', t);
    execute format('create policy %I on %I for select to authenticated using (is_staff(business_id) or coalesce(is_super_admin(), false))', t || '_read', t);
    -- Movements are a ledger: staff can read them, but only record_stock_movement writes them.
    if t <> 'inventory_movements' then
      execute format('create policy %I on %I for all to authenticated using (is_staff(business_id)) with check (is_staff(business_id))', t || '_write', t);
    end if;
  end loop;
end $$;

-- A row may only point at a field, crop or group of the SAME business.
create or replace function farm_same_business() returns trigger language plpgsql as $$
declare ok boolean := true;
begin
  if tg_table_name = 'crops' then
    ok := exists (select 1 from farm_fields where id = new.field_id and business_id = new.business_id);
  elsif tg_table_name in ('crop_activities','harvests') then
    ok := exists (select 1 from crops where id = new.crop_id and business_id = new.business_id);
  elsif tg_table_name = 'farm_tasks' then
    ok := (new.field_id is null or exists (select 1 from farm_fields where id = new.field_id and business_id = new.business_id))
      and (new.crop_id is null or exists (select 1 from crops where id = new.crop_id and business_id = new.business_id));
  elsif tg_table_name in ('farm_income','farm_expenses') then
    ok := (new.crop_id is null or exists (select 1 from crops where id = new.crop_id and business_id = new.business_id));
  end if;
  if not ok then raise exception 'That record belongs to a different business'; end if;
  return new;
end $$;

drop trigger if exists trg_same_business on crops;
create trigger trg_same_business before insert or update on crops for each row execute function farm_same_business();
drop trigger if exists trg_same_business on crop_activities;
create trigger trg_same_business before insert or update on crop_activities for each row execute function farm_same_business();
drop trigger if exists trg_same_business on harvests;
create trigger trg_same_business before insert or update on harvests for each row execute function farm_same_business();
drop trigger if exists trg_same_business on farm_tasks;
create trigger trg_same_business before insert or update on farm_tasks for each row execute function farm_same_business();
drop trigger if exists trg_same_business on farm_income;
create trigger trg_same_business before insert or update on farm_income for each row execute function farm_same_business();
drop trigger if exists trg_same_business on farm_expenses;
create trigger trg_same_business before insert or update on farm_expenses for each row execute function farm_same_business();

-- Guards: quantity and head_count may not be edited by hand once a row exists
create or replace function farm_guard_quantity() returns trigger language plpgsql as $$
begin
  if tg_table_name = 'farm_inventory_items' then
    if tg_op = 'UPDATE' and new.quantity is distinct from old.quantity and current_setting('farm.allow_qty', true) is distinct from 'on' then
      raise exception 'Change stock with a stock in, stock out or recount entry';
    end if;
  elsif tg_table_name = 'livestock_groups' then
    if tg_op = 'UPDATE' and new.head_count is distinct from old.head_count and current_setting('farm.allow_qty', true) is distinct from 'on' then
      raise exception 'Change the head count by recording a birth, sale or loss';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_quantity on farm_inventory_items;
create trigger trg_guard_quantity before update on farm_inventory_items for each row execute function farm_guard_quantity();
drop trigger if exists trg_guard_quantity on livestock_groups;
create trigger trg_guard_quantity before update on livestock_groups for each row execute function farm_guard_quantity();

-- The two functions switch the guard off for their own statement only.
create or replace function record_stock_movement(p_item uuid, p_kind text, p_quantity numeric, p_note text default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare i farm_inventory_items; v_new numeric;
begin
  select * into i from farm_inventory_items where id = p_item for update;
  if i.id is null then raise exception 'Item not found'; end if;
  perform _need_staff(i.business_id);
  if p_kind not in ('in','out','adjust') then raise exception 'Choose stock in, stock out or a recount'; end if;
  if p_quantity is null or p_quantity < 0 or (p_kind <> 'adjust' and p_quantity = 0) then raise exception 'Enter a quantity above zero'; end if;
  v_new := case p_kind when 'in' then i.quantity + p_quantity when 'out' then i.quantity - p_quantity else p_quantity end;
  if v_new < 0 then raise exception 'Only % % in stock', i.quantity, i.unit; end if;
  perform set_config('farm.allow_qty', 'on', true);
  update farm_inventory_items set quantity = v_new where id = p_item;
  perform set_config('farm.allow_qty', 'off', true);
  insert into inventory_movements (business_id, item_id, kind, quantity, balance_after, note, created_by)
  values (i.business_id, p_item, p_kind, p_quantity, v_new, nullif(trim(p_note), ''), auth.uid());
  return v_new;
end $$;

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
  if v_change <> 0 then
    perform set_config('farm.allow_qty', 'on', true);
    update livestock_groups set head_count = head_count + v_change where id = p_group;
    perform set_config('farm.allow_qty', 'off', true);
  end if;
  if p_kind = 'sale' and coalesce(p_amount, 0) > 0 then
    insert into farm_income (business_id, source, amount, income_date, group_id, description, created_by)
    values (g.business_id, 'livestock_sale', p_amount, v_date, p_group, 'Sold ' || p_heads || ' from ' || g.name, auth.uid());
  end if;
  return v_id;
end $$;

-- Creating a group or an item sets its opening quantity; that is allowed because the guard only checks UPDATE.
