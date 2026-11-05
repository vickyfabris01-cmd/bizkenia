<!-- docs/BACKEND.md — NEW FILE -->
# BizKenia backend on Cloudflare (the /api/v1 Worker)

**What it is.** The existing `bizkenia` Worker now also answers `/api/v1/*`. It takes over the jobs that run as Supabase Edge
Functions and Supabase cron timers, using the SAME rules as the current Edge Functions on `main` (payment hardening of Part 3,
login throttling, duplicate-prompt block, and so on). Supabase still holds the database and sign-in; R2 still holds the pictures;
everything the Worker already did (`/api/files`, `/api/admin/*`, `/share`, `/robots.txt`) is unchanged.

**Why.** The 2-minute `mpesa-reconcile` cron plus Edge Function traffic used up the Disk IO budget of the small Supabase
database. Timers and secret-holding jobs now run on Cloudflare (free tier), and public lists are cached near the visitor.

**Nothing changes until you switch a part on.** Every part has its own switch, and every switch can be turned back.

## What is where

| Address | What | Replaces |
|---|---|---|
| `GET /api/v1/health` | Is it alive. With header `X-Cron-Secret` it lists which settings are still empty (yes/no only) | new |
| `GET /api/v1/public/{businesses,home,market,counties,plans,stats}` | Cached public reads (60 s) | direct Supabase reads |
| `POST /api/v1/fn/mpesa-stk-push` | Start an M-Pesa prompt (maintenance guard, duplicate-tap block, flood limit) | Edge Function `mpesa-stk-push` |
| `POST /api/v1/fn/mpesa-status` | "Did my payment go through?" | `mpesa-status` |
| `POST /api/v1/mpesa/callback?secret=` | Safaricom's answer (amount check; no Amount = left for reconcile) | `mpesa-callback` |
| `POST /api/v1/fn/resolve-login` | Phone + password sign-in, throttled in the database | `resolve-login` |
| `POST /api/v1/fn/send-email` | Transactional email (Resend), refusals reported | `send-email` |
| `POST /api/v1/fn/delete-business`, `delete-account` | Danger-zone actions; files removed from R2 directly | `delete-business`, `delete-account` |
| `GET /api/v1/sitemap` (and `/sitemap.xml` when switched on) | Sitemap with businesses, products, rooms, produce | `sitemap` |
| Cron `*/10 * * * *` | Reconcile: asks Safaricom about unanswered prompts | the 2-minute pg_cron `mpesa-reconcile` |
| Cron `0 2 * * *` | Purge closed businesses (05:00 Nairobi) | pg_cron + `purge-closed-businesses` |
| `POST /api/v1/cron/{reconcile,purge}` | Run a timer by hand (header `X-Cron-Secret`) | new |

**Stays on Supabase (not moved):** the four `webauthn-*` functions (fingerprint sign-in), `mpesa-reconcile` as a function (kept as a
backup you can call by hand), and every database read and write the app already does with row-level security.

The browser keeps calling the same function names; `src/lib/backend.js` decides per function whether it goes to the Worker or to
Supabase, from a setting.

## Settings you must fill in (every placeholder is marked in the file)

Optional public values, in `wrangler.jsonc` > `vars` (empty is fine):

| Name | Put | Notes |
|---|---|---|
| `PUBLIC_BASE_URL` | `https://<your live site>` | Empty = the address the browser used is told to Safaricom as the callback address (right for the live site). Set it only when testing from another address. |
| `SITE_URL` | the same | Used in sitemap links; empty = the address asked |
| `MAIL_FROM` | `BizKenia <no-reply@your-domain>` | The default `onboarding@resend.dev` only delivers to YOUR Resend address. Verify a domain in Resend to email customers. |
| `SITEMAP_IN_WORKER` | `"true"` when ready | see step 7 |

Secrets, set once each from the project folder (PowerShell). Each command asks you to paste the value:

```
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY   # Supabase > Project Settings > API > service_role key
npx wrangler secret put MPESA_CONSUMER_KEY          # Daraja portal > My Apps > your app > Consumer Key
npx wrangler secret put MPESA_CONSUMER_SECRET       # Daraja portal > My Apps > your app > Consumer Secret
npx wrangler secret put MPESA_PASSKEY               # Daraja portal > M-Pesa Express > Passkey
npx wrangler secret put MPESA_CALLBACK_SECRET       # invent a NEW random text, 32+ characters
npx wrangler secret put CRON_SECRET                 # invent another random text, 32+ characters
npx wrangler secret put RESEND_API_KEY              # optional: resend.com > API Keys
```

The service-role key has full rights over your database. It lives only in Cloudflare's secret store, never in a file, never in the browser.
Use a NEW `MPESA_CALLBACK_SECRET` (and rotate `CRON_SECRET` on Supabase too: the old cron history contained it).

For `npx wrangler dev` on your computer: copy `worker/.dev.vars.example` to `.dev.vars` (project root), fill it, never commit it
(`.gitignore` lists it). Use a scratch Supabase project, not production.

## Go-live order (one at a time; test after each)

No database change is needed: the Worker uses the columns and functions from your existing migrations
(`last_checked_at`, `check_count`, `login_throttle_begin/finish`, `log_client_error`, the index from Part 3).

1. **Deploy the Worker** (push to GitHub). Open `https://<site>/api/v1/health`: you should see `{"ok":true,...}`. Then check your settings
   (replace `YOUR_CRON_SECRET`): `curl -H "X-Cron-Secret: YOUR_CRON_SECRET" https://<site>/api/v1/health`. Every `false` under `required` and `mpesa` is a setting still to fill.
2. **Public reads (the page-speed fix).** In Cloudflare > Workers > bizkenia > Settings > Build > Variables add `VITE_BACKEND_PUBLIC = on` and
   redeploy. Home, Explore and Shop and rent must look the same, and Network shows `/api/v1/public/...`. Undo: remove it, redeploy.
3. **M-Pesa, sandbox first.** Set `VITE_BACKEND_FUNCTIONS = mpesa-status,mpesa-stk-push` and redeploy. Pay a test order with a sandbox phone and confirm the
   intent turns `success`. Only then do it on live. Keep the Supabase `mpesa-callback` deployed for at least 24 hours: prompts started before the switch still answer to it.
4. **The rest.** Add `resolve-login,send-email,delete-business,delete-account` to the same list, one at a time, testing each (phone sign-in, a test email,
   deleting a test business, deleting a test account).
5. **Timers.** The Worker's cron triggers start with the deploy. In Cloudflare > Workers > bizkenia > Logs look for `[cron] reconcile` lines. Do NOT turn the
   Supabase 2-minute reconcile schedule back on. If both ever run, the claim columns stop them taking the same payment, but it would bring the load back.
   Move the daily purge: `select cron.unschedule(jobid) from cron.job where command ilike '%purge-closed-businesses%';` once the Worker's purge has run once (or run it by hand:
   `curl -X POST -H "X-Cron-Secret: YOUR_CRON_SECRET" https://<site>/api/v1/cron/purge`).
6. **Sitemap.** Compare `https://<site>/api/v1/sitemap` with the current `/sitemap.xml`. When happy, set `SITEMAP_IN_WORKER` to `"true"` in `wrangler.jsonc` and deploy.
7. **After about a week** with no problems: delete the Supabase functions that were replaced (`mpesa-stk-push`, `mpesa-status`, `mpesa-callback`, `resolve-login`, `send-email`,
   `delete-business`, `delete-account`, `purge-closed-businesses`; `sitemap` once step 6 is done). Keep the `webauthn-*` ones.

## Switches (no code change)

| Switch | Effect |
|---|---|
| remove a name from `VITE_BACKEND_FUNCTIONS` (and redeploy) | that function goes back to Supabase |
| `VITE_BACKEND_PUBLIC` off | public lists go straight to Supabase again |
| `SITEMAP_IN_WORKER = "false"` | `/sitemap.xml` is the Supabase function again |
| `RECONCILE_ENABLED = "false"` | the 10-minute payment check stops at once |
| `RECONCILE_BATCH`, `PURGE_BATCH` | how many items one run handles (1 to 10) |

## Limits to know (Workers free plan)

- 100,000 Worker requests per day, and 50 outbound requests per run. That is why one reconcile run checks at most 6 prompts (the rest wait for the next
  run, 10 minutes later), one purge run at most 8 businesses, and the Worker sitemap lists at most 1,200 rooms, 1,200 produce items and the products of the
  2,500 newest shops. Raise these only on a paid plan.
- Reconcile marks a payment paid from Safaricom's answer to "did it succeed", which has no receipt number or amount, so the amount asked for is trusted
  and the receipt stays empty until filled from the M-Pesa message. A normal callback carries the receipt.
- A prompt takes up to about 10 minutes to be reconciled instead of 2. Customers whose callback arrives normally are not affected.
- Delete routes slow one noisy user in memory (best effort). For a hard limit add a Cloudflare rate-limiting rule on `/api/v1/*`
  (Dashboard > Security > WAF > Rate limiting rules). Sign-in is limited in the database already.

## Tests

`npm run test:worker` runs the Worker's existing tests and the new `/api/v1` tests (Supabase and Safaricom are faked in memory; no setup needed).
