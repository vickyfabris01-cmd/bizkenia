-- 20261027100004_payment_reconcile.sql — NEW FILE (Part 3, payment hardening)
-- AIM: lets mpesa-reconcile find pending M-Pesa payments whose callback never arrived. It records when each
-- payment was last checked with Safaricom and how many times, and indexes the "still pending, oldest first" lookup.
-- Re-runnable. No new table, no policy and no grant change, so no RLS test is needed.
-- Run order: after 20261027100001_share_options.sql (any time before mpesa-reconcile is scheduled).
alter table public.payment_intents add column if not exists last_checked_at timestamptz;
alter table public.payment_intents add column if not exists check_count integer not null default 0;
create index if not exists payment_intents_status_created_idx on public.payment_intents (status, created_at);
