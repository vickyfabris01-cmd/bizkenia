# Backend report v2: BizKenia Cloudflare backend, rebased on current `main`

Base: `origin/main` commit `6f39a4171ecbbf40a8999c1801b33c80b8ff5aef` (includes Part 1 and your Parts 2 to 9).
Deliverable: `backend-cloudflare-v2.zip` (25 files, repo paths, `unzip -o` at the project root, LF endings, no emoji, no secrets).
This REPLACES the first zip. Before applying: delete the `backend-cloudflare/` folder and the old `backend-report.md` that were committed. Guide inside the zip: `docs/BACKEND.md`.

## What changed from v1 (because `main` moved)
- Written against the CURRENT Edge Functions, not the old ones. Ported rules: duplicate-tap block and flood limit in stk-push; callback that leaves a success with no usable Amount
  pending and a failed mark-paid pending (both for reconcile); login throttling in the database (`login_throttle_begin/finish`, CF-Connecting-IP only);
  send-email provider-refusal answers (502, `ok:false`); sitemap with rooms and produce; errors logged to `/admin/errors` (`log_client_error`).
- Reconcile now follows your Part 3 Edge Function: pending prompts 2 minutes to 24 hours old, claim by `last_checked_at`/`check_count`, STK Push Query states
  (paid / cancelled / failed / still processing / no answer), credentials per business. It runs from Cloudflare cron every 10 minutes, at most 6 per run.
- Merged, not replaced: `worker/entry.js` and `wrangler.jsonc` keep everything from Part 9 (`/robots.txt`, `/api/admin/storage`, `ASSETS` binding, share, orphans, files).
- No database migration at all (my extra index is dropped: Part 3's `payment_intents_status_created_idx` already covers it).
- Fewer placeholders: `PUBLIC_BASE_URL` and `SITE_URL` are optional (empty = the address the browser used).
- `/sitemap.xml` stays exactly as on `main` until you set `SITEMAP_IN_WORKER = "true"`; compare at `/api/v1/sitemap` first.
- `webauthn-*` functions are NOT moved (they stay on Supabase).

## Files
NEW: `worker/v1/{http,supabase,router,mpesa,public,login,email,lifecycle,sitemap,cron}.js`, `worker/v1.test.mjs`, `worker/.dev.vars.example`, `src/lib/backend.js`, `docs/BACKEND.md`.
MODIFIED: `worker/entry.js`, `wrangler.jsonc`, `package.json` (test script), `.gitignore` (+ `.dev.vars`), `src/lib/mpesa.js`, `src/lib/api/{directory,market,lifecycle,rental,storefront}.js`, `src/store/sessionStore.js`.
(`src/lib/cache.js` is already on `main` and unchanged.)

## What YOU must fill in (each is marked with a comment where it is used)
| Name | Kind | Where to get it |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | secret | Supabase > Project Settings > API > service_role |
| `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY` | secret | Daraja portal (sandbox first) |
| `MPESA_CALLBACK_SECRET`, `CRON_SECRET` | secret | invent two NEW random texts, 32+ characters |
| `RESEND_API_KEY` | secret, optional | resend.com > API Keys |
| `MAIL_FROM` | var, optional | an address on a domain verified in Resend |
| `PUBLIC_BASE_URL`, `SITE_URL` | var, optional | your live site address (empty is fine) |
| `VITE_BACKEND_FUNCTIONS`, `VITE_BACKEND_PUBLIC` | Cloudflare build variables | go-live order in `docs/BACKEND.md` |
Secrets: `npx wrangler secret put NAME`. Local testing: copy `worker/.dev.vars.example` to `.dev.vars`.

## Rollback
Remove a name from `VITE_BACKEND_FUNCTIONS` / turn `VITE_BACKEND_PUBLIC` off and redeploy; `SITEMAP_IN_WORKER="false"`; `RECONCILE_ENABLED="false"`.
Supabase functions stay deployed until you delete them.

## Tested (and not)
- On a fresh extract of `main` + the zip: `npm run test:worker` 65 pass (main's own Worker tests plus 48 new, Supabase and Safaricom faked), `vite build`, `check:budget` pass.
- Real Workers runtime (`wrangler dev`, local): health, detailed health, callback 403, cron 401, `/robots.txt`, `/api/files` 404 shape, SPA page. `wrangler deploy --dry-run` accepts config and cron triggers.
- Browser with the switches on: lists come from the Worker; with the Worker answering 500 they fall back to Supabase.
- NOT tested: real Supabase, real Daraja (sandbox or live, including the STK Query answer shape), real Resend, real R2 on Cloudflare; the PostgREST search filter (`or=(...ilike.*x*)`) only against my fake.
  `npm run lint` and `npm run test:e2e` were not run. The SQL tests for Parts 1 to 9 were not re-run (no database change here).

## Honest limits
- Free plan: 100k Worker requests per day, 50 outbound requests per run: so reconcile 6 per run, purge 8 per day, Worker sitemap capped (1,200 rooms, 1,200 produce, products of 2,500 newest shops).
- A confirmed-by-reconcile payment has no receipt number (the query returns none); it can wait up to about 10 minutes instead of 2.
- Delete-route rate limits are in memory (best effort); sign-in throttling is in the database. For a hard limit on `/api/v1/*` add a Cloudflare rate-limiting rule.
- The Worker still asks Supabase Auth to check the user on every call (as the Edge Functions did); no local token verification.
