-- 20261018100001_p5_05_account_lock_and_types.sql — Phase 5 step 2
-- Two fixes asked for by the owner.
--
-- 1. A switched-off account really is locked. Before, "Switch off" only set profiles.is_active and
--    nothing looked at it. Now:
--      * admin_set_user_active() sets the flag, bans the login in Supabase Auth and ends open sessions;
--      * account_active() is used by every membership helper, so a locked person has no access to any
--        business (staff, resident or owner) and cannot start a business or place an order;
--      * the browser also signs a locked person out (sessionStore).
-- 2. Business TYPES are no longer switched on and off. Only a single business can be suspended (that
--    already exists: admin_review_business). create_business no longer reads the "modules" setting.

create or replace function public.account_active() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_active from profiles where id = auth.uid()), true);
$$;
grant execute on function public.account_active() to anon, authenticated;

create or replace function public.is_business_member(bid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.account_active() and exists (select 1 from business_members
         where business_id = bid and user_id = auth.uid() and status = 'active');
$$;
create or replace function public.is_business_owner(bid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.account_active() and exists (select 1 from business_members
         where business_id = bid and user_id = auth.uid() and status = 'active' and role = 'owner');
$$;
create or replace function public.is_staff(bid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.account_active() and exists (select 1 from business_members
         where business_id = bid and user_id = auth.uid() and status = 'active' and role in ('owner','manager'));
$$;
create or replace function public.is_resident_of(bid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.account_active() and exists (select 1 from business_members
         where business_id = bid and user_id = auth.uid() and status = 'active' and role = 'resident');
$$;
create or replace function public.member_role(bid uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from business_members where business_id = bid and user_id = auth.uid() and status = 'active' and public.account_active();
$$;

-- Super admin: switch an account off or on.
create or replace function public.admin_set_user_active(p_user uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  if not coalesce(is_super_admin(), false) then raise exception 'Only a super admin can do this' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'You cannot switch off your own account'; end if;
  select role into v_role from profiles where id = p_user;
  if v_role is null then raise exception 'Account not found'; end if;
  if v_role = 'super_admin' then raise exception 'A super admin account cannot be switched off'; end if;
  update profiles set is_active = p_active where id = p_user;
  begin
    update auth.users set banned_until = case when p_active then null else 'infinity'::timestamptz end where id = p_user;
    if not p_active then
      delete from auth.refresh_tokens where user_id = p_user::text;
      delete from auth.sessions where user_id = p_user;
    end if;
  exception when undefined_table or undefined_column or insufficient_privilege then
    null; -- the flag above still locks the account everywhere in the app
  end;
end $$;
revoke all on function public.admin_set_user_active(uuid, boolean) from public, anon;
grant execute on function public.admin_set_user_active(uuid, boolean) to authenticated;

-- A locked account's phone number stays taken (the account still exists).
-- create_business: no more type-level switch.
create or replace function public.create_business(
  p_name text, p_type text, p_description text default null, p_county text default null,
  p_phone text default null, p_email text default null, p_address text default null)
returns public.businesses language plpgsql security definer set search_path = public as $$
declare
  v_slug text; v_base text; v_row businesses;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not account_active() then raise exception 'This account is switched off. Contact support.'; end if;
  if length(trim(coalesce(p_name,''))) < 2 then raise exception 'Enter the business name'; end if;
  if p_type not in ('rental','agriculture','shop') then raise exception 'Choose a type of business'; end if;
  v_base := trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'));
  if v_base = '' then v_base := 'business'; end if;
  v_slug := v_base;
  while exists (select 1 from businesses where slug = v_slug) loop
    v_slug := v_base || '-' || substr(md5(random()::text), 1, 4);
  end loop;
  insert into businesses (name, slug, business_type, status, owner_user_id, description, county, phone, email, address)
  values (trim(p_name), v_slug, p_type, 'pending_payment', auth.uid(), p_description, p_county, p_phone, p_email, p_address)
  returning * into v_row;
  insert into business_members (business_id, user_id, role) values (v_row.id, auth.uid(), 'owner');
  return v_row;
end $$;
grant execute on function public.create_business(text,text,text,text,text,text,text) to authenticated;

-- All three types are open; the old setting is kept only so old screens do not break.
update platform_settings set value = '{"rental":true,"agriculture":true,"shop":true}'::jsonb where key = 'modules';
