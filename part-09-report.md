# Part 9 report: payments, storage usage, SEO, headers and clean-up (BizKenia)

**Base commit used: `36d51cd0fc0b4e031fb911b66b92a5521d9a751d`** (main). The brief says c3b9cb7. Main has moved: two newer commits (`51aa658 hero size on mobile`, merge `36d51cd`). I worked from the newest commit as the brief says. None of my files were touched by those commits (checked with git diff c3b9cb7..36d51cd). Tell me if you want it redone on c3b9cb7.

## What is and is not proven (read this first)
Done and checked: lint (117 warnings before and after, 0 new), build, check:budget, test:worker (17/17), unzip into a fresh clone of the base commit with the git rm / git mv commands run first.

**NOT done, because I cannot do it from here. Nothing below is claimed as tested:**
- **Daraja sandbox run (success, wrong PIN, cancel, timeout, double tap).** No Safaricom network access and no credentials. The code and the case table are ready (docs/MPESA-SETUP.md, "The five sandbox cases"). Please run them and paste the results.
- **CSP report-only click-through.** No browser against the live app here. The origin list comes from reading index.html and src; see "CSP" below for what to do and what I expect to see.
- **Live proofs on a deployed site** (/sitemap.xml returning XML from the real function, /robots.txt on two real hosts, share link offline in a real browser). I proved the logic with tests and a service worker simulation (below), not on the deployed site.
- **Deno type-check** of the edge functions (no Deno here). The TypeScript was written carefully but not compiled.

## Findings you should know about
1. **send-email has no callers.** `grep -rn "send-email"` over src, supabase and docs finds only the function itself and three docs. Nothing in the repo sends approval or invitation emails today, so there was no caller to change. The function now returns an error status (below); whoever adds the first caller must read `sent`/`error`.
2. **Duplicate prompts cannot be fully prevented without a database constraint.** I added a re-check after the insert so two simultaneous taps resolve to one prompt, but a unique index would be the real guarantee. No migration was made (the brief says ask first).
3. **/share/* has no client route.** The service worker now sends an offline share link to the real page (see Job C).

## NEW files
- `worker/storage.js`
- `src/lib/api/adminStorage.js`
- `src/components/ui/icons/PlatformIcons.jsx` (icons phone, clock, refresh, flag; Icon.jsx has none of these)
- `public/_headers`

## MODIFIED files and what changed (grep these after merging)
- `supabase/functions/mpesa-stk-push/index.ts`: import of `darajaBase, darajaTimestamp, darajaToken`; new `DUP_MSG`, `findPending()`, the `already` early return before the insert, and the `first` re-check right after the insert; the token/timestamp/base now come from the shared helpers. The maintenance guard is untouched.
- `supabase/functions/_shared/daraja.ts`: one header comment line only.
- `src/lib/mpesa.js`: new export `checkPayment(intentId)`, header comment line.
- `src/pages/onboarding/SubscribePage.jsx`: states `phase` (form, sending, waiting, confirmed, failed), `outcome`, `slow`, `checking`, `paused`; functions `apply`, `checkAgain`, `tryAgain`; the 90 second timer effect; the status screen block; the maintenance Alert title.
- `src/pages/onboarding/Onboarding.css`: `.onb__state` and its `--ok`, `--bad`, `--wait` variants, `.onb__wait .onb__actions`.
- `docs/MPESA-SETUP.md`: section "Go-live checklist" (with the five sandbox cases), two troubleshooting rows.
- `worker/orphans.js`: **only** `async function listAll` became `export async function listAll`. No behaviour change.
- `worker/entry.js`: import of `handleStorage`; route `/api/admin/storage`; functions `robots`, `sitemap`, `FALLBACK_ROBOTS`; routes `/robots.txt` and `/sitemap.xml` (GET and HEAD).
- `worker/worker.test.mjs`: 10 new tests (storage 3, share 4, robots/sitemap 3).
- `src/pages/admin/AdminReports.jsx`: new `Storage` tab, `StorageCard`, `formatSize`, `FLAG_AT`; the render line `tab === "storage" ? <StorageCard /> : ...`; the `top` branch is now `else if (tab === "top")`.
- `public/robots.txt`: placeholder Sitemap line replaced by a comment.
- `public/sw.js`: `VERSION` is `bizkenia-v2`; `realPath`, `offline`, `keepShell`; `/api/files/` skipped; redirected loads never stored.
- `wrangler.jsonc`: `run_worker_first` adds `/robots.txt` and `/sitemap.xml`; `assets.binding = "ASSETS"` (needed so the Worker can read public/robots.txt; this is the one wrangler change beyond what you described).
- `supabase/functions/sitemap/index.ts`: `npm:@supabase/supabase-js@2` import; `listed()`; room and farm produce URLs.
- `supabase/functions/send-email/index.ts`: provider refusal or unreachable now answers 502 `{ ok:false, sent:false, error }`.
- `package.json`, `package-lock.json` (the two name fields), `.gitignore` (`.vite`), `docs/phase-5/STEP-3.md` (five levels, level 4 and 5 enforced on the server, lint note corrected).

## git rm / git mv (run in this order, at the repo root, BEFORE unzip -o)
```
git rm -r .vite
mkdir -p docs/archive docs/reports
git mv bizkenia-r2-storage.patch brand-studio.patch APPLY.txt README-INSTALL.txt docs/archive/
git mv part-01-report.md part-02-report.md part-03-report.md part-04-report.md part-06-report.md docs/reports/
git rm verify-budget.txt verify-build.txt verify-ci.txt verify-lint.txt verify-worker.txt
git rm .github/copilot-instructions.md
```
All of these exist at 36d51cd (`.vite/deps` was tracked). Only 01, 02, 03, 04 and 06 reports exist in the root (no 05). After the moves, docs/MPESA-SETUP.md points to `docs/reports/part-03-report.md`.

## Job A: subscription payments
- **Duplicate block.** Same user, same purpose, same reference (invoice, order, or business subscription), status pending, created in the last 2 minutes, **and same amount** (for a subscription, same plan too): that intent is returned with "A payment prompt was sent a moment ago..." and `duplicate: true`. I added the amount/plan match so a changed request (other plan, other rent amount) still goes through; remove `.eq("amount_kes", amount)` and the plan match in `findPending` if you want reference-only. Two requests at the same instant: each re-checks after inserting; the oldest pending intent wins and the other is marked failed with "Duplicate request, no prompt was sent." and returns the winner.
- **Optional refactor done:** token, timestamp and base URL use `_shared/daraja.ts` (it adds a 10 second timeout; same error text). The STK request itself stays in stk-push.
- **SubscribePage screens:** sending (spinner), waiting for the PIN (phone icon), confirmed (success icon, then moves on after 1.5 s), failed / cancelled / timeout (error, x, clock icons). After 90 seconds a "Still waiting" line and **Check again** button appear (uses `checkPayment`, the same `mpesa-status` call the page polls with). The timeout screen also has Check again. A double tap on Pay is ignored in the page too. Maintenance (`MAINTENANCE_*` codes) shows a warning titled "Payments are paused" with the server's message.
- **Daraja results: NOT RUN** (see top). Table to fill in:

| Case | Expected | Result |
|---|---|---|
| Success | Confirmed, approval step, Transactions Successful | not run |
| Wrong PIN | Payment not completed, Failed | not run |
| Cancel | Payment cancelled | not run |
| Timeout | No answer yet, then reconcile settles | not run |
| Double tap | One prompt; second call returns the same intent | not run |

## Job B: storage per business
- `GET /api/admin/storage` (super admin, same `is_super_admin` check as orphans.js, copied because orphans.js keeps its own private). Optional `?refresh=1` (the Refresh button). Cached 10 minutes in the Worker cache; the permission check runs before the cache is read.
- Returns `generatedAt, ttlSeconds, truncated, objects, totals, businesses[{id, bytes, files, share, averageOthers}], platform{bytes, files, share, parts{hero, share, avatars, other}}`. "Platform" = everything not under `business-media/<uuid>/`: hero pictures, **share cards (`site-media/share`)**, avatars (they are keyed by user id, not business), odd keys.
- UI: new **Storage** tab in Reports: business name (linked; "Deleted or unknown business (id)" if it is not in the businesses list, which also exposes leftover folders), used KB/MB/GB with file count, a bar with a line at the average of the other businesses, and a flag icon above 3 times that average.
- Test numbers (test "storage: bytes are summed per business..."): business A has 100 KB + 300 KB = **400 KB** in 2 files, business B has **40 KB** in 1 file; platform has share cards 60 KB + hero 20 KB + avatars 10 KB = **90 KB**; total 530 KB, 6 files. A's average of others = 40 KB, B's = 400 KB; A's share = 400/530; A is more than 3 times the average so it is flagged.
- Assumptions: the average is over businesses that have at least one file (R2 cannot list businesses with nothing); a single business shows no average. The listing stops at 20,000 objects (existing `MAX_OBJECTS` in orphans.js) and says so on screen when truncated. The cache is per Cloudflare data centre, and Refresh always lists R2 again (no limit on how often it is pressed).

## Job C: SEO and service worker
- `/robots.txt`: Worker reads `public/robots.txt` through the `ASSETS` binding, removes any Sitemap line and adds `Sitemap: <request origin>/sitemap.xml`. With no binding it falls back to a short built-in file, so it never fails.
- `/sitemap.xml`: proxied from `<SUPABASE_URL>/functions/v1/sitemap` (read from wrangler vars), `application/xml`, cached 1 hour; a failure answers 502 text, never the app page.
- **Sitemap function:** room pages `/b/<slug>/room/<id>` and farm produce `/b/<slug>/produce/<id>` come from `market_listings` (the "Shop and rent" function): active business, room type with a free room, produce active and in stock. That is exactly the listing rule, with no copy of it to drift. Rooms first, then produce, then shop products, so the 50,000 URL cut never drops them. Existing shop product behaviour is unchanged (it does not require stock, unlike market_listings; I left that alone). Import now `npm:`.
- **Secret needed:** `SITE_URL` (for example https://yourdomain, no trailing slash) as a Supabase Edge Functions secret. The function returns 500 "SITE_URL is not set" without it.
- **sw.js:** `/api/files/` is never handled; a navigation that ended on a redirect is never stored as the shell, and the shell is refreshed from `/` instead; only ok responses are stored; an offline `/share/b/...` or `/share/page/...` link redirects to the page it points to, which then opens the cached shell. `activate` already deleted other caches; kept. VERSION is `bizkenia-v2`.
- Service worker simulation (a Node harness, not in the zip; not a real browser):
```
upload png: handled by SW = false | stored = false
static icon png: handled = true | stored = true
shell after redirected load = <html>SHELL</html>
offline share link: 302 https://site.test/b/my-shop?utm_source=whatsapp
offline share page: 302 https://site.test/explore
offline real page serves: <html>SHELL</html>
VERSION cache names: [ 'bizkenia-v2' ]
```
- Unit proof for robots on two hosts (test 15): `Sitemap: https://one.example/sitemap.xml` and `Sitemap: https://www.two.example/sitemap.xml`, exactly one line each. Test 17 proves the XML pass-through and the 502. **Live check after deploy:** `curl -s https://YOURHOST/robots.txt | tail -2` and `curl -sI https://YOURHOST/sitemap.xml | grep -i content-type`.

## Job D
- **`public/_headers`:** nosniff, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy: camera=(), microphone=(), geolocation=(self)` (geolocation is used by `FieldMap.jsx`; camera and microphone are not used anywhere), and a **report-only** CSP. Worker answers (`/api/*`, `/share/*`, `/robots.txt`, `/sitemap.xml`) do not get these headers, so nothing conflicts with the `/api/files` headers.
- **CSP origins found:** Google Fonts CSS and files; Cloudflare Web Analytics script (`static.cloudflareinsights.com`) and its reports (`cloudflareinsights.com`); the Supabase host from wrangler.jsonc (https and wss for realtime); map tiles `tile.openstreetmap.org` and `server.arcgisonline.com`; place search `nominatim.openstreetmap.org`. The inline theme script in index.html is allowed by its hash (`sha256-S0XZfnEm1ePY5/Hxt+/a2CpWAsBklqW0gtbkYzrvb3Q=`, identical in source and dist). **If anyone edits that script, the hash must be recomputed.** Styles allow `'unsafe-inline'` because React uses inline style attributes.
- **Click-through: not done.** Do it with DevTools open (Console), visit: home, explore, a business page with a map, login, sign-up, onboarding, a dashboard, admin reports, a share link. Anything blocked shows as "Content-Security-Policy-Report-Only ... violates". Likely surprises: images from another host (listing pictures), the Google sign-in return, the Cloudflare beacon. Add each real origin to the right directive, then enforce.
- **To make it enforcing:** in `public/_headers` change the header name `Content-Security-Policy-Report-Only` to `Content-Security-Policy` (value unchanged, or with the origins you added), redeploy, repeat the click-through once. There is no report endpoint, so reports only appear in the browser console.
- **send-email:** provider refusal or unreachable now returns 502 `{ ok:false, sent:false, error:"<provider message>" }`. No key still answers `{ ok:true, sent:false }` as before. **The default sender `onboarding@resend.dev` only delivers to the Resend account owner's own address. To email anyone else, verify a sending domain in Resend and set `MAIL_FROM` to an address on it.**
- **Share tests:** route parsing, redirect with only utm_source and utm_medium kept, unknown path and non-GET, crawler user agents (Facebook, WhatsApp, Twitter, Telegram), escaping of `< > & " '`, noindex tag, fallback to the redirect when the business is missing or the database is down. No change to worker/share.js and no export was needed (`parseShare` and `handleShare` were already exported).
- **Clean-up:** package name `bizkenia`; the git commands above; `.vite` in .gitignore; STEP-3.md rewritten for the five levels.

## Deploy steps, in order
1. Run the git rm / git mv block above, then `unzip -o part-09-platform.zip` at the repo root. Commit.
2. Set the Supabase secret `SITE_URL`.
3. `supabase functions deploy mpesa-stk-push send-email` and `supabase functions deploy sitemap --no-verify-jwt`.
4. Push so the Worker and static files deploy (wrangler picks up `ASSETS`, the two new run_worker_first paths and `_headers`).
5. Check `/robots.txt`, `/sitemap.xml`, `/admin/reports` > Storage (sign in as super admin), and the console for CSP reports.
6. Follow "Go-live checklist" in docs/MPESA-SETUP.md for payments (start with maintenance level 4).
7. Only after a clean click-through, make the CSP enforcing.

## New env vars and secrets
- `SITE_URL` (Supabase Edge Functions secret, for `sitemap`). Nothing else is new. `RESEND_API_KEY`, `MAIL_FROM`, `CRON_SECRET`, the `MPESA_*` secrets already exist (listed in the checklist).

## Test output (fresh clone of 36d51cd + zip + git commands)
```
npm run lint            0 errors, 117 warnings (117 before my changes, same list)
npm run build           built in 15.90s
npm run check:budget    PASS  First-load JS (gzip): 136.4 KB (limit 200 KB)
                        PASS  First-load CSS (gzip): 10.7 KB (limit 40 KB)
                        PASS  Largest chunk vendor-charts (gzip): 108.2 KB (limit 130 KB)
npm run test:worker     tests 17, pass 17, fail 0
```
`unzip -l`: 23 files, all relative paths, no wrapper folder, no node_modules, dist, .git or report. dist contains `_headers` and `robots.txt`.

## Rollback
Redeploy the previous commit. Functions: redeploy the old `mpesa-stk-push`, `send-email`, `sitemap` from git (`git checkout 36d51cd -- supabase/functions`). The new Worker routes and `ASSETS` binding are harmless to leave. To switch off the headers alone, delete `public/_headers`. The old service worker cache `bizkenia-v1` is deleted by the new one and cannot come back; a rollback simply caches again. The moved files can be moved back with `git mv`.
