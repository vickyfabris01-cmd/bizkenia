-- supabase/migrations/20261020100007_room_type_listings.sql — NEW FILE
--
-- AIM
-- The home page and the "Shop and rent" page list rooms to rent. With room types, a block of 100
-- identical rooms must show as ONE listing with how many are still free, not as 100 cards.
-- This replaces two functions from 20261020100002 and 20261020100003 so their "rooms" part reads
-- room types:
--   * home_listings()    the home page feed: 'rooms' now has one row per room type
--   * market_listings()  kind 'rooms' now has one row per room type, with available and total
-- Row shape for a room type: id (the type), title/name, room_type (kind), capacity, monthly_price,
-- images, building_name, business_name, business_slug, county, available, total.
-- Everything else (shop, farm, counties, search, sort, paging) is unchanged.
-- Needs 20261020100006_room_types.sql (the room_types table) and 20261020100003.

-- Both functions below run as the visitor, so a visitor must be able to read room types. Row-level
-- security (policy room_types_read) still limits this to businesses that are live.
grant select on public.room_types to anon, authenticated;

-- 1. home page feed ----------------------------------------------------------------------------
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
    select t.id, t.name, t.kind as room_type, t.capacity, t.monthly_price, t.images, t.created_at,
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

-- 2. "Shop and rent" search ----------------------------------------------------------------------
-- p_kind: 'shop' | 'farm' | 'rooms'.  p_sort: 'new' | 'low' | 'high'.
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
           null::int as available, null::int as total,
           lower(concat_ws(' ', p.name, p.description, b.name, b.county)) as hay
      from products p join businesses b on b.id = p.business_id
     where p_kind = 'shop' and p.status = 'active' and p.stock > 0
       and b.status = 'active' and b.business_type = 'shop'
    union all
    select p.id, p.name, p.price::numeric, p.unit,
           null::text, null::text,
           to_jsonb(p.images) ->> 0, p.created_at,
           b.name, b.slug, b.county,
           null::int, null::int,
           lower(concat_ws(' ', p.name, p.description, b.name, b.county))
      from products p join businesses b on b.id = p.business_id
     where p_kind = 'farm' and p.status = 'active' and p.stock > 0
       and b.status = 'active' and b.business_type = 'agriculture'
    union all
    -- one row per room type that still has a free room
    select t.id, t.name, t.monthly_price::numeric, null::text,
           t.kind::text, bl.name,
           to_jsonb(t.images) ->> 0, t.created_at,
           b.name, b.slug, b.county,
           (select count(*) from rooms r where r.room_type_id = t.id and r.status = 'available')::int,
           (select count(*) from rooms r where r.room_type_id = t.id)::int,
           lower(concat_ws(' ', 'room', t.name, t.kind, t.description, bl.name, b.name, b.county))
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
