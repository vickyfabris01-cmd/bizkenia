-- supabase/tests/orphan_function_tests.sql — NEW FILE
-- AIM: proves admin_unreferenced_files (migration 20261027100002) counts every column that points to a file,
-- above all share_cards (a link-card picture must NEVER show as unused), still reports a file nothing points to,
-- and stays closed to everyone except a super admin. It also scans every text, text[] and jsonb column of the
-- public schema for storage paths, so a column added later and forgotten by the function is caught here.
-- Run in the Supabase SQL editor (or psql) on a SCRATCH or DEV project, never production, after the migration, with
-- at least one super admin account (profiles.role = 'super_admin'). Rows that do not exist yet (no business, no
-- product...) are reported as SKIPPED, not failed. Everything runs in one transaction that is rolled back, so no data
-- is left behind. The last result row says ALL ORPHAN-FUNCTION CHECKS PASS, or the first failure aborts with its reason.
begin;
create or replace function pg_temp.as_user(p_id uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
end $$;
create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FAILED: %', p_msg; end if;
end $$;
-- Runs p_sql and returns the error text, or null when it was NOT refused.
create or replace function pg_temp.err_of(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then return sqlerrm;
end $$;
-- The keys (of those asked about) that nothing points to, as the signed-in person would get them.
create or replace function pg_temp.unref(p_keys text[]) returns text[] language sql as $$
  select coalesce(array(select jsonb_array_elements_text((public.admin_unreferenced_files(p_keys))::jsonb -> 'unreferenced')), '{}'::text[])
$$;
create or replace function pg_temp.refs() returns integer language sql as $$
  select (((public.admin_unreferenced_files('{}'::text[]))::jsonb) ->> 'refs')::integer
$$;
grant execute on function pg_temp.as_user(uuid), pg_temp.as_anon(), pg_temp.ok(boolean, text), pg_temp.err_of(text),
  pg_temp.unref(text[]), pg_temp.refs() to public;

do $$
declare
  v_admin uuid; v_user uuid;
  v_id uuid; v_biz uuid;
  v_k text; v_e text;
  v_none  constant text := 'business-media/00000000-0000-4000-8000-000000000000/zz/orphan-test-none.jpg';
  v_super constant text := 'https://abcdefgh.supabase.co/storage/v1/object/public/';
  v_r2    constant text := 'https://example.test/api/files/';
  v_cols text;
  c record; n bigint;
begin
  reset role;
  select id into v_admin from profiles where role = 'super_admin' limit 1;
  if v_admin is null then raise exception 'No super admin account found (profiles.role = super_admin).'; end if;
  select id into v_user from profiles where role <> 'super_admin' limit 1;

  -- 1. who may ask -----------------------------------------------------------------------------------------------
  perform pg_temp.as_anon();
  v_e := pg_temp.err_of(format('select public.admin_unreferenced_files(array[%L])', v_none));
  perform pg_temp.ok(v_e is not null, 'a signed-out visitor is refused');
  if v_user is not null then
    perform pg_temp.as_user(v_user);
    v_e := pg_temp.err_of(format('select public.admin_unreferenced_files(array[%L])', v_none));
    perform pg_temp.ok(v_e ilike '%platform owner%', 'a signed-in person who is not a super admin is refused (got: ' || coalesce(v_e, 'no error') || ')');
  else
    raise notice 'SKIPPED: no ordinary account to test the refusal with';
  end if;

  perform pg_temp.as_user(v_admin);
  -- a file nothing points to is reported, and the answer has the shape worker/orphans.js reads
  perform pg_temp.ok(v_none = any (pg_temp.unref(array[v_none])), 'a file nothing points to is reported as unused');
  perform pg_temp.ok(jsonb_typeof((public.admin_unreferenced_files(array[v_none]))::jsonb -> 'unreferenced') = 'array'
                     and jsonb_typeof((public.admin_unreferenced_files(array[v_none]))::jsonb -> 'refs') = 'number',
                     'the answer is { refs: number, unreferenced: [...] }');
  perform pg_temp.ok(pg_temp.unref(null) = '{}'::text[] and pg_temp.unref('{}') = '{}'::text[], 'no keys asked, none reported');

  -- 2. share_cards: the card picture must not show as unused ------------------------------------------------------
  reset role;
  select id into v_biz from businesses limit 1;
  v_k := 'site-media/share/zz-orphan-test-abc.jpg';
  insert into share_cards (kind, ref, card) values ('site', 'zz-orphan-test-1',
    jsonb_build_object('v', 't1', 'bucket', 'site-media', 'path', 'share/zz-orphan-test-abc.jpg', 'url', v_r2 || v_k));
  perform pg_temp.as_user(v_admin);
  perform pg_temp.ok(not (v_k = any (pg_temp.unref(array[v_k, v_none]))), 'a SITE share card (url + bucket + path) does not appear as unused');
  perform pg_temp.ok(v_none = any (pg_temp.unref(array[v_k, v_none])), 'and an unrelated file still does');
  perform pg_temp.ok(pg_temp.refs() >= 1, 'refs counts the files the database points to');
  reset role;
  delete from share_cards where ref = 'zz-orphan-test-1';
  perform pg_temp.as_user(v_admin);
  perform pg_temp.ok(v_k = any (pg_temp.unref(array[v_k])), 'with the card row gone, its picture is unused again (so the card was what protected it)');

  -- a card that only has the address, and one that only has bucket + path
  reset role;
  v_k := 'business-media/11111111-2222-4333-8444-555555555555/share/business-zz-def.jpg';
  insert into share_cards (kind, ref, card) values ('business', '11111111-2222-4333-8444-555555555555',
    jsonb_build_object('v', 't2', 'url', v_super || v_k));
  perform pg_temp.as_user(v_admin);
  perform pg_temp.ok(not (v_k = any (pg_temp.unref(array[v_k]))), 'a BUSINESS share card with only a url (Supabase address) is counted');
  reset role;
  delete from share_cards where ref = '11111111-2222-4333-8444-555555555555';
  v_k := 'business-media/11111111-2222-4333-8444-555555555555/share/product-zz-ghi.jpg';
  insert into share_cards (kind, ref, card) values ('product', '66666666-7777-4888-8999-aaaaaaaaaaaa',
    jsonb_build_object('v', 't3', 'bucket', 'business-media', 'path', '11111111-2222-4333-8444-555555555555/share/product-zz-ghi.jpg'));
  perform pg_temp.as_user(v_admin);
  perform pg_temp.ok(not (v_k = any (pg_temp.unref(array[v_k]))), 'a PRODUCT share card with only bucket + path is counted');
  reset role;
  delete from share_cards where ref = '66666666-7777-4888-8999-aaaaaaaaaaaa';

  -- 3. every other column that points to a file ------------------------------------------------------------------
  -- businesses.logo_url (Supabase address) and cover_url (R2 address with a query string)
  select id into v_id from businesses limit 1;
  if v_id is null then raise notice 'SKIPPED: businesses.logo_url / cover_url (no business yet)'; else
    update businesses set logo_url = v_super || 'business-media/' || v_id || '/logo/zz-t1.png',
                          cover_url = v_r2 || 'business-media/' || v_id || '/cover/zz-t2.jpg?v=3' where id = v_id;
    perform pg_temp.as_user(v_admin);
    perform pg_temp.ok(not ('business-media/' || v_id || '/logo/zz-t1.png' = any (pg_temp.unref(array['business-media/' || v_id || '/logo/zz-t1.png']))), 'businesses.logo_url is counted');
    perform pg_temp.ok(not ('business-media/' || v_id || '/cover/zz-t2.jpg' = any (pg_temp.unref(array['business-media/' || v_id || '/cover/zz-t2.jpg']))), 'businesses.cover_url is counted (query string ignored)');
    perform pg_temp.ok('business-media/' || v_id || '/logo/zz-t1' = any (pg_temp.unref(array['business-media/' || v_id || '/logo/zz-t1'])), 'a key that is only the START of a pointed-to file is still unused');
    reset role;
  end if;

  -- profiles.avatar_url
  select id into v_id from profiles limit 1;
  if v_id is null then raise notice 'SKIPPED: profiles.avatar_url'; else
    update profiles set avatar_url = v_r2 || 'avatars/' || v_id || '/zz-t3.webp' where id = v_id;
    perform pg_temp.as_user(v_admin);
    perform pg_temp.ok(not ('avatars/' || v_id || '/zz-t3.webp' = any (pg_temp.unref(array['avatars/' || v_id || '/zz-t3.webp']))), 'profiles.avatar_url is counted');
    reset role;
  end if;

  -- products.images (text[])
  select id into v_id from products limit 1;
  if v_id is null then raise notice 'SKIPPED: products.images (no product yet)'; else
    update products set images = array[v_super || 'business-media/aaaaaaaa-0000-4000-8000-000000000001/products/zz-t4a.jpg',
                                       v_super || 'business-media/aaaaaaaa-0000-4000-8000-000000000001/products/zz-t4b.jpg'] where id = v_id;
    perform pg_temp.as_user(v_admin);
    perform pg_temp.ok(cardinality(pg_temp.unref(array['business-media/aaaaaaaa-0000-4000-8000-000000000001/products/zz-t4a.jpg',
                                                       'business-media/aaaaaaaa-0000-4000-8000-000000000001/products/zz-t4b.jpg'])) = 0, 'products.images is counted (both photos)');
    reset role;
  end if;

  -- room_types.images (jsonb)
  select id into v_id from room_types limit 1;
  if v_id is null then raise notice 'SKIPPED: room_types.images (no room type yet)'; else
    update room_types set images = jsonb_build_array(v_super || 'business-media/aaaaaaaa-0000-4000-8000-000000000001/rooms/zz-t5.jpg') where id = v_id;
    perform pg_temp.as_user(v_admin);
    perform pg_temp.ok(not ('business-media/aaaaaaaa-0000-4000-8000-000000000001/rooms/zz-t5.jpg' = any (pg_temp.unref(array['business-media/aaaaaaaa-0000-4000-8000-000000000001/rooms/zz-t5.jpg']))), 'room_types.images is counted');
    reset role;
  end if;

  -- rooms.images (jsonb)
  select id into v_id from rooms limit 1;
  if v_id is null then raise notice 'SKIPPED: rooms.images (no room yet)'; else
    update rooms set images = jsonb_build_array(v_super || 'business-media/aaaaaaaa-0000-4000-8000-000000000001/rooms/zz-t6.jpg') where id = v_id;
    perform pg_temp.as_user(v_admin);
    perform pg_temp.ok(not ('business-media/aaaaaaaa-0000-4000-8000-000000000001/rooms/zz-t6.jpg' = any (pg_temp.unref(array['business-media/aaaaaaaa-0000-4000-8000-000000000001/rooms/zz-t6.jpg']))), 'rooms.images is counted');
    reset role;
  end if;

  -- hero_images.storage_path (a bare path, the bucket is site-media)
  insert into hero_images (storage_path) values ('hero/zz-t7.jpg');
  perform pg_temp.as_user(v_admin);
  perform pg_temp.ok(not ('site-media/hero/zz-t7.jpg' = any (pg_temp.unref(array['site-media/hero/zz-t7.jpg']))), 'hero_images.storage_path is counted (as site-media/hero/...)');
  reset role;

  -- 4. drift check: any OTHER column that holds a storage path is a column the function does not know about ----------
  for c in
    select col.table_name t, col.column_name k
      from information_schema.columns col
      join information_schema.tables tb on tb.table_schema = col.table_schema and tb.table_name = col.table_name
     where col.table_schema = 'public' and tb.table_type = 'BASE TABLE'
       and (col.data_type in ('text', 'character varying', 'jsonb') or (col.data_type = 'ARRAY' and col.udt_name = '_text'))
       and (col.table_name, col.column_name) not in
           (('businesses', 'logo_url'), ('businesses', 'cover_url'), ('profiles', 'avatar_url'), ('products', 'images'),
            ('room_types', 'images'), ('rooms', 'images'), ('hero_images', 'storage_path'), ('share_cards', 'card'),
            ('audit_log', 'before'), ('audit_log', 'after'))
     order by 1, 2
  loop
    execute format('select count(*) from public.%I where %I::text ~ %L', c.t, c.k,
                   '(^|[^A-Za-z0-9_-])(business-media|site-media|avatars)/[A-Za-z0-9_/.-]+') into n;
    if n > 0 then v_cols := coalesce(v_cols || ', ', '') || c.t || '.' || c.k; end if;
  end loop;
  perform pg_temp.ok(v_cols is null,
    'these columns hold a storage path but admin_unreferenced_files does not count them (a file they point to could be deleted): ' || coalesce(v_cols, ''));
end $$;

select 'ALL ORPHAN-FUNCTION CHECKS PASS' as result;
rollback;
