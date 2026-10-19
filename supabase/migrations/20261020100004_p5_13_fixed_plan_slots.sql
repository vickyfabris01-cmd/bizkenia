-- 20261020100004_p5_13_fixed_plan_slots.sql — Phase 5 step 5
-- Subscription plans become a fixed grid instead of free-form rows.
--
--   * plan_durations is a locked lookup: monthly (30 days), quarterly (90), half a year (180), yearly (365).
--   * subscription_plans has exactly one "standard" plan per business type x duration (3 x 4 = 12 slots).
--     The database fills in code, name, period_days and sort from the lookup, so the super admin only ever
--     sets the amount, the description and the on/off switch.
--   * An optional "offer" plan (one per business type) with its own name, a duration from the lookup and an
--     optional start / end date. It is only visible while it is on, priced and inside its dates.
--   * A longer plan (or an offer) can never cost more than the same number of months at the monthly price,
--     so the saving shown to owners is never negative. The monthly price must be set first.
--   * plan_catalog() is the one read the public pages use: all 12 slots (price hidden while a slot is not
--     available) plus any open offer, with the saving worked out from the monthly price.
--   * RESET: the old free-form plans are cleared. One old plan per type and duration is kept so past payments
--     and subscriptions still point at a plan; every price is set to 0 and every slot is switched off. The rest
--     are removed (payments and subscriptions keep their own amount and dates; only the plan link is emptied).
--     The super admin then sets the monthly price first, then the others.

-- The migration itself should not fill the audit log with "plan changed" rows.
do $$
begin
  if exists (select 1 from pg_trigger where tgrelid = 'public.subscription_plans'::regclass and tgname = 'trg_audit_plan') then
    alter table public.subscription_plans disable trigger trg_audit_plan;
  end if;
end $$;

-- ---- 1. the lookup -------------------------------------------------------------------------------------
create table if not exists public.plan_durations (
  code        text primary key,
  label       text not null,
  months      integer not null check (months > 0),
  period_days integer not null unique check (period_days > 0),
  sort        integer not null unique
);

-- Only now (the table exists) can its triggers be dropped; they are put back after the rows are in.
drop trigger if exists trg_plan_durations_locked on public.plan_durations;
drop trigger if exists trg_plan_durations_locked_truncate on public.plan_durations;

insert into public.plan_durations (code, label, months, period_days, sort) values
  ('monthly',     'Monthly',     1,  30, 1),
  ('quarterly',   'Quarterly',   3,  90, 2),
  ('half_yearly', 'Half a year', 6, 180, 3),
  ('yearly',      'Yearly',      12, 365, 4)
on conflict (code) do nothing;

alter table public.plan_durations enable row level security;
drop policy if exists plan_durations_read on public.plan_durations;
create policy plan_durations_read on public.plan_durations for select using (true);
revoke insert, update, delete, truncate on public.plan_durations from anon, authenticated;
grant select on public.plan_durations to anon, authenticated;

create or replace function public.plan_durations_locked() returns trigger
language plpgsql as $$
begin
  raise exception 'The plan durations are fixed (monthly, quarterly, half a year, yearly) and cannot be changed.';
end $$;
create trigger trg_plan_durations_locked before insert or update or delete on public.plan_durations
  for each statement execute function public.plan_durations_locked();
create trigger trg_plan_durations_locked_truncate before truncate on public.plan_durations
  for each statement execute function public.plan_durations_locked();

-- ---- 2. new columns on subscription_plans ----------------------------------------------------------------
alter table public.subscription_plans
  add column if not exists kind            text not null default 'standard',
  add column if not exists duration_code   text references public.plan_durations(code),
  add column if not exists offer_starts_on date,
  add column if not exists offer_ends_on   date;

-- ---- 3. the reset ----------------------------------------------------------------------------------------
-- Keep one old plan per (type, duration) as that slot; remove every other old plan.
with ranked as (
  select sp.id, d.code,
         row_number() over (partition by sp.business_type, d.code order by sp.created_at, sp.id) as rn
    from public.subscription_plans sp
    join public.plan_durations d on d.period_days = sp.period_days
)
update public.subscription_plans sp
   set duration_code = r.code, kind = 'standard'
  from ranked r
 where r.id = sp.id and r.rn = 1;

delete from public.subscription_plans where duration_code is null;

-- Every price back to nothing, every plan off.
update public.subscription_plans set price_kes = 0, is_active = false, description = null;

alter table public.subscription_plans alter column duration_code set not null;

alter table public.subscription_plans
  drop constraint if exists plans_kind_chk,
  drop constraint if exists plans_active_has_price_chk,
  drop constraint if exists plans_offer_dates_chk;
alter table public.subscription_plans
  add constraint plans_kind_chk             check (kind in ('standard', 'offer')),
  add constraint plans_active_has_price_chk check (not is_active or price_kes > 0),
  add constraint plans_offer_dates_chk      check (kind = 'offer' or (offer_starts_on is null and offer_ends_on is null));

create unique index if not exists subscription_plans_slot_uidx  on public.subscription_plans (business_type, duration_code) where kind = 'standard';
create unique index if not exists subscription_plans_offer_uidx on public.subscription_plans (business_type) where kind = 'offer';

-- Move every code out of the way first so the rename below can never clash.
update public.subscription_plans set code = 'tmp_' || id::text;

-- ---- 4. helpers and the two guards ----------------------------------------------------------------------
create or replace function public._plan_type_label(p_type text) returns text
language sql immutable as $$
  select case p_type when 'rental' then 'Rental' when 'agriculture' then 'Agriculture' when 'shop' then 'Shop' else initcap(p_type) end;
$$;

-- On sale = switched on, priced, and (for an offer) inside its dates. Dates are Nairobi dates.
create or replace function public._plan_open(p_active boolean, p_price integer, p_kind text, p_starts date, p_ends date)
returns boolean language sql stable as $$
  select coalesce(p_active, false) and coalesce(p_price, 0) > 0 and (
    p_kind = 'standard' or (
      (p_starts is null or p_starts <= (now() at time zone 'Africa/Nairobi')::date) and
      (p_ends   is null or p_ends   >= (now() at time zone 'Africa/Nairobi')::date)));
$$;

create or replace function public.plan_is_available(p_plan uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select _plan_open(is_active, price_kes, kind, offer_starts_on, offer_ends_on)
                     from subscription_plans where id = p_plan), false);
$$;
grant execute on function public.plan_is_available(uuid) to anon, authenticated, service_role;

create or replace function public.plans_enforce_shape() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d         plan_durations;
  v_monthly integer;
begin
  select * into d from plan_durations where code = new.duration_code;
  if d.code is null then
    raise exception 'Choose one of the fixed durations: monthly, quarterly, half a year or yearly.';
  end if;

  if tg_op = 'UPDATE' then
    if new.business_type is distinct from old.business_type or new.kind is distinct from old.kind then
      raise exception 'The business type and kind of a plan cannot be changed.';
    end if;
    if new.kind = 'standard' and new.duration_code is distinct from old.duration_code then
      raise exception 'The duration of a standard plan cannot be changed.';
    end if;
  end if;

  new.period_days := d.period_days;
  if new.kind = 'standard' then
    new.code            := new.business_type || '_' || d.code;
    new.name            := _plan_type_label(new.business_type) || ', ' || lower(d.label);
    new.sort            := d.sort;
    new.offer_starts_on := null;
    new.offer_ends_on   := null;
  else
    new.code := new.business_type || '_offer';
    new.name := coalesce(nullif(trim(new.name), ''), _plan_type_label(new.business_type) || ' offer');
    new.sort := 0;
    if new.offer_starts_on is not null and new.offer_ends_on is not null and new.offer_ends_on < new.offer_starts_on then
      raise exception 'The offer cannot end before it starts.';
    end if;
  end if;

  -- Longer plans and offers are measured against the monthly price of the same business type.
  if new.price_kes > 0 and (new.kind = 'offer' or d.code <> 'monthly') then
    select price_kes into v_monthly from subscription_plans
     where business_type = new.business_type and kind = 'standard' and duration_code = 'monthly';
    if coalesce(v_monthly, 0) <= 0 then
      raise exception 'Set the monthly price for % first. The other prices are checked against it.', lower(_plan_type_label(new.business_type));
    end if;
    if new.price_kes > d.months * v_monthly then
      raise exception 'This price is higher than % month(s) at the monthly price (KSh %). A longer plan must save the owner money.',
        d.months, d.months * v_monthly;
    end if;
  end if;

  -- Lowering the monthly price must not make a longer plan or the offer more expensive than its months.
  if tg_op = 'UPDATE' and new.kind = 'standard' and d.code = 'monthly' and new.price_kes < old.price_kes then
    if exists (select 1 from subscription_plans p join plan_durations pd on pd.code = p.duration_code
                where p.business_type = new.business_type and p.id <> new.id
                  and p.price_kes > 0 and p.price_kes > pd.months * new.price_kes) then
      raise exception 'A longer plan or the offer would cost more than its months at this monthly price. Lower those prices first.';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_plans_shape on public.subscription_plans;
create trigger trg_plans_shape before insert or update on public.subscription_plans
  for each row execute function public.plans_enforce_shape();

create or replace function public.plans_no_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'Plans cannot be deleted. Switch the plan off instead.';
end $$;
drop trigger if exists trg_plans_no_delete on public.subscription_plans;
create trigger trg_plans_no_delete before delete on public.subscription_plans
  for each row execute function public.plans_no_delete();

-- ---- 5. make sure all 12 slots exist, and normalise the kept rows ---------------------------------------
insert into public.subscription_plans (business_type, duration_code, kind, price_kes, is_active)
select t.business_type, d.code, 'standard', 0, false
  from (values ('rental'), ('agriculture'), ('shop')) as t(business_type)
 cross join public.plan_durations d
 where not exists (select 1 from public.subscription_plans p
                    where p.business_type = t.business_type and p.duration_code = d.code and p.kind = 'standard');

-- Fires the guard on every row: sets code, name, period_days and sort from the lookup.
update public.subscription_plans set price_kes = price_kes;

-- ---- 6. who can read what ------------------------------------------------------------------------------
drop policy if exists plans_read on public.subscription_plans;
create policy plans_read on public.subscription_plans for select
  using (public._plan_open(is_active, price_kes, kind, offer_starts_on, offer_ends_on) or public.is_super_admin());

-- ---- 7. the catalogue the public pages read --------------------------------------------------------------
-- One row per slot (12) plus any open offer. A slot that is not on sale comes back with available = false and
-- no price. Savings are worked out here from the monthly price of the same business type, never stored.
create or replace function public.plan_catalog()
returns table (
  id uuid, business_type text, kind text, duration_code text, duration_label text, months integer, period_days integer,
  name text, description text, available boolean, price_kes integer, monthly_price_kes integer, full_price_kes integer,
  saving_kes integer, saving_percent integer, offer_ends_on date)
language sql stable security definer set search_path = public as $$
  with plans_x as (
    select p.*, d.label as d_label, d.months as d_months,
           public._plan_open(p.is_active, p.price_kes, p.kind, p.offer_starts_on, p.offer_ends_on) as is_open
      from subscription_plans p
      join plan_durations d on d.code = p.duration_code
  ), monthly as (
    select x.business_type, x.price_kes
      from plans_x x
     where x.kind = 'standard' and x.duration_code = 'monthly' and x.is_open
  )
  select o.id, o.business_type, o.kind, o.duration_code, o.d_label, o.d_months, o.period_days,
         o.name, o.description,
         o.is_open,
         case when o.is_open then o.price_kes end,
         m.price_kes,
         m.price_kes * o.d_months,
         case when o.is_open and m.price_kes is not null
              then greatest(0, m.price_kes * o.d_months - o.price_kes) end,
         case when o.is_open and m.price_kes is not null
              then greatest(0, round(100.0 * (m.price_kes * o.d_months - o.price_kes) / (m.price_kes * o.d_months))::integer) end,
         o.offer_ends_on
    from plans_x o
    left join monthly m on m.business_type = o.business_type
   where o.kind = 'standard' or o.is_open
   order by o.business_type, o.sort, o.created_at;
$$;
revoke all on function public.plan_catalog() from public;
grant execute on function public.plan_catalog() to anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_trigger where tgrelid = 'public.subscription_plans'::regclass and tgname = 'trg_audit_plan') then
    alter table public.subscription_plans enable trigger trg_audit_plan;
  end if;
end $$;