-- Phase 1 / 05 — notification types used by onboarding and approval.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type = any (array[
  'billing','payment','complaint','announcement','system','invite','transfer',
  'business_submitted','business_to_review','business_approved','business_rejected','business_suspended']));
