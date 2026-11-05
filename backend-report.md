# Backend report: BizKenia Cloudflare backend (Steps 1 to 5)

Base: repo commit `e6b67ddf77e777a324e7c7c2e0cae85a2275a8a0` **plus Part 1 (maintenance levels) applied first**.
`src/lib/mpesa.js` is in both zips; the backend copy already contains the Part 1 changes, so unzip Part 1, then this zip (`unzip -o`).
Deliverable: `backend-cloudflare.zip` (27 files, repo paths, LF endings, no emoji, no secrets). Full guide inside: `docs/BACKEND.md`.

## What it does
Extends the existing `bizkenia` Worker with `/api/v1/*` and cron timers. Supabase keeps the database and sign-in; R2 is untouched.

| Step | Built | Replaces |
|---|---|---|
| 1 Foundation | router, one error shape, origin allowlist, health route (detailed with a secret), per-route limits | none |
| 2 Cached public reads | businesses, home, market, counties, plans, stats; 60 s edge cache; safe inputs | direct reads (when switched on) |
| 3 M-Pesa | stk-push (maintenance guard kept, fails closed), callback, status | 3 Edge Functions |
| 4 Cron | reconcile every 10 min (one cheap read when idle), purge daily 02:00 UTC | old `mpesa-reconcile` cron, pg_cron purge |
| 5 The rest | resolve-login, send-email, delete-business, delete-account, sitemap | 5 Edge Functions |

Frontend: `src/lib/backend.js` routes each function to the Worker or to Supabase by a setting; five call sites changed by one word each.
With no setting, behaviour is exactly as before.

## Files
NEW: `worker/v1/{http,supabase,router,mpesa,public,login,email,lifecycle,sitemap,cron}.js`, `worker/v1.test.mjs`, `worker/.dev.vars.example`,
`src/lib/backend.js`, `src/lib/cache.js`, `supabase/migrations/20261105100001_payment_intents_pending_index.sql`, `docs/BACKEND.md`.
MODIFIED: `worker/entry.js`, `wrangler.jsonc`, `package.json` (test script), `.gitignore` (+ `.dev.vars`), `src/lib/mpesa.js`, `src/lib/api/{directory,market,lifecycle,rental,storefront}.js`, `src/store/sessionStore.js`.

## What YOU must fill in (every one is marked with a comment where it is used)
| Name | Kind | Where to get it |
|---|---|---|
| `PUBLIC_BASE_URL`, `SITE_URL` | var in `wrangler.jsonc` (placeholder `https://YOUR-LIVE-SITE-ADDRESS`) | your live site address |
| `MAIL_FROM` | var | an address on a domain verified in Resend (optional at first) |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | Supabase > Project Settings > API > service_role |
| `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY` | secret | Daraja portal (sandbox first) |
| `MPESA_CALLBACK_SECRET`, `CRON_SECRET` | secret | invent two NEW random texts, 32+ characters |
| `RESEND_API_KEY` | secret (optional) | resend.com > API Keys |
| `VITE_BACKEND_FUNCTIONS`, `VITE_BACKEND_PUBLIC` | build variables in Cloudflare | see go-live order in `docs/BACKEND.md` |
Secrets are set with `npx wrangler secret put NAME`. Local testing: copy `worker/.dev.vars.example` to `.dev.vars`.

## Deploy
1. Run the migration (one small index; re-runnable). 2. Fill vars, set secrets, push to GitHub. 3. Check `/api/v1/health`.
4. Switch features on one at a time (public reads, then M-Pesa in sandbox, then the rest). 5. Stop the old Supabase timers, later delete the old Edge Functions.
Exact order and checks: `docs/BACKEND.md`.

## Rollback
Remove a name from `VITE_BACKEND_FUNCTIONS` or `VITE_BACKEND_PUBLIC` and redeploy: that part goes back to Supabase. `RECONCILE_ENABLED="false"` stops the timer at once.
Old Edge Functions stay deployed until you delete them.

## Tested (and not)
- `npm run test:worker`: 40 pass (7 existing file tests + 33 new). Fakes for Supabase and Safaricom. Covers: callback secret and amount-mismatch, idempotent callback,
  maintenance levels 4 and 5 and fail-closed, DB-side amount, per-shop shortcode, flood limit, ownership checks, status privacy, reconcile (idle = no Safaricom call,
  batch cap, timeout, cancel), cache hit with zero DB calls and no caching of failures, login same-answer and rate limit, email permissions, delete flows (R2 folder only), purge batch, sitemap, CORS.
- Worker ran in the real Workers runtime (`wrangler dev`, local): health, 404 shape, sitemap, callback 403, detailed health. `wrangler deploy --dry-run` accepted the config and cron triggers.
- Frontend builds; `npm run check:budget` passes. Browser check with the switches on: lists come from the Worker; with the Worker answering 500 they fall back to Supabase.
- **NOT tested:** against a real Supabase project, real Daraja (sandbox or live), real Resend, real R2 on Cloudflare; the PostgREST `or=(...ilike.*x*)` search string was checked only against my fake.
  `npm run lint` is broken at base (pre-existing) and was not run; `npm run test:e2e` was not run.

## Assumptions and honest limits
- Reconcile uses Daraja's STK Push Query (`/mpesa/stkpushquery/v1/query`); its answer shape (`ResultCode` as text, "being processed" as an error answer) is from documentation, not a live call. Test it in the sandbox.
- A payment confirmed by reconcile has no receipt number or amount check (the query does not return them). Fill the receipt from the M-Pesa message if needed.
- The repo never contained `mpesa-reconcile`; this is a new, deliberately cheap design (10 minutes, 6 per run, prompts 3 to 60 minutes old, partial index).
- Free plan: 50 outbound requests per run is why batches are small; 100k requests per day overall.
- Rate limits in login and deletes are in-memory (best effort). Add a Cloudflare rate-limiting rule for a hard limit.
- Departures from the earlier plan: written in JavaScript like the existing Worker (no build step); I did not add the combined `home_overview` database function or drop the exact count on home, because the edge cache makes both unnecessary for now.
- User identity is checked by asking Supabase Auth on every call (one extra round trip, same as the Edge Functions did); local token verification was left out on purpose.
- Existing `/api/files`, share and admin-stats routes are unchanged.
