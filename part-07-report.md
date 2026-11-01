# Part 7 report: Google sign-in switch, fingerprint login, settings quick-nav (BizKenia)

## Read this first
1. **Not run here: `npm run lint`, `npm run build`, `npm run check:budget`, `npm run test:worker`.** This workspace could not reach the npm registry (`npm ci` failed, `curl` to registry.npmjs.org returned no answer, with and without the proxy), so `node_modules` could not be installed. I did not invent output. **Please run those four commands after unzipping** (section "What you must run"). What I ran instead is listed under "Test output".
2. **Not run here: the four Edge Functions.** No Deno, and `@simplewebauthn/server` could not be downloaded. They parse (esbuild) and were checked line by line against the v13 API, but have never executed. Treat them as untested until the Android test list below passes.
3. **Not tested on a real Android phone, on real Supabase, or with real Google.** Your Android checklist is at the end.
4. **You did not answer my four questions about Job B**, so I used the defaults I proposed. They are listed under "Decisions I made".
5. **Base commit: `36d51cd0fc0b4e031fb911b66b92a5521d9a751d`** (head of `main` at the time; the brief said `c3b9cb7`). The only file that differs between the two is `src/pages/public/HomePage.css`, which is not mine. `main` did not move while I worked as far as I checked at the start; re-check before merging.

## Files (23)
NEW (11)
- `supabase/migrations/20261028100001_auth_providers.sql`
- `supabase/migrations/20261028100002_webauthn.sql`
- `supabase/tests/webauthn_tests.sql`
- `supabase/functions/webauthn-register-options/index.ts`
- `supabase/functions/webauthn-register-verify/index.ts`
- `supabase/functions/webauthn-login-options/index.ts`
- `supabase/functions/webauthn-login-verify/index.ts`
- `src/lib/biometric.js`
- `src/components/ui/SectionNav.jsx`
- `src/components/ui/SectionNav.css`
- `src/components/ui/icons/AuthIcons.jsx` (only `FingerprintIcon`; `Icon.jsx` has no fingerprint)

MODIFIED (12)
- `src/store/platformStore.js`, `src/store/sessionStore.js`
- `src/components/auth/GoogleButton.jsx`, `src/components/auth/AfterSignIn.jsx`
- `src/pages/auth/LoginPage.jsx`, `src/pages/auth/AuthCallbackPage.jsx`
- `src/pages/account/AccountPage.jsx`
- `src/pages/admin/PlatformControls.jsx`, `src/pages/admin/AdminSettings.jsx`
- `src/pages/rental/SettingsPage.jsx`, `src/pages/shop/ShopSettingsPage.jsx`, `src/pages/farm/FarmSettingsPage.jsx`

In your list but **not changed**: `SignupPage.jsx` (it already uses `GoogleButton`, so it gets the greyed state for free), `PhoneInput.jsx` (not needed), and everything outside the list (`rateLimit.ts`, `resolve-login`, `Icon.jsx`, `ui/index.js`, all share files). Deleted or moved files: none, so no `git rm` / `git mv`. `package.json` and the lockfile are not in the zip.

## What I changed in each modified file (so you can grep after merging)
- **`platformStore.js`**: new exports `DEFAULT_AUTH_PROVIDERS`, `normalizeAuthProviders()`; private `fetchAuthProviders()` (calls the `auth_providers` RPC, no fallback); new state `authProviders`; `load()` now also reads it (unreadable means Google stays off); `apply("auth_providers", value)`. The maintenance code is untouched.
- **`sessionStore.js`**: the `get isSuperAdmin()` getter is removed (grep before: only its own definition and a comment line 8, now fixed). Nothing else.
- **`GoogleButton.jsx`**: `ready` selector from `usePlatformStore`; when not ready (flag off or still loading) an early return renders a disabled, `aria-disabled` button labelled "Google (not available yet)" with a greyed mark and **no click handler**. The enabled path is unchanged.
- **`AfterSignIn.jsx`**: new exports `needsPhone(user, profile)` and `PhoneStep()`; the default export `AfterSignIn` shows `PhoneStep` instead of redirecting while `needsPhone` is true.
- **`AuthCallbackPage.jsx`**: `phoneFirst = needsPhone(...)`; the redirect effect waits for it; renders `<PhoneStep />`.
- **`LoginPage.jsx`**: state `fpReady`, `fpBusy`; an effect that sets `fpReady` only if `deviceHasEnrolment()` and `biometricSupported()`; handler `fingerprint()`; a "Sign in with fingerprint" block between the form and the "or" divider. The password path and `submit()` are unchanged.
- **`AccountPage.jsx`**: new component `FingerprintCard` above `AccountPage` (device list, "Enable fingerprint" / "Add this device", Remove with a confirm dialog); `<FingerprintCard />` placed before the Appearance card; imports `Badge`, `useRef`, `ConfirmDialog`, `FingerprintIcon`, the biometric helpers and `formatDate`.
- **`PlatformControls.jsx`**: new export `AuthProvidersCard`, const `AUTH_MISSING`, import `normalizeAuthProviders`. It saves through the existing `saveSetting()`, so the database writes the audit entry exactly as for Maintenance. `MaintenanceCard` and `CommissionCard` are untouched.
- **`AdminSettings.jsx`**: const `SECTIONS`, `<SectionNav>`, ids on every card, and `<AuthProvidersCard />` right after the Maintenance card.
- **`rental/SettingsPage.jsx`, `shop/ShopSettingsPage.jsx`, `farm/FarmSettingsPage.jsx`**: const `SECTIONS`, `<SectionNav items={SECTIONS} />` under `PageHead`, an `id` on each section. Components I should not edit (logo, cover, M-Pesa card, danger zone, share options) are wrapped in a `<div id="..." className="sec-anchor">`; plain cards got the `id` directly. **Inside "Share and promote" nothing changed**, only its wrapper has an id.
- **`SectionNav.css`** also holds the `.sec-anchor` helper (a flex wrapper whose child fills it, so a card keeps its size in a grid).

Section ids (for support): rental `set-billing, set-rooms, set-mpesa, set-profile, set-branding, set-share, set-danger`; shop `set-delivery, set-profile, set-mpesa, set-branding, set-share, set-danger`; farm `set-profile, set-recorded, set-branding, set-mpesa, set-share, set-danger`; admin `set-brand, set-hero, set-approval, set-prices, set-share, set-mpesa, set-maintenance, set-auth, set-commission`. The admin bar has the five you listed (Brand, Approval, M-Pesa, Maintenance, Commission) plus the new Sign-in card, Home page, Prices and Share and promote.

## Job A: Google sign-in
- **Flag:** platform setting `auth_providers = { google: boolean }`, default **off**. `auth_providers()` is `security definer`, `search_path = public`, revoked from public, granted to `anon` and `authenticated`, and returns only `{ google }`. A trigger cleans any value written (anything but the JSON value `true` becomes false; extra keys dropped). Writes are super admin only (existing policy) and audited by the existing `trg_audit_settings` trigger. `maintenance` is not touched.
- **The switch controls the button only.** It does not turn the provider off inside Supabase. Keep the provider off in the Supabase dashboard until you want it on, otherwise someone calling the API directly can still use it.
- **Phone step:** shown to a Google account whose `profiles.phone` is empty, at `/auth/callback` and when a signed-in person opens `/login`. It validates a Kenyan mobile (`lib/validate.js`), checks `phone_available` (unique index `profiles_phone_norm_uq` is the final guard, and `updateProfile` already turns a clash into a friendly message), saves as `07xxxxxxxx` through `updateProfile`, then the normal onboarding continues. There is a "Sign out" link and **no Skip**.
- **Gap you should know about:** the step lives in the two pages that Google redirects to. A Google user who types a dashboard URL straight into the browser before saving a phone is not stopped, because the route guards are not in my file list. If you want that closed, `guards.jsx` needs a small `needsPhone` check (I can do it as a follow-up).
- **Google settings you must configure** (the dashboard values below are the standard ones; I could not check your live project):
  1. Google Cloud Console, OAuth client (Web): Authorized redirect URI = `https://<your-project-ref>.supabase.co/auth/v1/callback`; Authorized JavaScript origins = your site (`https://<your-domain>`, plus `https://www.<your-domain>` if used). Publish the consent screen (not "Testing").
  2. Supabase > Authentication > Providers > Google: paste the client id and secret, switch on.
  3. Supabase > Authentication > URL configuration: Site URL = `https://<your-domain>`; Redirect URLs = `https://<your-domain>/auth/callback`, `https://<your-domain>/reset-password`, and for development `http://localhost:5173/auth/callback`.
  4. Then Admin > Settings > **Sign-in methods** > switch on > Save.

## Job B: fingerprint / device biometrics
**How it works.** Enrol: signed-in person taps "Enable fingerprint" > `webauthn-register-options` (challenge + rules: built-in authenticator only, discoverable passkey, user verification required) > phone makes the passkey > `webauthn-register-verify` checks it and saves the **public key only**. Sign in: "Sign in with fingerprint" > `webauthn-login-options` (a challenge, no account named) > phone shows the passkeys it holds for the site > `webauthn-login-verify` checks challenge, signature, origin, relying party, user verification and counter > creates a one-time `magiclink` token hash with the admin API (no email is sent) > the browser trades it for a normal session with `verifyOtp`.

**Honest limit, as in the brief:** the web cannot demand a fingerprint specifically; the phone chooses fingerprint, face or screen PIN. The UI says "Fingerprint / device biometrics".

- **Tables:** `webauthn_credentials` (browser can SELECT only `id, user_id, credential_id, device_label, transports, created_at, last_used_at`, and DELETE its own rows; **`public_key` and `counter` cannot be read from the browser**, no insert or update from the browser) and `webauthn_challenges` (no browser access at all). `webauthn_consume_challenge()` deletes and checks in one statement, so a challenge works once, within 5 minutes, for its own purpose (and its own person for enrolment). Both helper functions are service-role only.
- **Env vars and pinned origin:** relying party id and origin come only from env vars, never from the request.
- **Rate limits** use the Part 6 helper **without changing it**: sign-in verify uses identifier `fp:<credential id>` with the default 5 per 15 min plus 20 per IP; challenge hand-out uses `fpo:<ip>` as the identifier (120 per 15 min) and passes **no IP**, so many Kenyan customers behind one mobile address cannot lock each other out through it. If no trusted IP header is present, the options function is not throttled (same fail-open stance as Part 6).
- **Counter:** many Android phones always report 0. 0 to 0 is accepted; a non-zero counter that does not increase is refused and logged (possible cloned passkey).
- **Switched-off accounts** (`profiles.is_active = false`) get the "switched off" message; `sessionStore._apply` also signs them out as for any other sign-in.
- **Removing:** works from any signed-in session (database policy: own rows only). Maximum 5 devices per person.
- **Changing the password does not remove devices** (as asked). **I think a password reset should**: if an attacker ever got into an account and enrolled their own phone, a reset would not lock them out. It needs a change outside my list (the reset page, or a trigger on `auth.users`), so it is a recommendation, not done.
- **Side effect to know:** signing in through the magic-link token marks the email as confirmed. That is acceptable because a passkey can only be enrolled from an already signed-in session.

## Migrations, run order
1. `20261028100001_auth_providers.sql` (after `20261027100005_login_attempts.sql`)
2. `20261028100002_webauthn.sql`
Both are re-runnable and non-destructive. Run on a scratch project first, then `supabase/tests/webauthn_tests.sql` (edit the two emails at the top; it rolls back and ends with `ALL WEBAUTHN CHECKS PASS`). There is no separate SQL test file for the Google flag (not in your list); I checked it with a throwaway script, results below.

## Deploy steps, in order
1. Scratch project: both migrations, then `webauthn_tests.sql`.
2. Production: both migrations.
3. Set secrets (below).
4. Deploy functions:
   - `supabase functions deploy webauthn-register-options` (**JWT required**, default, no flag)
   - `supabase functions deploy webauthn-register-verify` (**JWT required**, default, no flag)
   - `supabase functions deploy webauthn-login-options --no-verify-jwt`
   - `supabase functions deploy webauthn-login-verify --no-verify-jwt`
5. Deploy the front end (`npm run build`). Until step 2 is done, the Google button simply stays grey and the fingerprint buttons show an error, nothing breaks.
6. When ready: configure Google (Job A list), then switch it on in Admin > Settings > Sign-in methods.

## New env vars and secrets (Supabase > Edge Functions > Secrets; I set none)
| Name | Value | Notes |
|---|---|---|
| `WEBAUTHN_RP_ID` | the bare domain, e.g. `bizkenia.co.ke` | no `https://`, no port. It must be your site's domain or a parent of it (so one value covers `www.` too). **Changing it later invalidates every enrolled device.** I do not know your production domain; `bizkenia.co.ke` is only the example in `_shared/http.ts`. |
| `WEBAUTHN_ORIGIN` | exact origins with scheme, comma separated, e.g. `https://bizkenia.co.ke,https://www.bizkenia.co.ke` | no trailing slash |

Without them the four functions answer 503 "not set up on the server yet". Already set and still used: `ALLOWED_ORIGINS`, `SUPABASE_*`.
**Local testing:** `WEBAUTHN_RP_ID=localhost`, `WEBAUTHN_ORIGIN=http://localhost:5173`, run `npm run dev`, and `supabase functions serve --env-file <file>` with those two lines (the file stays out of git). `localhost` counts as a secure context, so the phone-style prompt works on a desktop with Windows Hello or Touch ID. A real phone needs https, so use the deployed site or an https tunnel and set the RP id to that host.

## Decisions I made (you can reverse any)
1. Discoverable passkeys (`residentKey: required`); the login page shows its button only when this device was enrolled (a small `localStorage` hint with credential ids, which are not secret) and the browser supports a built-in authenticator. If a person clears site data, they re-enrol (the Account page copes with "already on this device").
2. Rate-limit scheme above; challenge clean-up runs inside the two options functions (no cron job).
3. `webauthn-register-options` also requires a JWT; 5 devices maximum; labels are the browser's description, cut to 60 characters.
4. The small `rpConfig()` helper is repeated in the four functions because a shared file was not in the list.
5. Admin quick-nav has four extra entries, and shop/farm "Logo and cover" wrap the two-card grid in one anchor.
6. SectionNav hides sections that are not on the page yet (cards that load later appear when they do) and shows nothing when fewer than two exist.
7. Not touched, flagged only: `docs/GO-LIVE.md` section 3 should mention the new admin switch; `part-0N` docs are unchanged.

## What you must run
```
unzip -o part-07-accounts-and-settings.zip   # at the repo root
npm ci && npm run lint && npm run build && npm run check:budget && npm run test:worker
```
**Lint note:** the repo uses `react-hooks` rules (`set-state-in-effect`, `refs`) as warnings. I wrote `SectionNav` to avoid setting state inside effects, but I could not run those rules. Expect at most a few warnings in `AccountPage.jsx` (`FingerprintCard`'s load-on-mount effect) and `AuthIcons.jsx` is fine. An unused import `supabase` in `AccountPage.jsx` already existed at the base commit and is left alone.

## Test output (what really ran)
**1. SQL, real PostgreSQL 16 with stand-ins for Supabase roles, `auth.uid()`, `is_super_admin()`, and the `platform_settings` table, policies and audit trigger copied from the repo (not real Supabase):**
```
migration 20261028100001  applied twice: OK        migration 20261028100002  applied twice: OK
webauthn_tests.sql   32 "ok" checks, then:  ALL WEBAUTHN CHECKS PASS
```
It covers: visitors and other people cannot read devices or challenges; `public_key` and `counter` cannot be selected; no insert or update from the browser; delete only your own device (0 rows for someone else's); a challenge works once, expires, is tied to purpose and person; purge keeps recent challenges; a credential id cannot be saved twice.
Google flag (throwaway script, not in the zip): visitor reads `{"google": false}` by default; visitor and a normal user cannot change it; super admin saving `{"google":"yes","evil":1}` stores `{"google": false}`; saving `true` stores `{"google": true}` and the visitor then reads true; a string value reads as off; a deleted row reads as off; 3 audit entries recorded with the actor.
**2. Syntax:** all 19 JS, JSX and TS files parse (esbuild). ESLint core rules (`no-undef`, `no-unused-vars` and others, not the react plugins) on the 15 changed or new `src` files: 0 errors; the only warning in my code (an unused variable in SectionNav) was fixed.
**3. SectionNav in real Chromium at 360px**, using a harness page with the real component and the real design tokens (not the app's actual settings pages): **20 of 20 pass**: lists only sections present; one `aria-current`; 91 by 44px touch targets; sticky directly under the top bar; follows scroll; tap lands the section just below the bars and moves focus; active item scrolled into view inside the bar; last section active at the very bottom; Enter key works; reduced motion jumps instantly; hidden at 1024px; dark theme through tokens; no horizontal page scroll; no console errors.
**4. `biometric.js`** with a fake `navigator.credentials` and fake Supabase: **22 of 22 pass**: base64url round trip, enrol, device label, cancelled prompt (wrong finger or timeout), "already on this device", server refusals shown in plain words (5-device limit, replayed or refused answer, 429), sign-in hands the session to the store, locked account, no-https message, list, remove, remove of a row you do not own.
**Screenshots:** the two harness screenshots next to this report (`sectionnav-harness-360-light.png`, `-dark.png`) show only the component. **I do not have screenshots of the real pages** (greyed and enabled Google button, phone step, the four settings pages) because the app could not be built here.

## Your Android test list (Job B, nothing here has run on a phone)
Enrol, sign out, sign in, remove, wrong finger, replayed challenge. Also: enrol twice on the same phone; enrol on a second phone; remove from the other phone; sign in after clearing site data (button hidden until re-enrolled); five bad attempts then the 429 message; a switched-off account.
Replay check without a phone: capture one `webauthn-login-verify` request in DevTools and resend it; it must answer "Fingerprint sign-in did not work".
Also check once on production: from mobile data, call a throttled function with `X-Forwarded-For: 1.2.3.4` and confirm the stored IP is the real one (the open item from Part 6).

## Rollback
- **Front end and functions:** redeploy the previous build; `supabase functions delete webauthn-register-options` (and the other three) if you want them gone. Without the functions the fingerprint buttons only show an error.
- **Google off at once:** Admin > Settings > Sign-in methods > off (grey button), or SQL `update platform_settings set value = '{"google": false}' where key = 'auth_providers';`
- **Database:** both migrations are additive and can stay. To remove them (destructive, ask first): `drop table public.webauthn_credentials, public.webauthn_challenges; drop function public.webauthn_consume_challenge(text,text,uuid), public.webauthn_purge_challenges(); drop trigger trg_auth_providers_before_write on public.platform_settings; drop function public.auth_providers_before_write(), public.auth_providers(); delete from public.platform_settings where key = 'auth_providers';`
