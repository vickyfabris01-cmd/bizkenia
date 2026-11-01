-- 20261028100002_webauthn.sql — NEW FILE (Part 7, job B: fingerprint / device-biometrics sign-in)
-- AIM: stores what the four webauthn-* Edge Functions need.
--   webauthn_credentials  one row per enrolled device (a passkey held by the phone). It holds the PUBLIC key only; the
--                         private key never leaves the phone. A signed-in person can LIST and DELETE their own rows;
--                         nothing else is possible from the browser (rows are created and updated only by the functions,
--                         with the service role).
--   webauthn_challenges   the random value the server hands out before an enrolment or a sign-in. Short-lived (5 minutes)
--                         and SINGLE USE: webauthn_consume_challenge() deletes the row and returns it in one step, so a
--                         replayed or second answer finds nothing. No browser role can touch this table at all.
-- Re-runnable. Never destructive. Run order: after 20261028100001_auth_providers.sql, BEFORE deploying the functions.

-- 1. Enrolled devices ------------------------------------------------------------------------------------------------
create table if not exists public.webauthn_credentials (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  credential_id text not null unique,                       -- base64url, as the phone reports it
  public_key    text not null,                              -- base64url of the COSE public key
  counter       bigint not null default 0,                  -- signature counter (many phones always report 0)
  transports    text[] not null default '{}',               -- e.g. {internal}
  device_label  text not null default 'This device' check (char_length(device_label) between 1 and 60),
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create index if not exists webauthn_credentials_user_idx on public.webauthn_credentials (user_id);

alter table public.webauthn_credentials enable row level security;
-- Start from nothing, then give back only what the account page needs. public_key and counter are never readable.
revoke all on public.webauthn_credentials from public, anon, authenticated;
grant select (id, user_id, credential_id, device_label, transports, created_at, last_used_at) on public.webauthn_credentials to authenticated;
grant delete on public.webauthn_credentials to authenticated;
grant all on public.webauthn_credentials to service_role;

drop policy if exists webauthn_credentials_select_own on public.webauthn_credentials;
create policy webauthn_credentials_select_own on public.webauthn_credentials
  for select to authenticated using (user_id = auth.uid());
drop policy if exists webauthn_credentials_delete_own on public.webauthn_credentials;
create policy webauthn_credentials_delete_own on public.webauthn_credentials
  for delete to authenticated using (user_id = auth.uid());
-- no insert or update policy on purpose: only the service role (the Edge Functions) creates or changes a row.

-- 2. Challenges ------------------------------------------------------------------------------------------------------
create table if not exists public.webauthn_challenges (
  id         uuid primary key default gen_random_uuid(),
  challenge  text not null unique,                          -- base64url random value
  purpose    text not null check (purpose in ('register', 'login')),
  user_id    uuid references auth.users(id) on delete cascade,   -- set for 'register'; null for 'login' (the phone picks the account)
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '5 minutes'
);
create index if not exists webauthn_challenges_expires_idx on public.webauthn_challenges (expires_at);

alter table public.webauthn_challenges enable row level security;
revoke all on public.webauthn_challenges from public, anon, authenticated;
grant all on public.webauthn_challenges to service_role;
-- no policies on purpose: with RLS on and no policy, no browser role can see or change a row.

-- 3. Single-use consume ----------------------------------------------------------------------------------------------
-- Deletes the challenge and tells the caller whether it was valid, in ONE statement, so two answers can never both use it.
-- Valid = exists, same purpose, not expired, and (for 'register') issued to this same user. Only a row that matches every
-- condition is deleted and gives true; anything else gives false and is left alone (old rows are removed by
-- webauthn_purge_challenges below).
create or replace function public.webauthn_consume_challenge(p_challenge text, p_purpose text, p_user uuid default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  delete from public.webauthn_challenges c
   where c.challenge = p_challenge
     and c.purpose = p_purpose
     and c.expires_at > now()
     and (p_purpose = 'login' or c.user_id = p_user)
  returning c.id into v_id;
  return v_id is not null;
end;
$$;
revoke all on function public.webauthn_consume_challenge(text, text, uuid) from public, anon, authenticated;
grant execute on function public.webauthn_consume_challenge(text, text, uuid) to service_role;

-- 4. Clean-up of old challenges (the options functions call this each time they run) -----------------------------------
create or replace function public.webauthn_purge_challenges()
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.webauthn_challenges where expires_at < now() - interval '1 hour';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.webauthn_purge_challenges() from public, anon, authenticated;
grant execute on function public.webauthn_purge_challenges() to service_role;
