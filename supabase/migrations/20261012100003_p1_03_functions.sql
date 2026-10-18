-- Phase 1 / 03 — onboarding, payment and approval functions.

create or replace function public._notify(p_user uuid, p_type text, p_title text, p_body text, p_business uuid, p_data jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, tenant_id, type, title, body, data)
  values (p_user, p_business, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb));
$$;
revoke all on function public._notify(uuid,text,text,text,uuid,jsonb) from public, anon, authenticated;

create or replace function public._grant_owner_role(p_business uuid) returns void
language sql security definer set search_path = public as $$
  update profiles p set role = 'owner', tenant_id = coalesce(p.tenant_id, b.id)
  from businesses b
  where b.id = p_business and p.id = b.owner_user_id and p.role = 'visitor';
$$;
revoke all on function public._grant_owner_role(uuid) from public, anon, authenticated;

-- A business owner starts a business: creates the business and becomes its owner.
create or replace function public.create_business(
  p_name text, p_type text, p_description text default null, p_county text default null,
  p_phone text default null, p_email text default null, p_address text default null)
returns public.businesses language plpgsql security definer set search_path = public as $$
declare
  v_slug text; v_base text; v_row businesses;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if length(trim(coalesce(p_name,''))) < 2 then raise exception 'Enter the business name'; end if;
  if coalesce((select value ->> p_type from platform_settings where key = 'modules'), 'false') <> 'true' then
    raise exception 'This type of business is not open yet';
  end if;
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
end;
$$;
grant execute on function public.create_business(text,text,text,text,text,text,text) to authenticated;

-- Shared by the M-Pesa callback, the manual recording and the tests.
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
  return v_status;
end;
$$;
revoke all on function public._subscription_paid(uuid,uuid,uuid) from public, anon, authenticated;

-- Called by the M-Pesa callback function (service role) when the STK push succeeded.
create or replace function public.mark_intent_paid(p_intent uuid, p_receipt text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_i payment_intents;
begin
  select * into v_i from payment_intents where id = p_intent for update;
  if v_i.id is null then raise exception 'Payment not found'; end if;
  if v_i.status = 'success' then return 'already_paid'; end if;
  update payment_intents set status = 'success', mpesa_receipt = coalesce(p_receipt, mpesa_receipt) where id = p_intent;
  return _subscription_paid(v_i.business_id, v_i.plan_id, p_intent);
end;
$$;
revoke all on function public.mark_intent_paid(uuid,text) from public, anon, authenticated;
grant execute on function public.mark_intent_paid(uuid,text) to service_role;

-- Super admin records a subscription payment that was made outside the STK flow.
create or replace function public.admin_record_payment(p_business uuid, p_plan uuid, p_receipt text default null, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_biz businesses; v_plan subscription_plans; v_intent uuid;
begin
  if not coalesce(is_super_admin(), false) then raise exception 'Only a super admin can do this' using errcode = '42501'; end if;
  select * into v_biz from businesses where id = p_business;
  select * into v_plan from subscription_plans where id = p_plan;
  if v_biz.id is null or v_plan.id is null then raise exception 'Business or plan not found'; end if;
  insert into payment_intents (user_id, business_id, plan_id, method, amount_kes, status, mpesa_receipt, note)
  values (v_biz.owner_user_id, p_business, p_plan, 'manual', v_plan.price_kes, 'success', p_receipt, p_note)
  returning id into v_intent;
  return _subscription_paid(p_business, p_plan, v_intent);
end;
$$;
grant execute on function public.admin_record_payment(uuid,uuid,text,text) to authenticated;

-- Super admin decision on a business.
create or replace function public.admin_review_business(p_business uuid, p_decision text, p_reason text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_biz businesses; v_new text;
begin
  if not coalesce(is_super_admin(), false) then raise exception 'Only a super admin can do this' using errcode = '42501'; end if;
  select * into v_biz from businesses where id = p_business;
  if v_biz.id is null then raise exception 'Business not found'; end if;

  if p_decision = 'approve' then
    if v_biz.status not in ('pending','rejected') then raise exception 'Only a pending or rejected business can be approved'; end if;
    update businesses set status = 'active', rejection_reason = null, approved_at = now(), approved_by = auth.uid() where id = p_business;
    perform _grant_owner_role(p_business);
    perform _notify(v_biz.owner_user_id, 'business_approved', 'Your business is live',
      v_biz.name || ' is approved and open on the platform.', p_business, jsonb_build_object('business_id', p_business, 'slug', v_biz.slug));
    v_new := 'active';
  elsif p_decision = 'reject' then
    if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'Give a reason for the owner'; end if;
    if v_biz.status <> 'pending' then raise exception 'Only a pending business can be rejected'; end if;
    update businesses set status = 'rejected', rejection_reason = trim(p_reason) where id = p_business;
    perform _notify(v_biz.owner_user_id, 'business_rejected', 'Your business needs changes', trim(p_reason), p_business,
      jsonb_build_object('business_id', p_business));
    v_new := 'rejected';
  elsif p_decision = 'suspend' then
    if v_biz.status <> 'active' then raise exception 'Only an active business can be suspended'; end if;
    update businesses set status = 'suspended', rejection_reason = nullif(trim(coalesce(p_reason,'')), '') where id = p_business;
    perform _notify(v_biz.owner_user_id, 'business_suspended', 'Your business was suspended',
      coalesce(nullif(trim(p_reason),''), 'Contact support for details.'), p_business, jsonb_build_object('business_id', p_business));
    v_new := 'suspended';
  elsif p_decision = 'reinstate' then
    if v_biz.status <> 'suspended' then raise exception 'Only a suspended business can be reinstated'; end if;
    update businesses set status = 'active', rejection_reason = null where id = p_business;
    perform _notify(v_biz.owner_user_id, 'business_approved', 'Your business is active again', v_biz.name || ' is open again.', p_business, '{}');
    v_new := 'active';
  else
    raise exception 'Unknown decision';
  end if;
  return v_new;
end;
$$;
grant execute on function public.admin_review_business(uuid,text,text) to authenticated;

-- Owner fixed what was rejected and sends the business back for review.
create or replace function public.resubmit_business(p_business uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_biz businesses; v_mode text; v_admin record;
begin
  select * into v_biz from businesses where id = p_business;
  if v_biz.id is null or not is_business_owner(p_business) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if v_biz.status <> 'rejected' then raise exception 'Only a rejected business can be resubmitted'; end if;
  v_mode := coalesce((select value ->> 'mode' from platform_settings where key = 'approval'), 'manual');
  if v_mode = 'auto' then
    update businesses set status = 'active', rejection_reason = null, approved_at = now(), submitted_at = now() where id = p_business;
    perform _grant_owner_role(p_business);
    return 'active';
  end if;
  update businesses set status = 'pending', rejection_reason = null, submitted_at = now() where id = p_business;
  for v_admin in select id from profiles where role = 'super_admin' loop
    perform _notify(v_admin.id, 'business_to_review', 'Business resubmitted', v_biz.name || ' was updated and resubmitted.', p_business,
      jsonb_build_object('business_id', p_business));
  end loop;
  return 'pending';
end;
$$;
grant execute on function public.resubmit_business(uuid) to authenticated;

-- Public numbers for the home page.
create or replace function public.public_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('businesses', (select count(*) from businesses where status = 'active'));
$$;
grant execute on function public.public_stats() to anon, authenticated;
