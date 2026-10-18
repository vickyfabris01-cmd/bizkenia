-- supabase/migrations/20261015100002_p3_02_complaints_transfers.sql — NEW FILE
--
-- AIM
-- Phase 3, step 2: complaints and room-transfer requests.
--  * a resident raises a complaint and follows the thread; owner/managers triage, reply and resolve
--  * a resident asks to move rooms; owner/managers decide (approval moves the tenancy)
--  * tables are read-only through RLS; every write is a SECURITY DEFINER function

drop policy if exists complaints_client on complaints;
drop policy if exists complaints_create on complaints;
drop policy if exists complaints_manager on complaints;
drop policy if exists complaint_messages_create on complaint_messages;
drop policy if exists complaint_messages_participant on complaint_messages;
drop policy if exists transfers_client on room_transfers;
drop policy if exists transfers_create on room_transfers;
drop policy if exists transfers_manager on room_transfers;

create policy complaints_read on complaints for select to authenticated
  using (submitted_by = auth.uid() or is_staff(tenant_id));
create policy complaint_messages_read on complaint_messages for select to authenticated
  using (exists (select 1 from complaints c where c.id = complaint_id and (c.submitted_by = auth.uid() or is_staff(c.tenant_id))));
create policy transfers_read on room_transfers for select to authenticated
  using (requested_by = auth.uid() or is_staff(tenant_id));

alter table room_transfers add column if not exists decision_note text;
alter table complaint_messages add column if not exists is_staff boolean not null default false;

create or replace function create_complaint(p_business uuid, p_title text, p_body text, p_category text, p_priority text default 'normal')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_tenancy uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  if member_role(p_business) is distinct from 'resident' then raise exception 'Only residents can raise a complaint' using errcode = '42501'; end if;
  if coalesce(trim(p_title),'') = '' then raise exception 'Give the complaint a short title'; end if;
  select id into v_tenancy from tenancies where tenant_id = p_business and client_id = auth.uid() and status = 'active';
  insert into complaints (tenant_id, tenancy_id, submitted_by, title, body, category, priority, status)
  values (p_business, v_tenancy, auth.uid(), trim(p_title), nullif(trim(coalesce(p_body,'')),''),
          coalesce(p_category,'general'), coalesce(p_priority,'normal'), 'open') returning id into v_id;
  perform _notify_staff(p_business, 'complaint', 'New complaint: ' || trim(p_title), null, '/app/' || _slug(p_business) || '/complaints');
  return v_id;
end $$;

create or replace function post_complaint_message(p_complaint uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare c complaints; v_staff boolean; v_id uuid;
begin
  select * into c from complaints where id = p_complaint;
  if c.id is null then raise exception 'Complaint not found'; end if;
  v_staff := is_staff(c.tenant_id);
  if not (v_staff or c.submitted_by = auth.uid()) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if coalesce(trim(p_body),'') = '' then raise exception 'Write a message'; end if;
  insert into complaint_messages (tenant_id, complaint_id, sender_id, body, is_staff)
  values (c.tenant_id, p_complaint, auth.uid(), trim(p_body), v_staff) returning id into v_id;
  if v_staff then
    if c.status = 'open' then update complaints set status = 'in_progress' where id = p_complaint; end if;
    perform _note(c.submitted_by, c.tenant_id, 'complaint', 'Reply on: ' || c.title, left(trim(p_body), 140),
                  '/app/' || _slug(c.tenant_id) || '/my-complaints');
  else
    if c.status in ('resolved','closed') then update complaints set status = 'open', resolved_at = null where id = p_complaint; end if;
    perform _notify_staff(c.tenant_id, 'complaint', 'Resident replied: ' || c.title, left(trim(p_body), 140),
                          '/app/' || _slug(c.tenant_id) || '/complaints');
  end if;
  return v_id;
end $$;

create or replace function update_complaint(p_complaint uuid, p_status text, p_priority text default null, p_assigned uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare c complaints;
begin
  select * into c from complaints where id = p_complaint for update;
  if c.id is null then raise exception 'Complaint not found'; end if;
  perform _need_staff(c.tenant_id);
  if p_status is not null and p_status not in ('open','in_progress','resolved','closed') then raise exception 'Unknown status'; end if;
  if p_priority is not null and p_priority not in ('low','normal','high','urgent') then raise exception 'Unknown priority'; end if;
  if p_assigned is not null and not exists (select 1 from business_members where business_id = c.tenant_id and user_id = p_assigned
                                            and status = 'active' and role in ('owner','manager','worker')) then
    raise exception 'Assign to the owner, a manager or a worker of this business';
  end if;
  update complaints set status = coalesce(p_status, status), priority = coalesce(p_priority, priority),
         assigned_to = coalesce(p_assigned, assigned_to),
         resolved_at = case when coalesce(p_status, status) in ('resolved','closed') then coalesce(resolved_at, now()) else null end
   where id = p_complaint;
  if p_status is not null and p_status is distinct from c.status then
    perform _note(c.submitted_by, c.tenant_id, 'complaint', 'Your complaint is now ' || replace(p_status, '_', ' '), c.title,
                  '/app/' || _slug(c.tenant_id) || '/my-complaints');
  end if;
end $$;

-- who a complaint can be assigned to
create or replace function assignable_people(p_business uuid)
returns table (user_id uuid, full_name text, role text) language plpgsql stable security definer set search_path = public as $$
begin
  perform _need_staff(p_business);
  return query select m.user_id, coalesce(p.full_name, p.email), m.role
    from business_members m join profiles p on p.id = m.user_id
   where m.business_id = p_business and m.status = 'active' and m.role in ('owner','manager','worker') order by 2;
end $$;

-- ---------- transfers ----------
create or replace function request_transfer(p_business uuid, p_to_room uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare t tenancies; v_id uuid;
begin
  if member_role(p_business) is distinct from 'resident' then raise exception 'Only residents can ask to move' using errcode = '42501'; end if;
  select * into t from tenancies where tenant_id = p_business and client_id = auth.uid() and status = 'active';
  if t.id is null then raise exception 'You have no active tenancy'; end if;
  if exists (select 1 from room_transfers where tenancy_id = t.id and status = 'pending') then
    raise exception 'You already have a transfer request waiting for a decision';
  end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'Tell the manager why you want to move'; end if;
  if p_to_room is not null and not exists (select 1 from rooms where id = p_to_room and tenant_id = p_business and status = 'available') then
    raise exception 'That room is not available';
  end if;
  insert into room_transfers (tenant_id, tenancy_id, from_room_id, to_room_id, requested_by, reason, status)
  values (p_business, t.id, t.room_id, p_to_room, auth.uid(), trim(p_reason), 'pending') returning id into v_id;
  perform _notify_staff(p_business, 'transfer', 'Room transfer request', left(trim(p_reason), 140), '/app/' || _slug(p_business) || '/transfers');
  return v_id;
end $$;

create or replace function cancel_transfer(p_transfer uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update room_transfers set status = 'rejected', decision_note = 'Withdrawn by the resident'
   where id = p_transfer and requested_by = auth.uid() and status = 'pending';
  if not found then raise exception 'Nothing to withdraw'; end if;
end $$;

create or replace function decide_transfer(p_transfer uuid, p_approve boolean, p_to_room uuid default null, p_effective date default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r room_transfers; v_to uuid; v_num text;
begin
  select * into r from room_transfers where id = p_transfer for update;
  if r.id is null then raise exception 'Request not found'; end if;
  perform _need_staff(r.tenant_id);
  if r.status <> 'pending' then raise exception 'This request has already been decided'; end if;
  if p_approve then
    v_to := coalesce(p_to_room, r.to_room_id);
    if v_to is null then raise exception 'Choose the room to move the resident to'; end if;
    if not exists (select 1 from rooms where id = v_to and tenant_id = r.tenant_id and status = 'available') then
      raise exception 'That room is not available';
    end if;
    update tenancies set room_id = v_to where id = r.tenancy_id;
    update room_transfers set status = 'completed', to_room_id = v_to, approved_by = auth.uid(),
           effective_date = coalesce(p_effective, current_date), decision_note = p_note where id = p_transfer;
    select room_number into v_num from rooms where id = v_to;
    perform _note(r.requested_by, r.tenant_id, 'transfer', 'Your move was approved', 'You are now in room ' || v_num, '/app/' || _slug(r.tenant_id));
  else
    update room_transfers set status = 'rejected', approved_by = auth.uid(), decision_note = p_note where id = p_transfer;
    perform _note(r.requested_by, r.tenant_id, 'transfer', 'Your move request was declined', p_note, '/app/' || _slug(r.tenant_id) || '/transfer');
  end if;
end $$;

revoke all on function create_complaint(uuid,text,text,text,text), post_complaint_message(uuid,text), update_complaint(uuid,text,text,uuid),
  assignable_people(uuid), request_transfer(uuid,uuid,text), cancel_transfer(uuid), decide_transfer(uuid,boolean,uuid,date,text) from public, anon;
grant execute on function create_complaint(uuid,text,text,text,text), post_complaint_message(uuid,text), update_complaint(uuid,text,text,uuid),
  assignable_people(uuid), request_transfer(uuid,uuid,text), cancel_transfer(uuid), decide_transfer(uuid,boolean,uuid,date,text) to authenticated;
