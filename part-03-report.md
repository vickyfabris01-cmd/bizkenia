# Part 3 report: payment hardening (BizKenia)

## Base
- Base commit: `e6b67ddf77e777a324e7c7c2e0cae85a2275a8a0` ("share rework"), the head of `main` when I cloned.
- The brief still said `<PASTE HASH>`, so I used the current head. If you meant a different commit, tell me and I will redo the diff against it. I did not rebase anything.

## Files
NEW
- `supabase/functions/_shared/daraja.ts`
- `supabase/functions/mpesa-reconcile/index.ts`
- `supabase/migrations/20261027100004_payment_reconcile.sql`

MODIFIED
- `supabase/functions/mpesa-callback/index.ts` (+17 / -3)

Deleted or moved: none, so no `git rm` / `git mv` commands.
Not touched: `mpesa-stk-push`, the sharing files, `config.toml`, `package.json`.

## What changed in the modified file (`mpesa-callback/index.ts`)
Other parts should not need this file. If one does, these are the only places I changed:
- New import: `logError` from `../_shared/daraja.ts`.
- `paid` is now NaN unless `Amount` is a number or a non-empty string. Before, `Number(null)` and `Number("")` gave 0, which would have marked a real payment as an amount mismatch.
- New guard at the top of the `ResultCode === 0` branch: if `paid` is not finite, log, set `payment_intents.note`, leave the intent pending, return Accepted. The old mismatch check is unchanged.
- The `mark_intent_paid` result is now checked. On error: log, leave pending, still return Accepted.

## Migration and run order
1. `20261027100004_payment_reconcile.sql`: adds `last_checked_at timestamptz` and `check_count integer not null default 0` to `payment_intents`, plus index `payment_intents_status_created_idx` on `(status, created_at)`. Re-runnable (`if not exists`). No new table, policy or grant, so no `supabase/tests` file. It does not depend on the other parts' migrations (2 and 3 of the 20261027 series).
2. Run it on a scratch Supabase project first, never production first.

## Deploy steps, in order
1. Run the migration (scratch, then production).
2. `supabase functions deploy mpesa-callback`
3. `supabase functions deploy mpesa-reconcile --no-verify-jwt` (a scheduler calls it, not a browser; it is protected by the secret header).
4. Make sure the `CRON_SECRET` secret exists (it is the one `purge-closed-businesses` already uses).
5. Test once by hand: `curl -X POST -H "x-cron-secret: YOUR_CRON_SECRET" https://YOUR-PROJECT-REF.supabase.co/functions/v1/mpesa-reconcile`. Expect JSON like `{"checked":0,"paid":0,"cancelled":0,"failed":0,"pending":0,"skipped":0,"errors":0}`.
6. Schedule it (below).

## Scheduling mpesa-reconcile every 2 minutes
Same pattern as the daily purge in `docs/phase-6/STEP-1.md`. In the SQL editor, replace the project reference and the secret:
```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('bizkenia-mpesa-reconcile', '*/2 * * * *', $$
  select net.http_post(
    url     := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/mpesa-reconcile',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR_CRON_SECRET'),
    body    := '{}'::jsonb);
$$);
```
Check it is running: `select * from cron.job_run_details order by start_time desc limit 5;`. Stop it: `select cron.unschedule('bizkenia-mpesa-reconcile');`.
A lost callback is therefore settled 2 to 4 minutes after the prompt.

## New env vars
None. `mpesa-reconcile` uses the existing `CRON_SECRET`, `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY`, optional `MPESA_SHORTCODE`, plus `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

## How mpesa-reconcile behaves
- Refuses unless `x-cron-secret` matches `CRON_SECRET` (constant-time compare; with no secret set every call gets 403). POST only.
- Picks intents with `status = pending`, `method = mpesa_stk`, a `checkout_request_id`, created more than 2 minutes and less than 24 hours ago, not checked in the last 90 seconds. At most 50 per run, never-checked first, then oldest first. Five are queried in parallel, each Safaricom call times out after 10 seconds.
- Each intent is claimed first (`last_checked_at` and `check_count` updated under a still-pending condition), so two overlapping runs cannot handle the same payment.
- Credentials follow `mpesa-stk-push`. The intent table is `payment_intents` (read from `mark_intent_paid` in `20261018100002_p5_06_storefront_checkout.sql`).
  - subscription: platform passkey and shortcode (`MPESA_SHORTCODE`, else `platform_settings.mpesa.shortcode`, else 174379).
  - rent: the business's own `tenant_settings.mpesa_shortcode` and `tenant_secrets.mpesa_passkey`; without them the intent is skipped.
  - order: the shop's own when both are saved, otherwise the platform's, sandbox only; skipped in live.
- Result handling: ResultCode 0 calls `mark_intent_paid` and checks its error; 1032 marks `cancelled` (same as the callback); any other ResultCode marks `failed`; 4999 and "being processed" leave it pending; no answer or Daraja error logs and leaves it pending. Failed and cancelled only apply while the intent is still pending, so a payment the callback just confirmed is never overwritten.
- Errors are logged with `console.error` and also through `log_client_error`, so they appear at `/admin/errors`.

## Assumptions (please confirm)
1. The scheduler secret is `CRON_SECRET` in the `x-cron-secret` header, the repo's existing scheduler pattern, rather than a new variable. Say so if you want a separate `MPESA_RECONCILE_SECRET`.
2. "Existing error logging approach" is `console.error("[function] ...")` as used in `delete-account` and `_shared/storage.ts`, plus the existing `log_client_error` RPC.
3. A callback that arrives without a usable Amount is flagged by leaving it pending and writing `payment_intents.note`; reconcile picks it up because it is pending. `result_desc` is left alone because `mpesa-status` returns it to the browser.
4. Failed payments with ResultCode 1037 (customer did not respond) are marked `failed`, as the callback does, not `timeout`.
5. `same()` (constant-time compare) is copied into `mpesa-reconcile` rather than moved, so the callback needed no refactor.

## Known limits
- Daraja's STK Push Query returns no amount, so a payment confirmed by reconcile is trusted at the amount we asked for. Only the callback can compare the paid amount.
- It returns no receipt number either, so `mark_intent_paid` is called with a null receipt for reconciled payments.
- Existing behaviour, unchanged: `mark_intent_paid` only skips an intent that is already `success`, so a genuine late callback can still turn a `failed` or `cancelled` intent into paid.
- `npm run lint` does not work on this repo at the base commit: the script passes `--ext`, which ESLint's flat config rejects. I did not touch it.

## Tests
Not run against the real Daraja sandbox: `sandbox.safaricom.co.ke` is not reachable from the environment I work in. In its place I ran the real function code under Deno 2.9 with a faked Supabase client and a faked Safaricom, and `deno check` on all four Deno files (including `mpesa-stk-push`, untouched). These scratch tests are not in the zip.

Callback (fake DB and RPC):
```
PASS ResultCode 0 -> paid
PASS 1032 -> cancelled
PASS 1 -> failed
PASS 1037 timeout -> failed
PASS 4999 -> pending
PASS being processed error -> pending
PASS other error -> error
PASS garbage ResultCode -> error
PASS wrong secret refused
PASS good callback marks paid
PASS missing Amount: not paid, still pending, Accepted, logged
PASS non-numeric Amount: not paid, pending
PASS Amount without Value: not paid, pending
PASS Amount null (was 0): not marked failed, pending
PASS no CallbackMetadata: pending
PASS amount mismatch still marked failed (unchanged)
PASS rpc error: left pending, logged, Accepted
PASS 1032 cancelled
PASS 1 failed
```
Reconcile and parser:
```
PASS ResultCode 0 -> paid
PASS 1032 -> cancelled
PASS 1 -> failed
PASS 1037 timeout -> failed
PASS 4999 -> pending
PASS being processed error -> pending
PASS other error -> error
PASS garbage ResultCode -> error
PASS no secret header refused
PASS wrong secret refused
PASS CRON_SECRET unset: fails closed
PASS GET refused
PASS success -> mark_intent_paid, status success
PASS failed -> failed
PASS cancelled -> cancelled
PASS timeout (1037) -> failed
PASS still processing -> stays pending, no error
PASS Daraja error -> pending, error counted, logged
PASS rpc fails -> stays pending, logged
PASS rent with no business credentials -> skipped, never paid
```
Repo checks, run in a fresh clone at `e6b67dd` after `unzip -o` of the zip (`npm ci` first):
```
dist/assets/vendor-supabase-BfONzQwb.js        175.82 kB │ gzip:  46.14 kB
dist/assets/vendor-charts-C08b-oug.js          411.24 kB │ gzip: 110.81 kB
✓ built in 13.21s
PASS  First-load JS (gzip): 134.3 KB (limit 200 KB)
PASS  First-load CSS (gzip): 10.4 KB (limit 40 KB)
PASS  Largest chunk vendor-charts-C08b-oug.js (gzip): 108.2 KB (limit 130 KB)
# tests 7
# pass 7
# fail 0
```
`unzip -l` shows 4 files, all with relative paths from the repo root, no wrapper folder. All four files are UTF-8, LF, no BOM, no emoji.

### Daraja sandbox run to do on your scratch project
1. Success with a lost callback: start an STK push in the sandbox, then change `MPESA_CALLBACK_SECRET` so Safaricom's callback gets 403. Complete the prompt. Restore the secret, wait 2 minutes, call mpesa-reconcile with the curl above. Expect `paid: 1`, intent `success`, subscription active.
2. Failed: enter a wrong PIN on the prompt (or let it fail), repeat the same steps. Expect `failed: 1`, intent `failed`. Cancelling the prompt should give `cancelled: 1`.
3. Timeout: do not answer the prompt. After Safaricom gives up (about a minute) run reconcile. Expect `failed: 1` with `result_code` 1037. If Safaricom is still working, expect `pending: 1` and a second run to settle it.
4. Missing Amount: POST to the callback with a success body and no Amount item, using your callback secret:
   `{"Body":{"stkCallback":{"CheckoutRequestID":"<id of a pending intent>","ResultCode":0,"ResultDesc":"ok","CallbackMetadata":{"Item":[{"Name":"MpesaReceiptNumber","Value":"TEST123"}]}}}}`
   Expect `{"ResultCode":0,"ResultDesc":"Accepted"}`, the intent still `pending` with a `note`, and an entry in `/admin/errors`. Then run reconcile and it settles it with Safaricom.

## Rollback
- Unschedule the job: `select cron.unschedule('bizkenia-mpesa-reconcile');`
- Redeploy the previous `mpesa-callback`: `git checkout e6b67dd -- supabase/functions/mpesa-callback/index.ts`, then deploy it. Delete the function if wanted: `supabase functions delete mpesa-reconcile`.
- The migration is additive and safe to leave. To undo it anyway (ask first, it is destructive): `drop index if exists payment_intents_status_created_idx; alter table payment_intents drop column if exists last_checked_at, drop column if exists check_count;`
