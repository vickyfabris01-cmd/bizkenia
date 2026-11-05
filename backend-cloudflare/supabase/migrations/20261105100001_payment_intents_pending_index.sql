-- supabase/migrations/20261105100001_payment_intents_pending_index.sql — NEW FILE
-- AIM: makes the 10-minute payment check (worker/v1/mpesa.js reconcile) nearly free. It looks only at prompts that are
-- still "pending"; this small partial index holds just those rows, so an idle site costs one tiny index read per run.
-- Re-runnable. Read-only for data: it adds an index and nothing else.
create index if not exists payment_intents_pending_idx
  on public.payment_intents (created_at)
  where status = 'pending' and method = 'mpesa_stk';
