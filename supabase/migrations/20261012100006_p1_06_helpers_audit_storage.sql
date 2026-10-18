-- Phase 1 / 06 — helper functions used by every later policy, audit log, notify(), storage.

create or replace function public.is_member(bid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_business_member(bid);
$$;
create or replace function public.member_role(bid uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from business_members where business_id = bid and user_id = auth.uid() and status = 'active';
$$;
create or replace function public.is_business_active(bid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from businesses where id = bid and status = 'active');
$$;
grant execute on function public.is_member(uuid), public.member_role(uuid), public.is_business_active(uuid) to anon, authenticated;

-- Audit log: written by triggers, readable by super admins only.
create table public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid,
  action     text not null,
  entity     text not null,
  entity_id  text,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);
alter table public.audit_log enable row level security;
create policy audit_admin_read on public.audit_log for select using (public.is_super_admin());

create or replace function public.audit_business_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into audit_log (actor_id, action, entity, entity_id, before, after)
    values (auth.uid(), 'business.status', 'business', new.id::text,
            jsonb_build_object('status', old.status), jsonb_build_object('status', new.status, 'reason', new.rejection_reason));
  end if;
  return new;
end;
$$;
create trigger trg_audit_business after update on public.businesses
  for each row execute function public.audit_business_change();

create or replace function public.audit_setting_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(), 'setting.update', 'platform_settings', new.key, to_jsonb(old.value), to_jsonb(new.value));
  return new;
end;
$$;
create trigger trg_audit_settings after update on public.platform_settings
  for each row execute function public.audit_setting_change();

-- notify(): one way to create an in-app notification.
alter table public.notifications add column if not exists link text;
create or replace function public.notify(p_user uuid, p_business uuid, p_type text, p_title text, p_body text default null, p_link text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not (coalesce(is_super_admin(), false) or p_user = auth.uid()
          or (p_business is not null and is_business_member(p_business)
              and exists (select 1 from business_members where business_id = p_business and user_id = p_user and status = 'active'))) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  insert into notifications (user_id, tenant_id, type, title, body, link) values (p_user, p_business, p_type, p_title, p_body, p_link);
end;
$$;
grant execute on function public.notify(uuid,uuid,text,text,text,text) to authenticated;

-- Storage: business-media is public to read; members of a business write inside their business folder.
insert into storage.buckets (id, name, public) values ('business-media', 'business-media', true)
  on conflict (id) do nothing;
create policy business_media_read on storage.objects for select using (bucket_id = 'business-media');
create policy business_media_write on storage.objects for insert to authenticated
  with check (bucket_id = 'business-media' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
              and public.is_business_member(((storage.foldername(name))[1])::uuid));
create policy business_media_update on storage.objects for update to authenticated
  using (bucket_id = 'business-media' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         and public.is_business_member(((storage.foldername(name))[1])::uuid));
create policy business_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'business-media' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         and public.is_business_member(((storage.foldername(name))[1])::uuid));
