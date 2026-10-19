-- The "Shop and rent" page: one search/filter/sort function for shop products, farm produce and
-- available rooms, and one function that lists the counties that have items of a given type.
-- Both run as the caller, so row-level security still decides what a visitor can see.
-- Needs 20261020100002 (rooms.created_at, farm produce readable).

-- p_kind: 'shop' | 'farm' | 'rooms'.  p_sort: 'new' | 'low' | 'high'.
-- Search looks at the name, description, business, building and county (plain text match).
-- Returns { total, items } where total counts every match and items is one page of them.
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
           lower(concat_ws(' ', p.name, p.description, b.name, b.county)) as hay
      from products p join businesses b on b.id = p.business_id
     where p_kind = 'shop' and p.status = 'active' and p.stock > 0
       and b.status = 'active' and b.business_type = 'shop'
    union all
    select p.id, p.name, p.price::numeric, p.unit,
           null::text, null::text,
           to_jsonb(p.images) ->> 0, p.created_at,
           b.name, b.slug, b.county,
           lower(concat_ws(' ', p.name, p.description, b.name, b.county))
      from products p join businesses b on b.id = p.business_id
     where p_kind = 'farm' and p.status = 'active' and p.stock > 0
       and b.status = 'active' and b.business_type = 'agriculture'
    union all
    select r.id, 'Room ' || r.room_number, r.monthly_price::numeric, null::text,
           r.room_type::text, bl.name,
           to_jsonb(r.images) ->> 0, r.created_at,
           b.name, b.slug, b.county,
           lower(concat_ws(' ', 'room', r.room_number, r.room_type, r.description, bl.name, b.name, b.county))
      from rooms r
      join businesses b on b.id = r.tenant_id
      left join buildings bl on bl.id = r.building_id
     where p_kind = 'rooms' and r.status = 'available'
       and b.status = 'active' and b.business_type = 'rental'
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

-- Counties that have at least one item of the type. p_kind null or '' means any type.
create or replace function public.market_counties(p_kind text default null)
returns text[]
language sql stable
set search_path = public
as $$
  select coalesce(array_agg(t.c order by t.c), '{}'::text[])
    from (
      select distinct b.county as c
        from businesses b
       where b.status = 'active' and b.county is not null and trim(b.county) <> ''
         and (
              (coalesce(p_kind, '') in ('', 'shop') and b.business_type = 'shop'
                 and exists (select 1 from products p where p.business_id = b.id and p.status = 'active' and p.stock > 0))
           or (coalesce(p_kind, '') in ('', 'farm') and b.business_type = 'agriculture'
                 and exists (select 1 from products p where p.business_id = b.id and p.status = 'active' and p.stock > 0))
           or (coalesce(p_kind, '') in ('', 'rooms') and b.business_type = 'rental'
                 and exists (select 1 from rooms r where r.tenant_id = b.id and r.status = 'available'))
         )
    ) t;
$$;
revoke all on function public.market_counties(text) from public, anon;
grant execute on function public.market_counties(text) to anon, authenticated;