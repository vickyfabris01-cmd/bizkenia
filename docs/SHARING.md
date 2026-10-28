# Sharing and marketing

There are two separate jobs, and each has its own place.

## 1. Sending a link: the share icon
Every business, room type, product and item of produce has a small **share icon**. The three site pages
(Main site, Explore, Pricing) have one on the admin dashboard, and the super admin's Settings page has
"Share the site". Tapping an icon opens a small window **over the current screen** with the supported places:
WhatsApp, Facebook, X, Telegram, LinkedIn, SMS, Email and Copy link. Nothing navigates and no extra page opens
until the person picks a place.

Where the icons are:
- Business dashboard (rental, shop and farm): "Share your business and rooms / products / produce", the business and the five latest things.
- Properties (a room type), Products and Produce (every item on sale, and "Share this product" in the edit form).
- Settings: "Share this business".
- Super admin dashboard: one icon for each of Main site, Explore and Pricing. Settings: "Share the site".
- After adding something, "Share it now?" opens the same window.

**Out of stock or fully occupied.** The icon stays. Tapping it asks the owner or manager "Share anyway?". Yes opens the
window and the card says "Out of stock", "Fully occupied" or "Not available yet". No does nothing.

## 2. The card and the poster: Share and promote
`/app/:slug/share` (a business) and `/admin/share` (the site) are where the **card** and the **poster** are seen and
downloaded. Each row has "Card and poster", which opens a window with two tabs:
- **Poster**: 1080x1350, to post on WhatsApp, Instagram, Facebook, TikTok or a status. Download as PNG.
- **Card**: 1200x630, what people see when the link is pasted. Download as JPEG.
There are no platform buttons on these pages. Old links such as `/app/:slug/share?open=<id>` still work and open that thing's card and poster.

## What a share says
- **No quantities.** Never "5 rooms available", "only 3 left" or "12 businesses on the platform". An item is "Available",
  "Out of stock", "Fully occupied" or "Not available yet".
- **Site cards sell the platform**: what it solves (collect rent and track every payment, sell online and get paid by M-Pesa,
  keep farm records and sales in one place), never how big it is. The lines are in `BENEFITS` in `src/lib/share.js`.
- **Prices**: product and produce prices always show. Rent can be hidden by the owner. Plan prices on the Pricing card are
  off unless the super admin turns them on.

## What each business chooses (Settings > Share and promote)
| Switch | Who | Effect |
|---|---|---|
| Show rent price | rentals | the rent on room cards, posters, link previews and messages |
| Show phone and WhatsApp number | every business | the contact rows on the business card and poster |
| Show address and county | every business | the place on cards, posters, previews and messages |
| Show plan prices on the Pricing card | super admin (site) | "from KSh X a month" on the Pricing card (default off) |

Saved in the `share_options` table through `set_share_options` (the owner, or the super admin for the site) and read with
`get_share_options`. The Worker reads them too, so a pasted link follows the same choices as the card. Changing a switch
changes the card's fingerprint, so a fresh card is drawn and saved the next time that thing is shared.

## How the link card works
1. When the share window opens, the saved card is looked up (`share_cards`). If the data has not changed, nothing is drawn
   or saved again. If it changed, the browser draws a 1200x630 card from the live data and saves it
   (`business-media/<business id>/share/...jpg`, or `site-media/share/...jpg`).
2. `set_share_card` records it with a fingerprint of the data.
3. The shared link is `/share/...?v=<fingerprint>`. The Cloudflare Worker (`worker/share.js`) answers link-preview
   bots with the stored card (falling back to the item photo, cover or logo), and sends people to the real page.
   The `v` changes with the data, so WhatsApp and Facebook do not show an old cached preview.

Things listed before this feature get their card the first time someone opens Share on them.

## Set up
1. Run `supabase/migrations/20261026100001_share_cards.sql` if you have not (SQL editor), then
   `supabase/migrations/20261027100001_share_options.sql`. Both are safe to run again.
2. Deploy the app, then the Worker (`npx wrangler deploy`). `run_worker_first` in `wrangler.jsonc` already includes `/share/*`.
   Run the migration **before** the app: until it exists the switches cannot be saved (sharing itself keeps working with the defaults).
3. Test:
   - `curl -A "WhatsApp/2.23" https://YOUR-SITE/share/b/SLUG | grep og:image`
   - Facebook: https://developers.facebook.com/tools/debug/ then Scrape Again.
   - Open the same link in a normal browser: it should land on the real page.
   - Turn "Show rent price" off, open Share on a room type: the preview text and the card no longer show the rent.

## Notes
- Facebook removes caption text from shared pictures; that is why the poster is posted with the link pasted in the caption.
- Only live things have link cards: an active business and products that are On sale.
- All cards drawn before this change are drawn again once (the design version went from c3 to c4).
- If you move storage between Supabase and R2, the card URLs saved in `share_cards` are not rewritten by
  `scripts/rewrite-storage-urls.sql`. Opening Share again after a data change draws a fresh one; to force it,
  `delete from share_cards;`.
