# Phase 5, step 2: storefront, cart, M-Pesa checkout, my orders, wishlist, order help, plus two fixes

Built on main `9290921` ("phase 5 step 1/a").

## Run these, in this order
1. `supabase/migrations/20261018100001_p5_05_account_lock_and_types.sql`
2. `supabase/migrations/20261018100002_p5_06_storefront_checkout.sql`
3. Deploy the edge function: `supabase functions deploy mpesa-stk-push` (it now accepts `purpose: "order"`).
4. `npm install` is not needed (no new packages).

The step-1 README said p5_05/p5_06 were held back; these two files replace those names (new timestamps).
The old `p5_06 enable shop` is not needed: the type switch is gone and the migration sets `modules` to all true.

## Fix 1: business types can no longer be locked
- Removed the "Business types" card from Admin > Settings, and the type check in `create_business` and in onboarding.
- Locking is per business: Admin > Businesses > suspend (already existed). A suspended business disappears from Home, Explore and its public page.
- Why the old switch seemed to do nothing: only onboarding read it; Home and Explore used fixed flags.

## Fix 2: a switched-off user is really locked
- "Switch off" now calls `admin_set_user_active`: sets the flag, bans the login in Supabase Auth, ends their sessions.
- Every membership helper (`is_staff`, `is_business_member`, `is_business_owner`, `is_resident_of`, `member_role`) now needs an active account, so a locked person cannot work in any business, start one or order.
- The browser signs a locked person out at sign-in and when they return to the tab, and the login page says "This account has been switched off. Please contact support."
- A super admin cannot switch off themselves or another super admin. Switching on lifts the ban.
- A locked person cannot re-register with the same email or phone (both stay taken).

## Shopper side (new)
| Address | Page |
|---|---|
| `/b/:slug` | shop front (for shops; rentals and farms keep the old page) |
| `/b/:slug/browse` | search, category, sort |
| `/b/:slug/p/:productId` | product, gallery, add to cart, buy now, wishlist heart |
| `/b/:slug/cart` | cart for one shop |
| `/b/:slug/checkout` | sign-in required; 3 steps: delivery or pickup, payment, review |
| `/orders`, `/orders/:id` | my orders, tracking timeline, Pay now, cancel while unpaid, Get help |
| `/wishlist` | saved products |

- The cart lives in the browser (localStorage), so it survives sign-in. Price, stock and delivery fee are always decided by `place_order` in the database.
- Checkout reserves stock immediately. An unpaid M-Pesa order can be cancelled by the customer (stock returns); a paid one needs "Get help".
- M-Pesa: the prompt goes to the shop's own paybill/till if the owner saved one (new "M-Pesa payments" card in shop Settings). On a live system with none saved the customer is told to contact the shop; sandbox falls back to the platform shortcode.
- Not configured or failed prompts: the owner can press **Confirm M-Pesa payment** on the order.
- Pay on delivery appears only when the seller switched it on.
- Order help creates a Phase 3 support ticket linked to the order (`support_tickets.order_id`, category `order`); the platform team and the shop's staff are notified.

## Known limits
- The cart is not synced across devices (it is per browser).
- Unpaid M-Pesa orders keep their stock reserved until paid or cancelled. An automatic expiry can come with step 4.
- Reviews are left out, as planned.
- Refunds of paid, cancelled orders are still done outside the app.

## Checks done
Clean `vite build` on main + these files; ESLint clean on every new or changed file; the two migrations applied on a scratch Postgres with checks for totals, free delivery, overselling, bad quantities, duplicate lines, cancel restock, other-customer isolation, M-Pesa paid once only, seller confirm, direct table writes refused, and the account lock (ban, helpers, create_business).
Not run against your live project or the real Daraja API.
