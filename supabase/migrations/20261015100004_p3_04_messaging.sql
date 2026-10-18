-- supabase/migrations/20261015100004_p3_04_messaging.sql — NEW FILE
--
-- AIM
-- Phase 3, step 4: one-to-one messages inside a business.
--  * a conversation always has exactly two members of the same business
--  * residents and workers may only message the owner or a manager; owner/managers may message anyone
--  * rows are read-only through RLS (only the two people read them); sending goes through functions
--  * messages are in the realtime publication so threads update live

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (business_id, user_a, user_b)
);
create table if not exists conversation_members (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default 'epoch',
  primary key (conversation_id, user_id)
);
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(trim(body)) > 0 and length(body) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists messages_conv_idx on messages (conversation_id, created_at);
create index if not exists conversation_members_user_idx on conversation_members (user_id);

alter table conversations enable row level security;
alter table conversation_members enable row level security;
alter table messages enable row level security;

create or replace function in_conversation(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversation_members where conversation_id = cid and user_id = auth.uid());
$$;

create policy conversations_read on conversations for select to authenticated using (in_conversation(id));
create policy conversation_members_read on conversation_members for select to authenticated using (in_conversation(conversation_id));
create policy messages_read on messages for select to authenticated using (in_conversation(conversation_id));

-- people the caller may message in a business (names come from here, so no profile access is needed)
create or replace function message_contacts(p_business uuid)
returns table (user_id uuid, full_name text, role text, avatar_url text) language plpgsql stable security definer set search_path = public as $$
declare v_role text := member_role(p_business);
begin
  if v_role is null then raise exception 'Not a member of this business' using errcode = '42501'; end if;
  return query
  select m.user_id, coalesce(p.full_name, p.email), m.role, p.avatar_url
    from business_members m join profiles p on p.id = m.user_id
   where m.business_id = p_business and m.status = 'active' and m.user_id <> auth.uid()
     and (v_role in ('owner','manager') or m.role in ('owner','manager'))
   order by (m.role in ('owner','manager')) desc, 2;
end $$;

create or replace function start_conversation(p_business uuid, p_other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_me text := member_role(p_business); v_they text; v_a uuid; v_b uuid; v_id uuid;
begin
  if v_me is null then raise exception 'Not a member of this business' using errcode = '42501'; end if;
  select role into v_they from business_members where business_id = p_business and user_id = p_other and status = 'active';
  if v_they is null or p_other = auth.uid() then raise exception 'You cannot message that person'; end if;
  if v_me not in ('owner','manager') and v_they not in ('owner','manager') then
    raise exception 'You can message the owner or a manager of this business' using errcode = '42501';
  end if;
  v_a := least(auth.uid(), p_other); v_b := greatest(auth.uid(), p_other);
  select id into v_id from conversations where business_id = p_business and user_a = v_a and user_b = v_b;
  if v_id is null then
    insert into conversations (business_id, user_a, user_b) values (p_business, v_a, v_b) returning id into v_id;
    insert into conversation_members (conversation_id, user_id) values (v_id, v_a), (v_id, v_b);
  end if;
  return v_id;
end $$;

create or replace function send_message(p_conversation uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare c conversations; v_to uuid; v_id uuid; v_name text;
begin
  select * into c from conversations where id = p_conversation;
  if c.id is null or not in_conversation(p_conversation) then raise exception 'Conversation not found' using errcode = '42501'; end if;
  if coalesce(trim(p_body),'') = '' then raise exception 'Write a message'; end if;
  if length(p_body) > 2000 then raise exception 'Messages can be up to 2000 characters'; end if;
  -- both people must still belong to the business
  if (select count(*) from business_members where business_id = c.business_id and status = 'active' and user_id in (c.user_a, c.user_b)) < 2 then
    raise exception 'This person is no longer part of the business';
  end if;
  insert into messages (conversation_id, sender_id, body) values (p_conversation, auth.uid(), trim(p_body)) returning id into v_id;
  update conversations set last_message_at = now(), last_message_preview = left(trim(p_body), 80) where id = p_conversation;
  update conversation_members set last_read_at = now() where conversation_id = p_conversation and user_id = auth.uid();
  v_to := case when c.user_a = auth.uid() then c.user_b else c.user_a end;
  select coalesce(full_name, email) into v_name from profiles where id = auth.uid();
  -- one unread alert per conversation (not one per message)
  if not exists (select 1 from notifications where user_id = v_to and type = 'message' and is_read = false
                 and data->>'conversation' = p_conversation::text) then
    insert into notifications (user_id, tenant_id, type, title, body, link, data)
    values (v_to, c.business_id, 'message', 'New message from ' || coalesce(v_name, 'someone'), left(trim(p_body), 100),
            '/app/' || _slug(c.business_id) || '/messages?c=' || p_conversation, jsonb_build_object('conversation', p_conversation));
  end if;
  return v_id;
end $$;

create or replace function mark_conversation_read(p_conversation uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update conversation_members set last_read_at = now() where conversation_id = p_conversation and user_id = auth.uid();
  update notifications set is_read = true where user_id = auth.uid() and type = 'message' and is_read = false
     and data->>'conversation' = p_conversation::text;
end $$;

-- the caller's conversations in a business with the other person's name and unread count
create or replace function my_conversations(p_business uuid)
returns table (id uuid, other_id uuid, other_name text, other_role text, other_avatar text,
               last_message_at timestamptz, last_message_preview text, unread integer)
language sql stable security definer set search_path = public as $$
  select c.id, o.user_id, coalesce(p.full_name, p.email), m.role, p.avatar_url, c.last_message_at, c.last_message_preview,
         (select count(*)::int from messages x where x.conversation_id = c.id and x.sender_id <> auth.uid() and x.created_at > me.last_read_at)
    from conversations c
    join conversation_members me on me.conversation_id = c.id and me.user_id = auth.uid()
    join conversation_members o on o.conversation_id = c.id and o.user_id <> auth.uid()
    join profiles p on p.id = o.user_id
    left join business_members m on m.business_id = c.business_id and m.user_id = o.user_id
   where c.business_id = p_business
   order by c.last_message_at desc;
$$;

revoke all on function in_conversation(uuid), message_contacts(uuid), start_conversation(uuid,uuid), send_message(uuid,text),
  mark_conversation_read(uuid), my_conversations(uuid) from public, anon;
grant execute on function in_conversation(uuid), message_contacts(uuid), start_conversation(uuid,uuid), send_message(uuid,text),
  mark_conversation_read(uuid), my_conversations(uuid) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table messages; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table notifications; exception when duplicate_object then null; end;
  end if;
end $$;
