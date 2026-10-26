-- supabase/migrations/20261026100001_share_cards.sql
-- AIM: keep the LINK CARD of each shareable thing ready (see src/lib/api/shareCards.js).
-- The link card is the small landscape picture WhatsApp, Facebook, Telegram and X show when a shared
-- link is pasted. It is drawn in the owner's browser, saved to file storage, and recorded here:
--   share_cards(kind, ref) -> { v: fingerprint of the data it shows, url, bucket, path }
--   kind  business | product | room | site      ref  the business, product or room type id, or the site page (home | explore | pricing)
-- It is a table of its own, so nothing about businesses, products or room types changes (no new
-- columns, no triggers, no audit entries). Two functions are the only way in and out:
--   set_share_card(...)  owner or manager of the business (or the super admin, for the site); checks who is asking
--   get_share_card(...)  anyone, but only for something that is live (an active business, an item on sale)
-- The Cloudflare Worker (worker/share.js) calls get_share_card with the public key to build the preview.
-- Also lets the super admin store the site cards in site-media/share/ (it was hero/ only).
-- Safe to run more than once.

-- 1. The table: closed to direct access (row-level security on, no policies)
create table if not exists public.share_cards (
  kind       text not null check (kind in ('business', 'product', 'room', 'site')),
  ref        text not null,
  card       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (kind, ref)
);
alter table public.share_cards enable row level security;

-- 2. Write: only the people who may manage that thing
create or replace function public.set_share_card(p_kind text, p_id uuid, p_key text, p_card jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  bid uuid;
  r   text;
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;
  if p_card is null or jsonb_typeof(p_card) <> 'object' or coalesce(p_card ->> 'url', '') = '' or coalesce(p_card ->> 'v', '') = '' then
    raise exception 'That share card is not valid.' using errcode = '22023';
  end if;

  if p_kind = 'site' then
    if not coalesce(public.is_super_admin(), false) then
      raise exception 'Only the platform owner can do this.' using errcode = '42501';
    end if;
    if p_key not in ('home', 'explore', 'pricing') then
      raise exception 'Unknown page.' using errcode = '22023';
    end if;
    r := p_key;
  else
    if p_id is null then raise exception 'Missing id.' using errcode = '22023'; end if;
    if p_kind = 'business' then bid := p_id;
    elsif p_kind = 'product' then select business_id into bid from public.products where id = p_id;
    elsif p_kind = 'room' then select tenant_id into bid from public.room_types where id = p_id;
    else raise exception 'Unknown kind.' using errcode = '22023';
    end if;
    if bid is null or not public.is_staff(bid) then
      raise exception 'You cannot share this one.' using errcode = '42501';
    end if;
    r := p_id::text;
  end if;

  insert into public.share_cards (kind, ref, card) values (p_kind, r, p_card)
  on conflict (kind, ref) do update set card = excluded.card, updated_at = now();
end;
$$;
revoke all on function public.set_share_card(text, uuid, text, jsonb) from public, anon;
grant execute on function public.set_share_card(text, uuid, text, jsonb) to authenticated;

-- 3. Read: anyone, but only for something that is live; null when there is nothing
create or replace function public.get_share_card(p_kind text, p_id uuid, p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select c.card
    from public.share_cards c
   where c.kind = p_kind
     and (
       (p_kind = 'site' and c.ref = p_key)
       or (p_kind = 'business' and c.ref = p_id::text
           and exists (select 1 from public.businesses b where b.id = p_id and b.status = 'active'))
       or (p_kind = 'product' and c.ref = p_id::text
           and exists (select 1 from public.products p join public.businesses b on b.id = p.business_id
                        where p.id = p_id and p.status = 'active' and b.status = 'active'))
       or (p_kind = 'room' and c.ref = p_id::text
           and exists (select 1 from public.room_types t join public.businesses b on b.id = t.tenant_id
                        where t.id = p_id and b.status = 'active'))
     );
$$;
grant execute on function public.get_share_card(text, uuid, text) to anon, authenticated;

-- 4. File storage: the super admin may also write the site cards in site-media/share/
drop policy if exists site_media_write  on storage.objects;
drop policy if exists site_media_update on storage.objects;
drop policy if exists site_media_delete on storage.objects;
create policy site_media_write on storage.objects for insert to authenticated
  with check (bucket_id = 'site-media' and (storage.foldername(name))[1] in ('hero', 'share') and public.is_super_admin());
create policy site_media_update on storage.objects for update to authenticated
  using (bucket_id = 'site-media' and (storage.foldername(name))[1] in ('hero', 'share') and public.is_super_admin());
create policy site_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'site-media' and (storage.foldername(name))[1] in ('hero', 'share') and public.is_super_admin());

-- 5. Cloudflare R2 (worker/index.js asks this): same rule, site-media now hero/ or share/
create or replace function public.can_write_files(p_bucket text, p_paths text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and coalesce(array_length(p_paths, 1), 0) between 1 and 100
     and not exists (
       select 1 from unnest(p_paths) as f(path)
       where not coalesce(
         case p_bucket
           when 'business-media' then
             case when split_part(f.path, '/', 1) ~ '^[0-9a-f-]{36}$' and split_part(f.path, '/', 2) <> ''
                  then public.is_staff(split_part(f.path, '/', 1)::uuid) else false end
           when 'site-media' then
             split_part(f.path, '/', 1) in ('hero', 'share') and split_part(f.path, '/', 2) <> '' and public.is_super_admin()
           when 'avatars' then
             split_part(f.path, '/', 1) = auth.uid()::text and split_part(f.path, '/', 2) <> ''
           else false
         end, false)
     );
$$;
revoke all on function public.can_write_files(text, text[]) from public, anon;
grant execute on function public.can_write_files(text, text[]) to authenticated;
