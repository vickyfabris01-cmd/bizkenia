-- 20261019100001_p5_08_hardening.sql — Phase 5 step 4 (hardening)
-- Result of the security review of the live project. Every statement is safe to run twice.
--   1. Table privileges: signed-out visitors can no longer write to anything, and nobody can TRUNCATE
--      (TRUNCATE ignores row-level security).
--   2. Function privileges: only the functions a signed-out visitor really needs stay open to them.
--   3. Mutable search_path on a few helper functions is fixed.
--   4. Storage: the old catch-all rules on the documents, invoices and property-images buckets are
--      removed (any signed-in person could read or write every document), business-media gets a size
--      and file type limit, duplicate avatar rules are dropped.
--   5. The leftover "read for all users" rule on tenant_branding now follows business visibility.
--   6. client_errors: a small error log for the live site (browser crashes), readable by super admins.

-- 1. table privileges ---------------------------------------------------------------------
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
do $$ begin
  alter default privileges in schema public revoke insert, update, delete, truncate, references, trigger on tables from anon;
  alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;
exception when others then null;
end $$;

-- 2. function privileges ----------------------------------------------------------------------
do $$
declare f record; had_auth boolean;
begin
  for f in
    select p.oid, p.proname, p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    had_auth := has_function_privilege('authenticated', f.oid, 'execute');
    execute format('revoke all on function %s from public, anon', f.sig);
    if had_auth then execute format('grant execute on function %s to authenticated', f.sig); end if;
    begin execute format('grant execute on function %s to service_role', f.sig); exception when others then null; end;
    -- what a signed-out visitor needs: the read-only "who am I" checks used inside row-level security,
    -- and the public pages (stats, hero image, invoice and invite links, phone check at sign-up)
    if f.proname ~ '^(is_|can_|in_)' or f.proname in (
         'account_active', 'member_role', 'normalize_phone', 'notification_category',
         'public_stats', 'current_hero_image', 'phone_available', 'get_invite_by_token', 'get_public_invoice') then
      execute format('grant execute on function %s to anon, authenticated', f.sig);
    end if;
  end loop;
end $$;

-- internal helpers, the payment confirmation, the phone login lookup and trigger functions are never callable by a browser
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f'
              and (p.proname like '\_%' or p.proname in ('mark_intent_paid', 'login_email_for_phone') or p.prorettype = 'trigger'::regtype)
              and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    begin execute format('grant execute on function %s to service_role', f.sig); exception when others then null; end;
  end loop;
end $$;

-- 3. fixed search_path on helpers that had none ---------------------------------------------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f' and p.proconfig is null
              and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s set search_path = public', f.sig);
  end loop;
end $$;

-- 4. storage ---------------------------------------------------------------------------------
drop policy if exists documents_tenant_access on storage.objects;
drop policy if exists invoices_manager_access on storage.objects;
drop policy if exists property_images_upload on storage.objects;
drop policy if exists property_images_manage on storage.objects;
drop policy if exists property_images_delete on storage.objects;
drop policy if exists avatars_delete on storage.objects;     -- same rule as avatars_delete_own
drop policy if exists avatars_update on storage.objects;     -- same rule as avatars_update_own
update storage.buckets set file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'business-media';

-- 5. leftover legacy rule --------------------------------------------------------------------
drop policy if exists "Enable read access for all users" on public.tenant_branding;
drop policy if exists tenant_branding_read on public.tenant_branding;
create policy tenant_branding_read on public.tenant_branding for select using (is_business_active(tenant_id) or is_staff(tenant_id) or coalesce(is_super_admin(), false));

-- 6. browser error log ------------------------------------------------------------------------
create table if not exists client_errors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid,
  message text not null,
  stack text,
  url text,
  user_agent text,
  release text
);
create index if not exists idx_client_errors_created on client_errors (created_at desc);
alter table client_errors enable row level security;
drop policy if exists client_errors_admin_read on client_errors;
create policy client_errors_admin_read on client_errors for select to authenticated using (coalesce(is_super_admin(), false));
revoke all on client_errors from anon, authenticated;
grant select on client_errors to authenticated;

-- Anyone's browser may report a crash. Sizes are capped and volume is limited, so it cannot be used to fill the database.
create or replace function log_client_error(p_message text, p_stack text default null, p_url text default null, p_agent text default null, p_release text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_recent int;
begin
  if coalesce(trim(p_message), '') = '' then return; end if;
  select count(*) into v_recent from client_errors where created_at > now() - interval '1 minute';
  if v_recent >= 100 then return; end if;
  if auth.uid() is not null and (select count(*) from client_errors where user_id = auth.uid() and created_at > now() - interval '1 minute') >= 10 then return; end if;
  insert into client_errors (user_id, message, stack, url, user_agent, release)
  values (auth.uid(), left(p_message, 500), left(p_stack, 4000), left(p_url, 300), left(p_agent, 300), left(p_release, 40));
end $$;
revoke all on function log_client_error(text,text,text,text,text) from public;
grant execute on function log_client_error(text,text,text,text,text) to anon, authenticated;

-- Super admin: the latest crashes, grouped by message, and removal of old rows (older than 30 days).
create or replace function admin_client_errors(p_days int default 7)
returns table (message text, times bigint, users bigint, last_seen timestamptz, sample_url text, sample_stack text)
language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(is_super_admin(), false) then raise exception 'Only a super admin can do this' using errcode = '42501'; end if;
  delete from client_errors where created_at < now() - interval '30 days';
  return query
    select e.message, count(*), count(distinct e.user_id), max(e.created_at),
           (array_agg(e.url order by e.created_at desc))[1], (array_agg(e.stack order by e.created_at desc))[1]
      from client_errors e where e.created_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 30)))
     group by e.message order by max(e.created_at) desc limit 100;
end $$;
revoke all on function admin_client_errors(int) from public, anon;
grant execute on function admin_client_errors(int) to authenticated;
