-- supabase/migrations/20261024100001_r2_can_write_files.sql
-- AIM: the Cloudflare Worker (worker/index.js) stores files in R2 and asks THIS function, with the
-- signed-in person's own token, whether they may write the given files. The rules are the same ones
-- the Supabase storage policies already enforce (p2_04, p4_07, p3_06), kept in one place:
--   business-media  owner or manager of the business named by the first folder
--   site-media      super admin, inside hero/ only
--   avatars         the person, inside their own folder only
-- Returns false (never an error) for anyone not signed in or for any path that breaks a rule.
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
             split_part(f.path, '/', 1) = 'hero' and split_part(f.path, '/', 2) <> '' and public.is_super_admin()
           when 'avatars' then
             split_part(f.path, '/', 1) = auth.uid()::text and split_part(f.path, '/', 2) <> ''
           else false
         end, false)
     );
$$;
revoke all on function public.can_write_files(text, text[]) from public, anon;
grant execute on function public.can_write_files(text, text[]) to authenticated;
