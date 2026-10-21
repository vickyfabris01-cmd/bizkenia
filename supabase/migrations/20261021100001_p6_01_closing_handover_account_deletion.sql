-- Phase 6 / 01 — delete business (60-day freeze), ownership hand-over, delete account, billing history kept.
--
-- WHAT THIS DOES
--  1. A business can be "closed" (the owner's Delete business). It is hidden from everyone, nothing is
--     removed for 60 days, and the owner can restore it. After 60 days a scheduled job purges it
--     (every row of the business goes with it). A business that was never submitted (draft or
--     waiting for its first payment) is removed straight away.
--  2. A business with an unfinished order or an active tenancy can never be closed or purged.
--  3. Ownership hand-over: the owner offers the business to one of his managers, the manager accepts,
--     and the two swap roles in one step (there is always exactly one owner).
--  4. Delete account support: checks before the account goes, and the clean-up after it.
--  5. The platform's billing history is never deleted: subscriptions and payment records stay,
--     without the person and without the business link (a snapshot of the business name is kept).
--  6. A restored business whose paid period has run out must subscribe again, and after paying it
--     opens straight away (no second approval).
--
-- Functions that delete things for a signed-in user are only callable by the server (service role),
-- which checks the password first. Run this whole file once in the SQL editor.

-- ---------------------------------------------------------------------------------------------
-- 1. Closing: columns, status, guard
-- ---------------------------------------------------------------------------------------------
alter table public.businesses
  add column if not exists closed_at       timestamptz,
  add column if not exists closed_from     text,
  add column if not exists closed_by       uuid references auth.users(id) on delete set null,
  add column if not exists closed_by_admin boolean not null default false;

alter table public.businesses drop constraint if exists businesses_status_chk;
alter table public.businesses add constraint businesses_status_chk
  check (status in ('draft','pending_payment','pending','active','rejected','suspended','closed'));

create index if not exists businesses_closed_idx on public.businesses (closed_at) where status = 'closed';

-- Owners can update their own business row, so the closing fields need their own guard.
create or replace function public.guard_business_closure_columns() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated','anon')
     and not coalesce(public.is_super_admin(), false)
     and (   new.closed_at       is distinct from old.closed_at
          or new.closed_from     is distinct from old.closed_from
          or new.closed_by       is distinct from old.closed_by
          or new.closed_by_admin is distinct from old.closed_by_admin)
  then
    raise exception 'Deleting and restoring a business is done from its Settings screen'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_business_closure on public.businesses;
create trigger trg_guard_business_closure before update on public.businesses
  for each row execute function public.guard_business_closure_columns();

-- ---------------------------------------------------------------------------------------------
-- 2. Billing history is kept for ever
-- ---------------------------------------------------------------------------------------------
-- Payments: who paid is blanked when an account is deleted, the money record stays.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.payment_intents'::regclass and contype = 'f'
              and confrelid = 'auth.users'::regclass loop
    execute format('alter table public.payment_intents drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.payment_intents alter column user_id drop not null;
alter table public.payment_intents
  add constraint payment_intents_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;
alter table public.payment_intents add column if not exists business_name text;

-- Subscriptions belong to the business, but stay when the business is purged.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.business_subscriptions'::regclass and contype = 'f'
              and confrelid = 'public.businesses'::regclass loop
    execute format('alter table public.business_subscriptions drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.business_subscriptions alter column business_id drop not null;
alter table public.business_subscriptions
  add constraint business_subscriptions_business_id_fkey foreign key (business_id) references public.businesses(id) on delete set null;
alter table public.business_subscriptions
  add column if not exists business_name text,
  add column if not exists business_type text,
  add column if not exists business_slug text;

-- ---------------------------------------------------------------------------------------------
-- 3. Helpers (not callable from the browser)
-- ---------------------------------------------------------------------------------------------
-- Things that must be finished before a business can go.
create or replace function public._business_open_items(p_business uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'open_orders',      (select count(*) from orders
                          where business_id = p_business
                            and status in ('pending_payment','paid','processing','shipped','ready_for_pickup')),
    'active_tenancies', (select count(*) from tenancies where tenant_id = p_business and status = 'active'));
$$;
revoke all on function public._business_open_items(uuid) from public, anon, authenticated;

-- Removes the business and everything under it. Billing records stay, with a snapshot of the name.
create or replace function public._purge_business_rows(p_business uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b businesses;
begin
  select * into b from businesses where id = p_business;
  if b.id is null then return; end if;
  update business_subscriptions
     set business_name = b.name, business_type = b.business_type, business_slug = b.slug, status = 'expired'
   where business_id = p_business;
  update payment_intents set business_name = b.name where business_id = p_business;
  update profiles set tenant_id = null where tenant_id = p_business;
  insert into audit_log (actor_id, action, entity, entity_id, before)
  values (auth.uid(), 'business.purge', 'business', p_business::text,
          jsonb_build_object('name', b.name, 'slug', b.slug, 'type', b.business_type, 'status', b.status));
  delete from businesses where id = p_business;
end;
$$;
revoke all on function public._purge_business_rows(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. Delete business
-- ---------------------------------------------------------------------------------------------
-- What the Settings screen shows before the owner confirms.
create or replace function public.business_delete_check(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b businesses; v jsonb; v_mode text; v_orders int; v_ten int;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into b from businesses where id = p_business;
  if b.id is null or not (public.is_business_owner(p_business) or coalesce(public.is_super_admin(), false)) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  v := public._business_open_items(p_business);
  v_orders := (v ->> 'open_orders')::int;
  v_ten    := (v ->> 'active_tenancies')::int;
  v_mode := case
    when b.status = 'closed'                        then 'closed'
    when b.status = 'suspended'                     then 'suspended'
    when b.status in ('draft','pending_payment')    then 'delete_now'
    else 'freeze' end;
  return jsonb_build_object(
    'status', b.status, 'mode', v_mode,
    'open_orders', v_orders, 'active_tenancies', v_ten,
    'can_delete', v_mode in ('delete_now','freeze') and v_orders = 0 and v_ten = 0,
    'closed_at', b.closed_at,
    'restore_until', case when b.closed_at is null then null else b.closed_at + interval '60 days' end,
    'closed_by_admin', b.closed_by_admin,
    'pending_offer', exists (select 1 from ownership_transfers where business_id = p_business and status = 'pending'));
end;
$$;
grant execute on function public.business_delete_check(uuid) to authenticated;

-- Server only (after the password check). Returns 'closed' or 'deleted'.
create or replace function public.owner_close_business(p_user uuid, p_business uuid) returns text
language plpgsql security definer set search_path = public as $$
declare b businesses; v jsonb; m record;
begin
  select * into b from businesses where id = p_business for update;
  if b.id is null then raise exception 'Business not found'; end if;
  if not exists (select 1 from business_members
                  where business_id = p_business and user_id = p_user and role = 'owner' and status = 'active') then
    raise exception 'Only the owner can delete this business';
  end if;
  if not coalesce((select is_active from profiles where id = p_user), true) then
    raise exception 'This account is switched off';
  end if;
  if b.status = 'closed' then raise exception 'This business is already deleted'; end if;
  if b.status = 'suspended' then
    raise exception 'This business is suspended. Contact support to close it.';
  end if;
  v := public._business_open_items(p_business);
  if (v ->> 'open_orders')::int > 0 then
    raise exception 'This business still has orders that are not finished. Finish or cancel them first.';
  end if;
  if (v ->> 'active_tenancies')::int > 0 then
    raise exception 'This business still has tenants with active tenancies. End the tenancies first.';
  end if;

  -- Never submitted, nothing worth keeping: remove straight away.
  if b.status in ('draft','pending_payment') then
    perform public._purge_business_rows(p_business);
    return 'deleted';
  end if;

  update ownership_transfers set status = 'cancelled', decided_at = now()
   where business_id = p_business and status = 'pending';
  update businesses
     set status = 'closed', closed_at = now(), closed_from = b.status, closed_by = p_user, closed_by_admin = false
   where id = p_business;
  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (p_user, 'business.close', 'business', p_business::text,
          jsonb_build_object('status', b.status), jsonb_build_object('status', 'closed'));

  for m in select user_id from business_members where business_id = p_business and status = 'active' loop
    perform public._notify(m.user_id, 'system',
      case when m.user_id = p_user then 'Business deleted' else 'Business closed by the owner' end,
      case when m.user_id = p_user
           then b.name || ' is hidden. You can restore it within 60 days, then it is deleted for good.'
           else b.name || ' was closed by its owner and is no longer available.' end,
      p_business, jsonb_build_object('business_id', p_business));
  end loop;
  return 'closed';
end;
$$;
revoke all on function public.owner_close_business(uuid, uuid) from public, anon, authenticated;
grant execute on function public.owner_close_business(uuid, uuid) to service_role;

-- Owner brings the business back within the 60 days. No password needed.
create or replace function public.restore_business(p_business uuid) returns text
language plpgsql security definer set search_path = public as $$
declare b businesses; v_to text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not public.account_active() then raise exception 'This account is switched off' using errcode = '42501'; end if;
  select * into b from businesses where id = p_business for update;
  if b.id is null or b.status <> 'closed' then raise exception 'This business is not deleted'; end if;
  if not exists (select 1 from business_members
                  where business_id = p_business and user_id = auth.uid() and role = 'owner' and status = 'active') then
    raise exception 'Only the owner can restore this business' using errcode = '42501';
  end if;
  if b.closed_by_admin then
    raise exception 'Support closed this business. Contact support to open it again.';
  end if;
  if b.closed_at <= now() - interval '60 days' then
    raise exception 'The 60 days are over, this business is being deleted for good.';
  end if;

  v_to := coalesce(b.closed_from, 'active');
  -- Paid period ran out while it was closed: the owner subscribes again to continue.
  if v_to = 'active' and not exists (
       select 1 from business_subscriptions
        where business_id = p_business and status = 'active' and period_end > now()) then
    v_to := 'pending_payment';
  end if;

  update businesses set status = v_to, closed_at = null, closed_from = null, closed_by = null where id = p_business;
  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(), 'business.restore', 'business', p_business::text,
          jsonb_build_object('status', 'closed'), jsonb_build_object('status', v_to));
  perform public._notify(auth.uid(), 'system', 'Business restored',
    case when v_to = 'pending_payment' then b.name || ' is back. Subscribe again to open it.'
         else b.name || ' is back.' end,
    p_business, jsonb_build_object('business_id', p_business));
  return v_to;
end;
$$;
grant execute on function public.restore_business(uuid) to authenticated;

-- Business ids whose 60 days are over (used by the daily purge job).
create or replace function public.businesses_due_for_purge() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from businesses where status = 'closed' and closed_at <= now() - interval '60 days';
$$;
revoke all on function public.businesses_due_for_purge() from public, anon, authenticated;
grant execute on function public.businesses_due_for_purge() to service_role;

-- Names of the files a business or a user keeps in storage (folder = the first part of the path).
create or replace function public.storage_paths_for(p_bucket text, p_folder text) returns setof text
language sql stable security definer set search_path = public as $$
  select name from storage.objects where bucket_id = p_bucket and (storage.foldername(name))[1] = p_folder;
$$;
revoke all on function public.storage_paths_for(text, text) from public, anon, authenticated;
grant execute on function public.storage_paths_for(text, text) to service_role;

-- Permanent deletion. p_force skips the 60 days (used only when the owner's account is deleted).
create or replace function public.purge_business(p_business uuid, p_force boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare b businesses; v jsonb;
begin
  select * into b from businesses where id = p_business for update;
  if b.id is null then return 'missing'; end if;
  if b.status <> 'closed' then raise exception 'Only a deleted business can be purged'; end if;
  if not p_force and b.closed_at > now() - interval '60 days' then
    raise exception 'The 60 days are not over yet';
  end if;
  v := public._business_open_items(p_business);
  if (v ->> 'open_orders')::int > 0 or (v ->> 'active_tenancies')::int > 0 then
    raise exception 'This business still has unfinished orders or active tenancies';
  end if;
  perform public._purge_business_rows(p_business);
  return 'purged';
end;
$$;
revoke all on function public.purge_business(uuid, boolean) from public, anon, authenticated;
grant execute on function public.purge_business(uuid, boolean) to service_role;

-- Support: close or reopen any business, for example a suspended one at the owner's request.
create or replace function public.admin_close_business(p_business uuid) returns text
language plpgsql security definer set search_path = public as $$
declare b businesses; v jsonb;
begin
  if not coalesce(public.is_super_admin(), false) then raise exception 'Only a super admin can do this' using errcode = '42501'; end if;
  select * into b from businesses where id = p_business for update;
  if b.id is null then raise exception 'Business not found'; end if;
  if b.status = 'closed' then raise exception 'Already closed'; end if;
  v := public._business_open_items(p_business);
  if (v ->> 'open_orders')::int > 0 or (v ->> 'active_tenancies')::int > 0 then
    raise exception 'This business still has unfinished orders or active tenancies';
  end if;
  update ownership_transfers set status = 'cancelled', decided_at = now() where business_id = p_business and status = 'pending';
  update businesses set status = 'closed', closed_at = now(), closed_from = b.status, closed_by = auth.uid(), closed_by_admin = true
   where id = p_business;
  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(), 'business.close', 'business', p_business::text,
          jsonb_build_object('status', b.status), jsonb_build_object('status', 'closed', 'by_admin', true));
  return 'closed';
end;
$$;
grant execute on function public.admin_close_business(uuid) to authenticated;

create or replace function public.admin_restore_business(p_business uuid) returns text
language plpgsql security definer set search_path = public as $$
declare b businesses; v_to text;
begin
  if not coalesce(public.is_super_admin(), false) then raise exception 'Only a super admin can do this' using errcode = '42501'; end if;
  select * into b from businesses where id = p_business for update;
  if b.id is null or b.status <> 'closed' then raise exception 'This business is not closed'; end if;
  v_to := coalesce(b.closed_from, 'active');
  if v_to = 'active' and not exists (
       select 1 from business_subscriptions where business_id = p_business and status = 'active' and period_end > now()) then
    v_to := 'pending_payment';
  end if;
  update businesses set status = v_to, closed_at = null, closed_from = null, closed_by = null, closed_by_admin = false where id = p_business;
  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(), 'business.restore', 'business', p_business::text,
          jsonb_build_object('status', 'closed'), jsonb_build_object('status', v_to, 'by_admin', true));
  return v_to;
end;
$$;
grant execute on function public.admin_restore_business(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. A restored business that subscribes again opens straight away (it was approved before)
-- ---------------------------------------------------------------------------------------------
-- Same as the original, plus one branch: a business that already has an approval date does not
-- go back through review.
create or replace function public._subscription_paid(p_business uuid, p_plan uuid, p_intent uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_plan subscription_plans; v_biz businesses; v_mode text; v_status text; v_admin record;
begin
  select * into v_biz from businesses where id = p_business;
  if v_biz.id is null then raise exception 'Business not found'; end if;
  select * into v_plan from subscription_plans where id = p_plan;
  insert into business_subscriptions (business_id, plan_id, payment_intent_id, amount_kes, period_end)
  values (p_business, p_plan, p_intent, coalesce(v_plan.price_kes, 0),
          now() + make_interval(days => coalesce(v_plan.period_days, 30)));

  v_status := v_biz.status;
  if v_biz.status in ('draft','pending_payment') then
    if v_biz.approved_at is not null then
      -- Came back from a deleted state and was approved before: open again.
      v_status := 'active';
      update businesses set status = 'active' where id = p_business;
      perform _notify(v_biz.owner_user_id, 'business_approved', 'Your business is live again',
        v_biz.name || ' is open again.', p_business, jsonb_build_object('business_id', p_business, 'slug', v_biz.slug));
    else
      v_mode := coalesce((select value ->> 'mode' from platform_settings where key = 'approval'), 'manual');
      if v_mode = 'auto' then
        v_status := 'active';
        update businesses set status = 'active', submitted_at = now(), approved_at = now() where id = p_business;
        perform _grant_owner_role(p_business);
        perform _notify(v_biz.owner_user_id, 'business_approved', 'Your business is live',
          v_biz.name || ' is approved and open on the platform.', p_business, jsonb_build_object('business_id', p_business, 'slug', v_biz.slug));
      else
        v_status := 'pending';
        update businesses set status = 'pending', submitted_at = now() where id = p_business;
        perform _notify(v_biz.owner_user_id, 'business_submitted', 'Payment received',
          v_biz.name || ' is waiting for approval.', p_business, jsonb_build_object('business_id', p_business));
        for v_admin in select id from profiles where role = 'super_admin' loop
          perform _notify(v_admin.id, 'business_to_review', 'New business to review',
            v_biz.name || ' is waiting for approval.', p_business, jsonb_build_object('business_id', p_business));
        end loop;
      end if;
    end if;
  end if;
  return v_status;
end;
$$;
revoke all on function public._subscription_paid(uuid,uuid,uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 6. Ownership hand-over
-- ---------------------------------------------------------------------------------------------
create table if not exists public.ownership_transfers (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  from_user   uuid not null references auth.users(id) on delete cascade,
  to_user     uuid not null references auth.users(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
create unique index if not exists one_pending_transfer_per_business
  on public.ownership_transfers (business_id) where status = 'pending';
create index if not exists ownership_transfers_to_idx on public.ownership_transfers (to_user) where status = 'pending';
alter table public.ownership_transfers enable row level security;
revoke all on public.ownership_transfers from anon, authenticated;
grant select on public.ownership_transfers to authenticated;
drop policy if exists ownership_transfers_read on public.ownership_transfers;
create policy ownership_transfers_read on public.ownership_transfers for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid() or public.is_super_admin());
-- no write policies: everything goes through the functions below.

create or replace function public.offer_ownership(p_business uuid, p_to_user uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare b businesses; v_id uuid; v_from text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not public.account_active() then raise exception 'This account is switched off' using errcode = '42501'; end if;
  select * into b from businesses where id = p_business for update;
  if b.id is null or not public.is_business_owner(p_business) then
    raise exception 'Only the owner can hand over this business' using errcode = '42501';
  end if;
  if b.status not in ('active','pending','rejected') then
    raise exception 'Ownership can only be handed over while the business is active, pending or rejected';
  end if;
  if p_to_user = auth.uid() then raise exception 'Choose one of your managers'; end if;
  if not exists (select 1 from business_members
                  where business_id = p_business and user_id = p_to_user and role = 'manager' and status = 'active') then
    raise exception 'Choose one of your managers. Invite a manager first if you have none.';
  end if;
  if not coalesce((select is_active from profiles where id = p_to_user), false) then
    raise exception 'That account is switched off';
  end if;

  update ownership_transfers set status = 'cancelled', decided_at = now()
   where business_id = p_business and status = 'pending';
  insert into ownership_transfers (business_id, from_user, to_user) values (p_business, auth.uid(), p_to_user)
  returning id into v_id;

  select coalesce(nullif(full_name, ''), 'The owner') into v_from from profiles where id = auth.uid();
  perform public._notify(p_to_user, 'invite', 'Ownership offer',
    v_from || ' wants to hand ' || b.name || ' over to you. Open your requests to accept or decline.',
    p_business, jsonb_build_object('business_id', p_business, 'transfer_id', v_id));
  return v_id;
end;
$$;
grant execute on function public.offer_ownership(uuid, uuid) to authenticated;

create or replace function public.cancel_ownership_offer(p_business uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not public.is_business_owner(p_business) then raise exception 'Not allowed' using errcode = '42501'; end if;
  update ownership_transfers set status = 'cancelled', decided_at = now()
   where business_id = p_business and status = 'pending';
end;
$$;
grant execute on function public.cancel_ownership_offer(uuid) to authenticated;

create or replace function public.respond_ownership(p_transfer uuid, p_accept boolean) returns text
language plpgsql security definer set search_path = public as $$
declare t ownership_transfers; b businesses; v_to_name text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into t from ownership_transfers where id = p_transfer for update;
  if t.id is null or t.to_user <> auth.uid() then raise exception 'Offer not found' using errcode = '42501'; end if;
  if t.status <> 'pending' then raise exception 'This offer is no longer open'; end if;
  select * into b from businesses where id = t.business_id for update;

  if not p_accept then
    update ownership_transfers set status = 'declined', decided_at = now() where id = t.id;
    perform public._notify(t.from_user, 'invite', 'Ownership offer declined',
      'Your offer to hand over ' || b.name || ' was declined.', t.business_id, jsonb_build_object('business_id', t.business_id));
    return 'declined';
  end if;

  if not public.account_active() then raise exception 'This account is switched off' using errcode = '42501'; end if;
  if b.status not in ('active','pending','rejected') then
    raise exception 'This business cannot be handed over right now';
  end if;
  if not exists (select 1 from business_members
                  where business_id = t.business_id and user_id = t.from_user and role = 'owner' and status = 'active') then
    update ownership_transfers set status = 'cancelled', decided_at = now() where id = t.id;
    raise exception 'The owner has changed. Ask for a new offer.';
  end if;
  if not exists (select 1 from business_members
                  where business_id = t.business_id and user_id = t.to_user and role = 'manager' and status = 'active') then
    update ownership_transfers set status = 'cancelled', decided_at = now() where id = t.id;
    raise exception 'You are no longer a manager of this business';
  end if;

  -- Swap in one step: the old owner becomes a manager first, then the manager becomes the owner.
  update business_members set role = 'manager'
   where business_id = t.business_id and user_id = t.from_user and role = 'owner' and status = 'active';
  update business_members set role = 'owner'
   where business_id = t.business_id and user_id = t.to_user and role = 'manager' and status = 'active';
  update businesses set owner_user_id = t.to_user where id = t.business_id;
  perform public._grant_owner_role(t.business_id);
  update ownership_transfers set status = 'accepted', decided_at = now() where id = t.id;

  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(), 'business.owner_change', 'business', t.business_id::text,
          jsonb_build_object('owner', t.from_user), jsonb_build_object('owner', t.to_user));
  select coalesce(nullif(full_name, ''), 'The manager') into v_to_name from profiles where id = t.to_user;
  perform public._notify(t.from_user, 'invite', 'Ownership handed over',
    v_to_name || ' is now the owner of ' || b.name || '. You are a manager.', t.business_id,
    jsonb_build_object('business_id', t.business_id));
  return 'accepted';
end;
$$;
grant execute on function public.respond_ownership(uuid, boolean) to authenticated;

-- Offers waiting for me.
create or replace function public.my_ownership_offers()
returns table (id uuid, business_id uuid, business_name text, business_slug text, from_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select t.id, t.business_id, b.name, b.slug, coalesce(nullif(p.full_name, ''), 'The owner'), t.created_at
    from ownership_transfers t
    join businesses b on b.id = t.business_id
    left join profiles p on p.id = t.from_user
   where t.to_user = auth.uid() and t.status = 'pending'
   order by t.created_at desc;
$$;
grant execute on function public.my_ownership_offers() to authenticated;

-- The offer the owner has out for this business (if any).
create or replace function public.business_ownership_offer(p_business uuid)
returns table (id uuid, to_user uuid, to_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select t.id, t.to_user, coalesce(nullif(p.full_name, ''), p.email, 'Manager'), t.created_at
    from ownership_transfers t
    left join profiles p on p.id = t.to_user
   where t.business_id = p_business and t.status = 'pending'
     and (public.is_business_owner(p_business) or coalesce(public.is_super_admin(), false));
$$;
grant execute on function public.business_ownership_offer(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 7. Delete account support
-- ---------------------------------------------------------------------------------------------
-- What the Delete account dialog shows (about the signed-in user).
create or replace function public.account_delete_check() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_blocking jsonb; v_closed jsonb; v_ten int; v_orders int; v_admin boolean;
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  v_admin := coalesce((select role = 'super_admin' from profiles where id = v_uid), false);

  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'slug', b.slug, 'status', b.status)), '[]'::jsonb)
    into v_blocking
    from businesses b join business_members m on m.business_id = b.id
   where m.user_id = v_uid and m.role = 'owner' and m.status = 'active' and b.status <> 'closed';

  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'closed_at', b.closed_at)), '[]'::jsonb)
    into v_closed
    from businesses b join business_members m on m.business_id = b.id
   where m.user_id = v_uid and m.role = 'owner' and m.status = 'active' and b.status = 'closed';

  select count(*) into v_ten from tenancies where client_id = v_uid and status = 'active';
  select count(*) into v_orders from orders
   where customer_id = v_uid and status in ('pending_payment','paid','processing','shipped','ready_for_pickup');

  return jsonb_build_object(
    'is_super_admin', v_admin,
    'owned_blocking', v_blocking,
    'owned_closed', v_closed,
    'active_tenancies', v_ten,
    'open_orders', v_orders,
    'can_delete', not v_admin and jsonb_array_length(v_blocking) = 0 and v_ten = 0);
end;
$$;
grant execute on function public.account_delete_check() to authenticated;

-- Server only: refuses when the account cannot go; otherwise lists the closed businesses to purge first.
create or replace function public.account_delete_prepare(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_names text; v_purge jsonb; v_ten int;
begin
  if coalesce((select role = 'super_admin' from profiles where id = p_user), false) then
    raise exception 'A super admin account cannot be deleted here';
  end if;
  select string_agg(b.name, ', ') into v_names
    from businesses b join business_members m on m.business_id = b.id
   where m.user_id = p_user and m.role = 'owner' and m.status = 'active' and b.status <> 'closed';
  if v_names is not null then
    raise exception 'You still own: %. Hand it over to a manager or delete it first.', v_names;
  end if;
  select count(*) into v_ten from tenancies where client_id = p_user and status = 'active';
  if v_ten > 0 then
    raise exception 'You have an active tenancy. Ask the owner to end it before deleting your account.';
  end if;
  select coalesce(jsonb_agg(b.id), '[]'::jsonb) into v_purge
    from businesses b join business_members m on m.business_id = b.id
   where m.user_id = p_user and m.role = 'owner' and m.status = 'active' and b.status = 'closed';
  return jsonb_build_object('purge', v_purge);
end;
$$;
revoke all on function public.account_delete_prepare(uuid) from public, anon, authenticated;
grant execute on function public.account_delete_prepare(uuid) to service_role;

-- Server only, after the login has been removed: the person's profile and notifications go too.
create or replace function public.account_delete_cleanup(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from notifications where user_id = p_user;
  delete from profiles where id = p_user;
end;
$$;
revoke all on function public.account_delete_cleanup(uuid) from public, anon, authenticated;
grant execute on function public.account_delete_cleanup(uuid) to service_role;
