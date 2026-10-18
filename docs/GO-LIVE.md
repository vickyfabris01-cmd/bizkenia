# Go-live checklist

Tick each line. "Test" says how to know it works. Do the demo-data and security rows first.

## 0. Clean the database
- [ ] Delete demo accounts and demo data (`*.demo@example.com`, businesses created by `supabase/seed/*.sql`). Never run the seeds on production.
- [ ] Run migrations `p5_08` and `p5_09` (and every earlier one) in order.
- [ ] Supabase > Authentication > Providers > Email: switch **Leaked password protection** on, minimum length 8 or more.
- [ ] Make yourself super admin: `update profiles set role='super_admin' where email='you@yourdomain';`

## 1. Domain and site
- [ ] Buy/point the domain; deploy `dist/` to your host with HTTPS and a rewrite of every path to `index.html` (single-page app).
- [ ] Build with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_URL=https://your-domain` (see `.env.example`).
- [ ] Edit `public/robots.txt`: replace `YOUR-DOMAIN` in the Sitemap line.
- [ ] Supabase > Authentication > URL configuration: Site URL = your domain; redirect URLs `https://your-domain/auth/callback` and `https://your-domain/reset-password`.
- Test: open the home page on a phone; install it ("Add to home screen"); switch the phone offline and reopen it.

## 2. Email
- [ ] Create a Resend account, verify your domain (SPF and DKIM records), create an API key.
- [ ] Secrets: `RESEND_API_KEY`, `MAIL_FROM="BizKenia <no-reply@your-domain>"`.
- [ ] Supabase > Authentication > SMTP settings: use the same provider so sign-up and reset emails come from your domain.
- Test: sign up with a fresh address and reset a password; both mails arrive (check spam).

## 3. Google sign-in
- [ ] Google Cloud OAuth client (Web); redirect URI `https://<project>.supabase.co/auth/v1/callback`; publish the consent screen (not "Testing").
- [ ] Paste id and secret in Supabase > Authentication > Providers > Google.
- Test: "Continue with Google" from a private window.

## 4. M-Pesa live
Full walkthrough with sandbox testing: **[MPESA-SETUP.md](MPESA-SETUP.md)**. Summary:
- [ ] Safaricom Daraja: apply for **Go Live** with your Paybill or Till; get live consumer key, secret and passkey.
- [ ] Secrets: `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY`, and a new long random (leave `MPESA_SHORTCODE` unset so Admin > Settings controls it) `MPESA_CALLBACK_SECRET` (`openssl rand -hex 32`). Do not reuse sandbox values.
- [ ] Admin > Settings: set the shortcode and environment to live as the screen shows.
- [ ] Deploy `mpesa-callback` and `sitemap` with `--no-verify-jwt`; the others with JWT verification on.
- Test: pay KSh 10 for a subscription with your own phone. Admin > Transactions shows it successful; the business turns active. Then pay with the wrong amount in sandbox only: it must show failed "Amount mismatch".

## 5. Restrict the functions to your site
- [ ] Secrets: `ALLOWED_ORIGINS=https://your-domain,https://www.your-domain`, `SITE_URL=https://your-domain`.
- Test: from another website's console, a call to `resolve-login` is blocked by the browser.

## 6. Search engines
- [ ] Sitemap address: `https://<project>.supabase.co/functions/v1/sitemap` (the robots.txt line). Add it in Google Search Console.
- Test: open the sitemap URL; it lists your active businesses and products.

## 7. Backups and recovery
- [ ] Supabase > Database > Backups: confirm daily backups. On a paid plan enable **Point in Time Recovery** (restore to any second).
- [ ] Once a month: `supabase db dump --linked -f backup-YYYY-MM.sql` and store it away from Supabase (cloud drive). Storage files (images) are not in the dump; keep the `business-media` bucket in mind.
- [ ] Practise one restore into a **new** project before launch. Runbook: create project > run the dump with `psql` > point a test build at it > sign in.
- Never restore over production without a fresh dump of the current state first.

## 8. Monitoring
- [ ] Admin > App errors: check it daily for the first two weeks. It should read "No errors reported".
- [ ] Supabase > Reports and Logs > Edge Functions: look for `mpesa-callback` errors after the first real payment.
- [ ] Supabase > Advisors: security and performance lists should show nothing in red.
- [ ] Set up a free uptime check (UptimeRobot) on your home page and the sitemap URL.
- [ ] Lighthouse (Chrome DevTools > Lighthouse, mobile) on the home page and a product page. Target 90 or more for performance, accessibility, best practices and SEO. This was not run during the build; fix anything under target.

## 9. Final rehearsal (30 minutes)
Sign up a new owner > create each of the three business types > pay the subscription > add a product > order as a customer on a second account and pay by M-Pesa > refund/cancel > open every admin screen > sign out. Run `npm run test:e2e` against the live site with the `E2E_*` variables set (see `e2e/journeys.spec.js`) using a **test** project.
