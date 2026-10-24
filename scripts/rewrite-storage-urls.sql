-- scripts/rewrite-storage-urls.sql
-- AIM: after the files are copied to R2 and the site runs with VITE_STORAGE_PROVIDER=r2, point every
-- stored picture address (business logos and covers, room/product photos, avatars...) at the new place.
-- Run in the Supabase SQL editor. It scans every text, text[] and jsonb column of every table in the
-- public schema, so no column is forgotten. Run it first with v_apply = false (counts only), then true.
-- Take a backup first (Supabase dashboard > Database > Backups).
--
-- Fill in the two prefixes. They must end where the bucket name begins:
--   old: https://<project-ref>.supabase.co/storage/v1/object/public/
--   new: the address the app now writes, up to the bucket name, e.g.
--        https://bizkenia.<you>.workers.dev/api/files/     or    https://cdn.example.com/
do $$
declare
  v_old   text    := 'https://YOUR-PROJECT-REF.supabase.co/storage/v1/object/public/';
  v_new   text    := 'https://YOUR-SITE/api/files/';
  v_apply boolean := false;
  c record; n bigint; total bigint := 0;
begin
  if v_old like '%YOUR-%' or v_new like '%YOUR-%' then raise exception 'Fill in v_old and v_new first.'; end if;
  for c in
    select col.table_name t, col.column_name k, col.data_type d, col.udt_name u
    from information_schema.columns col
    join information_schema.tables tb on tb.table_schema = col.table_schema and tb.table_name = col.table_name
    where col.table_schema = 'public' and tb.table_type = 'BASE TABLE'
      and (col.data_type in ('text', 'character varying', 'jsonb') or (col.data_type = 'ARRAY' and col.udt_name = '_text'))
  loop
    if c.d in ('text', 'character varying') then
      execute format('select count(*) from public.%I where %I like %L', c.t, c.k, v_old || '%') into n;
      if n > 0 and v_apply then execute format('update public.%I set %I = replace(%I, %L, %L) where %I like %L', c.t, c.k, c.k, v_old, v_new, c.k, v_old || '%'); end if;
    elsif c.d = 'jsonb' then
      execute format('select count(*) from public.%I where %I::text like %L', c.t, c.k, '%' || v_old || '%') into n;
      if n > 0 and v_apply then execute format('update public.%I set %I = replace(%I::text, %L, %L)::jsonb where %I::text like %L', c.t, c.k, c.k, v_old, v_new, c.k, '%' || v_old || '%'); end if;
    else
      execute format('select count(*) from public.%I where exists (select 1 from unnest(%I) x where x like %L)', c.t, c.k, v_old || '%') into n;
      if n > 0 and v_apply then execute format('update public.%I set %I = (select array_agg(replace(x, %L, %L)) from unnest(%I) x) where exists (select 1 from unnest(%I) x where x like %L)', c.t, c.k, v_old, v_new, c.k, c.k, v_old || '%'); end if;
    end if;
    if n > 0 then raise notice '% rows in %.%', n, c.t, c.k; total := total + n; end if;
  end loop;
  raise notice '% % rows in total.', case when v_apply then 'Updated' else 'Would update' end, total;
end $$;
