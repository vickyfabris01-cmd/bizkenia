-- supabase/migrations/20261016100007_p4_07_hero_images.sql
--
-- AIM
-- Home page hero background managed by the super admin.
--   1. Public storage bucket "site-media" (folder hero/): only the super admin can write.
--   2. Table hero_images: the uploaded photos, their order and an on/off switch.
--   3. platform_settings key "hero_rotation": how often the photo changes (12, 24, 120 or 168 hours).
--   4. Function current_hero_image(): which photo is showing right now, the same for every visitor.
-- Safe to run more than once.

-- 1. Bucket (public read, 5 MB, images only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-media', 'site-media', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists site_media_read   on storage.objects;
drop policy if exists site_media_write  on storage.objects;
drop policy if exists site_media_update on storage.objects;
drop policy if exists site_media_delete on storage.objects;

create policy site_media_read on storage.objects for select
  using (bucket_id = 'site-media');

-- only super admin, and only inside the hero/ folder
create policy site_media_write on storage.objects for insert to authenticated
  with check (bucket_id = 'site-media' and (storage.foldername(name))[1] = 'hero' and public.is_super_admin());
create policy site_media_update on storage.objects for update to authenticated
  using (bucket_id = 'site-media' and (storage.foldername(name))[1] = 'hero' and public.is_super_admin());
create policy site_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'site-media' and (storage.foldername(name))[1] = 'hero' and public.is_super_admin());

-- 2. Images table
create table if not exists public.hero_images (
  id           uuid primary key default gen_random_uuid(),
  storage_path text not null unique check (storage_path like 'hero/%'),
  alt_text     text,
  sort_order   int  not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null
);
create index if not exists hero_images_order_idx on public.hero_images (sort_order, created_at);

alter table public.hero_images enable row level security;

drop policy if exists hero_images_public_read on public.hero_images;
drop policy if exists hero_images_admin_write on public.hero_images;
create policy hero_images_public_read on public.hero_images for select
  using (is_active or public.is_super_admin());
create policy hero_images_admin_write on public.hero_images for all
  using (public.is_super_admin()) with check (public.is_super_admin());

-- 3. Cycle setting: cycle_hours must be 12, 24 (day), 120 (5 days) or 168 (week)
insert into public.platform_settings (key, value, is_public)
values ('hero_rotation',
        jsonb_build_object('cycle_hours', 24, 'anchor', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
        true)
on conflict (key) do nothing;

create or replace function public.guard_hero_rotation() returns trigger
language plpgsql as $$
begin
  if new.key = 'hero_rotation' then
    if (new.value->>'cycle_hours') is null or (new.value->>'cycle_hours')::int not in (12, 24, 120, 168) then
      raise exception 'cycle_hours must be 12, 24, 120 or 168';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_hero_rotation on public.platform_settings;
create trigger trg_guard_hero_rotation before insert or update on public.platform_settings
  for each row execute function public.guard_hero_rotation();

-- 4. Which image is showing right now (no cron needed; same answer for every visitor)
create or replace function public.current_hero_image()
returns table (storage_path text, alt_text text, next_change_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_hours  int;
  v_anchor timestamptz;
  v_count  int;
  v_slot   bigint;
begin
  select coalesce((value->>'cycle_hours')::int, 24), coalesce((value->>'anchor')::timestamptz, now())
    into v_hours, v_anchor
    from platform_settings where key = 'hero_rotation';
  v_hours  := coalesce(v_hours, 24);
  v_anchor := coalesce(v_anchor, now());

  select count(*) into v_count from hero_images where is_active;
  if v_count = 0 then return; end if;

  v_slot := floor(extract(epoch from (now() - v_anchor)) / (v_hours * 3600))::bigint;

  return query
    select h.storage_path, h.alt_text,
           v_anchor + make_interval(hours => v_hours * (v_slot + 1)::int)
      from hero_images h
     where h.is_active
     order by h.sort_order, h.created_at, h.id
     offset (((v_slot % v_count) + v_count) % v_count)::int limit 1;
end;
$$;
grant execute on function public.current_hero_image() to anon, authenticated;
