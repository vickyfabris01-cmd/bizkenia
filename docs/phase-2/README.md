# Phase 2 — Rental core for owners and managers

Base commit: `dc259f7` (Phase 1) + local commits `77a9fce` (super admin blocked from `/app/*`) and `4e75902` (visitor-first landing).

## What this phase delivers
| Who | Screens (all under `/app/:slug` unless noted) |
|---|---|
| Owner + manager | Dashboard (real figures), Properties, Rental requests, Residents, Tenancies, Billing, Payments, Invoices |
| Owner only | Managers (invite by link), Settings (billing rules, own M-Pesa paybill/till) |
| Anyone | `/b/:slug` lists available rooms; `/invoice/:token` shared invoice (print); `/invite/:token` manager invite |
| Signed-in renter | `/b/:slug/request` (ask for a room), `/account/requests` (accept/decline offers, cancel) |
| Resident | Own menu, screens say "Coming in Phase 3" (Phase 3 developer builds them) |

## How it works
- **Roles** live in `business_members`: `owner`, `manager`, `resident`. Staff = owner or manager (`is_staff()`).
- **Request flow**: renter requests → staff send an offer (room becomes *reserved*) or decline → renter accepts → tenancy starts, room *occupied*, renter becomes *resident*, first invoice created. Offers expire (`expire_offers`), freeing the room.
- **Money**: invoices are `billing_cycles`; payments are `payments`. `_reconcile_cycle` re-adds confirmed payments after every change, so reversing a payment puts the amount back. Late fee is added once by `refresh_overdue` (settings: due day, grace days, fee). Payments with no invoice are *unmatched* and can be matched by hand.
- **M-Pesa**: `mpesa-stk-push` now accepts `purpose: "rent"` (invoice + amount + phone) and pays into the business's own shortcode/passkey (saved by the owner in Settings; passkey is write-only). The callback is unchanged: `mark_intent_paid` records the rent payment. Without the business till set up, the app says so and staff record the payment by hand.
- **Writes** to tenancies, invoices, payments and requests go only through database functions (RLS gives read access only). The super admin has no access to these tables.

## Files
- Migrations `supabase/migrations/20261014100001…04_p2_*.sql` — run in order (idempotent).
- Demo data `supabase/seed/p2.sql` (after `p1_demo.sql`) — Sunrise Apartments: 2 buildings, 24 rooms, 14 residents, 3 months of invoices, payments in every state.
- Tests `supabase/tests/p2_rls_tests.sql` — 58 checks run as real signed-in users inside a rolled-back transaction.
- Data layer `src/lib/api/rental.js`; screens `src/pages/rental/*`; `src/components/ui/PhotoUploader.jsx`.

## Demo accounts (password `Demo#1234`)
`owner.active@example.com` (owner of Sunrise Apartments) · `manager.demo@example.com` (manager) · `resident01…14@example.com` (residents) · `visitor@example.com` (has an open request for room B105).

## Set up on the dev project
1. Apply the 4 migrations, then `p1_demo.sql` and `p2.sql` (SQL editor).
2. `supabase functions deploy mpesa-stk-push`.
3. `psql "$DEV_DB_URL" -f supabase/tests/p2_rls_tests.sql` should end with `ALL CHECKS PASSED`.

## For the Phase 3 developer
Resident screens replace the four `resident-*` items in `src/modules/rental/index.js` (give each an `element`). A resident pays an invoice by calling `mpesa-stk-push` with `{ purpose: "rent", cycleId, amount, phone }` (see `sendRentPrompt` in `rental.js`).
