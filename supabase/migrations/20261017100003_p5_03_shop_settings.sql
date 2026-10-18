-- supabase/migrations/20261017100003_p5_03_shop_settings.sql — NEW FILE
-- Phase 5 (shop), part 3: how a shop delivers and takes payment. One row per shop business,
-- created the first time the owner saves the shop settings.

create table if not exists shop_settings (
  business_id uuid primary key references businesses(id) on delete cascade,
  delivery_enabled boolean not null default true,
  delivery_fee numeric not null default 0 check (delivery_fee >= 0),
  free_delivery_over numeric check (free_delivery_over is null or free_delivery_over > 0),
  pickup_enabled boolean not null default false,
  pickup_address text,
  pay_on_delivery boolean not null default false,   -- off by default: it changes how stock and orders behave
  delivery_note text,
  updated_at timestamptz not null default now(),
  check (delivery_enabled or pickup_enabled)
);
drop trigger if exists trg_shop_settings_touch on shop_settings;
create trigger trg_shop_settings_touch before update on shop_settings for each row execute function shop_touch_updated_at();
