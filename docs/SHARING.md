# Sharing and marketing

Every Share button in the app opens one page: `/app/:slug/share` for a business, `/admin/share` for the site.
Each thing opens a dialog with two tabs.

- **Share as link**: WhatsApp, Facebook, X, Telegram, LinkedIn, SMS, email and Copy link. Pasted anywhere, the link
  shows a card (photo, details, logo and name) and opens the business page or the item page.
- **Share as poster**: a 1080x1350 picture to download and post (WhatsApp, Instagram, Facebook, TikTok). Paste the link in the caption.

## How the link card works
1. When the dialog opens, the browser draws a small 1200x630 card from the live data and saves it
   (`business-media/<business id>/share/...jpg`, or `site-media/share/...jpg`).
2. `set_share_card` records it in the `share_cards` table with a fingerprint of the data. If the data has not
   changed, nothing is drawn or saved again; if it changed, a new card replaces the old one.
3. The shared link is `/share/...?v=<fingerprint>`. The Cloudflare Worker (`worker/share.js`) answers link-preview
   bots with the stored card (falling back to the item photo, cover or logo), and sends people to the real page.
   The `v` changes with the data, so WhatsApp and Facebook do not show an old cached preview.

Things listed before this feature get their card the first time someone opens Share on them.

## Set up
1. Run `supabase/migrations/20261026100001_share_cards.sql` (SQL editor). Safe to run again.
2. Deploy the Worker (`npx wrangler deploy`). `run_worker_first` in `wrangler.jsonc` already includes `/share/*`.
3. Test:
   - `curl -A "WhatsApp/2.23" https://YOUR-SITE/share/b/SLUG | grep og:image`
   - Facebook: https://developers.facebook.com/tools/debug/ then Scrape Again.
   - Open the same link in a normal browser: it should land on the real page.

## Notes
- Facebook removes caption text from shared pictures; that is why the poster path asks you to paste the link.
- Only live things have link cards: an active business and products that are On sale.
- If you move storage between Supabase and R2, the card URLs saved in `share_cards` are not rewritten by
  `scripts/rewrite-storage-urls.sql`. Opening Share again after a data change draws a fresh one; to force it,
  `delete from share_cards;`.
