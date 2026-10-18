-- supabase/migrations/20261014100001_p2_01_rental_rls.sql — NEW FILE
--
-- AIM
-- Phase 2, step 1: move every rental table from the old profile-based access rules
-- (same_tenant()/my_role()) to business-membership rules, add the "resident" member role,
-- and fix the legacy triggers that still pointed at the removed "tenants" table.
-- Writes to tenancies, billing, payments and requests go only through the functions in step 3.

-- 1. Roles ---------------------------------------------------------------------------------
alter table business_members drop constraint if exists business_members_role_check;
alter table business_members add constraint business_members_role_check
  check (role in ('owner','manager','resident'));

create or replace function is_staff(bid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from business_members
                 where business_id = bid and user_id = auth.uid() and status = 'active'
                   and role in ('owner','manager'));
$$;

create or replace function is_resident_of(bid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from business_members
                 where business_id = bid and user_id = auth.uid() and status = 'active' and role = 'resident');
$$;
grant execute on function is_staff(uuid), is_resident_of(uuid) to authenticated, anon;

-- Residents see only their own membership row; staff see everyone in their business.
drop policy if exists members_select on business_members;
create policy members_select on business_members for select
  using (user_id = auth.uid() or is_staff(business_id) or is_super_admin());

-- 2. Retire the profile-role triggers (roles now live in business_members) -------------------
drop trigger if exists trg_elevate_to_client on tenancies;
drop trigger if exists trg_revert_to_visitor on tenancies;
drop trigger if exists trg_tenancy_role_change on tenancies;
drop trigger if exists trg_generate_first_billing_cycle on tenancies;   -- replaced by RPC in step 3

-- 3. Table adjustments ---------------------------------------------------------------------
alter table payments alter column client_id drop not null;               -- unmatched M-Pesa money has no resident yet
alter table payments add column if not exists payer_phone text;
alter table payments add column if not exists payer_name text;
alter table payments add column if not exists intent_id uuid;
alter table payments add column if not exists reversed_at timestamptz;

alter table payment_intents add column if not exists billing_cycle_id uuid references billing_cycles(id) on delete set null;
alter table payment_intents add column if not exists tenancy_id uuid references tenancies(id) on delete set null;

alter table billing_cycles add column if not exists share_token text unique default replace(gen_random_uuid()::text,'-','');
update billing_cycles set share_token = replace(gen_random_uuid()::text,'-','') where share_token is null;

alter table rental_requests add column if not exists response_note text;
alter table rental_requests add column if not exists offer_price numeric;
alter table rental_requests add column if not exists offer_billing_type text check (offer_billing_type in ('monthly','semester'));
alter table rental_requests add column if not exists offer_move_in date;

create index if not exists idx_payments_unmatched on payments (tenant_id) where billing_cycle_id is null;
create index if not exists idx_requests_status on rental_requests (tenant_id, status);
create index if not exists idx_cycles_due on billing_cycles (tenant_id, status, due_date);
create unique index if not exists uq_open_request on rental_requests (requester_id, room_id) where status in ('pending','offered');
create unique index if not exists uq_active_tenancy_room on tenancies (room_id) where status = 'active';

-- 4. Row level security --------------------------------------------------------------------
-- buildings / rooms / beds: public can read for live businesses; staff manage.
do $$
declare t text; p record;
begin
  foreach t in array array['buildings','rooms','beds','tenancies','billing_cycles','payments','rental_requests','manager_invites','invoices','tenant_settings','tenant_secrets']
  loop
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on %I', p.policyname, t);
    end loop;
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

create policy buildings_read on buildings for select
  using (is_business_active(tenant_id) or is_staff(tenant_id));
create policy buildings_write on buildings for all
  using (is_staff(tenant_id)) with check (is_staff(tenant_id));

create policy rooms_read on rooms for select
  using (is_business_active(tenant_id) or is_staff(tenant_id));
create policy rooms_write on rooms for all
  using (is_staff(tenant_id)) with check (is_staff(tenant_id));

create policy beds_read on beds for select using (is_staff(tenant_id));
create policy beds_write on beds for all
  using (is_staff(tenant_id)) with check (is_staff(tenant_id));

-- Read-only for the people involved; every write goes through a function.
create policy requests_read on rental_requests for select
  using (requester_id = auth.uid() or is_staff(tenant_id));
create policy tenancies_read on tenancies for select
  using (client_id = auth.uid() or is_staff(tenant_id));
create policy cycles_read on billing_cycles for select
  using (client_id = auth.uid() or is_staff(tenant_id));
create policy payments_read on payments for select
  using (client_id = auth.uid() or is_staff(tenant_id));
create policy invites_read on manager_invites for select using (is_business_owner(tenant_id));
create policy invoices_read on invoices for select using (client_id = auth.uid() or is_staff(tenant_id));

-- Settings: staff read, owner writes. Secrets are never readable from the browser.
create policy settings_read on tenant_settings for select using (is_staff(tenant_id));
create policy settings_write on tenant_settings for all
  using (is_business_owner(tenant_id)) with check (is_business_owner(tenant_id));
-- tenant_secrets: no policies at all = no direct access. Written by set_business_mpesa() only.

-- Residents can read the profile of staff of their business? No — they get names through functions.
