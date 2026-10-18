-- Phase 1 / 02 — platform settings, subscription plans, payment records.

create table public.platform_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  is_public  boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.platform_settings enable row level security;
create policy platform_settings_read on public.platform_settings for select
  using (is_public or public.is_super_admin());
create policy platform_settings_admin on public.platform_settings for all
  using (public.is_super_admin()) with check (public.is_super_admin());

insert into public.platform_settings (key, value, is_public) values
  ('brand',   '{"name":"BizKenia","tagline":"Manage and grow your business","support_email":"support@fabrentals.co.ke","website":"https://fabrentals.co.ke"}', true),
  ('modules', '{"rental":true,"agriculture":false,"shop":false}', true),
  ('approval','{"mode":"manual"}', false),
  ('mpesa',   '{"env":"sandbox","shortcode":"174379"}', false);

create table public.subscription_plans (
  id            uuid primary key default gen_random_uuid(),
  business_type text not null check (business_type in ('rental','agriculture','shop')),
  code          text not null unique,
  name          text not null,
  description   text,
  price_kes     integer not null check (price_kes >= 0),
  period_days   integer not null default 30 check (period_days > 0),
  is_active     boolean not null default true,
  sort          integer not null default 0,
  created_at    timestamptz not null default now()
);
alter table public.subscription_plans enable row level security;
create policy plans_read on public.subscription_plans for select using (is_active or public.is_super_admin());
create policy plans_admin on public.subscription_plans for all
  using (public.is_super_admin()) with check (public.is_super_admin());

insert into public.subscription_plans (business_type, code, name, description, price_kes, period_days, sort) values
  ('rental', 'rental_monthly',   'Rental, monthly',   'Everything for one rental business, billed every month.', 1500, 30, 1),
  ('rental', 'rental_quarterly', 'Rental, 3 months',  'Three months of the rental plan at a lower price.',       4000, 90, 2);

create table public.payment_intents (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  business_id          uuid references public.businesses(id) on delete set null,
  plan_id              uuid references public.subscription_plans(id) on delete set null,
  purpose              text not null default 'subscription',
  method               text not null default 'mpesa_stk' check (method in ('mpesa_stk','manual')),
  amount_kes           integer not null check (amount_kes >= 0),
  phone                text,
  status               text not null default 'pending'
                       check (status in ('pending','success','failed','cancelled','timeout')),
  checkout_request_id  text unique,
  merchant_request_id  text,
  mpesa_receipt        text,
  result_code          integer,
  result_desc          text,
  note                 text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index payment_intents_user_idx on public.payment_intents (user_id, created_at desc);
create index payment_intents_business_idx on public.payment_intents (business_id);
alter table public.payment_intents enable row level security;
create policy intents_select on public.payment_intents for select
  using (user_id = auth.uid() or public.is_super_admin());
-- writes: edge functions (service role) and the admin functions only.

create table public.business_subscriptions (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses(id) on delete cascade,
  plan_id           uuid references public.subscription_plans(id) on delete set null,
  payment_intent_id uuid references public.payment_intents(id) on delete set null,
  status            text not null default 'active' check (status in ('active','expired')),
  amount_kes        integer not null default 0,
  period_start      timestamptz not null default now(),
  period_end        timestamptz not null,
  created_at        timestamptz not null default now()
);
create index business_subscriptions_business_idx on public.business_subscriptions (business_id);
alter table public.business_subscriptions enable row level security;
create policy subs_select on public.business_subscriptions for select
  using (public.is_business_member(business_id) or public.is_super_admin());

create trigger trg_platform_settings_updated before update on public.platform_settings
  for each row execute function public.set_updated_at();
create trigger trg_payment_intents_updated before update on public.payment_intents
  for each row execute function public.set_updated_at();
