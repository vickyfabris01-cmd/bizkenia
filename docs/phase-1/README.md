# BizKenia — Phase 1 (foundation)

Phase 1 turns fab-rental-management into the BizKenia multi-business platform shell. Everything
here opens in the browser; screens that belong to later phases show a "Coming in Phase N" page.

## What is in Phase 1
- Public site: Home, Explore, Business page, Pricing, About, Contact, Help, Terms, Privacy, 404
- Accounts: email + password, phone number + password, Google; confirm email, forgot/reset password
- My account, My businesses, notifications
- Onboarding: choose type (Rental open; Agriculture/Shop "Coming soon") → details → subscribe (M-Pesa STK) → status
- Super admin (lite): dashboard, businesses (review, approve/reject/suspend/reinstate, record payment), users, settings (brand, prices, approval mode)
- Business app frame: `/app/:slug` with role-based menu from the module registry, mobile bottom tabs + More, getting-started dashboard
- Light / dark / system theme, skeleton loaders

## Not in Phase 1
Properties, rental requests, residents, tenancies, billing, complaints, workforce, reports (Phases 2–4),
cart (Phase 5). Their menu items exist and open a placeholder.

## Files
- SETUP.md — environment, Supabase, Google, M-Pesa, email, first super admin, demo accounts
- CONTRACTS.md — what Phase 2+ developers can rely on
- ACCEPTANCE.md — click-through test script
- CHANGELOG.md

## Known base issues (not caused by Phase 1)
- `npm run lint` fails: ESLint 8 is installed but `eslint.config.js` is ESLint 9 flat config.
- Two paths committed wrongly were fixed: `pages/public/PreviewPage` moved to `pages/preview/`, and
  `components/modals/Modals.css` renamed `Modal.css`.
- Legacy pages (old tenant/manager/client/admin screens) are still in `src/pages/*` behind
  `VITE_ENABLE_LEGACY_PAGES`. They were all deleted in Phase 5 step 4.
