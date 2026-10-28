# Changelog

## Share rework (one picker, icon buttons, card and poster page)
Built on `e747c89`. See `docs/SHARING.md`. Needs migration `20261027100001_share_options.sql`, run **before** deploying the app; redeploy the Worker too.
Every item, business and site page has a share icon that opens one platform picker over the current screen (no page change). The Share and promote pages now only show and download the card and the poster. Shared cards and messages never show quantities (items are "Available", "Out of stock" or "Fully occupied"; the site cards say what the platform solves, with no business counts). Out-of-stock items and full room types ask "Share anyway?". Each business chooses what shows (rent price, phone, address) under Settings > Share and promote; the super admin chooses whether the Pricing card shows plan prices.

## Brand studio (drawn logos and avatars)
Built on `8323024`. See `docs/BRAND-STUDIO.md`.
Every business gets a designed logo and every person a designed avatar, drawn in the browser from a tiny saved recipe instead of a stored picture. Owners pick from six designs when they create a business (or upload their own); people pick an avatar at sign-up. Skipping picks the first design. Existing rows with nothing saved get a stable design worked out from their id. Needs migration `20261025100001_brand_designs.sql`, run **before** deploying the app.

## Phase 6 step 1 (delete a business, hand over ownership, delete an account)
Built on `fc723b1`. See `docs/phase-6/STEP-1.md`.
Delete business with a 60-day freeze and restore, ownership hand-over between owner and manager, delete my account (password required), support close and restore, daily purge job with file clean-up and a day-50 reminder, platform billing records kept after a purge, people removed from records show as "Deleted user" (`p6_01`, `p6_02`).

## 1.0.0 — Phase 5 step 4 (hardening and launch)
Built on `8c2d4da`. See `docs/phase-5/STEP-4.md`.
Security hardening (`p5_08`), cleanup (`p5_09`), safer M-Pesa callback and function CORS, SEO and structured data, installable offline shell, error monitoring with an admin screen, performance budget, accessibility fix, Playwright tests, go-live checklist, legacy code removed, theme follows the device.

## Phase 5 steps 1–3
Shop (database, seller side, storefront, checkout with M-Pesa, orders) and platform finance (transactions, revenue, reports, audit log). `docs/phase-5/`.

## Phases 1–4
Platform and accounts, rentals, people and support, farms. `docs/phase-1/` to `docs/phase-4/`.
