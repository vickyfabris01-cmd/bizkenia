# Phase 5, step 5 — Fixed subscription plans

Built on `cfc0d33`. Two new migrations, two new tests, one edge function changed, one new admin card.

## What changed
- **Every business type has the same four plans:** Monthly, Quarterly, Half a year, Yearly (30 / 90 / 180 / 365 days). That is 12 fixed slots (shop, agriculture, rental × 4). The durations live in a locked database table, `plan_durations`; nobody can add, change or delete one.
- **The super admin only types an amount** and switches a plan on or off (Admin > Settings > Subscription prices). The database fills in the plan's code, name, length and order itself, and refuses any attempt to change a plan's type or duration.
- **Savings are worked out, never typed.** A longer plan is measured against the same type's monthly price. Pricing page, subscribe page and the admin grid all show "Save KSh X (Y%)". The database refuses a longer plan that costs more than its months at the monthly price, and refuses to lower the monthly price below a longer plan. **Set the monthly price first.**
- **A plan can only be on sale when it has a price.** A slot with no price (or switched off) shows "Not available yet" on the Pricing page and cannot be bought.
- **Optional Offer plan** (one per type): its own name, one of the four durations, an optional start and end date (Nairobi dates). It appears to owners only while it is on, priced and inside its dates, and carries an "Offer" badge.
- **Pricing page** shows three cards (Shop, Agriculture, Rental): monthly price as the headline, the longer plans with their savings, the open offer if any. The button starts a business of that type (`/start/details?type=…`).
- **Business types are always on** (`DEFAULT_MODULES` is now all true). Only a single business can be suspended.
- **Reset (done by the migration):** all old free-form plans are cleared; one old plan per type and duration is kept so past payments still point at a plan. Every price is 0 and every plan is off until you set prices.
- **Payments are checked in three places:** the M-Pesa prompt function, the database lookup, and "Record payment" by an admin (`p5_14`) all refuse a plan that is not on sale or belongs to another business type.

## Apply, in this order
1. SQL editor: `supabase/migrations/20261020100004_p5_13_fixed_plan_slots.sql` (already applied if you ran it earlier), then `20261020100005_p5_14_record_payment_checks.sql`. Both are safe to run twice.
2. Redeploy the edge function: `supabase functions deploy mpesa-stk-push`.
3. Deploy the site (`npm ci && npm run lint && npm run build`).
4. Sign in as super admin > Admin > Settings > Subscription prices. For each type enter the **monthly** price, switch it on, **Save**; then the other three.

## Run the tests (SQL editor, each ends with a result row)
- `supabase/tests/p5d_plan_slots_tests.sql` (already in the repo) — the 12 slots, the locked durations, the price rules, the offer, who can read what. Ends with `ALL PLAN SLOT CHECKS PASSED`.
- `supabase/tests/p5e_record_payment_tests.sql` — recording a payment by hand: wrong type, plan off, unknown plan, valid payment, non-admins. Ends with `ALL RECORD-PAYMENT CHECKS PASS`. Needs one existing business and one super admin.

## Things to know
- **Demo data:** `supabase/seed/p5c.sql` picks an *active* plan per type, and the reset switched all plans off. Set the prices first, then run the seed (it skips a type that has no plan on sale).
- **Business dashboard:** it reads the plan name through a join; for a business whose plan has since been switched off the name falls back to "Plan". The subscription itself (amount, dates) is unaffected.
- A plan can be switched off but never deleted, so history always has a plan to point to.
