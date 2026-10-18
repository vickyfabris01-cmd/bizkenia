-- supabase/migrations/20261016100001_p4_01_farm_core.sql — NEW FILE
-- Phase 4: the core farm tables. Fields (with a boundary drawn on a map), crops, the work done on
-- a crop, and harvests. New tables use business_id. Row-level security is added in p4_04.

create table if not exists farm_fields (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  area_ha numeric(12,4) not null default 0 check (area_ha >= 0),
  boundary jsonb,                       -- GeoJSON Polygon geometry, or null if not drawn yet
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_farm_field_name on farm_fields (business_id, lower(name));

create table if not exists crops (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  field_id uuid not null references farm_fields(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  variety text,
  status text not null default 'planned' check (status in ('planned','planted','growing','harvested')),
  area_ha numeric(12,4) check (area_ha is null or area_ha >= 0),
  planned_date date,
  planted_date date,
  expected_harvest date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_crops_field on crops (field_id);
create index if not exists idx_crops_business_status on crops (business_id, status);

create table if not exists crop_activities (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  crop_id uuid not null references crops(id) on delete cascade,
  kind text not null check (kind in ('planting','fertilising','spraying','watering','weeding','other')),
  activity_date date not null default current_date,
  quantity numeric check (quantity is null or quantity >= 0),
  unit text,
  notes text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_crop_activities_crop on crop_activities (crop_id, activity_date desc);

create table if not exists harvests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  crop_id uuid not null references crops(id) on delete cascade,
  harvest_date date not null default current_date,
  quantity_kg numeric not null check (quantity_kg > 0),
  notes text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_harvests_crop on harvests (crop_id, harvest_date desc);
create index if not exists idx_harvests_business_date on harvests (business_id, harvest_date desc);

-- Keep updated_at honest
create or replace function farm_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_farm_fields_touch on farm_fields;
create trigger trg_farm_fields_touch before update on farm_fields for each row execute function farm_touch_updated_at();
drop trigger if exists trg_crops_touch on crops;
create trigger trg_crops_touch before update on crops for each row execute function farm_touch_updated_at();
