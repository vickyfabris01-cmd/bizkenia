# Phase 5, step 4 — Hardening and launch (release 1.0)

Built on `8c2d4da` (phase 5 step 3). Two new migrations, five edge functions changed, one added.

## Apply, in this order
1. **Run the migrations** in the SQL editor: `20261019100001_p5_08_hardening.sql`, then `20261019100002_p5_09_cleanup.sql`. Both are safe to run twice.
2. **Set the secret** `MPESA_CALLBACK_SECRET` (Supabase > Edge Functions > Secrets). *The callback now refuses every call while it is unset.* Add `ALLOWED_ORIGINS` and `SITE_URL` as well (see `docs/GO-LIVE.md`).
3. **Deploy the functions:** `resolve-login`, `mpesa-stk-push`, `mpesa-status`, `send-email` (normal), `mpesa-callback` and `sitemap` with `--no-verify-jwt`. The `_shared` folder ships with them.
4. **Deploy the site** (`npm ci && npm run build`, publish `dist/`).
5. Remove the leftover legacy files by running `scripts/delete-legacy.sh` if you unpacked the release over an old checkout (a zip cannot delete files). A fresh clone of the release needs nothing.

## Security review: what was found and fixed
| Finding | Fix |
|---|---|
| Visitors who are not signed in (`anon`) held insert/update/delete rights on every table (RLS was the only guard). | `p5_08` revokes write rights from `anon` everywhere and `truncate/references/trigger` from everyone but the system. |
| Every database function was callable by anyone, including internal ones such as `mark_intent_paid` (marks a payment as received). | Functions are closed to the public by default. Only the lookups the public site needs stay open to visitors; the payment-recording and helper functions are reachable only by the system. |
| Some functions had no fixed `search_path`. | Set to `public` on all of them. |
| Old storage rules let any signed-in user write to tenant document, invoice and property-image folders. | Dropped; replaced earlier by business-scoped rules. Duplicate avatar rules removed. `business-media` limited to 5 MB and JPEG/PNG/WebP. |
| Branding of suspended businesses was readable. | Only active businesses (and their staff and the super admin) can read it. |
| M-Pesa callback accepted a payment of any amount for an intent, and ran without a secret if none was set. | It fails closed without the secret, compares the secret in constant time, and marks the payment **failed** when the amount paid differs from the amount asked. |
| No limit on payment prompts. | Three per user per minute; a switched-off account cannot start one. |
| Edge functions answered any website. | `ALLOWED_ORIGINS` restricts browser callers to your domain. |

Not changed, with reasons: leaked-password protection is a dashboard toggle (Authentication > Providers > Email), see the checklist. `pg_graphql` is enabled by Supabase; the app does not use it and the revokes above leave it nothing to expose. If you want it gone: `drop extension pg_graphql;`.

## What else is in it
- **Accessibility:** public pages pass the automated WCAG 2 A/AA rules (axe). One real finding was fixed: the green used for link text on white was 3.3:1; text links now use the darker link colour (5:1). A skip link, landmarks and visible focus were already there.
- **SEO:** a title, description, canonical address and social card per page; shops, products and businesses carry structured data (Store, Product with price and stock, LocalBusiness). Private, cart and unknown pages are `noindex`. `robots.txt` plus a `sitemap` function listing every active business and product.
- **Installable app:** web manifest, icons, a small service worker (production only). Opened offline you get the last page shell, or a friendly offline page. Data is never cached.
- **Performance budget:** `npm run check:budget` fails when first-load JavaScript passes 200 KB gzipped (now 126 KB), CSS 40 KB (now 9 KB), or any chunk 130 KB (largest 108 KB).
- **Monitoring:** crashes (uncaught errors, failed promises, error boundaries) are reported to the database; **Admin > App errors** shows them grouped, with the trace. At most five reports per page load per visitor, rate limited in the database, auto-deleted after 30 days.
- **Cleanup:** 100+ unreachable legacy files removed (old pages, FastAPI client code, old stores), the `tenants` compatibility view dropped, the FastAPI proxy and variables removed, unused fonts dropped, **theme now follows the device by default**.
- **Tests:** Playwright end-to-end suite in `e2e/`, see `docs/TEST-REPORT.md`.

## Known limits
- Maintenance mode is enforced in the browser only. It is a courtesy screen, not a security control.
- Pushing to the repository was not possible from the build session, so this ships as a zip.
- Lighthouse was not run in the build environment. Run it once on the live site (`docs/GO-LIVE.md`).
