-- supabase/migrations/20261015100005_p3_05_support.sql — NEW FILE
--
-- AIM
-- Phase 3, step 5: the help desk.
--  * help_articles: the public help centre, written by the super admin
--  * support_tickets / ticket_messages: a signed-in person writes to the platform team; only that
--    person and the super admin can read the ticket. Tickets are platform data, not business data.

create table if not exists help_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  body text not null,
  category text not null default 'General',
  audience text not null default 'everyone' check (audience in ('everyone','owners','residents','visitors')),
  sort integer not null default 100,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  business_id uuid references businesses(id) on delete set null,
  subject text not null,
  category text not null default 'general' check (category in ('general','account','billing','business','technical','other')),
  status text not null default 'open' check (status in ('open','pending','solved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create table if not exists ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  from_support boolean not null default false,
  body text not null check (length(trim(body)) > 0 and length(body) <= 4000),
  created_at timestamptz not null default now()
);
create index if not exists support_tickets_user_idx on support_tickets (user_id, last_message_at desc);
create index if not exists ticket_messages_ticket_idx on ticket_messages (ticket_id, created_at);

alter table help_articles enable row level security;
alter table support_tickets enable row level security;
alter table ticket_messages enable row level security;

create policy help_articles_read on help_articles for select to anon, authenticated using (published or coalesce(is_super_admin(), false));
create policy help_articles_admin on help_articles for all to authenticated
  using (coalesce(is_super_admin(), false)) with check (coalesce(is_super_admin(), false));
create policy tickets_read on support_tickets for select to authenticated using (user_id = auth.uid() or coalesce(is_super_admin(), false));
create policy ticket_messages_read on ticket_messages for select to authenticated
  using (exists (select 1 from support_tickets t where t.id = ticket_id and (t.user_id = auth.uid() or coalesce(is_super_admin(), false))));

create or replace function create_ticket(p_subject text, p_body text, p_category text default 'general', p_business uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text; r record;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  if coalesce(trim(p_subject),'') = '' or coalesce(trim(p_body),'') = '' then raise exception 'Write a subject and describe the problem'; end if;
  if p_business is not null and not is_member(p_business) then p_business := null; end if;
  insert into support_tickets (user_id, business_id, subject, category) values (auth.uid(), p_business, trim(p_subject), coalesce(p_category,'general'))
  returning id into v_id;
  insert into ticket_messages (ticket_id, sender_id, body) values (v_id, auth.uid(), trim(p_body));
  select coalesce(full_name, email) into v_name from profiles where id = auth.uid();
  for r in select id from profiles where role = 'super_admin' loop
    insert into notifications (user_id, type, title, body, link)
    values (r.id, 'ticket', 'New support ticket: ' || trim(p_subject), 'From ' || coalesce(v_name, 'a user'), '/admin/support?t=' || v_id);
  end loop;
  return v_id;
end $$;

create or replace function reply_ticket(p_ticket uuid, p_body text, p_status text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare t support_tickets; v_admin boolean := coalesce(is_super_admin(), false); v_id uuid; r record;
begin
  select * into t from support_tickets where id = p_ticket for update;
  if t.id is null or not (v_admin or t.user_id = auth.uid()) then raise exception 'Ticket not found' using errcode = '42501'; end if;
  if coalesce(trim(p_body),'') = '' then raise exception 'Write a message'; end if;
  insert into ticket_messages (ticket_id, sender_id, from_support, body) values (p_ticket, auth.uid(), v_admin, trim(p_body)) returning id into v_id;
  update support_tickets set last_message_at = now(), updated_at = now(),
         status = case when v_admin then coalesce(p_status, 'pending') else 'open' end where id = p_ticket;
  if v_admin then
    insert into notifications (user_id, type, title, body, link) values (t.user_id, 'ticket', 'Support replied: ' || t.subject, left(trim(p_body), 140), '/help/tickets?t=' || p_ticket);
  else
    for r in select id from profiles where role = 'super_admin' loop
      insert into notifications (user_id, type, title, body, link) values (r.id, 'ticket', 'Ticket reply: ' || t.subject, left(trim(p_body), 140), '/admin/support?t=' || p_ticket);
    end loop;
  end if;
  return v_id;
end $$;

create or replace function set_ticket_status(p_ticket uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare t support_tickets;
begin
  select * into t from support_tickets where id = p_ticket;
  if t.id is null or not (coalesce(is_super_admin(), false) or t.user_id = auth.uid()) then raise exception 'Ticket not found' using errcode = '42501'; end if;
  if p_status not in ('open','pending','solved') then raise exception 'Unknown status'; end if;
  if not coalesce(is_super_admin(), false) and p_status = 'pending' then raise exception 'Not allowed' using errcode = '42501'; end if;
  update support_tickets set status = p_status, updated_at = now() where id = p_ticket;
end $$;

-- starter articles so the help centre is not empty
insert into help_articles (slug, title, body, category, audience, sort) values
 ('create-account', 'Create an account and sign in', E'Create an account with Google, your email or your phone number and a password. You can sign in with the same details later. No text message codes are needed.', 'Getting started', 'everyone', 10),
 ('find-a-room', 'Find a room and send a request', E'Open Explore, choose a rental business and pick a room. Press Request this room and add a message. The owner can accept, send you an offer, or decline. You can follow every request under My requests.', 'Renting', 'visitors', 20),
 ('pay-rent', 'Pay rent with M-Pesa', E'Open My invoices, choose the invoice and press Pay now. Enter your M-Pesa phone number and approve the prompt on your phone. Your receipt appears in the invoice as soon as the payment is confirmed.', 'Renting', 'residents', 30),
 ('complaints', 'Raise a complaint', E'Open Complaints in your resident portal and press New complaint. The manager can reply and mark it resolved. You will get a notification each time something changes.', 'Renting', 'residents', 40),
 ('list-business', 'List your business', E'Choose List your business, add your details and submit for review. Once approved you can add buildings, rooms and invite managers. Your subscription is paid with M-Pesa.', 'For owners', 'owners', 50),
 ('contact-support', 'Contact the support team', E'Signed-in people can open a ticket from Help > My tickets and follow the replies there. You can also email the support address shown in the footer.', 'Getting started', 'everyone', 60)
on conflict (slug) do nothing;

revoke all on function create_ticket(text,text,text,uuid), reply_ticket(uuid,text,text), set_ticket_status(uuid,text) from public, anon;
grant execute on function create_ticket(text,text,text,uuid), reply_ticket(uuid,text,text), set_ticket_status(uuid,text) to authenticated;
