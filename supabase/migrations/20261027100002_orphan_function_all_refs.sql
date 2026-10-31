-- supabase/migrations/20261027100002_orphan_function_all_refs.sql
-- AIM: put the function behind the "Unused files" tool (worker/orphans.js) into version control, and make it count
-- EVERY column that stores a file path or file address, including the new share_cards table.
-- Before this, the function lived only in the production database. If it did not look at share_cards, the super
-- admin could delete a link-card picture 3 days after it was made, and the link preview would stay broken
-- until the card's data changed (the share code only compares a fingerprint).
--
-- What the Worker sends and expects (worker/orphans.js, unchanged):
--   rpc admin_unreferenced_files({ p_keys: ["business-media/<uuid>/cover/x.jpg", ...] })   up to 1000 keys per call
--   answer { refs: <number of distinct files the database points to>, unreferenced: [<the p_keys nothing points to>] }
--   (refs = 0 makes the Worker refuse to offer or delete anything, as a safety net.)
-- A key is "<bucket>/<path>", exactly how the file is named in storage and in R2.
--
-- Columns that point to a file (keep this list and supabase/tests/orphan_function_tests.sql in step):
--   businesses.logo_url           text    full address         businesses.cover_url   text    full address
--   profiles.avatar_url           text    full address
--   products.images               text[]  full addresses       room_types.images      jsonb   array of full addresses
--   rooms.images                  jsonb   array of addresses (copied from the room type)
--   hero_images.storage_path      text    bare path, bucket site-media (hero/...)
--   share_cards.card              jsonb   { v, bucket, path, url }   the link card (business-media/<id>/share/... or site-media/share/...)
-- Left out on purpose: audit_log (before/after copies of old rows would keep replaced files "in use" for ever),
-- logo_design / avatar_design (drawn from a small recipe, no file), client_errors.url (a page address, not a file).
-- When a new column stores a file path or address, add it to the list inside the function below.
--
-- How a reference is found: the column is read as text and every "<bucket>/<path>" in it is picked out, so it does not
-- matter if the address is Supabase Storage, R2 through the Worker, or your own CDN, or whether the column is text,
-- text[] or jsonb. Paths only use letters, digits, _ - . and / (see worker/index.js), so no decoding is needed.
--
-- Same name, same argument (p_keys text[]), same answer shape as before, so worker/orphans.js keeps working untouched.
-- The return type (json or jsonb) is taken from the function already in the database, because "create or replace"
-- cannot change it; a new database gets jsonb. If the function already exists with a different argument list this
-- migration stops with a clear message and changes nothing.
-- Still super admin only (security definer, search_path pinned, execute granted to signed-in users only).
-- Safe to run more than once.

do $do$
declare
  v_count integer;
  v_args  text;
  v_ret   text := 'jsonb';
begin
  select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_unreferenced_files';

  if v_count > 1 then
    raise exception 'public.admin_unreferenced_files has more than one version. Nothing was changed. Ask the project owner which one the Worker uses.';
  end if;

  if v_count = 1 then
    select pg_get_function_arguments(p.oid), pg_get_function_result(p.oid) into v_args, v_ret
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'admin_unreferenced_files';
    if v_args <> 'p_keys text[]' then
      raise exception 'public.admin_unreferenced_files already exists with arguments (%). Expected (p_keys text[]). Nothing was changed.', v_args;
    end if;
    if v_ret not in ('json', 'jsonb') then
      raise exception 'public.admin_unreferenced_files already returns %. Expected json or jsonb. Nothing was changed.', v_ret;
    end if;
  end if;

  execute format($fn$
create or replace function public.admin_unreferenced_files(p_keys text[]) returns %1$s
language plpgsql stable security definer set search_path = public as $body$
declare
  v_out jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_super_admin(), false) then
    raise exception 'Only the platform owner can do this.' using errcode = '42501';
  end if;

  with src(txt) as (
    select logo_url::text   from public.businesses  where logo_url   is not null
    union all
    select cover_url::text  from public.businesses  where cover_url  is not null
    union all
    select avatar_url::text from public.profiles    where avatar_url is not null
    union all
    select images::text     from public.products    where images     is not null
    union all
    select images::text     from public.room_types  where images     is not null
    union all
    select images::text     from public.rooms       where images     is not null
    union all
    select 'site-media/' || storage_path from public.hero_images where storage_path is not null
    union all
    select card::text       from public.share_cards
    union all
    select (card ->> 'bucket') || '/' || (card ->> 'path')
      from public.share_cards
     where card ->> 'bucket' is not null and card ->> 'path' is not null
  ),
  refs as (
    select distinct m[1] as key
      from src,
           regexp_matches(src.txt, '(?:^|[^A-Za-z0-9_-])((?:business-media|site-media|avatars)/[A-Za-z0-9_/.-]+)', 'g') as m
  ),
  want as (
    select distinct k from unnest(coalesce(p_keys, '{}'::text[])) as k
  ),
  gone as (
    select w.k from want w where not exists (select 1 from refs r where r.key = w.k)
  )
  select jsonb_build_object(
           'refs',         (select count(*) from refs),
           'unreferenced', coalesce((select jsonb_agg(k order by k) from gone), '[]'::jsonb)
         )
    into v_out;

  return v_out::%1$s;
end;
$body$
$fn$, v_ret);
end
$do$;

revoke all on function public.admin_unreferenced_files(text[]) from public, anon;
grant execute on function public.admin_unreferenced_files(text[]) to authenticated;

comment on function public.admin_unreferenced_files(text[]) is
  'Super admin only. Of the given storage keys (bucket/path), returns { refs, unreferenced }: the keys no database column points to. Counts businesses.logo_url/cover_url, profiles.avatar_url, products.images, room_types.images, rooms.images, hero_images.storage_path and share_cards.card. Used by worker/orphans.js.';
