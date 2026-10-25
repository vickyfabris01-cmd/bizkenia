-- 20261025100001_brand_designs.sql
--
-- AIM
-- Logos and avatars are drawn by the app from a small saved "recipe" instead of being stored as
-- picture files. This migration adds the two places the recipes are kept:
--   businesses.logo_design   e.g. {"v":1,"s":3,"i":5,"p":8}   (style, symbol, palette)
--   profiles.avatar_design   e.g. {"v":1,"s":2,"p":4,"b":1}   (style, palette, pattern)
-- A row with no recipe is fine: the app works one out from the row's id, so no data is changed here.
-- Uploaded pictures (logo_url, avatar_url) are untouched and still win when they exist.
--
-- It also changes my_conversations so the chat list can draw the other person's chosen avatar.
--
-- SAFE TO RUN ONCE OR MANY TIMES. Run it BEFORE deploying the new app version
-- (npx supabase db push), because the new app asks for these columns.

-- 1. the two recipe columns (nullable, so existing rows are untouched)
alter table public.businesses add column if not exists logo_design jsonb;
alter table public.profiles   add column if not exists avatar_design jsonb;

-- 2. keep them small and the right shape: a JSON object under 200 characters
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'businesses_logo_design_shape') then
    alter table public.businesses add constraint businesses_logo_design_shape
      check (logo_design is null or (jsonb_typeof(logo_design) = 'object' and length(logo_design::text) <= 200));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_avatar_design_shape') then
    alter table public.profiles add constraint profiles_avatar_design_shape
      check (avatar_design is null or (jsonb_typeof(avatar_design) = 'object' and length(avatar_design::text) <= 200));
  end if;
end $$;

comment on column public.businesses.logo_design is 'Saved logo recipe {v,s,i,p}; the app draws the logo from it. Null = derived from the id.';
comment on column public.profiles.avatar_design is 'Saved avatar recipe {v,s,p,b}; the app draws the avatar from it. Null = derived from the id.';

-- 3. owners and people can already change their own row (existing row rules); this only makes sure
--    the new columns are allowed if column-level privileges are in use.
grant update (logo_design) on public.businesses to authenticated;
grant update (avatar_design) on public.profiles to authenticated;

-- 4. chat list: also return the other person's avatar recipe.
--    The return shape changes, so the old version is dropped first, then created again and re-granted.
drop function if exists public.my_conversations(uuid);
create function public.my_conversations(p_business uuid)
returns table (id uuid, other_id uuid, other_name text, other_role text, other_avatar text, other_avatar_design jsonb,
               last_message_at timestamptz, last_message_preview text, unread integer)
language sql stable security definer set search_path = public as $$
  select c.id, o.user_id, coalesce(p.full_name, p.email), m.role, p.avatar_url, p.avatar_design, c.last_message_at, c.last_message_preview,
         (select count(*)::int from messages x where x.conversation_id = c.id and x.sender_id <> auth.uid() and x.created_at > me.last_read_at)
    from conversations c
    join conversation_members me on me.conversation_id = c.id and me.user_id = auth.uid()
    join conversation_members o on o.conversation_id = c.id and o.user_id <> auth.uid()
    join profiles p on p.id = o.user_id
    left join business_members m on m.business_id = c.business_id and m.user_id = o.user_id
   where c.business_id = p_business
   order by c.last_message_at desc;
$$;
revoke all on function public.my_conversations(uuid) from public, anon;
grant execute on function public.my_conversations(uuid) to authenticated;
