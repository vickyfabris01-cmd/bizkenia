-- supabase/migrations/20261020100001_room_types.sql — NEW FILE
--
-- AIM
-- Room types. An owner describes a kind of room ONCE (name, building, rent, photos, what it has) and
-- says how many there are (a number range such as A1 to A20). The individual rooms are created from
-- it, so tenancies, invoices and payments keep working on real rooms.
--  * room_types            the shared details + the "tenants may pick their own room" switch
--  * rooms.room_type_id    every room belongs to one type
--  * save_room_type()      create or edit a type; an edit reaches all its rooms, and a rent change
--                          reaches every active tenancy and sends each resident a notification
--  * add_rooms()           add rooms to a type from a number range
--  * delete_room_type()    remove a type that has no history
--  * list_room_types()     public list: one row per type with total and available rooms
--  * submit_type_request() a person asks for a type (and, if allowed, a free room of it)
--  * respond_request()     the manager's offer now also chooses the room (picked / automatic / manual)
--  * my_requests()         shows the type for requests that have no room yet
--  * tenant_settings.room_assignment   'manual' (manager chooses) or 'auto' (system chooses)
--
-- Manager approval stays on for every request: nobody becomes a resident (no dashboard) until a
-- manager sends an offer with a room and the person accepts it.

-- 1. room types ------------------------------------------------------------------------------
create table if not exists room_types (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references businesses(id) on delete cascade,
  building_id     uuid not null references buildings(id) on delete restrict,
  name            text not null,
  kind            text not null default 'single' check (kind in ('single','double','dormitory','suite','bedsitter','studio')),
  capacity        integer not null default 1 check (capacity between 1 and 20),
  monthly_price   numeric not null default 0 check (monthly_price >= 0),
  semester_price  numeric check (semester_price is null or semester_price >= 0),
  description     text,
  amenities       jsonb not null default '[]'::jsonb,
  images          jsonb not null default '[]'::jsonb,
  allow_self_pick boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists room_types_building_name_uq on room_types (building_id, lower(name));
create index if not exists idx_room_types_tenant on room_types (tenant_id);

drop trigger if exists trg_room_types_updated_at on room_types;
create trigger trg_room_types_updated_at before update on room_types
  for each row execute function set_updated_at();

alter table room_types enable row level security;
drop policy if exists room_types_read on room_types;
create policy room_types_read on room_types for select
  using (is_business_active(tenant_id) or is_staff(tenant_id));
-- No write policies: every change goes through the functions below.
revoke insert, update, delete on room_types from anon, authenticated;

-- 2. rooms belong to a type ------------------------------------------------------------------
alter table rooms add column if not exists room_type_id uuid references room_types(id) on delete restrict;
create index if not exists idx_rooms_room_type on rooms (room_type_id);

-- Once there are no loose rooms left, every room must have a type.
do $$
begin
  if not exists (select 1 from rooms where room_type_id is null) then
    alter table rooms alter column room_type_id set not null;
  end if;
end $$;

-- 3. requests may ask for a type -------------------------------------------------------------
alter table rental_requests add column if not exists room_type_id uuid references room_types(id) on delete set null;
create index if not exists idx_requests_room_type on rental_requests (room_type_id);
create unique index if not exists uq_open_type_request on rental_requests (requester_id, room_type_id)
  where room_type_id is not null and status in ('pending','offered');

-- 4. owner setting: who chooses the room -----------------------------------------------------
alter table tenant_settings add column if not exists room_assignment text not null default 'manual'
  check (room_assignment in ('manual','auto'));

-- 5. save a type (create or edit) ------------------------------------------------------------
create or replace function save_room_type(
  p_business uuid, p_id uuid, p_building uuid, p_name text, p_kind text, p_capacity int,
  p_monthly numeric, p_semester numeric, p_description text, p_amenities jsonb, p_images jsonb, p_allow_self_pick boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  old room_types; v_id uuid; v_repriced int := 0; v_slug text := _slug(p_business); r record;
begin
  perform _need_staff(p_business);
  if coalesce(trim(p_name), '') = '' then raise exception 'Enter a name for this room type'; end if;
  if p_kind is null or p_kind not in ('single','double','dormitory','suite','bedsitter','studio') then raise exception 'Choose the kind of room'; end if;
  if p_monthly is null or p_monthly <= 0 then raise exception 'Enter the monthly rent'; end if;
  if p_semester is not null and p_semester < 0 then raise exception 'The semester rent cannot be negative'; end if;
  if coalesce(p_capacity, 0) < 1 or p_capacity > 20 then raise exception 'People it sleeps must be from 1 to 20'; end if;
  if not exists (select 1 from buildings where id = p_building and tenant_id = p_business) then raise exception 'Choose a building'; end if;

  if p_id is null then
    insert into room_types (tenant_id, building_id, name, kind, capacity, monthly_price, semester_price, description, amenities, images, allow_self_pick)
    values (p_business, p_building, trim(p_name), p_kind, p_capacity, p_monthly, p_semester, nullif(trim(p_description), ''),
            coalesce(p_amenities, '[]'::jsonb), coalesce(p_images, '[]'::jsonb), coalesce(p_allow_self_pick, false))
    returning id into v_id;
    return jsonb_build_object('id', v_id, 'repriced', 0);
  end if;

  select * into old from room_types where id = p_id and tenant_id = p_business for update;
  if old.id is null then raise exception 'Room type not found'; end if;

  update room_types set building_id = p_building, name = trim(p_name), kind = p_kind, capacity = p_capacity,
         monthly_price = p_monthly, semester_price = p_semester, description = nullif(trim(p_description), ''),
         amenities = coalesce(p_amenities, '[]'::jsonb), images = coalesce(p_images, '[]'::jsonb),
         allow_self_pick = coalesce(p_allow_self_pick, false)
   where id = p_id;

  -- the edit reaches every room of the type (their status is never touched)
  update rooms set building_id = p_building, room_type = p_kind, capacity = p_capacity, monthly_price = p_monthly,
         semester_price = p_semester, description = nullif(trim(p_description), ''),
         amenities = coalesce(p_amenities, '[]'::jsonb), images = coalesce(p_images, '[]'::jsonb)
   where room_type_id = p_id;

  -- a new monthly rent reaches every resident who pays monthly; they are told straight away
  if old.monthly_price is distinct from p_monthly then
    for r in select t.id, t.client_id, t.agreed_price from tenancies t join rooms rm on rm.id = t.room_id
              where rm.room_type_id = p_id and t.status = 'active' and t.billing_type = 'monthly'
                and t.agreed_price is distinct from p_monthly loop
      update tenancies set agreed_price = p_monthly where id = r.id;
      perform _note(r.client_id, p_business, 'tenancy', 'Your rent has changed',
                    'Your monthly rent changes from KES ' || to_char(r.agreed_price, 'FM999,999,990') || ' to KES ' || to_char(p_monthly, 'FM999,999,990')
                    || '. It applies to invoices created from now on.', '/app/' || v_slug);
      v_repriced := v_repriced + 1;
    end loop;
  end if;

  -- same for residents who pay per semester
  if p_semester is not null and old.semester_price is distinct from p_semester then
    for r in select t.id, t.client_id, t.agreed_price from tenancies t join rooms rm on rm.id = t.room_id
              where rm.room_type_id = p_id and t.status = 'active' and t.billing_type = 'semester'
                and t.agreed_price is distinct from p_semester loop
      update tenancies set agreed_price = p_semester where id = r.id;
      perform _note(r.client_id, p_business, 'tenancy', 'Your rent has changed',
                    'Your semester rent changes from KES ' || to_char(r.agreed_price, 'FM999,999,990') || ' to KES ' || to_char(p_semester, 'FM999,999,990')
                    || '. It applies to invoices created from now on.', '/app/' || v_slug);
      v_repriced := v_repriced + 1;
    end loop;
  end if;

  return jsonb_build_object('id', p_id, 'repriced', v_repriced);
exception when unique_violation then
  raise exception 'This building already has a room type with that name';
end $$;

-- 6. add rooms to a type from a number range -------------------------------------------------
-- add_rooms(type, 'A', 1, 20, 0) -> A1 … A20 ;  add_rooms(type, 'A', 1, 20, 2) -> A01 … A20
create or replace function add_rooms(p_type uuid, p_prefix text, p_from int, p_to int, p_pad int default 0)
returns int language plpgsql security definer set search_path = public as $$
declare t room_types; v_prefix text := coalesce(trim(p_prefix), ''); v_pad int := greatest(coalesce(p_pad, 0), 0); v_count int; v_taken text;
begin
  select * into t from room_types where id = p_type;
  if t.id is null then raise exception 'Room type not found'; end if;
  perform _need_staff(t.tenant_id);
  if p_from is null or p_to is null or p_from < 0 or p_to < p_from then raise exception 'Enter a valid range, like 1 to 20'; end if;
  v_count := p_to - p_from + 1;
  if v_count > 300 then raise exception 'Add up to 300 rooms at a time'; end if;

  select string_agg(room_number, ', ' order by room_number) into v_taken from (
    select room_number from rooms
     where tenant_id = t.tenant_id
       and room_number in (select v_prefix || case when length(g::text) < v_pad then lpad(g::text, v_pad, '0') else g::text end
                             from generate_series(p_from, p_to) g)
     order by room_number limit 5) x;
  if v_taken is not null then raise exception 'These room numbers already exist: %. Choose another prefix or range.', v_taken; end if;

  insert into rooms (tenant_id, building_id, room_type_id, room_number, room_type, capacity, monthly_price, semester_price,
                     description, amenities, images, status)
  select t.tenant_id, t.building_id, t.id,
         v_prefix || case when length(g::text) < v_pad then lpad(g::text, v_pad, '0') else g::text end,
         t.kind, t.capacity, t.monthly_price, t.semester_price, t.description, t.amenities, t.images, 'available'
    from generate_series(p_from, p_to) g;
  return v_count;
end $$;

-- 7. delete a type (only when nothing ever happened in it) -----------------------------------
create or replace function delete_room_type(p_type uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t room_types;
begin
  select * into t from room_types where id = p_type for update;
  if t.id is null then raise exception 'Room type not found'; end if;
  perform _need_staff(t.tenant_id);
  if exists (select 1 from tenancies x join rooms r on r.id = x.room_id where r.room_type_id = p_type) then
    raise exception 'Rooms of this type have tenancy history, so it cannot be deleted. Mark its rooms as under maintenance instead.';
  end if;
  if exists (select 1 from rental_requests q where q.room_type_id = p_type or q.room_id in (select id from rooms where room_type_id = p_type)) then
    raise exception 'There are requests for this type, so it cannot be deleted.';
  end if;
  delete from rooms where room_type_id = p_type;
  delete from room_types where id = p_type;
end $$;

-- 8. public list: one row per type ------------------------------------------------------------
create or replace function list_room_types(p_business uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x.building_name, x.monthly_price, x.name), '[]'::jsonb) from (
    select t.id, t.name, t.kind, t.capacity, t.monthly_price, t.semester_price, t.description, t.amenities, t.images,
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

-- 9. a person asks for a type -----------------------------------------------------------------
create or replace function submit_type_request(p_business uuid, p_type uuid, p_room uuid default null,
                                               p_message text default null, p_move_in date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare t room_types; v_room rooms; v_id uuid; v_name text; v_label text;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  if not is_business_active(p_business) then raise exception 'This business is not taking requests right now'; end if;
  if is_staff(p_business) then raise exception 'You run this business, so you cannot request a room in it'; end if;
  select * into t from room_types where id = p_type and tenant_id = p_business;
  if t.id is null then raise exception 'Room type not found'; end if;
  if not exists (select 1 from rooms where room_type_id = p_type and status = 'available') then
    raise exception 'No % rooms are free right now', t.name;
  end if;
  if exists (select 1 from tenancies where client_id = auth.uid() and status = 'active') then
    raise exception 'You already live in a rented room. Ask to move from your resident page instead.';
  end if;
  if exists (select 1 from rental_requests where requester_id = auth.uid() and room_type_id = p_type and status in ('pending','offered')) then
    raise exception 'You already have an open request for this room type';
  end if;
  if p_room is not null then
    if not t.allow_self_pick then raise exception 'The business assigns rooms itself. Send the request without choosing a room.'; end if;
    select * into v_room from rooms where id = p_room and room_type_id = p_type;
    if v_room.id is null then raise exception 'That room is not part of this room type'; end if;
    if v_room.status <> 'available' then raise exception 'Room % is no longer available', v_room.room_number; end if;
  end if;
  insert into rental_requests (tenant_id, room_type_id, room_id, requester_id, status, message, preferred_move_in)
  values (p_business, p_type, p_room, auth.uid(), 'pending', nullif(trim(p_message), ''), p_move_in) returning id into v_id;
  select coalesce(full_name, email) into v_name from profiles where id = auth.uid();
  v_label := t.name || case when v_room.id is not null then ' (room ' || v_room.room_number || ')' else '' end;
  perform _notify_staff(p_business, 'rental_request', 'New room request',
                        coalesce(v_name, 'Someone') || ' asked for ' || v_label || '.',
                        '/app/' || _slug(p_business) || '/rental-requests');
  return v_id;
end $$;

-- 10. the manager's answer: the offer also chooses the room -----------------------------------
-- Room for an offer: the room the manager chose now; else the room the person picked (if still free);
-- else, when the business assigns automatically, the free room with the lowest number; else the
-- manager must choose one.
drop function if exists respond_request(uuid, text, numeric, text, date, text, int);
create or replace function respond_request(p_request uuid, p_action text, p_price numeric default null, p_billing text default null,
                                           p_move_in date default null, p_note text default null, p_hours int default 48,
                                           p_room uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare r rental_requests; v_room rooms; v_mode text; v_type text;
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

-- 11. the person's own requests (type shown while there is no room yet) -----------------------
create or replace function my_requests() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
    select r.id, r.status, r.message, r.preferred_move_in, r.created_at, r.offer_price, r.offer_billing_type, r.offer_move_in,
           r.offer_expires_at, r.response_note, b.name as business_name, b.slug as business_slug,
           rm.room_number, bl.name as building_name, rm.monthly_price,
           rt.name as type_name, coalesce(rt.monthly_price, rm.monthly_price) as type_monthly_price
    from rental_requests r join businesses b on b.id = r.tenant_id
    left join rooms rm on rm.id = r.room_id
    left join room_types rt on rt.id = r.room_type_id
    left join buildings bl on bl.id = coalesce(rm.building_id, rt.building_id)
    where r.requester_id = auth.uid()) x;
$$;

-- 12. who may call what ----------------------------------------------------------------------
-- the old "request one specific room" call would let a person skip the type's self-pick switch
revoke all on function submit_rental_request(uuid, uuid, text, date) from public, anon, authenticated;

revoke all on function save_room_type(uuid, uuid, uuid, text, text, int, numeric, numeric, text, jsonb, jsonb, boolean),
  add_rooms(uuid, text, int, int, int), delete_room_type(uuid), submit_type_request(uuid, uuid, uuid, text, date),
  respond_request(uuid, text, numeric, text, date, text, int, uuid), my_requests(), list_room_types(uuid) from public, anon;
grant execute on function save_room_type(uuid, uuid, uuid, text, text, int, numeric, numeric, text, jsonb, jsonb, boolean),
  add_rooms(uuid, text, int, int, int), delete_room_type(uuid), submit_type_request(uuid, uuid, uuid, text, date),
  respond_request(uuid, text, numeric, text, date, text, int, uuid), my_requests() to authenticated;
grant execute on function list_room_types(uuid) to anon, authenticated;