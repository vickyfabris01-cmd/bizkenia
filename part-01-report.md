# Part 1 report: maintenance levels (BizKenia)

## Base
- Base commit: `e6b67ddf77e777a324e7c7c2e0cae85a2275a8a0` ("share rework", Oct 28). The brief had `<PASTE HASH>` unfilled, so I used the head of `main` at the time I cloned.
- **`main` has moved since:** it is now `865b56e8b0d5e6d5d944d660a28353bcb3a59b64` ("part 3 & 4 #report"). It added the part 3 and part 4 files (daraja.ts, mpesa-reconcile, mpesa-callback, migration 20261027100004, NotificationBell, Notifications.css, two report files). **None of those files is one of my 14.** I did not rebase. I applied the zip to both commits and it builds on both (see Test output).

## Files (14)
NEW
- `supabase/migrations/20261027100003_maintenance_levels.sql`
- `supabase/tests/maintenance_levels_tests.sql`
- `src/components/feedback/MaintenanceBanner.jsx`
- `src/components/feedback/MaintenanceBanner.css`

MODIFIED
- `src/store/platformStore.js`
- `src/router/MaintenanceGate.jsx`
- `src/router/routes.js`
- `src/router/guards.jsx`
- `src/pages/shared/MaintenancePage.jsx`
- `src/pages/admin/PlatformControls.jsx` (the "admin controls page"; `AdminSettings.jsx` needed no change)
- `src/components/shell/AppShell.jsx`
- `src/layouts/PublicLayout.jsx` (the public layout)
- `src/lib/mpesa.js`
- `supabase/functions/mpesa-stk-push/index.ts` (guard only)

In your file list but **not changed**: `src/router/AppRouter.jsx` (the gate already wraps every route; `Boot` reads `ROUTE_META[pathname]` and ignores the new `key` field) and `src/components/ui/Icon.jsx` (the existing `warning` and `x` icons are what the banner needs; no new icon was added).

Deleted or moved: none, so no `git rm` / `git mv` commands. `package.json` and the lockfile are not in the zip.

## What I changed in files other parts may edit
- **`supabase/functions/mpesa-stk-push/index.ts`**: one block inserted directly after the `if (!user) return ...401` line, wrapped in its own `{ }` so it adds no names to the function scope. Nothing else changed. It reads `platform_settings.maintenance` with the service-role client and returns 503 with a `code`: `MAINTENANCE_PAYMENTS`, `MAINTENANCE_BUSINESS` or `MAINTENANCE_UNKNOWN`.
- **`src/lib/mpesa.js`**: new `PAUSED` constant and `stkMessage()` helper above `startStk`; inside `startStk`: a `status` variable, the `new Error(...)` line, the `err.code` line and the `data?.error` line. `normalizePhone` and `watchPayment` are untouched.
- **`src/store/platformStore.js`**: `DEFAULT_MAINTENANCE` has the new shape (it keeps `enabled` as a copy of `system`); new exports `normalizeMaintenance()` and `maintenanceActive()`; `load()` now reads brand and modules with a select and maintenance through `get_maintenance()` (falls back to the public row if the RPC is missing); new action `refreshMaintenance()`; `apply("maintenance", v)` normalises. Existing exports and `load`/`apply` signatures are kept.
- **`src/router/routes.js`**: every `ROUTE_META` entry gained a `key` (page key). New exports `pageKeyFor(pathname)` and `PAGE_OPTIONS`. Existing fields are unchanged.
- **`src/router/guards.jsx`**: `RequireMember` only: three imports, one `usePlatformStore` selector (`downTypes`) and one `if` after the "business is active" check.
- **`src/pages/shared/MaintenancePage.jsx`**: `MaintenancePage` takes optional `title` and `partial` props (defaults give the old look); the small print follows `partial`; `check()` calls `refreshMaintenance()`; `MaintenanceRoute` uses `maintenanceActive()`. CSS file untouched.
- **`src/router/MaintenanceGate.jsx`**: rewritten (default export and props kept). New named export `isDashboardPath`. The old sticky admin banner is gone; `MaintenanceBanner` replaces it. The `.maint-banner` rules in `MaintenancePage.css` are now unused; I left them alone.
- **`src/components/shell/AppShell.jsx`**: one import and `<MaintenanceBanner />` between `<TopBar />` and `<main>`.
- **`src/layouts/PublicLayout.jsx`**: one import and `<MaintenanceBanner />` between `<SiteHeader />` and `<main>` in the default `PublicLayout` only. `SiteHeader` and `SiteFooter` are unchanged.
- **`src/pages/admin/PlatformControls.jsx`**: `MaintenanceCard` rewritten; new `Group` helper, `withItem` and `EMPTY` above it; `saveSetting` now also returns `data`. `CommissionCard` is untouched. Styling is inline with theme variables so `Admin.css` (not in your list) stays untouched.

## What was built
- **Config** under `platform_settings` key `maintenance`: `{ system, allDashboards, types[], pages[], payments, businesses[], message, updated_at }`.
- **Level 1** `system` and **level 2** `allDashboards` and **pages**: enforced in `MaintenanceGate`. **Level 3** `types`: in `RequireMember`. **Levels 4 and 5**: enforced by the Edge Function (server side); the browser only shows the friendly message.
- **Database**: `maintenance_normalize()` cleans any value (unknown keys dropped, bad types, page keys and ids ignored, message cut to 300). A trigger runs it on every write and sets `updated_at` only when the settings really changed. `get_maintenance()` is `security definer`, `set search_path = public`, revoked from public, granted to `anon` and `authenticated`. Writes stay super admin only (existing `platform_settings_admin` policy). The existing `trg_audit_settings` trigger writes an audit entry on every change.
- **Banner** under the header (public and signed-in), warning SVG plus close X (44px target, theme colours). X hides it for this browser session (sessionStorage); it returns when `updated_at` changes. Super admins also get a "Manage maintenance" link.
- **Admin card** with the five levels, business finder (level 5), page picker, message, confirmation before anything is switched on, and "Turn everything off".

## Migrations and run order
1. `20261027100003_maintenance_levels.sql` (re-runnable). Needs `platform_settings` (p1_02) and the audit trigger (p1_06); p5_07 created the row but this migration creates it if missing. It does not depend on the other 20261027 migrations (part 3 is `...100004`); the order among them does not matter.
2. It converts the old `{enabled, message}` row once (`enabled` becomes `system`). That conversion writes **one audit entry with no actor**.
3. Test on a **scratch** Supabase project first, then run `supabase/tests/maintenance_levels_tests.sql` there (command is at the top of that file).

## Deploy steps, in order
1. Scratch project: apply the migration, run the SQL test file.
2. Production: apply the migration.
3. `supabase functions deploy mpesa-stk-push` (same flags you use today).
4. Deploy the front-end (`npm run build`), straight after step 2.
5. Check in Admin > Settings > Maintenance: switch on level 4 with a message, confirm the banner shows and that a test STK prompt is refused with "Payments are paused...", then turn it off.

Between steps 2 and 4, do not switch maintenance on: a browser still running the old front-end reads `maintenance.enabled`, which the new row no longer has, so it would treat the site as open.

## New env vars
None. No keys, tokens or `.env` content are in the code or the zip.

## Assumptions and decisions you should check
1. **Super admin bypasses every gate level**, not only level 1, so you can test and switch things off. Signed-in as super admin you see the real site plus the banner.
2. **Level 1 does not block `mpesa-stk-push`.** The brief says the guard blocks levels 4 and 5 only. Say so if you want level 1 to stop prompts too.
3. **Fail closed:** the guard refuses the prompt (503, `MAINTENANCE_UNKNOWN`) when the setting cannot be read, the row is missing, or the value is not an object. Consequence: if someone deletes the `maintenance` row, payments stop until it is back (the migration re-creates it).
4. **Level 5 applies to `purpose: "subscription"` only**, matching `businessId` case-insensitively; an omitted purpose counts as subscription, as the function already does. Level 4 covers subscription, rent and order. If the body is unreadable the guard lets the function reach its own "Invalid request" 400; no prompt is sent.
5. **`get_maintenance()` returns the level-5 business ids to anyone, including visitors** (they are UUIDs only, and the brief's object includes them). It is one line to blank the list for `anon` if you prefer.
6. **Page keys** come from `ROUTE_META` plus patterns for `/b/:slug` (and its `/browse`, `/p/:id`, `/produce/:id`, `/room/:id`, `/cart`, `/checkout`, `/request`), `/orders/:id` and `/invoice/:token`. `/app/*` and `/admin/*` have no page keys (levels 1 to 3 cover dashboards; admin is never blocked). `/invite/:token` and `/not-found` have none. Sign-in, forgot/reset password, confirm and `/maintenance` cannot be marked, so a super admin can always sign in.
7. **Dashboards wait for the settings before rendering.** My browser test caught a race: on a fresh load of `/app/...` the sign-in redirect could fire before the maintenance settings arrived. Public pages still render immediately (waiting would slow every first visit by one round trip), as the old gate did.
8. **Polling:** every 60 s while anything is on, every 5 min otherwise, paused while the tab is hidden (one small RPC call).
9. The banner shows to everyone whenever anything is on, as written. That includes a level-5-only state, where visitors see "subscription payments are paused for some new businesses."
10. **Level 3 applies only to active businesses**; businesses not yet active are sent to `/start/status` first, as before.
11. Existing callers for rent (`lib/api/rental.js`) and shop orders (`lib/api/storefront.js`) already show the server's `error` text, so they display the new message without changes. The subscription screen gets it through `startStk`.

## Follow-up I did not do (files outside your list)
- `src/lib/auditText.js`: the audit entries work, but the new fields show as "AllDashboards" and raw JSON lists. Six labels in `FIELD_LABEL` would fix it: `system: "Whole site"`, `allDashboards: "All dashboards"`, `types: "Business types"`, `pages: "Pages"`, `payments: "M-Pesa payments"`, `businesses: "Businesses (subscriptions)"`. Tell me and I will add them.
- `docs/phase-5/STEP-3.md` still describes the single switch.

## Test output
**Base `e6b67ddf`, zip unzipped over a fresh clone (`unzip -o` at the repo root):**
```
npm run build            ✓ built in 6.60s
npm run check:budget     PASS  First-load JS (gzip): 136.2 KB (limit 200 KB)
                         PASS  First-load CSS (gzip): 10.4 KB (limit 40 KB)
                         PASS  Largest chunk vendor-charts (gzip): 108.2 KB (limit 130 KB)
npm run test:worker      # tests 7  # pass 7  # fail 0
```
**Current `main` `865b56e8`, same zip:** build ✓ (6.51s), budget PASS (136.4 KB / 10.7 KB / 108.2 KB), worker 7 of 7 pass.

**`npm run lint` does not work, with or without my changes:** it fails at the base commit with `Invalid option '--ext'`, and running `eslint` directly fails because `eslint.config.js` imports `eslint/config`, which the installed ESLint 8.57.1 does not export. I did not touch it. My files were not linted.

`unzip -l` shows 14 entries, all relative, no wrapper folder, no node_modules, dist, .git, screenshots or lockfile.

**SQL (migration + test file), run in real Postgres (PGlite) with a stand-in for Supabase's roles, `auth.uid()` and `is_super_admin()`, and the `platform_settings` policies and audit trigger copied from the repo. 27 of 27 checks pass**, including: re-running changes nothing; old `{enabled:true}` becomes `system:true`; junk values are cleaned; anon and non-admins change 0 rows; anon cannot call `maintenance_normalize`; every change is audited with actor; identical re-save keeps `updated_at`, a real change moves it. The repo test file `maintenance_levels_tests.sql` also ran to the end against the same stand-in. **It has not been run on a real Supabase scratch project; please run it there (step 1 of the deploy list).**

**Edge Function: the real `index.ts` ran in Deno 2.9.6 against a local mock of Supabase** (no call to Safaricom):
```
setting state                     request                         result
off / old {enabled:false}         subscription                    passes guard (normal 400 on the test phone)
level 1 only                      subscription                    passes guard (not enforced here)
level 4 payments                  subscription, rent, order       503 MAINTENANCE_PAYMENTS
level 5 listed business           subscription (also UPPER-case
                                  id, and purpose omitted)        503 MAINTENANCE_BUSINESS
level 5 other business            subscription                    passes guard
level 5 listed id                 rent                            passes guard
setting read fails / row missing
 / value not an object            subscription                    503 MAINTENANCE_UNKNOWN (fails closed)
no Authorization header           any                             401 (before the guard)
```

**Browser, the real built site with Supabase's answers mocked, 360px wide: 46 of 46 pass.** Visitor, business owner (a rental and a shop business) and super admin, each against: all off, level 1, level 2, level 3 (rental), level 4, level 5, and pages. Highlights: level 1 shows the full maintenance page to visitors and owners, keeps `/login` open, and lets the super admin through; level 2 blocks `/app` only; level 3 blocks the rental dashboard but not the shop dashboard or public pages; levels 4 and 5 leave every page working and show the banner; a marked page (including `/b/:slug` by pattern) shows the partial page while unmarked pages work; `/login` cannot be marked. Banner: shows the message, two SVG icons hidden from screen readers, close button 44 by 44, no horizontal scroll, no emoji, theme colour in dark mode, X closes it (keyboard Enter works), it stays closed after reload and on other pages, and returns when `updated_at` changes.

**Admin card, as super admin at 360px: 21 of 21 pass.** All five groups and the page picker render; sign-in pages are not offered; ticking levels 2, 4, one type, one business, one page and a message gives a confirmation that lists them; the saved value is exactly what was ticked and has no `updated_at`; the banner appears at once; "Turn everything off" clears everything in one save.

**Not tested:** the real hosted database and a real STK prompt (no Daraja credentials or scratch project here), the repo's own `npm run test:e2e` suite, a screen reader, and real phones. The browser tests are throwaway scripts outside the repo; I can add them to `e2e/` if you want them kept.

Screenshots (separate files): `banner-360.png`, `page-maintenance-360.png`, `admin-card-360.png`, `banner-dark-desktop.png`.

## Rollback
- **Front-end and function:** redeploy the previous builds (`mpesa-stk-push` from `e6b67ddf`). The old function ignores the new fields.
- **Database:** nothing is dropped, and the old and new front-ends cannot both read the new row (see the note under Deploy steps). If you must go back completely, in this order:
```sql
drop trigger if exists trg_maintenance_before_write on public.platform_settings;
update public.platform_settings
   set value = jsonb_build_object('enabled', coalesce((value ->> 'system')::boolean, false), 'message', coalesce(value ->> 'message', ''))
 where key = 'maintenance';
drop function if exists public.get_maintenance();
drop function if exists public.maintenance_before_write();
drop function if exists public.maintenance_normalize(jsonb);
```
(The trigger must go first, otherwise it rewrites the old shape back into the new one.) Fix forward is usually safer: turn every level off in Admin > Settings.
