-- Phase 1 / 01 — businesses (renamed from tenants), members, phone helper.
-- The old name `tenants` stays available as an updatable view so legacy code keeps working until Phase 3.

alter table public.tenants rename to businesses;

alter table public.businesses
  add column if not exists business_type text not null default 'rental',
  add column if not exists description text,
  add column if not exists cover_url text,
  add column if not exists whatsapp text,
  add column if not exists rejection_reason text,
  add column if not exists submitted_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id),
  add column if not exists commission_percent numeric(5,2) not null default 0;

alter table public.businesses
  add constraint businesses_type_chk check (business_type in ('rental','agriculture','shop')),
  add constraint businesses_status_chk check (status in ('draft','pending_payment','pending','active','rejected','suspended'));
alter table public.businesses alter column status set default 'pending_payment';

create view public.tenants with (security_invoker = true) as select * from public.businesses;
grant select on public.tenants to anon;
grant select, insert, update, delete on public.tenants to authenticated;

-- Members: exactly one active owner per business, plus invited managers.
create table public.business_members (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('owner','manager')),
  status      text not null default 'active' check (status in ('active','removed')),
  created_at  timestamptz not null default now(),
  unique (business_id, user_id)
);
create unique index one_active_owner_per_business on public.business_members (business_id)
  where role = 'owner' and status = 'active';
create index business_members_user_idx on public.business_members (user_id);
alter table public.business_members enable row level security;

create or replace function public.is_business_member(bid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from business_members
                 where business_id = bid and user_id = auth.uid() and status = 'active');
$$;
create or replace function public.is_business_owner(bid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from business_members
                 where business_id = bid and user_id = auth.uid() and status = 'active' and role = 'owner');
$$;

create policy members_select on public.business_members for select
  using (user_id = auth.uid() or public.is_business_member(business_id) or public.is_super_admin());
-- no insert/update/delete policies: changes go through the functions only.

create policy businesses_member_select on public.businesses for select
  using (public.is_business_member(id));
create policy businesses_owner_update on public.businesses for update
  using (public.is_business_owner(id)) with check (public.is_business_owner(id));

-- The guard now also protects the approval fields, type and commission.
create or replace function public.guard_tenant_protected_columns() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated','anon')
     and not coalesce(public.is_super_admin(), false)
     and (   new.id               is distinct from old.id
          or new.status           is distinct from old.status
          or new.plan             is distinct from old.plan
          or new.slug             is distinct from old.slug
          or new.owner_user_id    is distinct from old.owner_user_id
          or new.business_type    is distinct from old.business_type
          or new.rejection_reason is distinct from old.rejection_reason
          or new.submitted_at     is distinct from old.submitted_at
          or new.approved_at      is distinct from old.approved_at
          or new.approved_by      is distinct from old.approved_by
          or new.commission_percent is distinct from old.commission_percent)
  then
    raise exception 'Only a super admin can change status, plan, slug, type, owner or commission'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Phone numbers: one account per number, compared in the 2547XXXXXXXX form.
create or replace function public.normalize_phone(p text) returns text
language sql immutable as $$
  select case
    when p is null then null
    else (select case
            when d ~ '^0[17][0-9]{8}$'     then '254' || substr(d, 2)
            when d ~ '^[17][0-9]{8}$'      then '254' || d
            when d ~ '^254[17][0-9]{8}$'   then d
            else null end
          from (select regexp_replace(p, '[^0-9]', '', 'g') as d) s)
  end;
$$;
create unique index profiles_phone_norm_uq on public.profiles (public.normalize_phone(phone))
  where public.normalize_phone(phone) is not null;

create or replace function public.phone_available(p_phone text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from profiles where normalize_phone(phone) = normalize_phone(p_phone));
$$;
grant execute on function public.phone_available(text) to anon, authenticated;

-- New accounts keep the phone from sign-up (when it is free).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_phone text := nullif(new.raw_user_meta_data->>'phone', '');
begin
  if v_phone is not null and (normalize_phone(v_phone) is null
     or exists (select 1 from profiles where normalize_phone(phone) = normalize_phone(v_phone))) then
    v_phone := null;
  end if;
  insert into profiles (id, role, full_name, email, phone)
  values (new.id, 'visitor',
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
          new.email, v_phone)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Used only by the resolve-login edge function (service role).
create or replace function public.login_email_for_phone(p_phone text) returns text
language sql stable security definer set search_path = public as $$
  select email from profiles where normalize_phone(phone) = normalize_phone(p_phone) and is_active limit 1;
$$;
revoke all on function public.login_email_for_phone(text) from public, anon, authenticated;
grant execute on function public.login_email_for_phone(text) to service_role;
