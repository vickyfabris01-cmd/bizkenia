-- 20261020100005_p5_14_record_payment_checks.sql — Phase 5 step 5
-- Recording a payment by hand (Admin > Businesses > "Record payment") now follows the same rules as the
-- M-Pesa prompt: the plan must belong to the business's type and must be on sale (switched on, priced and,
-- for an offer, inside its dates). Before, a super admin could record a payment against any plan row.
-- Only the two new checks are added; the rest of the function is unchanged from p1_03.
create or replace function public.admin_record_payment(p_business uuid, p_plan uuid, p_receipt text default null, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_biz businesses; v_plan subscription_plans; v_intent uuid;
begin
  if not coalesce(is_super_admin(), false) then raise exception 'Only a super admin can do this' using errcode = '42501'; end if;
  select * into v_biz from businesses where id = p_business;
  select * into v_plan from subscription_plans where id = p_plan;
  if v_biz.id is null or v_plan.id is null then raise exception 'Business or plan not found'; end if;
  if v_plan.business_type <> v_biz.business_type then
    raise exception 'This plan is for a different type of business';
  end if;
  if not plan_is_available(p_plan) then
    raise exception 'This plan is not on sale. Switch it on and set its price first.';
  end if;
  insert into payment_intents (user_id, business_id, plan_id, method, amount_kes, status, mpesa_receipt, note)
  values (v_biz.owner_user_id, p_business, p_plan, 'manual', v_plan.price_kes, 'success', p_receipt, p_note)
  returning id into v_intent;
  return _subscription_paid(p_business, p_plan, v_intent);
end;
$$;
grant execute on function public.admin_record_payment(uuid,uuid,text,text) to authenticated;
