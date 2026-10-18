# Contracts for Phase 2+

## Module registry (`src/modules`)
`registerModule({type,label,nav:[{id,label,icon,path,phase,roles,element?,end?}]})`. To build a screen
set `element` (a lazy component) on the nav item in `modules/rental/index.js`; nothing else changes.
Items without `element` render `ComingSoonPage`. Screens render inside `/app/:slug/*`; use `<h2>` for page
headings (TopBar owns the h1). Admin menu: `modules/adminNav.js`.

## Guards (`src/router/guards.jsx`, `BusinessContext.jsx`)
`RequireAuth`, `RequireSuperAdmin`, `RequireMember`, `RoleRoute`. Inside `/app/:slug`,
`useBusiness()` gives `{business, role, ...}`.

## Stores
- `store/sessionStore.js` (`useSession`) — session, profile, sign in/up/out, Google, reset. It replaces the
  planned `authStore.js` name; the old `authStore.js` is legacy-only.
- `store/platformStore.js` — brand/modules/pricing settings. `hooks/useBrand.js` reads it.
- `store/businessStore.js` — the user's businesses and memberships.

## Libs
`lib/permissions.js` (`can`, `useCan`, `roleOf`), `lib/phone.js` (`toE164`, `isKenyanMobile`),
`lib/format.js` (`formatKsh`, dates, `STATUS_BADGE`), `lib/mpesa.js` (`startStk`, `watchPayment`),
`lib/notify.js`, `lib/api/{directory,businesses,notifications}.js`.

## Database
Tables: `businesses` (was `tenants`; `tenants` view kept for old code), `business_members`
(one active owner per business), `platform_settings`, `subscription_plans`, `payment_intents`,
`business_subscriptions`, `audit_log`, `notifications`.
Helpers: `is_business_member`, `is_business_owner`, `is_member`, `member_role`, `is_business_active`,
`create_business`, `admin_review_business`, `admin_record_payment`, `resubmit_business`,
`mark_intent_paid` (service role), `notify`, `normalize_phone`, `phone_available`, `public_stats`.
Phase 2 tables must carry `business_id` and use `is_business_member(business_id)` in RLS.
Storage bucket `business-media`.

## Styling
Tokens only (`styles/tokens.css`), no hex. 44px touch targets. Breakpoints 480/768/1024/1280.
`--color-nav-*` are for the dark sidebar only.
