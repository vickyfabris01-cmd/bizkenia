# Phase 1 setup

## 1. Run locally
```
cp .env.example .env.local
npm install
npm run dev
```
Build check: `npm run build`.

## 2. Supabase (project vhjptjbonpzpohdqydrt)
Migrations are in `supabase/migrations/` (p1_01 … p1_06) and are already applied to the dev project.
For a new project run them in order. Edge functions in `supabase/functions/`:
`resolve-login`, `mpesa-stk-push`, `mpesa-callback`, `mpesa-status`, `send-email` (all deployed).

Phone + password login works through `resolve-login` (phone → login email). No SMS codes.

## 3. Google sign-in
1. Google Cloud Console → OAuth client (Web). Authorised redirect URI: `https://<project>.supabase.co/auth/v1/callback`.
2. Supabase → Authentication → Providers → Google: paste client id/secret, enable.
3. Supabase → Authentication → URL configuration: Site URL = your app URL; add redirect URLs
   `<app>/auth/callback` and `<app>/reset-password` (plus `http://localhost:5173/...` for dev).

## 4. M-Pesa (Daraja sandbox)
Supabase → Edge Functions → Secrets:
`MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY`, optional `MPESA_SHORTCODE` (sandbox 174379),
`MPESA_CALLBACK_SECRET` (any long random string; the callback URL is protected by it).
Callback URL given to Daraja: `<project-url>/functions/v1/mpesa-callback?secret=<MPESA_CALLBACK_SECRET>`.
Until credentials exist, the super admin can use "Record payment" on a business to activate its subscription.

## 5. Email (optional)
Secrets `RESEND_API_KEY`, `MAIL_FROM`. Supabase auth emails (confirm/reset) use Supabase's own SMTP settings.

## 6. First super admin
Sign up normally, then in SQL: `update profiles set role='super_admin' where email='you@example.com';`
(fabrisvicky1@gmail.com is already super admin in the dev project.)
Then set brand, support email/domain, prices and approval mode in Admin → Settings.

## 7. Demo accounts (DEV ONLY — delete before production)
Seed: `supabase/seed/p1_demo.sql`. Password for all: `Demo#1234`
- owner.active@example.com / 0711000001 — Sunrise Apartments + Greenview Hostels (active)
- owner.two@example.com / 0711000002 — Coastline Stays (active)
- owner.pending@example.com / 0711000003 — Lakeview Rentals (pending review)
- owner.rejected@example.com / 0711000004 — Hilltop Hostel (rejected, with reason)
- visitor@example.com / 0711000005 — no business
Delete: remove these users from Authentication → Users (businesses cascade).
