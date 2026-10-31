-- supabase/migrations/20261027100003_maintenance_levels.sql — NEW FILE
-- Maintenance levels: replaces the single { enabled, message } flag with one config object under the
-- existing platform_settings key 'maintenance':
--   { system, allDashboards, types[], pages[], payments, businesses[], message, updated_at }
--     system         level 1  whole site (only a super admin can navigate)
--     allDashboards  level 2  everything under /app
--     types          level 3  business types whose dashboards are down: rental | agriculture | shop
--     payments       level 4  every M-Pesa STK prompt is blocked (enforced in mpesa-stk-push)
--     businesses     level 5  business ids whose subscription STK prompts are blocked (same function)
--     pages          page keys (router/routes.js) that show the maintenance page
-- Safe to run twice. Nothing is dropped. Old rows { enabled, message } are converted once (enabled -> system).
--
-- WHO CAN WRITE: only a super admin, through the existing platform_settings_admin policy. Every change
-- is written to audit_log by the existing trg_audit_settings trigger (action 'setting.update', entity_id 'maintenance').
-- WHO CAN READ: everyone, through get_maintenance() (anon and authenticated). The row itself is also public, as before.

-- 1. One function that turns any jsonb into a valid, complete config (unknown keys dropped, bad values ignored).
--    A legacy { enabled: true } becomes system = true. updated_at is NOT touched here.
create or replace function public.maintenance_normalize(p_value jsonb)
returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  v         jsonb := case when jsonb_typeof(p_value) = 'object' then p_value else '{}'::jsonb end;
  v_system  boolean;
  v_dash    boolean;
  v_pay     boolean;
  v_types   jsonb;
  v_pages   jsonb;
  v_biz     jsonb;
  v_message text;
begin
  v_system := coalesce(
    case when jsonb_typeof(v -> 'system') = 'boolean' then (v ->> 'system')::boolean end,
    case when jsonb_typeof(v -> 'enabled') = 'boolean' then (v ->> 'enabled')::boolean end,
    false);
  v_dash := coalesce(case when jsonb_typeof(v -> 'allDashboards') = 'boolean' then (v ->> 'allDashboards')::boolean end, false);
  v_pay  := coalesce(case when jsonb_typeof(v -> 'payments') = 'boolean' then (v ->> 'payments')::boolean end, false);

  select coalesce(jsonb_agg(t order by t), '[]'::jsonb) into v_types
    from (select distinct x as t
            from jsonb_array_elements_text(case when jsonb_typeof(v -> 'types') = 'array' then v -> 'types' else '[]'::jsonb end) x
           where x in ('rental', 'agriculture', 'shop')) s;

  select coalesce(jsonb_agg(t order by t), '[]'::jsonb) into v_pages
    from (select distinct x as t
            from jsonb_array_elements_text(case when jsonb_typeof(v -> 'pages') = 'array' then v -> 'pages' else '[]'::jsonb end) x
           where x ~ '^[a-z0-9-]{1,60}$'
           limit 200) s;

  select coalesce(jsonb_agg(t order by t), '[]'::jsonb) into v_biz
    from (select distinct lower(x) as t
            from jsonb_array_elements_text(case when jsonb_typeof(v -> 'businesses') = 'array' then v -> 'businesses' else '[]'::jsonb end) x
           where x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           limit 500) s;

  v_message := left(btrim(coalesce(case when jsonb_typeof(v -> 'message') = 'string' then v ->> 'message' end, '')), 300);

  return jsonb_build_object(
    'system', v_system, 'allDashboards', v_dash, 'types', v_types, 'pages', v_pages,
    'payments', v_pay, 'businesses', v_biz, 'message', v_message);
end;
$$;
revoke all on function public.maintenance_normalize(jsonb) from public, anon;
grant execute on function public.maintenance_normalize(jsonb) to authenticated, service_role;

-- 2. Every write to the 'maintenance' row is normalised, and updated_at moves only when the settings
--    really changed (so the dismissed banner comes back when something changed, not on a repeat save).
--    clock_timestamp(), not now(): two saves in one transaction must still differ.
create or replace function public.maintenance_before_write()
returns trigger
language plpgsql set search_path = public as $$
declare
  v_norm jsonb;
  v_ts   text := to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
begin
  if new.key = 'maintenance' then
    v_norm := public.maintenance_normalize(new.value);
    if tg_op = 'UPDATE' and public.maintenance_normalize(old.value) = v_norm and old.value ->> 'updated_at' is not null then
      new.value := v_norm || jsonb_build_object('updated_at', old.value ->> 'updated_at');
    else
      new.value := v_norm || jsonb_build_object('updated_at', v_ts);
    end if;
    new.is_public := true;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_maintenance_before_write on public.platform_settings;
create trigger trg_maintenance_before_write before insert or update on public.platform_settings
  for each row execute function public.maintenance_before_write();

-- 3. The row exists (p5_07 created it) and is converted from the old shape once.
insert into public.platform_settings (key, value, is_public)
values ('maintenance', '{}'::jsonb, true)
on conflict (key) do nothing;

-- A no-op update fires the trigger above, which rewrites the old { enabled, message } into the new shape.
-- (This writes one audit entry with no actor; a second run finds the new shape and does nothing.)
update public.platform_settings
   set value = value
 where key = 'maintenance'
   and not (value ? 'system');

-- 4. The anon-callable read. Security definer so it works for visitors with no sign-in, with a pinned
--    search_path. It returns only the maintenance object, never any other setting.
create or replace function public.get_maintenance()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select public.maintenance_normalize(s.value) || jsonb_build_object('updated_at', s.value ->> 'updated_at')
       from public.platform_settings s where s.key = 'maintenance'),
    public.maintenance_normalize('{}'::jsonb) || jsonb_build_object('updated_at', null)
  );
$$;
revoke all on function public.get_maintenance() from public;
grant execute on function public.get_maintenance() to anon, authenticated;
