-- Phase 1 / 04 — the old status check only allowed pending/active/suspended and blocks the new statuses.
alter table public.businesses drop constraint if exists tenants_status_check;
