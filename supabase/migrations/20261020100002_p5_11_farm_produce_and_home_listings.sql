-- Farms can sell produce through the products catalogue, and the home page gets one call
-- that returns the latest shop products, farm produce and available rooms.

-- 1. A farm's active produce is publicly readable, like a shop's products.
--    (Checkout is untouched: place_order still only accepts shops.)
create or replace function public.shop_is_live(bid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from businesses where id = bid and status = 'active' and business_type in ('shop', 'agriculture'));
$$;
grant execute on function public.shop_is_live(uuid) to anon, authenticated;

-- 2. "Latest" rooms needs a creation time. No change if the column already exists.
alter table public.rooms add column if not exists created_at timestamptz not null default now();

-- 3. Home page feed: up to p_per_type of each (1 to 12, default 4), newest first.
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
    select r.id, r.room_number, r.room_type, r.capacity, r.monthly_price, r.images, r.created_at,
           bl.name as building_name,
           b.name as business_name, b.slug as business_slug, b.county
      from rooms r
      join businesses b on b.id = r.tenant_id
      left join buildings bl on bl.id = r.building_id
     where r.status = 'available' and b.status = 'active' and b.business_type = 'rental'
     order by r.created_at desc
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