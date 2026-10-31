# Phase 5, step 3: platform finance

Built on top of phase 5 step 2 (storefront, checkout, account lock). The three files both steps touched (`src/lib/api/businesses.js`, `src/pages/admin/AdminSettings.jsx`, `src/router/AppRouter.jsx`) are merged: every step 2 change is kept and the step 3 additions are layered on top. This file is separate from `docs/phase-5/README.md` on purpose; tick "step 3" in the README's status table.

## What is in it
**Super admin screens** (`/admin/*`, menu in `src/modules/adminNav.js`)
| Screen | File | What it does |
|---|---|---|
| Transactions | `pages/admin/AdminTransactions.jsx` | Every payment in one list (subscription, rent, shop order). Filters: type, status, dates, search. Tiles (money in, successful, pending, failed, reversed). Row opens full details. CSV of what matches. |
| Revenue (new menu item) | `pages/admin/AdminRevenue.jsx` | Subscription income: this month vs last month, 12 months, all time, running and ending subscriptions, by month and by business type, latest payments, CSV. |
| Reports | `pages/admin/AdminReports.jsx` | Tabs: Growth, Businesses, Money, Top businesses. Chart, table and CSV on each. |
| Audit log | `pages/admin/AdminAudit.jsx` | Read-only history in plain English with before and after, filters, raw record on request, CSV. |
| Settings (two new cards) | `pages/admin/PlatformControls.jsx` | Maintenance (five levels, a page picker and a message) and Default commission (stored only). |

**Maintenance (five levels):** Admin > Settings > Maintenance. Everything is saved in the `maintenance` setting and a super admin is never blocked.
1. **Whole system.** Only super admins can use the site; everyone else sees the maintenance page.
2. **All dashboards.** Everything under `/app`; public pages keep working.
3. **One business type.** Only the dashboards of the types ticked (rentals, shops, farms).
4. **All money handling.** Every M-Pesa prompt (subscription, rent, shop order) is refused. The server (`mpesa-stk-push`) enforces this and fails closed, so it also stops calls that do not use the screen.
5. **Some businesses' subscriptions.** The subscription prompt is refused for the businesses picked, for example new ones with no billing set up yet.
A **Pages** picker shows the maintenance page on single pages, and an optional message is shown on it. `router/MaintenanceGate.jsx` wraps all routes in `AppRouter.jsx` and `pages/shared/MaintenancePage.jsx` is the page and the `/maintenance` route. `/login`, `/forgot-password`, `/reset-password` and `/auth/callback` stay open so a super admin can sign in. A super admin sees a banner with a "Turn it off" link. Switching something ON asks for a confirmation.

**Shop owner Reports** (the placeholder from 5A): `pages/shop/ShopReportsPage.jsx`. Tabs: Sales, Orders, Top products. Owner only, as in 5A.

**Data layer:** `lib/api/platformFinance.js`, `lib/auditText.js` (turns audit rows into plain English), `getShopReport` added to `lib/api/reports.js`.

**Database:** `supabase/migrations/20261018100003_p5_07_platform_views.sql`. It runs after step 2's `20261018100001_p5_05_account_lock_and_types.sql` and `20261018100002_p5_06_storefront_checkout.sql` (it reads `payment_intents.order_id` from p5_06).

## Apply
1. Run migration `20261018100003_p5_07_platform_views.sql` after the two step 2 migrations (safe to run twice). Until it is applied, the new screens show a load error and the maintenance and commission cards say the setting is missing.
2. Optional demo history (development projects only), after `p1_demo.sql`, `p2.sql`, `p5.sql`: `supabase/seed/p5c.sql`.
3. To check the rules: `psql "$DEV_DB_URL" -v ON_ERROR_STOP=1 -v admin_email="'you@example.com'" -f supabase/tests/p5c_rls_tests.sql` (needs one real super admin account; rolls back at the end).

## Rules the database enforces
- Only a super admin can call the `admin_*` functions. Anyone else gets "Only a super admin can do this". The internal money list `_platform_money` is closed to everyone but those functions. No existing table policy was loosened (the rental `payments` policy still does not let a super admin read them directly; the functions do it).
- **One row per payment.** An STK rent payment exists as a payment intent and as a rental payment. Only the intent is listed. Rental payments appear on their own only when they have no intent (cash, bank, paybill recorded by staff). If the rental payment was reversed, the transaction shows as Reversed.
- **Revenue is subscriptions only.** `Revenue`, the dashboard tile and the Transactions "Subscriptions" total all use successful subscription payments, so they agree. Rent and shop money is shown as "money handled", never as platform income. No commission is charged.
- Status words: Successful, Pending, Failed (failed, cancelled and timed out), Reversed (reversed or refunded).
- New audit entries (alongside the Phase 1 business status and setting entries): price plan added or changed, manual payment recorded, payment status changes, account switched on or off, account role changed. A change made by the M-Pesa callback has no person and shows as "System".

## Merged with step 2 (storefront and checkout)
1. **Orders in Transactions.** Shop money is listed from `payment_intents` rows with `purpose = 'order'` (once paid), from pay-on-delivery orders, and from M-Pesa orders the shop confirmed by hand with `seller_mark_order_paid` (those have no successful intent, so the list reads them from `orders`). Each payment appears once.
2. **Account lock and the audit log.** `admin_set_user_active` (step 2) updates `profiles.is_active`, so the audit trigger from this step still records "account switched on/off". `adminSetUserActive` in `businesses.js` keeps calling the step 2 RPC.
3. **Business types.** The "Business types" card stays removed from Settings (step 2). Settings now has the Maintenance mode and Default commission cards (step 3).
4. **Routes.** All step 2 storefront routes (`/b/:slug/browse`, `/p/:id`, `/cart`, `/checkout`, `/orders`, `/wishlist`) stay inside `MaintenanceGate`, which wraps every route, so nothing needs wrapping again.
5. **Shared files this step changed:** `src/modules/shop/index.js` (the Reports `element`), `src/router/AppRouter.jsx`, `src/store/platformStore.js` (maintenance), `src/pages/admin/AdminSettings.jsx`, `src/modules/adminNav.js`, `src/lib/api/businesses.js` (`adminStats` revenue), `src/lib/api/reports.js` (new function at the bottom).

## Fixed on the way
- The admin dashboard's "Subscription revenue" tile summed **every** successful payment intent, so rent paid by STK would have been counted as platform revenue (and orders soon after). It now counts subscriptions only and is added up in the database (the old way was also silently cut off at 1,000 rows).

## Click-through test (step 3)
1. Sign in as a super admin. The menu now shows Transactions, Revenue, Reports, Audit log (the ComingSoon pages are gone).
2. Transactions: tiles show money in, successful %, pending, failed. Filter Type = Rent, Status = Successful; pick dates; search a receipt. Open a row. Download CSV and open it in a spreadsheet; the rows match the list.
3. Revenue: this month and 12-month totals equal the "Subscriptions" total on Transactions (filter Type = Subscription, Status = Successful, no dates). The chart and table agree. The dashboard "Subscription revenue" tile equals "All time".
4. Reports: each of the four tabs shows a chart, a table and a working CSV.
5. Settings: change a plan price, then open Audit log: "Price plan changed" with the old and new price. Switch an account off in Users: it appears too. Approve or suspend a business: "Business status changed".
6. Settings > Maintenance: switch on level 1 with a message and confirm. In a private window, any page shows the maintenance page with your message; `/login` still opens. As the super admin the site works and the banner shows. Switch it off: the private window returns to normal within a minute, or at once with "Check again". The change is in the Audit log. Then switch on level 4 and start a payment as a normal owner: the prompt is refused with "Payments are paused for a short while"; switch level 4 off again.
7. Settings > Default commission: save 5; reload and it is still 5; the Audit log shows it. Nothing in Revenue changes.
8. Sign in as `shop.demo@example.com`, open Reports: Sales, Orders and Top products match the Orders screen (cancelled orders left out of sales).
9. Sign in as an ordinary business owner and open `/admin/transactions`: you land on the 404 page.

## Known limits and decisions
- **Levels 1 to 3 and the page picker hide pages in the browser only.** They do not stop API calls, the M-Pesa callback or direct database access. That is deliberate for planned short work (and the M-Pesa callback must keep working). Levels 4 and 5 are different: they are enforced on the server, in `mpesa-stk-push`, which refuses the prompt (and fails closed if the setting cannot be read).
- Sheet 11 also shows "2FA required" and "Auto backup" switches. They are not built: two-factor needs the auth provider's setup and backups are done by the hosting plan, so a switch here would not do anything. The commission field is stored and shown only, as the plan's defaults say.
- Lists show 25 rows a page. CSV downloads hold up to 5,000 rows; if more match, the message says so and asks you to narrow the dates.
- Dates and months follow UTC (as the Phase 4 reports do).
- `npm run lint` works (ESLint 9) and runs in CI. `npm run build` passes.
