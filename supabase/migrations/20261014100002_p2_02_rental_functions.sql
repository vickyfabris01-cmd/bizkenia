-- supabase/migrations/20261014100002_p2_02_rental_functions.sql — NEW FILE
--
-- AIM
-- Phase 2, step 2: every write that touches several rows or needs a rule check lives here as a
-- SECURITY DEFINER function: requests and offers, tenancies, billing cycles, late fees, payments
-- (manual, reversed, unmatched, M-Pesa), manager invites and the owner's M-Pesa details.
-- The browser can only call these; it cannot write those tables directly (see step 1).

alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check check (type = any (array[
  'billing','payment','complaint','announcement','system','invite','transfer',
  'business_submitted','business_to_review','business_approved','business_rejected','business_suspended',
  'rental_request','offer','tenancy']));

drop trigger if exists trg_elevate_to_manager on manager_invites;
drop trigger if exists trg_reconcile_payment on payments;
create unique index if not exists uq_payment_receipt on payments (tenant_id, mpesa_receipt) where mpesa_receipt is not null;

-- ---- helpers ---------------------------------------------------------------------------
create or replace function _need_staff(bid uuid) returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  if not is_staff(bid) then raise exception 'Only the owner or a manager can do this' using errcode = '42501'; end if;
end $$;

create or replace function _need_owner(bid uuid) returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  if not is_business_owner(bid) then raise exception 'Only the owner can do this' using errcode = '42501'; end if;
end $$;

create or replace function _notify_staff(bid uuid, p_type text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, tenant_id, type, title, body, link)
  select user_id, bid, p_type, p_title, p_body, p_link
  from business_members where business_id = bid and status = 'active' and role in ('owner','manager');
$$;

create or replace function _note(p_user uuid, bid uuid, p_type text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, tenant_id, type, title, body, link) values (p_user, bid, p_type, p_title, p_body, p_link);
$$;

create or replace function _slug(bid uuid) returns text language sql stable security definer set search_path = public as $$
  select slug from businesses where id = bid;
$$;

-- staff may read the profiles of people in their business or asking to join it
create or replace function can_staff_see_profile(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from business_members m where m.user_id = uid and m.status = 'active' and is_staff(m.business_id))
      or exists (select 1 from rental_requests r where r.requester_id = uid and is_staff(r.tenant_id));
$$;
drop policy if exists profiles_staff_read on profiles;
create policy profiles_staff_read on profiles for select using (can_staff_see_profile(id));

-- ---- billing ---------------------------------------------------------------------------
create or replace function _next_invoice_no(bid uuid, d date) returns text
language plpgsql security definer set search_path = public as $$
declare n int; s text;
begin
  perform pg_advisory_xact_lock(hashtext('inv' || bid::text));
  select count(*) + 1 into n from billing_cycles where tenant_id = bid;
  select upper(left(regexp_replace(slug, '[^a-zA-Z0-9]', '', 'g'), 4)) into s from businesses where id = bid;
  return coalesce(s, 'INV') || '-' || to_char(d, 'YYYYMM') || '-' || lpad(n::text, 4, '0');
end $$;

-- Creates the cycle that starts at p_start for a tenancy. Internal.
create or replace function _make_cycle(p_tenancy uuid, p_start date) returns uuid
language plpgsql security definer set search_path = public as $$
declare t tenancies; st tenant_settings; v_end date; v_due date; v_day int; v_id uuid;
begin
  select * into t from tenancies where id = p_tenancy;
  select * into st from tenant_settings where tenant_id = t.tenant_id;
  v_day := greatest(1, least(28, coalesce(st.billing_due_day, 5)));
  if t.billing_type = 'semester' then
    v_end := (date_trunc('month', p_start) + interval '6 months' - interval '1 day')::date;
  else
    v_end := (date_trunc('month', p_start) + interval '1 month' - interval '1 day')::date;
  end if;
  v_due := greatest(p_start, (date_trunc('month', p_start) + (v_day - 1) * interval '1 day')::date);
  insert into billing_cycles (tenant_id, tenancy_id, client_id, room_id, billing_type, period_start, period_end,
                              amount_due, amount_paid, late_fee, balance, status, due_date, invoice_number)
  values (t.tenant_id, t.id, t.client_id, t.room_id, t.billing_type, p_start, v_end,
          t.agreed_price, 0, 0, t.agreed_price, 'unpaid', v_due, _next_invoice_no(t.tenant_id, p_start))
  returning id into v_id;
  return v_id;
end $$;

-- Re-adds up the confirmed payments of one cycle and sets its status.
create or replace function _reconcile_cycle(p_cycle uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c billing_cycles; v_paid numeric; v_due numeric; v_grace int;
begin
  select * into c from billing_cycles where id = p_cycle;
  if c.id is null or c.status in ('waived','cancelled') then return; end if;
  select coalesce(sum(amount), 0) into v_paid from payments where billing_cycle_id = p_cycle and payment_status = 'confirmed';
  v_due := c.amount_due + coalesce(c.late_fee, 0);
  select coalesce(grace_period_days, 3) into v_grace from tenant_settings where tenant_id = c.tenant_id;
  update billing_cycles set
    amount_paid = v_paid,
    balance = greatest(0, v_due - v_paid),
    status = case when v_paid >= v_due then 'paid'
                  when c.due_date + coalesce(v_grace, 3) < current_date then 'overdue'
                  when v_paid > 0 then 'partial'
                  else 'unpaid' end
  where id = p_cycle;
end $$;

create or replace function trg_payments_reconcile() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') and old.billing_cycle_id is not null then perform _reconcile_cycle(old.billing_cycle_id); end if;
  if tg_op in ('INSERT','UPDATE') and new.billing_cycle_id is not null then perform _reconcile_cycle(new.billing_cycle_id); end if;
  return coalesce(new, old);
end $$;
create trigger trg_reconcile_payment after insert or update or delete on payments
  for each row execute function trg_payments_reconcile();

-- Creates missing cycles up to today for every active tenancy. Returns how many were created.
create or replace function generate_cycles(p_business uuid) returns int
language plpgsql security definer set search_path = public as $$
declare t tenancies; v_last date; v_next date; n int := 0;
begin
  perform _need_staff(p_business);
  for t in select * from tenancies where tenant_id = p_business and status = 'active' loop
    select max(period_end) into v_last from billing_cycles where tenancy_id = t.id and status <> 'cancelled';
    v_next := case when v_last is null then t.move_in_date else v_last + 1 end;
    while v_next <= current_date and (t.move_out_date is null or v_next <= t.move_out_date) loop
      perform _make_cycle(t.id, v_next);
      n := n + 1;
      select max(period_end) into v_last from billing_cycles where tenancy_id = t.id and status <> 'cancelled';
      v_next := v_last + 1;
    end loop;
  end loop;
  return n;
end $$;

-- Flags cycles past due + grace as overdue and adds the late fee once. Returns how many changed.
create or replace function refresh_overdue(p_business uuid) returns int
language plpgsql security definer set search_path = public as $$
declare st tenant_settings; c billing_cycles; n int := 0; v_fee numeric;
begin
  perform _need_staff(p_business);
  select * into st from tenant_settings where tenant_id = p_business;
  for c in select * from billing_cycles where tenant_id = p_business
           and (status in ('unpaid','partial') or (status = 'overdue' and coalesce(late_fee, 0) = 0))
           and due_date + coalesce(st.grace_period_days, 3) < current_date for update loop
    v_fee := coalesce(st.late_fee_amount, 0) + round(c.amount_due * coalesce(st.late_fee_percent, 0) / 100);
    if coalesce(c.late_fee, 0) = 0 and v_fee > 0 then update billing_cycles set late_fee = v_fee where id = c.id; end if;
    if c.status <> 'overdue' then
      update billing_cycles set status = 'overdue' where id = c.id;
      perform _note(c.client_id, p_business, 'billing', 'Rent is overdue',
                    'Invoice ' || c.invoice_number || ' is past its due date.', '/app/' || _slug(p_business));
      n := n + 1;
    end if;
    perform _reconcile_cycle(c.id);
  end loop;
  return n;
end $$;

create or replace function waive_cycle(p_cycle uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare c billing_cycles;
begin
  select * into c from billing_cycles where id = p_cycle;
  if c.id is null then raise exception 'Invoice not found'; end if;
  perform _need_staff(c.tenant_id);
  update billing_cycles set status = 'waived', balance = 0,
    notes = trim(both ' ' from coalesce(notes, '') || ' Waived: ' || coalesce(nullif(p_reason, ''), 'no reason given')) where id = p_cycle;
end $$;

-- ---- tenancies -------------------------------------------------------------------------
create or replace function _start_tenancy(p_business uuid, p_client uuid, p_room uuid, p_billing text,
                                          p_price numeric, p_move_in date, p_request uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_room rooms; v_id uuid;
begin
  select * into v_room from rooms where id = p_room and tenant_id = p_business for update;
  if v_room.id is null then raise exception 'Room not found'; end if;
  if exists (select 1 from tenancies where room_id = p_room and status = 'active') then
    raise exception 'Room % already has a resident', v_room.room_number;
  end if;
  if exists (select 1 from business_members where business_id = p_business and user_id = p_client and status = 'active' and role in ('owner','manager')) then
    raise exception 'Owners and managers of this business cannot also rent a room in it';
  end if;
  insert into tenancies (tenant_id, client_id, room_id, request_id, rental_request_id, billing_type, agreed_price, move_in_date, status, approved_by)
  values (p_business, p_client, p_room, p_request, p_request, p_billing, p_price, p_move_in, 'active', auth.uid())
  returning id into v_id;
  insert into business_members (business_id, user_id, role, status) values (p_business, p_client, 'resident', 'active')
  on conflict (business_id, user_id) do update set role = 'resident', status = 'active';
  perform _make_cycle(v_id, p_move_in);
  return v_id;
end $$;

create or replace function add_resident(p_business uuid, p_email text, p_room uuid, p_billing text, p_price numeric, p_move_in date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_id uuid;
begin
  perform _need_staff(p_business);
  if p_billing not in ('monthly','semester') then raise exception 'Billing must be monthly or semester'; end if;
  if p_price is null or p_price < 0 then raise exception 'Enter the agreed rent'; end if;
  select id into v_user from profiles where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'No account uses that email. Ask the person to sign up first, then try again.'; end if;
  v_id := _start_tenancy(p_business, v_user, p_room, p_billing, p_price, coalesce(p_move_in, current_date), null);
  perform _note(v_user, p_business, 'tenancy', 'You have been added as a resident',
                'Your tenancy has started.', '/app/' || _slug(p_business));
  return v_id;
end $$;

create or replace function end_tenancy(p_tenancy uuid, p_status text, p_move_out date default null) returns void
language plpgsql security definer set search_path = public as $$
declare t tenancies; v_out date := coalesce(p_move_out, current_date);
begin
  select * into t from tenancies where id = p_tenancy for update;
  if t.id is null then raise exception 'Tenancy not found'; end if;
  perform _need_staff(t.tenant_id);
  if t.status <> 'active' then raise exception 'This tenancy has already ended'; end if;
  if p_status not in ('completed','terminated') then raise exception 'Status must be completed or terminated'; end if;
  update tenancies set status = p_status, move_out_date = v_out where id = p_tenancy;
  update billing_cycles set status = 'cancelled', balance = 0
    where tenancy_id = p_tenancy and status in ('unpaid') and period_start > v_out and amount_paid = 0;
  if not exists (select 1 from tenancies where client_id = t.client_id and tenant_id = t.tenant_id and status = 'active') then
    update business_members set status = 'removed' where business_id = t.tenant_id and user_id = t.client_id and role = 'resident';
  end if;
  perform _note(t.client_id, t.tenant_id, 'tenancy', 'Your tenancy has ended', 'Move-out date: ' || to_char(v_out, 'DD Mon YYYY'), null);
end $$;

-- ---- requests and offers ---------------------------------------------------------------
create or replace function submit_rental_request(p_business uuid, p_room uuid, p_message text default null, p_move_in date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_room rooms; v_id uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  if not is_business_active(p_business) then raise exception 'This business is not taking requests right now'; end if;
  select * into v_room from rooms where id = p_room and tenant_id = p_business;
  if v_room.id is null then raise exception 'Room not found'; end if;
  if v_room.status <> 'available' then raise exception 'This room is no longer available'; end if;
  if is_staff(p_business) then raise exception 'You run this business, so you cannot request a room in it'; end if;
  if exists (select 1 from rental_requests where requester_id = auth.uid() and room_id = p_room and status in ('pending','offered')) then
    raise exception 'You already have an open request for this room';
  end if;
  insert into rental_requests (tenant_id, room_id, requester_id, status, message, preferred_move_in)
  values (p_business, p_room, auth.uid(), 'pending', nullif(trim(p_message), ''), p_move_in) returning id into v_id;
  select coalesce(full_name, email) into v_name from profiles where id = auth.uid();
  perform _notify_staff(p_business, 'rental_request', 'New room request',
                        coalesce(v_name, 'Someone') || ' asked for room ' || v_room.room_number || '.',
                        '/app/' || _slug(p_business) || '/rental-requests');
  return v_id;
end $$;

create or replace function respond_request(p_request uuid, p_action text, p_price numeric default null, p_billing text default null,
                                           p_move_in date default null, p_note text default null, p_hours int default 48)
returns void language plpgsql security definer set search_path = public as $$
declare r rental_requests; v_room rooms;
begin
  select * into r from rental_requests where id = p_request for update;
  if r.id is null then raise exception 'Request not found'; end if;
  perform _need_staff(r.tenant_id);
  if r.status <> 'pending' then raise exception 'This request has already been answered'; end if;
  select * into v_room from rooms where id = r.room_id for update;
  if p_action = 'offer' then
    if v_room.status <> 'available' then raise exception 'Room % is no longer available', v_room.room_number; end if;
    if p_price is null or p_price < 0 then raise exception 'Enter the agreed rent'; end if;
    if p_billing not in ('monthly','semester') then raise exception 'Billing must be monthly or semester'; end if;
    update rental_requests set status = 'offered', offer_price = p_price, offer_billing_type = p_billing,
      offer_move_in = coalesce(p_move_in, r.preferred_move_in, current_date), response_note = nullif(trim(p_note), ''),
      offer_expires_at = now() + make_interval(hours => greatest(1, least(p_hours, 336))),
      reviewed_by = auth.uid(), reviewed_at = now() where id = p_request;
    update rooms set status = 'reserved' where id = r.room_id;
    perform _note(r.requester_id, r.tenant_id, 'offer', 'Your room request has an offer',
                  'Room ' || v_room.room_number || ' at KES ' || p_price || '. Open My requests to accept.', '/account/requests');
  elsif p_action = 'reject' then
    update rental_requests set status = 'rejected', response_note = nullif(trim(p_note), ''), reviewed_by = auth.uid(), reviewed_at = now() where id = p_request;
    perform _note(r.requester_id, r.tenant_id, 'offer', 'Your room request was declined',
                  coalesce(nullif(trim(p_note), ''), 'The business could not offer you this room.'), '/account/requests');
  else
    raise exception 'Action must be offer or reject';
  end if;
end $$;

create or replace function cancel_request(p_request uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r rental_requests;
begin
  select * into r from rental_requests where id = p_request for update;
  if r.id is null or r.requester_id <> auth.uid() then raise exception 'Request not found'; end if;
  if r.status not in ('pending','offered') then raise exception 'This request can no longer be cancelled'; end if;
  update rental_requests set status = 'cancelled' where id = p_request;
  if r.status = 'offered' then update rooms set status = 'available' where id = r.room_id and status = 'reserved'; end if;
end $$;

create or replace function respond_offer(p_request uuid, p_accept boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare r rental_requests; v_id uuid; v_room rooms;
begin
  select * into r from rental_requests where id = p_request for update;
  if r.id is null or r.requester_id <> auth.uid() then raise exception 'Request not found'; end if;
  if r.status <> 'offered' then raise exception 'There is no open offer on this request'; end if;
  select * into v_room from rooms where id = r.room_id;
  if r.offer_expires_at is not null and r.offer_expires_at < now() then
    update rental_requests set status = 'expired' where id = p_request;
    update rooms set status = 'available' where id = r.room_id and status = 'reserved';
    return null;
  end if;
  if p_accept then
    update rooms set status = 'available' where id = r.room_id and status = 'reserved';   -- let _start_tenancy take it
    v_id := _start_tenancy(r.tenant_id, r.requester_id, r.room_id, r.offer_billing_type, r.offer_price, r.offer_move_in, r.id);
    update rental_requests set status = 'accepted' where id = p_request;
    perform _notify_staff(r.tenant_id, 'tenancy', 'Offer accepted', 'Room ' || v_room.room_number || ' now has a resident.',
                          '/app/' || _slug(r.tenant_id) || '/tenancies');
    return v_id;
  end if;
  update rental_requests set status = 'cancelled' where id = p_request;
  update rooms set status = 'available' where id = r.room_id and status = 'reserved';
  perform _notify_staff(r.tenant_id, 'rental_request', 'Offer declined', 'The offer on room ' || v_room.room_number || ' was declined.',
                        '/app/' || _slug(r.tenant_id) || '/rental-requests');
  return null;
end $$;

-- Frees rooms whose offers ran out. Safe to call often.
create or replace function expire_offers(p_business uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform _need_staff(p_business);
  with x as (update rental_requests set status = 'expired'
             where tenant_id = p_business and status = 'offered' and offer_expires_at < now() returning room_id)
  update rooms set status = 'available' where id in (select room_id from x) and status = 'reserved';
  get diagnostics n = row_count;
  return n;
end $$;

-- ---- payments --------------------------------------------------------------------------
create or replace function record_payment(p_business uuid, p_cycle uuid, p_amount numeric, p_method text,
                                          p_reference text default null, p_paid_at timestamptz default null,
                                          p_notes text default null, p_payer_phone text default null, p_payer_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare c billing_cycles; v_id uuid; v_bal numeric;
begin
  perform _need_staff(p_business);
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount above zero'; end if;
  if p_method not in ('mpesa','cash','bank_transfer','other') then raise exception 'Choose how it was paid'; end if;
  if p_method = 'mpesa' and nullif(trim(p_reference), '') is null then raise exception 'Enter the M-Pesa code'; end if;
  if p_cycle is not null then
    select * into c from billing_cycles where id = p_cycle and tenant_id = p_business for update;
    if c.id is null then raise exception 'Invoice not found'; end if;
    if c.status in ('waived','cancelled') then raise exception 'This invoice is closed'; end if;
    v_bal := c.amount_due + coalesce(c.late_fee, 0) - coalesce(c.amount_paid, 0);
    if p_amount > v_bal then raise exception 'That is more than the balance of KES %', v_bal; end if;
  end if;
  begin
    insert into payments (tenant_id, billing_cycle_id, client_id, amount, payment_method, payment_status, mpesa_receipt, reference,
                          paid_at, recorded_by, notes, payer_phone, payer_name)
    values (p_business, p_cycle, c.client_id, p_amount, p_method, 'confirmed',
            case when p_method = 'mpesa' then upper(trim(p_reference)) end,
            case when p_method <> 'mpesa' then nullif(trim(p_reference), '') end,
            coalesce(p_paid_at, now()), auth.uid(), nullif(trim(p_notes), ''), nullif(trim(p_payer_phone), ''), nullif(trim(p_payer_name), ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'That M-Pesa code is already recorded';
  end;
  if c.id is not null then
    perform _note(c.client_id, p_business, 'payment', 'Payment received',
                  'KES ' || p_amount || ' recorded for invoice ' || c.invoice_number || '.', null);
  end if;
  return v_id;
end $$;

create or replace function reverse_payment(p_payment uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare p payments;
begin
  select * into p from payments where id = p_payment for update;
  if p.id is null then raise exception 'Payment not found'; end if;
  perform _need_staff(p.tenant_id);
  if p.payment_status <> 'confirmed' then raise exception 'Only confirmed payments can be reversed'; end if;
  update payments set payment_status = 'reversed', reversed_at = now(),
    notes = trim(both ' ' from coalesce(notes, '') || ' Reversed: ' || coalesce(nullif(p_reason, ''), 'no reason given')) where id = p_payment;
end $$;

create or replace function assign_payment(p_payment uuid, p_cycle uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p payments; c billing_cycles; v_bal numeric;
begin
  select * into p from payments where id = p_payment for update;
  if p.id is null then raise exception 'Payment not found'; end if;
  perform _need_staff(p.tenant_id);
  if p.billing_cycle_id is not null then raise exception 'This payment is already matched'; end if;
  select * into c from billing_cycles where id = p_cycle and tenant_id = p.tenant_id for update;
  if c.id is null then raise exception 'Invoice not found'; end if;
  v_bal := c.amount_due + coalesce(c.late_fee, 0) - coalesce(c.amount_paid, 0);
  if p.amount > v_bal then raise exception 'That is more than the balance of KES %', v_bal; end if;
  update payments set billing_cycle_id = p_cycle, client_id = c.client_id where id = p_payment;
  perform _note(c.client_id, p.tenant_id, 'payment', 'Payment received', 'KES ' || p.amount || ' applied to invoice ' || c.invoice_number || '.', null);
end $$;

-- Called with the service role by the M-Pesa callback, or by staff. Replaces the Phase 1 version.
create or replace function mark_intent_paid(p_intent uuid, p_receipt text default null) returns text
language plpgsql security definer set search_path = public as $$
declare v_i payment_intents; c billing_cycles;
begin
  select * into v_i from payment_intents where id = p_intent for update;
  if v_i.id is null then raise exception 'Payment not found'; end if;
  if v_i.status = 'success' then return 'already_paid'; end if;
  update payment_intents set status = 'success', mpesa_receipt = coalesce(p_receipt, mpesa_receipt) where id = p_intent;
  if v_i.purpose = 'rent' then
    select * into c from billing_cycles where id = v_i.billing_cycle_id;
    if c.id is not null then
      insert into payments (tenant_id, billing_cycle_id, client_id, amount, payment_method, payment_status, mpesa_receipt,
                            paid_at, payer_phone, intent_id, notes)
      values (c.tenant_id, c.id, c.client_id, v_i.amount_kes, 'mpesa', 'confirmed', coalesce(p_receipt, v_i.mpesa_receipt),
              now(), v_i.phone, v_i.id, 'Paid by STK push')
      on conflict do nothing;
      perform _note(c.client_id, c.tenant_id, 'payment', 'Payment received', 'KES ' || v_i.amount_kes || ' for invoice ' || c.invoice_number || '.', null);
      perform _notify_staff(c.tenant_id, 'payment', 'Rent payment received', 'KES ' || v_i.amount_kes || ' for invoice ' || c.invoice_number || '.',
                            '/app/' || _slug(c.tenant_id) || '/payments');
    end if;
    return 'rent_recorded';
  end if;
  return _subscription_paid(v_i.business_id, v_i.plan_id, p_intent);
end $$;
revoke execute on function mark_intent_paid(uuid, text) from public, anon, authenticated;

-- ---- managers --------------------------------------------------------------------------
create or replace function invite_manager(p_business uuid, p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email)); v_token text;
begin
  perform _need_owner(p_business);
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address'; end if;
  if exists (select 1 from business_members m join profiles p on p.id = m.user_id
             where m.business_id = p_business and m.status = 'active' and m.role in ('owner','manager') and lower(p.email) = v_email) then
    raise exception 'That person already works in this business';
  end if;
  update manager_invites set status = 'cancelled' where tenant_id = p_business and lower(email) = v_email and status = 'pending';
  insert into manager_invites (tenant_id, email, invited_by) values (p_business, v_email, auth.uid()) returning token into v_token;
  return v_token;
end $$;

create or replace function cancel_invite(p_invite uuid) returns void
language plpgsql security definer set search_path = public as $$
declare i manager_invites;
begin
  select * into i from manager_invites where id = p_invite;
  if i.id is null then raise exception 'Invite not found'; end if;
  perform _need_owner(i.tenant_id);
  update manager_invites set status = 'cancelled' where id = p_invite and status = 'pending';
end $$;

drop function if exists get_invite_by_token(text);
create function get_invite_by_token(p_token text)
returns table (id uuid, business_id uuid, email text, status text, expires_at timestamptz, business_name text, business_slug text, invited_by_name text)
language sql stable security definer set search_path = public as $$
  select i.id, i.tenant_id, i.email, case when i.status = 'pending' and i.expires_at < now() then 'expired' else i.status end,
         i.expires_at, b.name, b.slug, p.full_name
  from manager_invites i join businesses b on b.id = i.tenant_id left join profiles p on p.id = i.invited_by
  where i.token = p_token limit 1;
$$;
grant execute on function get_invite_by_token(text) to anon, authenticated;

create or replace function accept_manager_invite(p_token text, p_full_name text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_email text := lower(auth.jwt() ->> 'email'); i manager_invites;
begin
  if v_uid is null then raise exception 'Sign in to accept this invite' using errcode = '28000'; end if;
  select * into i from manager_invites where token = p_token for update;
  if i.id is null then raise exception 'Invite not found'; end if;
  if i.status <> 'pending' then raise exception 'This invite is no longer valid'; end if;
  if i.expires_at < now() then raise exception 'This invite has expired'; end if;
  if lower(i.email) <> v_email then raise exception 'This invite was sent to a different email address'; end if;
  if exists (select 1 from business_members where business_id = i.tenant_id and user_id = v_uid and status = 'active' and role = 'resident') then
    raise exception 'You are a resident of this business. End your tenancy before becoming a manager.';
  end if;
  insert into business_members (business_id, user_id, role, status) values (i.tenant_id, v_uid, 'manager', 'active')
  on conflict (business_id, user_id) do update set role = case when business_members.role = 'owner' then 'owner' else 'manager' end, status = 'active';
  if nullif(trim(p_full_name), '') is not null then update profiles set full_name = trim(p_full_name) where id = v_uid and full_name is null; end if;
  update manager_invites set status = 'accepted' where id = i.id;
  perform _notify_staff(i.tenant_id, 'invite', 'Manager joined', i.email || ' accepted the invite.', '/app/' || _slug(i.tenant_id) || '/managers');
  return i.tenant_id;
end $$;

create or replace function remove_manager(p_business uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _need_owner(p_business);
  update business_members set status = 'removed' where business_id = p_business and user_id = p_user and role = 'manager';
  if not found then raise exception 'Manager not found'; end if;
end $$;

-- ---- owner's payment details -----------------------------------------------------------
create or replace function save_mpesa_details(p_business uuid, p_shortcode text, p_passkey text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _need_owner(p_business);
  if nullif(trim(p_shortcode), '') is not null and trim(p_shortcode) !~ '^[0-9]{5,7}$' then raise exception 'The paybill or till number is 5 to 7 digits'; end if;
  insert into tenant_settings (tenant_id, mpesa_shortcode) values (p_business, nullif(trim(p_shortcode), ''))
  on conflict (tenant_id) do update set mpesa_shortcode = excluded.mpesa_shortcode, updated_at = now();
  if nullif(trim(p_passkey), '') is not null then
    insert into tenant_secrets (tenant_id, mpesa_passkey) values (p_business, trim(p_passkey))
    on conflict (tenant_id) do update set mpesa_passkey = excluded.mpesa_passkey, updated_at = now();
  end if;
end $$;

create or replace function mpesa_status(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _need_staff(p_business);
  return jsonb_build_object(
    'shortcode', (select mpesa_shortcode from tenant_settings where tenant_id = p_business),
    'has_passkey', exists (select 1 from tenant_secrets where tenant_id = p_business and coalesce(mpesa_passkey, '') <> ''));
end $$;

-- grants: everything above is callable by signed-in users (each checks its own rules); internals are not.
do $$
declare f text;
begin
  foreach f in array array['generate_cycles(uuid)','refresh_overdue(uuid)','waive_cycle(uuid,text)','add_resident(uuid,text,uuid,text,numeric,date)',
    'end_tenancy(uuid,text,date)','submit_rental_request(uuid,uuid,text,date)','respond_request(uuid,text,numeric,text,date,text,int)',
    'cancel_request(uuid)','respond_offer(uuid,boolean)','expire_offers(uuid)',
    'record_payment(uuid,uuid,numeric,text,text,timestamptz,text,text,text)','reverse_payment(uuid,text)','assign_payment(uuid,uuid)',
    'invite_manager(uuid,text)','cancel_invite(uuid)','accept_manager_invite(text,text)',
    'remove_manager(uuid,uuid)','save_mpesa_details(uuid,text,text)','mpesa_status(uuid)']
  loop
    execute 'revoke all on function ' || f || ' from public, anon';
    execute 'grant execute on function ' || f || ' to authenticated';
  end loop;
  foreach f in array array['_need_staff(uuid)','_need_owner(uuid)','_notify_staff(uuid,text,text,text,text)','_note(uuid,uuid,text,text,text,text)',
    '_slug(uuid)','_next_invoice_no(uuid,date)','_make_cycle(uuid,date)','_reconcile_cycle(uuid)','_start_tenancy(uuid,uuid,uuid,text,numeric,date,uuid)',
    'trg_payments_reconcile()']
  loop
    execute 'revoke all on function ' || f || ' from public, anon, authenticated';
  end loop;
end $$;
