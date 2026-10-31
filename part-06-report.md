# Part 6 report: login throttling (BizKenia)

## Read this first: two deviations
1. **Migration number.** The brief named `20261027100002_login_attempts.sql`, but `20261027100002_orphan_function_all_refs.sql` already exists on main (and `...100003` and `...100004` too). Two files with the same version number break `supabase db push`. I used `20261027100005_login_attempts.sql`. Tell me if you want another number.
2. **Extra test file.** The common SQL rule says to add a `supabase/tests` file when permissions or RLS change, and a new RLS table does that, so I added `supabase/tests/login_attempts_tests.sql`. It was not in the FILES list.

## Base
- Base commit: `58e82ad6cc578aba9b5a08f1d51ad726070bdd6c` ("Merge pull request #2 from vickyfabris01-cmd/part-05-tooling-ci"), the head of `main` when I cloned. It confirmed unchanged right before I built the zip.
- **main has moved since Part 3:** Part 3 was built on `e6b67dd`. Main now holds parts 1 to 5, including the Part 3 files. None of the four files below were touched by those parts, so this zip applies cleanly. I did not rebase anything.

## Files
NEW
- `supabase/functions/_shared/rateLimit.ts`
- `supabase/migrations/20261027100005_login_attempts.sql`
- `supabase/tests/login_attempts_tests.sql`

MODIFIED
- `supabase/functions/resolve-login/index.ts` (+9 lines, nothing removed)

Not changed: the login page and `sessionStore.js` (see "The 429 message in the UI"), `delete-account`, `delete-business`, `_shared/auth.ts`.
Deleted or moved: none, so no `git rm` / `git mv`.

## What changed in the modified file (`resolve-login/index.ts`)
- Import of `beginAttempt, clientIp, finishAttempt, tooManyAttempts` from `../_shared/rateLimit.ts`.
- After the service-role client is created and before `login_email_for_phone`: `beginAttempt(admin, phone, clientIp(req))`, and a 429 return when it is refused.
- After a correct password: `finishAttempt(admin, attempt.attemptId, true)`.
- A header comment line about the throttle. The generic `FAIL` message and 401 answers are unchanged.

## How it works
- **Table `login_attempts`**: `id` (uuid primary key, added by me), `identifier` (the phone number), `ip`, `success`, `created_at`. RLS on, no policies, all browser roles revoked. Indexes on `(identifier, created_at)` and `(ip, created_at)`.
- **`login_throttle_begin`** (security definer, `search_path = public`, execute for `service_role` only): counts failures and, if the attempt may go ahead, records it as a failure in the same step. Doing the check and the insert together under advisory locks means a burst of parallel guesses cannot all slip past the count.
- **`login_throttle_finish`** marks an allowed attempt successful. A success makes that phone's earlier failures stop counting ("clears the failure count"); the rows stay for the 7-day history.
- **`purge_login_attempts(p_days default 7)`** deletes older rows and returns how many. Service role only.
- **Limits** (in `LOGIN_LIMITS` in `rateLimit.ts`, passed to the database): 5 failures per phone, 20 per IP, 15-minute window.
- **429 answer**: `{ "error": "Too many sign-in attempts. Please wait N minutes and try again.", "retry_after": seconds }` plus a `Retry-After` header. The message says nothing about the phone or account.
- **No enumeration**: an unknown phone is recorded and counted exactly like a real one, and gets the same 401 message and the same 429.
- **Reuse by the fingerprint part**: `beginAttempt(admin, identifier, ip)` / `finishAttempt(admin, attemptId, success)` take any stable string as `identifier`, so use a different prefix (for example `fp:<user id>`) to keep its counts apart from phone sign-in.

## Which client IP header (verified how far I could)
I cannot call your live project from here, so this is from Supabase's own documentation and a public Supabase discussion, not from a live test.
- Supabase's log reference lists `cf-connecting-ip` and `x-real-ip` as request headers it records, so both reach the platform.
- A Supabase discussion (#34647) shows `x-forwarded-for` can be set by the caller and arrives spoofed, while `cf-connecting-ip` still carried the real IP.
- So `clientIp()` uses `cf-connecting-ip`, then `x-real-ip`, and **never `x-forwarded-for`**. If neither header is present, `ip` is stored as null and only the per-phone limit applies (so a missing header can never lock everyone out).
- **Please confirm on your deployed project** (2 minutes): call the function from your phone's mobile data with a wrong password and `-H "X-Forwarded-For: 1.2.3.4"` from curl, then run `select identifier, ip from login_attempts order by created_at desc limit 5;`. The `ip` should be the real address of the caller (check it against what a "what is my IP" site shows), not `1.2.3.4`, not null, and not the same address for every caller.

## Migration and run order
1. `20261027100005_login_attempts.sql`, after `20261027100004_payment_reconcile.sql`, on a scratch project first. Re-runnable (`if not exists`, `create or replace`). It must run **before** the new `resolve-login` is deployed.
2. Optional check: run `supabase/tests/login_attempts_tests.sql` on the scratch project. It rolls back and ends with `ALL LOGIN-THROTTLE CHECKS PASS`.

## Deploy steps, in order
1. Run the migration (scratch, then production).
2. `supabase functions deploy resolve-login` (same as before: it keeps the normal sign-in check the app already satisfies with the anon key; `_shared/rateLimit.ts` ships with it).
3. Do the IP check above.
4. Schedule the purge (below).

## Scheduling the purge (you said you will schedule it)
It is a database function, so pg_cron can call it directly, no edge function or secret needed:
```sql
create extension if not exists pg_cron;
select cron.schedule('bizkenia-purge-login-attempts', '30 0 * * *', $$ select public.purge_login_attempts(); $$);
```
That is 03:30 in Kenya. Stop it with `select cron.unschedule('bizkenia-purge-login-attempts');`.

## New env vars
None.

## delete-account and delete-business
Both call `passwordIsCorrect(user.email, password)` from `_shared/auth.ts`, then return an error. Putting the limiter there needs a check before and a success mark after in each file, several lines each, and `passwordIsCorrect` returns only true or false so it cannot carry a 429. Per your rule (only if it is a one-line change) I left both untouched. Both already require a signed-in session, so an attacker would need to hold the account already. If you want them limited, I suggest a separate small part that adds `beginAttempt` to `passwordIsCorrect`'s two callers.

## The 429 message in the UI
No login page change was needed. `sessionStore.js` already reads `error` from the body of a failed `resolve-login` response and `LoginPage.jsx` shows it in its error alert. I checked this with the real `@supabase/supabase-js` client against a local server that answers 429: the form message came out as `Too many sign-in attempts. Please wait 14 minutes and try again.` I did not open the page in a browser, so please look at it once on a phone: 5 wrong passwords, then the 6th should show the message.

## Assumptions (please confirm)
1. "More than 5 failures" is implemented as: after 5 failures the 6th attempt is blocked. That matches your test line "5 wrong passwords then a block". Likewise 20 per IP, so the 21st attempt from one IP is blocked. Both numbers are one-line changes.
2. Attempts that are refused with 429 are not recorded, so someone who is blocked cannot extend their own block, and a victim cannot be kept locked out by an attacker hammering a blocked phone. Every attempt that reaches the password check is recorded.
3. If the limiter's database call fails, the attempt is allowed and the error is logged (fails open), so a database problem cannot lock everybody out of phone sign-in.
4. A phone number that is not in the valid Kenyan format is refused with the same 401 as before and is not recorded, because it never reaches Supabase Auth.
5. A success clears the phone's failures but not the IP's count.

## Tests
Run for real, not mocked, where it matters:
- **SQL** on a local PostgreSQL 16 (roles `anon`, `authenticated`, `service_role` created to mirror Supabase): migration applied twice with no error; `supabase/tests/login_attempts_tests.sql`:
```
ALL LOGIN-THROTTLE CHECKS PASS
```
  It covers: anon and authenticated refused on the table and on all three functions; 5 wrong then a block with retry_after about 15 minutes; the right password refused while blocked; refused attempts not recorded; another phone unaffected; block ends after the window and retry_after follows the oldest failure; success clears failures; 20 per IP blocks that IP only; a null IP is never IP-blocked; purge removes the 8-day-old row and keeps the 6-day-old one.
- **resolve-login end to end** (real function code under Deno 2.9, its limiter calls running the real SQL functions on the same Postgres; only Supabase Auth and the phone lookup are faked). `deno check` is clean on `resolve-login` and `rateLimit.ts`.
```
PASS wrong password 1: 401 with the generic message
PASS wrong password 2: 401 with the generic message
PASS wrong password 3: 401 with the generic message
PASS wrong password 4: 401 with the generic message
PASS wrong password 5: 401 with the generic message
PASS 6th attempt (even the right password): 429
PASS 429 body has retry_after (s) and a generic message
PASS 429 has a Retry-After header
PASS 429 message does not mention the phone or account
PASS a different phone (same IP) still signs in
      rows for A: 5 (5 failures, blocked attempt not recorded)
PASS correct password after the window: 200
PASS block again after 5 more failures
PASS 4 failures then the right password: 200
PASS failure count restarted after success (5 more wrong allowed)
PASS unknown phone is throttled exactly like a real one (no enumeration)
PASS 21st failure from one IP is blocked even when x-forwarded-for changes
PASS another IP is unaffected
PASS stored IPs are cf-connecting-ip / x-real-ip values, never x-forwarded-for: 41.80.0.10,41.80.0.11,41.80.0.9
PASS no IP headers: 25 different phones are never IP-blocked
PASS malformed phone: 401 and nothing recorded
PASS limiter database error: sign-in still works (fails open)
```
  These scratch tests are not in the zip. Say so if you want them added.
- **Repo checks**, in a fresh clone at `58e82ad` after `unzip -o` of the zip and `npm ci`:
```
/tmp/v6/src/router/MaintenanceGate.jsx
  30:14  warning  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components

✖ 117 problems (0 errors, 117 warnings)
  0 errors and 1 warning potentially fixable with the `--fix` option.

dist/assets/vendor-charts-C08b-oug.js          411.24 kB │ gzip: 110.81 kB
✓ built in 11.51s
PASS  First-load JS (gzip): 136.4 KB (limit 200 KB)
PASS  First-load CSS (gzip): 10.7 KB (limit 40 KB)
PASS  Largest chunk vendor-charts-C08b-oug.js (gzip): 108.2 KB (limit 130 KB)
# tests 7
# pass 7
# fail 0
```
  `npm run lint` works on this base (0 errors; the 117 warnings are existing). `unzip -l` shows exactly 4 files, all relative paths, no wrapper folder. All four are UTF-8, LF, no BOM, no emoji.

Not tested: the real Supabase project (IP header check above), and the login page in a browser at 360px (no UI code changed).

## Rollback
- Redeploy the previous `resolve-login`: `git checkout 58e82ad -- supabase/functions/resolve-login/index.ts` and deploy it. Phone sign-in then works as before, with no throttle.
- Unschedule the purge job if you created it.
- The migration is additive and can stay. To remove it (destructive, ask first): `drop function public.purge_login_attempts(integer), public.login_throttle_finish(uuid, boolean), public.login_throttle_begin(text, text, integer, integer, integer); drop table public.login_attempts;`
