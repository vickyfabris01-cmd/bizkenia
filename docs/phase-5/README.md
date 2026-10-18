# Phase 5 — Shop, platform finance and launch

Built on commit `f1bfb50` (brand logo). Phase 5 is delivered in steps; this is **step 1 of 4**.

| Step | What | Status |
|---|---|---|
| 5A | Shop database and the seller side (products, orders, inventory, customers, settings) | **This delivery** |
| 5B | Storefront for shoppers: shop home, browse, product page, cart, checkout with M-Pesa, my orders, wishlist, order help | Next |
| 5C | Platform finance: transactions, revenue, reports, audit log viewer, maintenance page | After 5B |
| 5D | Hardening and launch: security, accessibility, performance, installable app, go-live checklist, remove legacy code | Last |

## Step 5A: what is in it
- Migrations `20261017100001` to `20261017100004` (p5_01 catalogue, p5_02 orders, p5_03 settings, p5_04 security).
  `p5_05` (platform views) and `p5_06` (enable shop) are held back for 5C and 5B.
- Shop module `src/modules/shop` and screens in `src/pages/shop/`: Dashboard, Products (with categories and up to five photos),
  Orders (tabs, detail, process / ship / ready for pickup / deliver / cancel, timeline), Inventory (stock in, out, recount, history),
  Customers, Settings (delivery fee, free-delivery amount, pickup, pay on delivery, plus the logo and cover cards).
  Reports opens the ComingSoon page (it arrives with 5C).
- `src/lib/api/shop.js`, `supabase/seed/p5.sql`.

## Rules the database enforces
- A product's stock changes only through `record_shop_stock` (seller) or the internal `_shop_move_stock` (orders). It can never go below zero and every change is in the product's history.
- Shoppers see only products that are **On sale** in a shop that is **active**. Draft and archived products are hidden.
- A customer sees only their own orders, addresses, cart and wishlist. The owner and managers see their shop's orders. Nobody writes orders directly; `set_order_status` allows only valid steps, notifies the customer, and **puts stock back when an order is cancelled**.
- Pay on delivery is **off by default**. Commission is not charged (revenue is subscription only), as the plan's defaults say.
- Cancelling a paid order does not refund it. The seller refunds through M-Pesa, and the order screen says so.

## Apply
1. Run the four migrations in order (they are safe to run twice).
2. Optional demo data (development projects only): `supabase/seed/p5.sql` after `p1_demo.sql`.
   Accounts (password `Demo#1234`): `shop.demo@example.com` (owner of "Mama Njeri Mart"), `buyer.demo@example.com` (a customer).
3. To let people start a shop: Admin > Settings > Business types > switch **Shop** on. (The shop type is now marked open in `src/config/counties.js`; the switch still decides. It stays off until you turn it on.)

## Click-through test (step 5A)
1. Sign in as `shop.demo@example.com`, open Mama Njeri Mart. Dashboard shows 2 new orders, sales, 9 products on sale and 4 low or out.
2. Products: search "rice", filter by Drinks, add a product with two photos, make the second main, save. Edit it and remove a photo; the file is deleted from storage. Delete a category: its products stay.
3. Inventory: open "Low or out". Update White sugar with Stock in 20, then try Stock out 100 and see "Only 24 in stock". Open History.
4. Orders: open the paid order, Start processing, then Mark as shipped, then Mark as delivered; check the timeline. Cancel the awaiting-payment order and see the stock go back.
5. Sign in as `buyer.demo@example.com`; the notification bell shows each order step.
6. Customers: Brian Otieno with his order count and total (cancelled excluded).
7. Settings (owner): change the delivery fee, switch pickup on without an address and see the message, upload a logo and a 16:9 cover and see them on the business card.
8. Sign in as a manager of the shop (invite one): Settings is not in the menu; Products, Orders and Inventory work.

## Not in this step
Shopper-facing pages and the cart; paying for an order with M-Pesa (the `mpesa-stk-push` purpose `order` and the callback); wishlist; order help tickets; platform finance; maintenance mode; hardening and launch.
