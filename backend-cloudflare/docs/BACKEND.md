<!-- docs/BACKEND.md — NEW FILE -->
# BizKenia backend on Cloudflare (the /api/v1 Worker)

**What it is.** The existing `bizkenia` Worker now also answers `/api/v1/*`. It takes over the jobs that used to
run as Supabase Edge Functions or Supabase cron timers. Supabase still holds the database and sign-in (and all normal
reads and writes with row-level security). R2 still holds the pictures. Nothing here is a second website: it is the
same Worker, the same deploy (push to GitHub as usual).

**Why.** The 2-minute `mpesa-reconcile` cron plus Edge Function traffic used up the Disk IO budget of the small
Supabase database. Timers and secret-holding jobs now run on Cloudflare (free tier), and public lists are cached
near the visitor.

## What is where

| Address | What | Replaces |
|---|---|---|
| `GET /api/v1/health` | Is it alive. With header `X-Cron-Secret` it lists which settings are still empty (yes/no only) | new |
| `GET /api/v1/public/{businesses,home,market,counties,plans,stats}` | Cached public reads (60 s) | direct Supabase reads |
| `POST /api/v1/fn/mpesa-stk-push` | Start an M-Pesa prompt (keeps the maintenance guard, fails closed) | Edge Function `mpesa-stk-push` |
| `POST /api/v1/fn/mpesa-status` | "Did my payment go through?" | `mpesa-status` |
| `POST /api/v1/mpesa/callback?secret=` | Safaricom's answer | `mpesa-callback` |
| `POST /api/v1/fn/resolve-login` | Phone + password sign-in | `resolve-login` |
| `POST /api/v1/fn/send-email` | Transactional email (Resend) | `send-email` |
| `POST /api/v1/fn/delete-business`, `delete-account` | Danger-zone actions, files removed from R2 directly | `delete-business`, `delete-account` |
| `GET /sitemap.xml` | Sitemap | `sitemap` |
| Cron `*/10 * * * *` | Reconcile: asks Safaricom about unanswered prompts (cheap when idle) | the old pg_cron `mpesa-reconcile` |
| Cron `0 2 * * *` | Purge closed businesses (05:00 Nairobi) | pg_cron + `purge-closed-businesses` |
| `POST /api/v1/cron/{reconcile,purge}` | Run a timer by hand (header `X-Cron-Secret`) | new |

The browser keeps calling the same function names; `src/lib/backend.js` decides per function whether it goes to the
Worker or to Supabase, from a setting. **Nothing changes until you set the settings below**, and each step can be undone by
removing its setting.

## Settings you must fill in (every placeholder is marked in the file)

Public values, in `wrangler.jsonc` > `vars`:

| Name | Put | Where to find it |
|---|---|---|
| `PUBLIC_BASE_URL` | `https://<your live site>` no trailing slash | your live address |
| `SITE_URL` | the same value | same |
| `MAIL_FROM` | `BizKenia <no-reply@your-domain>` | a domain you verified in Resend (optional at first) |
| `ALLOWED_ORIGINS` | keep `http://localhost:5173` for local work, or clear it | |

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

The service-role key has full rights over your database. It lives only in Cloudflare's secret store, never in a file, never in
the browser. Use a NEW `MPESA_CALLBACK_SECRET` (the old one appeared in the Supabase cron history).

For `npx wrangler dev` on your computer: copy `worker/.dev.vars.example` to `.dev.vars` (project root), fill it, and never commit it
(`.gitignore` already lists it). Use a scratch Supabase project, not production.

## Go-live order (do them one at a time; test after each)

1. **Database:** run `supabase/migrations/20261105100001_payment_intents_pending_index.sql` (adds one small index; safe to re-run).
2. **Deploy the Worker** (push to GitHub). Open `https://<site>/api/v1/health`: you should see `{"ok":true,...}`.
   Then check your settings (replace `YOUR_CRON_SECRET`):
   `curl -H "X-Cron-Secret: YOUR_CRON_SECRET" https://<site>/api/v1/health` : every `false` is a setting still to fill.
3. **Public reads (the page-speed fix).** In Cloudflare > Workers > bizkenia > Settings > Build > Variables add
   `VITE_BACKEND_PUBLIC = on` and redeploy. Open Home, Explore, Shop and rent: they must look the same, and Network should show
   `/api/v1/public/...` answers. Undo: remove the variable, redeploy.
4. **M-Pesa, in sandbox first.** Set `VITE_BACKEND_FUNCTIONS = mpesa-status,mpesa-stk-push` and redeploy. Pay a test order with a sandbox phone.
   Confirm the intent turns `success` and the order is paid. Only then do it on live.
   Keep the old `mpesa-callback` Edge Function deployed for at least 24 hours: prompts started before the switch still answer to it.
5. **The rest.** Add `resolve-login,send-email,delete-business,delete-account` to the same list, one at a time, testing each
   (phone sign-in, a test email, deleting a test business, deleting a test account).
6. **Timers.** The Worker's cron triggers start with the deploy. Check Cloudflare > Workers > bizkenia > Logs for lines starting `[cron] reconcile`.
   Then stop the Supabase timers (SQL editor, one at a time, when the database is responsive):
   `select cron.unschedule(jobid) from cron.job where command ilike '%purge-closed-businesses%';`
7. **Sitemap.** In `public/robots.txt` set `Sitemap: https://<your live site>/sitemap.xml` and submit that address in Google Search Console.
8. **After about a week** with no problems: delete the old Edge Functions that were replaced (`mpesa-stk-push`, `mpesa-status`,
   `mpesa-callback`, `resolve-login`, `send-email`, `delete-business`, `delete-account`, `purge-closed-businesses`, `sitemap`).

## Switches (no code change)

| Switch | Effect |
|---|---|
| remove a name from `VITE_BACKEND_FUNCTIONS` (and redeploy) | that function goes back to Supabase |
| `VITE_BACKEND_PUBLIC` off | public lists go straight to Supabase again |
| `RECONCILE_ENABLED = "false"` | the 10-minute payment check stops at once |
| `RECONCILE_BATCH`, `PURGE_BATCH` | how many items one run handles (1 to 10) |

## Limits to know (Workers free plan)

- 100,000 Worker requests per day, and 50 outbound requests per run. That is why one reconcile run checks at most 6 prompts
  and one purge run at most 8 businesses; the rest wait for the next run.
- The in-memory rate limits (login, deletes) slow one noisy visitor but are not a hard wall. For a hard limit add a Cloudflare
  rate-limiting rule on `/api/v1/*` (Dashboard > Security > WAF > Rate limiting rules).
- Reconcile marks a payment paid from Safaricom's answer to "did it succeed", which has no receipt number. Such a payment has an empty receipt
  until someone fills it from the M-Pesa message. A normal callback carries the receipt.

## Tests

`npm run test:worker` runs the old file tests and the new `/api/v1` tests (Supabase and Safaricom are faked in memory; no setup needed).
