-- supabase/migrations/20261020100008_room_kinds_and_hostel.sql — NEW FILE
--
-- AIM
-- 1. The kind of room is a fixed list, in this order: Single room, Bed seater, One bedroom,
--    Two bedroom, Canteen, Kiosk.
-- 2. A room type has no typed name any more. Its name comes from the kind of room, and when the
--    same building already has one it becomes "Single room (1)", "Single room (2)" and so on.
-- 3. A room type can be a HOSTEL. A hostel type is priced per semester (people it sleeps + semester
--    rent, no monthly rent) and cannot be a Canteen or a Kiosk. Every other type is priced monthly
--    (no semester rent, and "people it sleeps" is not asked).
-- Replaces: save_room_type (new arguments), respond_request (hostel types are billed per semester,
-- the others monthly), list_room_types, home_listings, market_listings (a hostel's price is its
-- semester rent, and rows say is_hostel and carry `price`).
-- Needs 20261020100006_room_types.sql and 20261020100007_room_type_listings.sql.

-- 1. kinds and the hostel flag ------------------------------------------------------------------
alter table room_types add column if not exists is_hostel boolean not null default false;

alter table room_types drop constraint if exists room_types_kind_check;
alter table rooms drop constraint if exists rooms_room_type_check;

-- old kinds move to the nearest new one
update room_types set kind = case kind
    when 'bedsitter' then 'bedseater' when 'studio' then 'bedseater'
    when 'double' then 'single' when 'dormitory' then 'single' when 'suite' then 'one_bedroom' end
 where kind in ('bedsitter','studio','double','dormitory','suite');
update rooms set room_type = case room_type
    when 'bedsitter' then 'bedseater' when 'studio' then 'bedseater'
    when 'double' then 'single' when 'dormitory' then 'single' when 'suite' then 'one_bedroom' end
 where room_type in ('bedsitter','studio','double','dormitory','suite');

alter table room_types add constraint room_types_kind_check
  check (kind in ('single','bedseater','one_bedroom','two_bedroom','canteen','kiosk'));
alter table rooms add constraint rooms_room_type_check
  check (room_type in ('single','bedseater','one_bedroom','two_bedroom','canteen','kiosk'));

-- 2. price rules: hostel = semester rent, everything else = monthly rent ------------------------------
update room_types set semester_price = null where not is_hostel;
update rooms r set semester_price = null from room_types t where t.id = r.room_type_id and not t.is_hostel;

alter table room_types drop constraint if exists room_types_price_by_kind;
alter table room_types add constraint room_types_price_by_kind
  check ((is_hostel and coalesce(semester_price, 0) > 0) or (not is_hostel and monthly_price > 0));
alter table room_types drop constraint if exists room_types_hostel_kind;
alter table room_types add constraint room_types_hostel_kind
  check (not is_hostel or kind in ('single','bedseater','one_bedroom','two_bedroom'));

-- 3. names come from the kind ---------------------------------------------------------------------
create or replace function _kind_label(p_kind text) returns text language sql immutable as $$
  select case p_kind when 'single' then 'Single room' when 'bedseater' then 'Bed seater'
                     when 'one_bedroom' then 'One bedroom' when 'two_bedroom' then 'Two bedroom'
                     when 'canteen' then 'Canteen' when 'kiosk' then 'Kiosk' else initcap(p_kind) end;
$$;

-- "Single room", then "Single room (1)", "Single room (2)" … within one building
create or replace function _room_type_name(p_building uuid, p_kind text, p_exclude uuid default null) returns text
language plpgsql stable security definer set search_path = public as $$
declare base text := _kind_label(p_kind); cand text; n int := 0;
begin
  cand := base;
  while exists (select 1 from room_types where building_id = p_building and lower(name) = lower(cand) and id is distinct from p_exclude) loop
    n := n + 1;
    cand := base || ' (' || n || ')';
  end loop;
  return cand;
end $$;
-- the label lookup is harmless and is used by the public listing search; the name generator is internal
grant execute on function _kind_label(text) to anon, authenticated;
revoke all on function _room_type_name(uuid, text, uuid) from public, anon, authenticated;

-- rename the types that already exist to follow the rule (oldest first)
do $$
declare r record;
begin
  update room_types set name = id::text;   -- clear names first so renaming can never collide
  for r in select id, building_id, kind from room_types order by created_at, id loop
    update room_types set name = _room_type_name(r.building_id, r.kind, r.id) where id = r.id;
  end loop;
end $$;

-- 4. save a type ------------------------------------------------------------------------------------
drop function if exists save_room_type(uuid, uuid, uuid, text, text, int, numeric, numeric, text, jsonb, jsonb, boolean);
create or replace function save_room_type(
  p_business uuid, p_id uuid, p_building uuid, p_kind text, p_hostel boolean, p_capacity int,
  p_monthly numeric, p_semester numeric, p_description text, p_amenities jsonb, p_images jsonb, p_allow_self_pick boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  old room_types; v_id uuid; v_name text; v_repriced int := 0; v_slug text := _slug(p_business); r record;
  v_hostel boolean := coalesce(p_hostel, false); v_monthly numeric; v_semester numeric; v_capacity int;
begin
  perform _need_staff(p_business);
  if p_kind is null or p_kind not in ('single','bedseater','one_bedroom','two_bedroom','canteen','kiosk') then raise exception 'Choose the kind of room'; end if;
  if v_hostel and p_kind in ('canteen','kiosk') then raise exception 'A canteen or a kiosk cannot be a hostel room'; end if;
  if not exists (select 1 from buildings where id = p_building and tenant_id = p_business) then raise exception 'Choose a building'; end if;

  if v_hostel then
    if p_semester is null or p_semester <= 0 then raise exception 'Enter the semester rent'; end if;
    if coalesce(p_capacity, 0) < 1 or p_capacity > 20 then raise exception 'People it sleeps must be from 1 to 20'; end if;
    v_monthly := 0; v_semester := p_semester; v_capacity := p_capacity;
  else
    if p_monthly is null or p_monthly <= 0 then raise exception 'Enter the monthly rent'; end if;
    v_monthly := p_monthly; v_semester := null; v_capacity := 1;
  end if;

  if p_id is null then
    v_name := _room_type_name(p_building, p_kind, null);
    insert into room_types (tenant_id, building_id, name, kind, is_hostel, capacity, monthly_price, semester_price, description, amenities, images, allow_self_pick)
    values (p_business, p_building, v_name, p_kind, v_hostel, v_capacity, v_monthly, v_semester, nullif(trim(p_description), ''),
            coalesce(p_amenities, '[]'::jsonb), coalesce(p_images, '[]'::jsonb), coalesce(p_allow_self_pick, false))
    returning id into v_id;
    return jsonb_build_object('id', v_id, 'name', v_name, 'repriced', 0);
  end if;

  select * into old from room_types where id = p_id and tenant_id = p_business for update;
  if old.id is null then raise exception 'Room type not found'; end if;
  if old.is_hostel <> v_hostel and exists (select 1 from rooms where room_type_id = p_id and status in ('occupied','reserved')) then
    raise exception 'Some rooms of this type are occupied or reserved, so it cannot be switched between hostel and not hostel.';
  end if;

  -- the name follows the kind; it is kept when the kind and building did not change
  if old.kind = p_kind and old.building_id = p_building then v_name := old.name;
  else v_name := _room_type_name(p_building, p_kind, p_id); end if;

  update room_types set building_id = p_building, name = v_name, kind = p_kind, is_hostel = v_hostel, capacity = v_capacity,
         monthly_price = v_monthly, semester_price = v_semester, description = nullif(trim(p_description), ''),
         amenities = coalesce(p_amenities, '[]'::jsonb), images = coalesce(p_images, '[]'::jsonb),
         allow_self_pick = coalesce(p_allow_self_pick, false)
   where id = p_id;

  -- the edit reaches every room of the type (their status is never touched)
  update rooms set building_id = p_building, room_type = p_kind, capacity = v_capacity, monthly_price = v_monthly,
         semester_price = v_semester, description = nullif(trim(p_description), ''),
         amenities = coalesce(p_amenities, '[]'::jsonb), images = coalesce(p_images, '[]'::jsonb)
   where room_type_id = p_id;

  -- a new rent reaches every resident of the type; they are told straight away
  if not v_hostel and old.monthly_price is distinct from v_monthly then
    for r in select t.id, t.client_id, t.agreed_price from tenancies t join rooms rm on rm.id = t.room_id
              where rm.room_type_id = p_id and t.status = 'active' and t.billing_type = 'monthly'
                and t.agreed_price is distinct from v_monthly loop
      update tenancies set agreed_price = v_monthly where id = r.id;
      perform _note(r.client_id, p_business, 'tenancy', 'Your rent has changed',
                    'Your monthly rent changes from KES ' || to_char(r.agreed_price, 'FM999,999,990') || ' to KES ' || to_char(v_monthly, 'FM999,999,990')
                    || '. It applies to invoices created from now on.', '/app/' || v_slug);
      v_repriced := v_repriced + 1;
    end loop;
  end if;
  if v_hostel and old.semester_price is distinct from v_semester then
    for r in select t.id, t.client_id, t.agreed_price from tenancies t join rooms rm on rm.id = t.room_id
              where rm.room_type_id = p_id and t.status = 'active' and t.billing_type = 'semester'
                and t.agreed_price is distinct from v_semester loop
      update tenancies set agreed_price = v_semester where id = r.id;
      perform _note(r.client_id, p_business, 'tenancy', 'Your rent has changed',
                    'Your semester rent changes from KES ' || to_char(r.agreed_price, 'FM999,999,990') || ' to KES ' || to_char(v_semester, 'FM999,999,990')
                    || '. It applies to invoices created from now on.', '/app/' || v_slug);
      v_repriced := v_repriced + 1;
    end loop;
  end if;

  return jsonb_build_object('id', p_id, 'name', v_name, 'repriced', v_repriced);
exception when unique_violation then
  raise exception 'This building already has a room type with that name. Try again.';
end $$;

-- 5. the manager's offer: hostel types are billed per semester, the others monthly ---------------------
create or replace function respond_request(p_request uuid, p_action text, p_price numeric default null, p_billing text default null,
                                           p_move_in date default null, p_note text default null, p_hours int default 48,
                                           p_room uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare r rental_requests; v_room rooms; v_mode text; v_hostel boolean;
begin
  select * into r from rental_requests where id = p_request for update;
  if r.id is null then raise exception 'Request not found'; end if;
  perform _need_staff(r.tenant_id);
  if r.status <> 'pending' then raise exception 'This request has already been answered'; end if;

  if p_action = 'offer' then
    if p_price is null or p_price < 0 then raise exception 'Enter the agreed rent'; end if;
    if p_billing not in ('monthly','semester') then raise exception 'Billing must be monthly or semester'; end if;

    if r.room_type_id is null then
      -- an older request for one specific room
      select * into v_room from rooms where id = r.room_id for update;
      if v_room.id is null or v_room.status <> 'available' then raise exception 'That room is no longer available'; end if;
    else
      select is_hostel into v_hostel from room_types where id = r.room_type_id;
      if v_hostel and p_billing <> 'semester' then raise exception 'Hostel rooms are billed per semester'; end if;
      if not v_hostel and p_billing <> 'monthly' then raise exception 'This room is billed monthly'; end if;

      -- 1) the room the manager chose now, or 2) the room the person picked
      if coalesce(p_room, r.room_id) is not null then
        select * into v_room from rooms
         where id = coalesce(p_room, r.room_id) and tenant_id = r.tenant_id and room_type_id = r.room_type_id for update;
        if v_room.id is null then raise exception 'That room does not belong to the type this person asked for'; end if;
        if v_room.status <> 'available' then
          if p_room is not null then raise exception 'Room % is no longer available', v_room.room_number; end if;
          v_room := null;   -- their pick was taken meanwhile
        end if;
      end if;
      -- 3) automatic assignment
      if v_room.id is null then
        select room_assignment into v_mode from tenant_settings where tenant_id = r.tenant_id;
        if coalesce(v_mode, 'manual') = 'auto' then
          select * into v_room from rooms
           where tenant_id = r.tenant_id and room_type_id = r.room_type_id and status = 'available'
           order by length(room_number), room_number limit 1 for update skip locked;
          if v_room.id is null then raise exception 'No room of this type is free right now'; end if;
        else
          raise exception 'Choose a room for this person';
        end if;
      end if;
    end if;

    update rental_requests set status = 'offered', room_id = v_room.id, offer_price = p_price, offer_billing_type = p_billing,
      offer_move_in = coalesce(p_move_in, r.preferred_move_in, current_date), response_note = nullif(trim(p_note), ''),
      offer_expires_at = now() + make_interval(hours => greatest(1, least(p_hours, 336))),
      reviewed_by = auth.uid(), reviewed_at = now() where id = p_request;
    update rooms set status = 'reserved' where id = v_room.id;
    perform _note(r.requester_id, r.tenant_id, 'offer', 'Your room request has an offer',
                  'Room ' || v_room.room_number || ' at KES ' || p_price || '. Open My requests to accept.', '/account/requests');
  elsif p_action = 'reject' then
    update rental_requests set status = 'rejected', response_note = nullif(trim(p_note), ''), reviewed_by = auth.uid(), reviewed_at = now() where id = p_request;
    perform _note(r.requester_id, r.tenant_id, 'offer', 'Your room request was declined',
                  coalesce(nullif(trim(p_note), ''), 'The business could not offer you this room.'), '/account/requests');
  else
    raise exception 'Action must be offer or reject';
  end if;
end $$;

-- 6. public list: says is_hostel -----------------------------------------------------------------------
create or replace function list_room_types(p_business uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x.building_name, x.kind, x.name), '[]'::jsonb) from (
    select t.id, t.name, t.kind, t.is_hostel, t.capacity, t.monthly_price, t.semester_price, t.description, t.amenities, t.images,
           t.allow_self_pick, b.id as building_id, b.name as building_name, b.address as building_address,
           count(r.id) as total,
           count(r.id) filter (where r.status = 'available') as available,
           case when t.allow_self_pick then
             (select coalesce(jsonb_agg(jsonb_build_object('id', rr.id, 'room_number', rr.room_number) order by length(rr.room_number), rr.room_number), '[]'::jsonb)
                from rooms rr where rr.room_type_id = t.id and rr.status = 'available')
           else '[]'::jsonb end as free_rooms
      from room_types t
      join buildings b on b.id = t.building_id
      left join rooms r on r.room_type_id = t.id
     where t.tenant_id = p_business and (is_business_active(p_business) or is_staff(p_business))
     group by t.id, b.id
    having count(r.id) > 0) x;
$$;

-- 7. home page feed and "Shop and rent": price is the rent for the period, is_hostel says which ------------
create or replace function public.home_listings(p_per_type integer default 4)
returns jsonb
language sql stable
set search_path = public
as $$
  with shop as (
    select p.id, p.name, p.price, p.unit, p.images, p.created_at,
           b.name as business_name, b.slug as business_slug, b.county
      from products p join businesses b on b.id = p.business_id
     where p.status = 'active' and p.stock > 0 and b.status = 'active' and b.business_type = 'shop'
     order by p.created_at desc
     limit greatest(1, least(coalesce(p_per_type, 4), 12))
  ),
  farm as (
    select p.id, p.name, p.price, p.unit, p.images, p.created_at,
           b.name as business_name, b.slug as business_slug, b.county
      from products p join businesses b on b.id = p.business_id
     where p.status = 'active' and p.stock > 0 and b.status = 'active' and b.business_type = 'agriculture'
     order by p.created_at desc
     limit greatest(1, least(coalesce(p_per_type, 4), 12))
  ),
  rm as (
    select t.id, t.name, t.kind as room_type, t.is_hostel, t.capacity,
           case when t.is_hostel then t.semester_price else t.monthly_price end as price,
           t.images, t.created_at,
           bl.name as building_name,
           b.name as business_name, b.slug as business_slug, b.county,
           (select count(*) from rooms r where r.room_type_id = t.id and r.status = 'available')::int as available,
           (select count(*) from rooms r where r.room_type_id = t.id)::int as total
      from room_types t
      join businesses b on b.id = t.tenant_id
      join buildings bl on bl.id = t.building_id
     where b.status = 'active' and b.business_type = 'rental'
       and exists (select 1 from rooms r where r.room_type_id = t.id and r.status = 'available')
     order by t.created_at desc
     limit greatest(1, least(coalesce(p_per_type, 4), 12))
  )
  select jsonb_build_object(
    'shop',  coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc) from shop s), '[]'::jsonb),
    'farm',  coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at desc) from farm f), '[]'::jsonb),
    'rooms', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from rm r), '[]'::jsonb)
  );
$$;
revoke all on function public.home_listings(integer) from public, anon;
grant execute on function public.home_listings(integer) to anon, authenticated;

create or replace function public.market_listings(
  p_kind text,
  p_q text default null,
  p_county text default null,
  p_sort text default 'new',
  p_limit integer default 8,
  p_offset integer default 0
) returns jsonb
language sql stable
set search_path = public
as $$
  with base as (
    select p.id, p.name as title, p.price::numeric as price, p.unit,
           null::text as room_type, null::text as building_name,
           to_jsonb(p.images) ->> 0 as image, p.created_at,
           b.name as business_name, b.slug as business_slug, b.county,
           null::int as available, null::int as total, null::boolean as is_hostel,
           lower(concat_ws(' ', p.name, p.description, b.name, b.county)) as hay
      from products p join businesses b on b.id = p.business_id
     where p_kind = 'shop' and p.status = 'active' and p.stock > 0
       and b.status = 'active' and b.business_type = 'shop'
    union all
    select p.id, p.name, p.price::numeric, p.unit,
           null::text, null::text,
           to_jsonb(p.images) ->> 0, p.created_at,
           b.name, b.slug, b.county,
           null::int, null::int, null::boolean,
           lower(concat_ws(' ', p.name, p.description, b.name, b.county))
      from products p join businesses b on b.id = p.business_id
     where p_kind = 'farm' and p.status = 'active' and p.stock > 0
       and b.status = 'active' and b.business_type = 'agriculture'
    union all
    -- one row per room type that still has a free room; a hostel's price is its semester rent
    select t.id, t.name, (case when t.is_hostel then t.semester_price else t.monthly_price end)::numeric, null::text,
           t.kind::text, bl.name,
           to_jsonb(t.images) ->> 0, t.created_at,
           b.name, b.slug, b.county,
           (select count(*) from rooms r where r.room_type_id = t.id and r.status = 'available')::int,
           (select count(*) from rooms r where r.room_type_id = t.id)::int,
           t.is_hostel,
           lower(concat_ws(' ', 'room', t.name, _kind_label(t.kind), case when t.is_hostel then 'hostel' end, t.description, bl.name, b.name, b.county))
      from room_types t
      join businesses b on b.id = t.tenant_id
      join buildings bl on bl.id = t.building_id
     where p_kind = 'rooms' and b.status = 'active' and b.business_type = 'rental'
       and exists (select 1 from rooms r where r.room_type_id = t.id and r.status = 'available')
  ),
  filtered as (
    select * from base
     where (nullif(trim(p_county), '') is null or county = trim(p_county))
       and (nullif(trim(p_q), '') is null or strpos(hay, lower(trim(p_q))) > 0)
  ),
  ranked as (
    select f.*, row_number() over (
             order by case when p_sort = 'low' then f.price end asc nulls last,
                      case when p_sort = 'high' then f.price end desc nulls last,
                      f.created_at desc, f.id) as rn
      from filtered f
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'items', coalesce((
      select jsonb_agg(to_jsonb(r) - 'hay' - 'rn' order by r.rn)
        from ranked r
       where r.rn >  greatest(coalesce(p_offset, 0), 0)
         and r.rn <= greatest(coalesce(p_offset, 0), 0) + greatest(1, least(coalesce(p_limit, 8), 120))
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.market_listings(text, text, text, text, integer, integer) from public, anon;
grant execute on function public.market_listings(text, text, text, text, integer, integer) to anon, authenticated;

-- 8. who may call what -----------------------------------------------------------------------------------
revoke all on function save_room_type(uuid, uuid, uuid, text, boolean, int, numeric, numeric, text, jsonb, jsonb, boolean) from public, anon;
grant execute on function save_room_type(uuid, uuid, uuid, text, boolean, int, numeric, numeric, text, jsonb, jsonb, boolean) to authenticated;
