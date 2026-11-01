-- 20261028100001_auth_providers.sql — NEW FILE (Part 7, job A: Google sign-in switch)
-- AIM: a platform setting 'auth_providers' = { "google": boolean } decides whether the "Continue with Google" button on the
-- login and sign-up pages is usable. It starts OFF, so nothing changes for visitors until a super admin switches it on in
-- Admin > Settings > Sign-in methods (after Google is set up in Supabase, see the Part 7 report).
-- This switch only controls the BUTTON. It does not turn the provider off inside Supabase Auth.
-- WHO CAN READ: anyone, through auth_providers() (below). WHO CAN WRITE: only a super admin, through the existing
-- platform_settings_admin policy. Every change is written to the audit log by the existing trg_audit_settings trigger.
-- Re-runnable. Does not touch the 'maintenance' row or its trigger.
-- Run order: after 20261027100005_login_attempts.sql; BEFORE deploying the new front-end (the button stays grey until
-- auth_providers() exists).

-- 1. Keep the value clean: only { google: true|false }, whatever is sent. Anything else is dropped; anything that is
--    not the JSON value true counts as false. The row is public so the RPC and a plain select both work for visitors.
create or replace function public.auth_providers_before_write()
returns trigger
language plpgsql set search_path = public as $$
begin
  if new.key = 'auth_providers' then
    new.value := jsonb_build_object('google', coalesce((new.value -> 'google') = 'true'::jsonb, false));
    new.is_public := true;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_auth_providers_before_write on public.platform_settings;
create trigger trg_auth_providers_before_write before insert or update on public.platform_settings
  for each row execute function public.auth_providers_before_write();

-- 2. The row (off). An existing row is left alone, so re-running never switches Google off or on by itself.
insert into public.platform_settings (key, value, is_public)
values ('auth_providers', '{"google": false}'::jsonb, true)
on conflict (key) do nothing;

-- 3. The anon-callable read. Security definer so it works for visitors who are not signed in, with a pinned search_path.
--    It returns only { google }, never any other setting. A missing row reads as off.
create or replace function public.auth_providers()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'google',
    coalesce((select (s.value -> 'google') = 'true'::jsonb from public.platform_settings s where s.key = 'auth_providers'), false)
  );
$$;
revoke all on function public.auth_providers() from public;
grant execute on function public.auth_providers() to anon, authenticated;
