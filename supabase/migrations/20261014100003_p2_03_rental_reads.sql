-- supabase/migrations/20261014100003_p2_03_rental_reads.sql — NEW FILE
--
-- AIM
-- Phase 2, step 3: the two read functions that join several tables.
--  * rental_dashboard(business): figures for the owner/manager dashboard (also settles overdue invoices first).
--  * get_public_invoice(token): one invoice for anyone holding its share link (no sign-in), with how to pay.
--  * my_requests(): the signed-in person's own room requests with business and room names.

create or replace function rental_dashboard(p_business uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; v_month date := date_trunc('month', current_date)::date;
begin
  perform _need_staff(p_business);
  perform expire_offers(p_business);
  perform refresh_overdue(p_business);
  select jsonb_build_object(
    'rooms', (select jsonb_build_object(
        'total', count(*), 'available', count(*) filter (where status = 'available'),
        'occupied', count(*) filter (where status = 'occupied'), 'reserved', count(*) filter (where status = 'reserved'),
        'maintenance', count(*) filter (where status = 'maintenance')) from rooms where tenant_id = p_business),
    'buildings', (select count(*) from buildings where tenant_id = p_business),
    'residents', (select count(distinct client_id) from tenancies where tenant_id = p_business and status = 'active'),
    'pending_requests', (select count(*) from rental_requests where tenant_id = p_business and status = 'pending'),
    'billed_month', (select coalesce(sum(amount_due + coalesce(late_fee, 0)), 0) from billing_cycles
                     where tenant_id = p_business and status not in ('cancelled','waived') and period_start >= v_month and period_start < v_month + interval '1 month'),
    'collected_month', (select coalesce(sum(amount), 0) from payments
                        where tenant_id = p_business and payment_status = 'confirmed' and paid_at >= v_month and paid_at < v_month + interval '1 month'),
    'outstanding', (select coalesce(sum(balance), 0) from billing_cycles where tenant_id = p_business and status in ('unpaid','partial','overdue')),
    'overdue_count', (select count(*) from billing_cycles where tenant_id = p_business and status = 'overdue'),
    'overdue_amount', (select coalesce(sum(balance), 0) from billing_cycles where tenant_id = p_business and status = 'overdue'),
    'unmatched', (select count(*) from payments where tenant_id = p_business and billing_cycle_id is null and payment_status = 'confirmed'),
    'arrears', (select coalesce(jsonb_agg(a), '[]') from (
        select c.id, c.invoice_number, c.balance, c.due_date, p.full_name, r.room_number
        from billing_cycles c left join profiles p on p.id = c.client_id left join rooms r on r.id = c.room_id
        where c.tenant_id = p_business and c.status = 'overdue' order by c.balance desc limit 5) a),
    'recent_payments', (select coalesce(jsonb_agg(a), '[]') from (
        select pm.id, pm.amount, pm.payment_method, pm.paid_at, pm.payment_status, p.full_name
        from payments pm left join profiles p on p.id = pm.client_id
        where pm.tenant_id = p_business order by coalesce(pm.paid_at, pm.created_at) desc limit 5) a)
  ) into v;
  return v;
end $$;

create or replace function get_public_invoice(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c billing_cycles; b businesses; v jsonb;
begin
  select * into c from billing_cycles where share_token = p_token;
  if c.id is null then return null; end if;
  select * into b from businesses where id = c.tenant_id;
  select jsonb_build_object(
    'business', jsonb_build_object('name', b.name, 'phone', b.phone, 'email', b.email, 'address', b.address, 'logo_url', b.logo_url),
    'invoice_number', c.invoice_number, 'status', c.status, 'billing_type', c.billing_type,
    'period_start', c.period_start, 'period_end', c.period_end, 'due_date', c.due_date,
    'amount_due', c.amount_due, 'late_fee', coalesce(c.late_fee, 0), 'amount_paid', coalesce(c.amount_paid, 0), 'balance', coalesce(c.balance, 0),
    'resident', (select full_name from profiles where id = c.client_id),
    'room', (select r.room_number || coalesce(' · ' || bl.name, '') from rooms r left join buildings bl on bl.id = r.building_id where r.id = c.room_id),
    'pay_to', (select mpesa_shortcode from tenant_settings where tenant_id = c.tenant_id),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('amount', amount, 'method', payment_method, 'paid_at', paid_at) order by paid_at), '[]')
                 from payments where billing_cycle_id = c.id and payment_status = 'confirmed')
  ) into v;
  return v;
end $$;
grant execute on function get_public_invoice(text) to anon, authenticated;

create or replace function my_requests() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
    select r.id, r.status, r.message, r.preferred_move_in, r.created_at, r.offer_price, r.offer_billing_type, r.offer_move_in,
           r.offer_expires_at, r.response_note, b.name as business_name, b.slug as business_slug,
           rm.room_number, bl.name as building_name, rm.monthly_price
    from rental_requests r join businesses b on b.id = r.tenant_id
    left join rooms rm on rm.id = r.room_id left join buildings bl on bl.id = rm.building_id
    where r.requester_id = auth.uid()) x;
$$;

revoke all on function rental_dashboard(uuid), my_requests() from public, anon;
grant execute on function rental_dashboard(uuid), my_requests() to authenticated;
