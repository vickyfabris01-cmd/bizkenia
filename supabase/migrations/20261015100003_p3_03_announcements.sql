-- supabase/migrations/20261015100003_p3_03_announcements.sql — NEW FILE
--
-- AIM
-- Phase 3, step 3: announcements. Owner/managers write a notice for everyone, for one building or
-- for one floor. Members read what is meant for them; a read receipt per person powers "unread".

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  title text not null,
  body text not null,
  audience text not null default 'all' check (audience in ('all','building','floor')),
  building_id uuid references buildings(id) on delete cascade,
  floor_id uuid references floors(id) on delete cascade,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  check ((audience = 'all') or (audience = 'building' and building_id is not null) or (audience = 'floor' and floor_id is not null))
);
create index if not exists announcements_business_idx on announcements (business_id, created_at desc);

create table if not exists announcement_reads (
  announcement_id uuid not null references announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

alter table announcements enable row level security;
alter table announcement_reads enable row level security;

-- may the caller read this announcement? staff: all; residents: matching audience; workers: "all" only
create or replace function can_read_announcement(a announcements) returns boolean
language sql stable security definer set search_path = public as $$
  select is_staff(a.business_id) or exists (
    select 1 from business_members m where m.business_id = a.business_id and m.user_id = auth.uid() and m.status = 'active'
      and (a.audience = 'all'
           or (m.role = 'resident' and exists (
                select 1 from tenancies t join rooms r on r.id = t.room_id
                 where t.client_id = auth.uid() and t.tenant_id = a.business_id and t.status = 'active'
                   and ((a.audience = 'building' and r.building_id = a.building_id)
                     or (a.audience = 'floor' and r.floor_id = a.floor_id)))))
  );
$$;

create policy announcements_read on announcements for select to authenticated using (can_read_announcement(announcements));
create policy announcement_reads_own on announcement_reads for select to authenticated using (user_id = auth.uid());

create or replace function post_announcement(p_business uuid, p_title text, p_body text, p_audience text,
                                             p_building uuid default null, p_floor uuid default null, p_pinned boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_bld uuid := p_building;
begin
  perform _need_staff(p_business);
  if coalesce(trim(p_title),'') = '' or coalesce(trim(p_body),'') = '' then raise exception 'Write a title and a message'; end if;
  if p_audience not in ('all','building','floor') then raise exception 'Unknown audience'; end if;
  if p_audience = 'floor' then
    select building_id into v_bld from floors where id = p_floor and tenant_id = p_business;
    if v_bld is null then raise exception 'Choose a floor'; end if;
  elsif p_audience = 'building' then
    if not exists (select 1 from buildings where id = p_building and tenant_id = p_business) then raise exception 'Choose a building'; end if;
  end if;
  insert into announcements (business_id, author_id, title, body, audience, building_id, floor_id, pinned)
  values (p_business, auth.uid(), trim(p_title), trim(p_body), p_audience,
          case when p_audience = 'all' then null else v_bld end, case when p_audience = 'floor' then p_floor end, coalesce(p_pinned,false))
  returning id into v_id;
  -- notify each member who can read it, except the author
  insert into notifications (user_id, tenant_id, type, title, body, link)
  select m.user_id, p_business, 'announcement', trim(p_title), left(trim(p_body), 140), '/app/' || _slug(p_business) || '/notices'
    from business_members m, announcements a
   where a.id = v_id and m.business_id = p_business and m.status = 'active' and m.user_id <> auth.uid()
     and can_read_announcement_for(a, m.user_id, m.role);
  return v_id;
end $$;

-- same rule as can_read_announcement but for a named person (used only when sending notifications)
create or replace function can_read_announcement_for(a announcements, uid uuid, urole text) returns boolean
language sql stable security definer set search_path = public as $$
  select a.audience = 'all' or urole in ('owner','manager') or (urole = 'resident' and exists (
    select 1 from tenancies t join rooms r on r.id = t.room_id
     where t.client_id = uid and t.tenant_id = a.business_id and t.status = 'active'
       and ((a.audience = 'building' and r.building_id = a.building_id) or (a.audience = 'floor' and r.floor_id = a.floor_id))));
$$;

create or replace function delete_announcement(p_announcement uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a announcements;
begin
  select * into a from announcements where id = p_announcement;
  if a.id is null then raise exception 'Announcement not found'; end if;
  perform _need_staff(a.business_id);
  delete from announcements where id = p_announcement;
end $$;

create or replace function mark_announcement_read(p_announcement uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a announcements;
begin
  select * into a from announcements where id = p_announcement;
  if a.id is null or not can_read_announcement(a) then return; end if;
  insert into announcement_reads (announcement_id, user_id) values (p_announcement, auth.uid()) on conflict do nothing;
end $$;

revoke all on function can_read_announcement(announcements), can_read_announcement_for(announcements,uuid,text),
  post_announcement(uuid,text,text,text,uuid,uuid,boolean), delete_announcement(uuid), mark_announcement_read(uuid) from public, anon;
grant execute on function can_read_announcement(announcements), post_announcement(uuid,text,text,text,uuid,uuid,boolean),
  delete_announcement(uuid), mark_announcement_read(uuid) to authenticated;
