-- supabase/migrations/20261014100004_p2_04_staff_only_writes.sql — NEW FILE
--
-- AIM
-- Phase 2, step 4: residents are now business members too, so two Phase 1 rules that said
-- "any member" are narrowed to "owner or manager": uploading business media and sending
-- notifications to other members.

drop policy if exists business_media_write on storage.objects;
drop policy if exists business_media_update on storage.objects;
drop policy if exists business_media_delete on storage.objects;
create policy business_media_write on storage.objects for insert to authenticated
  with check (bucket_id = 'business-media' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
              and public.is_staff(((storage.foldername(name))[1])::uuid));
create policy business_media_update on storage.objects for update to authenticated
  using (bucket_id = 'business-media' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         and public.is_staff(((storage.foldername(name))[1])::uuid));
create policy business_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'business-media' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         and public.is_staff(((storage.foldername(name))[1])::uuid));

create or replace function notify(p_user uuid, p_business uuid, p_type text, p_title text, p_body text default null, p_link text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not (coalesce(is_super_admin(), false) or p_user = auth.uid()
          or (p_business is not null and is_staff(p_business)
              and exists (select 1 from business_members where business_id = p_business and user_id = p_user and status = 'active'))) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  insert into notifications (user_id, tenant_id, type, title, body, link) values (p_user, p_business, p_type, p_title, p_body, p_link);
end;
$$;
