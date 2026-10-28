-- supabase/migrations/20261027100001_share_options.sql
-- AIM: let each business (and the site) choose what its shared cards, posters and link previews show.
-- See src/lib/api/shareOptions.js and src/components/share/ShareOptionsCard.jsx.
--   showRent        rentals: the rent price            showPhone     the phone and WhatsApp number
--   showLocation    the address and county             showPlanPrices  site only: plan prices on the Pricing card
-- It is a table of its own (no new columns on businesses, no triggers, no audit entries), closed to direct
-- access (row-level security on, no policies). Two functions are the only way in and out:
--   set_share_options(p_business, p_options)  the OWNER of the business, or the super admin for the site (p_business null)
--   get_share_options(p_business)             anyone, but only for an active business (or the site); null when nothing is saved
-- The Cloudflare Worker (worker/share.js) calls get_share_options with the public key so a pasted link
-- follows the same choices as the card (for example no rent in the text when "Show rent price" is off).
-- Nothing saved means the defaults (rent, phone and location shown; plan prices hidden), applied by the app and the Worker.
-- Safe to run more than once.

-- 1. The table
create table if not exists public.share_options (
  kind       text not null check (kind in ('business', 'site')),
  ref        text not null,
  options    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (kind, ref)
);
alter table public.share_options enable row level security;

-- 2. Write: the owner (or the super admin, for the site). Only the four known switches are kept, and only as true/false.
create or replace function public.set_share_options(p_business uuid, p_options jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  clean jsonb := '{}'::jsonb;
  k     text;
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;
  if p_options is null or jsonb_typeof(p_options) <> 'object' then
    raise exception 'Those share settings are not valid.' using errcode = '22023';
  end if;
  foreach k in array array['showRent', 'showPhone', 'showLocation', 'showPlanPrices'] loop
    if jsonb_typeof(p_options -> k) = 'boolean' then
      clean := clean || jsonb_build_object(k, p_options -> k);
    end if;
  end loop;

  if p_business is null then
    if not coalesce(public.is_super_admin(), false) then
      raise exception 'Only the platform owner can do this.' using errcode = '42501';
    end if;
    insert into public.share_options (kind, ref, options) values ('site', 'site', clean)
    on conflict (kind, ref) do update set options = excluded.options, updated_at = now();
  else
    if not public.is_business_owner(p_business) then
      raise exception 'Only the owner can change what is shown on shared cards.' using errcode = '42501';
    end if;
    insert into public.share_options (kind, ref, options) values ('business', p_business::text, clean)
    on conflict (kind, ref) do update set options = excluded.options, updated_at = now();
  end if;
end;
$$;
revoke all on function public.set_share_options(uuid, jsonb) from public, anon;
grant execute on function public.set_share_options(uuid, jsonb) to authenticated;

-- 3. Read: anyone, but a business's options only while it is active; null when nothing is saved
create or replace function public.get_share_options(p_business uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select o.options
    from public.share_options o
   where (p_business is null and o.kind = 'site' and o.ref = 'site')
      or (p_business is not null and o.kind = 'business' and o.ref = p_business::text
          and (exists (select 1 from public.businesses b where b.id = p_business and b.status = 'active')
               or public.is_business_member(p_business)));
$$;
grant execute on function public.get_share_options(uuid) to anon, authenticated;
