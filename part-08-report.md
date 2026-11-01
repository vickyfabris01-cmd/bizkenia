# Part 8 report: action badges and upload progress

**Base commit used:** `36d51cd0fc0b4e031fb911b66b92a5521d9a751d` (main at the time of work).
The brief said `c3b9cb7`. Main had already moved to `36d51cd` (PR #4, "hero size on mobile"). I worked from the newest commit as the brief says and did not rebase anything. Main has since moved again to `8c96071` ("part 7", after "part 9" and a hero merge). I re-checked everything against it, see "Conflict check against Part 7 and Part 9" below. The zip is unchanged and applies cleanly on `8c96071` too.

**Status in one line:** code complete for both jobs; lint, build, budget, worker tests and SQL syntax pass; the SQL has NOT been run on a database and nothing was seen in a real browser. See "Not verified".

## Conflict check against Part 7 and Part 9 (main at `8c96071`)
Compared `36d51cd..8c96071` (48 files: Part 9, the hero merge and Part 7) with my 22 files.
- **Same file edited by both sides: none.** So `unzip -o` overwrites nothing from Part 7 or Part 9.
- **Migrations:** Part 7 uses `20261028100001` and `20261028100002`, mine is `20261028100003`. No table, function or index name is shared (checked `nav_seen`, `admin_scan_state`, the five new functions, `idx_client_errors_msg_url`). Part 7 and Part 9 do not redefine `log_client_error`; it is still defined only in `20261019100001_p5_08_hardening.sql`.
- **Icons folder:** Part 7 added `AuthIcons.jsx` and Part 9 added `PlatformIcons.jsx` in `src/components/ui/icons/`. Mine is `ActivityIcons.jsx`; different files, no clash.
- **`uploadFile` callers:** `AccountPage.jsx` (Part 7, avatar) and `shareCards.js` still call it with three arguments, which still works. `AccountPage` gets no percent yet, as the brief says.
- **Worker:** Part 9 added `/api/admin/storage` (usage per business), `/robots.txt` and `/sitemap.xml` to `worker/entry.js`. The upload PUT route and the orphan scan response (`orphans`, `unusedBytes`) are unchanged, so my XHR upload and `AdminFiles` still match. The new `public/_headers` policy is report-only and my XHR goes to the same address as before.
- **Menu and shell:** nothing in Part 7 or Part 9 touches `Sidebar`, `BottomTabBar`, `Shell.css`, the module nav files or the admin pages I changed.
- **Verified on a fresh clone of `8c96071` with my zip unzipped over it:** lint 0 errors, 120 warnings (pure `8c96071` also has 120, so none are mine); build OK; budget PASS (first-load JS 137.5 KB of 200 KB); `npm run test:worker` 17 of 17 pass.
- **Not checked:** I did not run Part 7's or Part 9's SQL, and I did not test sign-in or fingerprint login.

## Files

NEW (4)
- `supabase/migrations/20261028100003_action_counts.sql`
- `supabase/tests/action_counts_tests.sql`
- `src/store/actionCountsStore.js`
- `src/components/ui/icons/ActivityIcons.jsx`

MODIFIED (18)
`src/components/shell/Sidebar.jsx`, `src/components/shell/BottomTabBar.jsx`, `src/components/shell/Shell.css`, `src/modules/adminNav.js`, `src/modules/rental/index.js`, `src/modules/shop/index.js`, `src/modules/agriculture/index.js`, `src/pages/admin/AdminBusinesses.jsx`, `src/pages/admin/AdminErrors.jsx`, `src/pages/admin/AdminFiles.jsx`, `src/lib/auditText.js`, `src/lib/storage.js`, `src/components/ui/PhotoUploader.jsx`, `src/components/ui/ImageUploadButton.jsx`, `src/components/ui/ImageCropper.css`, `src/lib/api/businessMedia.js`, `src/lib/api/shop.js`, `src/lib/api/hero.js`

(The zip holds 22 files: the 4 new files above, 18 modified.) No file is deleted or moved, so no `git rm` / `git mv`. `ImageCropper.jsx` was not touched (it does not start uploads). `AdminBusinesses.jsx` already read `?status=` from the URL; I only added the menu refresh after a decision.

## What to grep after merging

| File | Added or changed |
|---|---|
| `Sidebar.jsx` | import `useNavBadges`; `const badgeFor = useNavBadges()`; per item `badge`, `has-badge` class, `aria-label`, `<span className="shell-badge">`; link goes to `badge.to` |
| `BottomTabBar.jsx` | same pattern on tabs and on the More sheet; `moreTotal`, `moreShown` add up counts inside More |
| `Shell.css` | block "Part 8: action count badges" appended at the end: `.shell-badge`, `.has-badge` rules, forced-colors rule |
| `adminNav.js` | `badgeKey` on businesses, errors, files, support |
| `rental/index.js` | `badgeKey` on rental-requests, invoices, complaints, transfers |
| `shop/index.js` | `badgeKey: "orders"` |
| `agriculture/index.js` | `badgeKey` on orders, tasks |
| `AdminBusinesses.jsx` | import `refreshActionCounts`; call before `reload()` after a decision |
| `AdminErrors.jsx` | `useSearchParams`, `onlyNew`, `seenAt`, `week`, `since`, `showAll`; reads `?status=new`; calls `getSeenAt("errors")` then `markSeen("errors")` |
| `AdminFiles.jsx` | `useEffect` that calls `markSeen("files")`; after a scan calls `saveScanState("unused_files", ...)` then `markSeen("files")` |
| `auditText.js` | six `FIELD_LABEL` entries (system, allDashboards, types, pages, payments, businesses); `formatValue` shows lists of plain values as words ("Rental, Shop", "none") |
| `storage.js` | `uploadFile(bucket, path, file, options)`; `putWithProgress`; `uploadBlockedReason`, `isTestHost`; `subscribeUploads`, `getUploadSnapshot`, `publish`; `downloadWithProgress` |
| `ImageUploadButton.jsx` | named export `UploadProgress`; props `showProgress`; async `onFiles` result drives the live percent |
| `PhotoUploader.jsx` | rewritten upload flow: `items` state, `queue`, `uploadOne`, `pump`, `cancel`, `retry`, per-file `UploadProgress` list |
| `ImageCropper.css` | appended `.imgup-list`, `.imgup-prog*`, `@keyframes imgup-slide`, reduced-motion rule |
| `businessMedia.js` | optional last arg `uploadOptions` on `uploadBusinessImage`, `uploadBusinessCover`, `uploadBusinessLogo` |
| `shop.js` | optional last arg `uploadOptions` on `uploadProductPhoto` |
| `hero.js` | optional last arg `uploadOptions` on `adminUploadHeroImage`, `adminReplaceHeroImage` |

## Migration

One migration: `20261028100003_action_counts.sql`. Re-runnable, nothing dropped.
- Tables: `nav_seen` (select-own RLS, writes only through `mark_nav_seen`), `admin_scan_state` (super admin read only).
- Functions (all `security definer`, `search_path = public`, explicit revoke/grant): `admin_action_counts()`, `business_action_counts(uuid)`, `mark_nav_seen(text)`, `save_scan_state(text, jsonb)`, `purge_client_errors(int)`.
- `log_client_error` redefined with the same signature: ignores the same message and url within 60 seconds (advisory lock so two simultaneous requests cannot both slip through), keeps the old caps (100 per minute global, 10 per user). New index `idx_client_errors_msg_url`.

Run order: after `20261028100002_webauthn.sql` (Part 7 uses `20261028100001_auth_providers.sql` and `20261028100002_webauthn.sql`; mine is `20261028100003`, so the order is fixed by the names). Then run `supabase/tests/action_counts_tests.sql` on a scratch project after editing the three emails at the top.

## Deploy steps
1. Run the migration on a scratch Supabase project, then run the test file. Expect "ALL ACTION-COUNT CHECKS PASSED".
2. Run the same on production.
3. Merge and deploy the front end (`unzip -o` at the repo root, `npm run build`, deploy as usual).
4. In R2 mode make sure `VITE_FILES_BASE_URL` is set on the live build (see Env).

## Env vars and secrets
None new. The upload guard reads the existing `VITE_FILES_BASE_URL`. In R2 mode, if it is not set and the page address is localhost, 127.x or `*.workers.dev`, uploads are refused with a clear message. Addresses already stored are not touched.

## Counts per dashboard

| Dashboard | Menu item | Counted |
|---|---|---|
| Super admin | Businesses | `businesses.status = 'pending'` (link opens `?status=pending`) |
| Super admin | Errors | different error messages since the admin last opened the page; first time: last 7 days (link opens `?status=new`) |
| Super admin | Unused files | count saved by the latest scan, until the page is opened (never scans R2 on load) |
| Super admin | Support | `support_tickets.status = 'open'` |
| Rental (owner, manager) | Rental requests | `rental_requests.status = 'pending'` |
| Rental | Invoices | `billing_cycles.status = 'overdue'` |
| Rental | Complaints | `complaints.status in ('open','in_progress')` |
| Rental | Transfers | `room_transfers.status = 'pending'` |
| Shop and Farm | Orders | `orders.status in ('pending_payment','paid')` (the "new" group) |
| Farm | Tasks | `farm_tasks.status = 'open'` and due today or earlier (Nairobi date) |

Residents and workers are members but get no numbers (the function returns nothing for non-staff).

Choices I made that you may want to change: Transactions and Users have no clear "needs action" status, so they carry no badge. Invoices counts the stored `overdue` status; if that status is only refreshed when the rental dashboard loads, the count can lag until it does.

## Business pages and the filter on click (needs another part)
Only the three admin pages read the filter from the URL, because the business pages are not in my FILES list. Business badges open the page unfiltered. To finish, the owner of those pages should read a query parameter. Current local values they would map to: requests and transfers `pending`, complaints `active`, shop orders group `new`. `BADGE_QUERY` in `actionCountsStore.js` is the one place to add the matching `?...` once a page reads it.

## Downloads in the app (grep of download / blob in src)
None is a real network download, so none gets a percent. None of these files is in my FILES list, so they are unchanged.

| Spot | What it is | What it shows |
|---|---|---|
| `src/components/share/CardDialog.jsx` | saves a poster or card drawn in the browser | unchanged (browser generated, keeps its spinner) |
| `src/lib/shareCard.js` | draws the card; fetches logo and photo images to draw them | not a user download, unchanged |
| `src/lib/brandStudio/download.js` | SVG to PNG in the browser | unchanged (browser generated) |
| `src/lib/csv.js` | CSV built in the browser | unchanged (browser generated) |
| `BusinessLogoCard` | saves the generated logo | unchanged (browser generated) |

I added `downloadWithProgress(url, onProgress)` to `storage.js` for the day a real download exists (percent from the response stream; with no known size it reports `null` and the caller shows a spinner). It is not used anywhere yet.

## Upload behaviour
- R2: the PUT goes through XMLHttpRequest; percent is shown, capped at 99 until the server answers, then 100.
- Supabase storage: no progress exists, so the UI shows "Uploading…" and a moving bar with no number.
- `PhotoUploader`: one row per file with its own percent, a cancel button (waiting or running), a retry button (failed or cancelled, restarts from 0%), photos upload one after another and each is added to the list as soon as it is saved. The old version had no cancel or retry; they are new.
- Pages that start the upload themselves (cover, logo, hero, product) are not in my list, so they cannot pass `onProgress`. Instead `ImageUploadButton` shows the live percent under the button while their async `onFiles` runs, read from the shared view in `storage.js`.
- `shareCards.js` still calls `uploadFile(bucket, path, file)` with three arguments; that still works (checked in the test below).
- `AccountPage.jsx` belongs to another part, so the avatar upload gets no percent for now. It keeps working because only optional arguments were added.
- Percent uses tabular numbers, `role="progressbar"` with `aria-valuenow` (left out when the percent is unknown), SVG icons only (`ActivityIcons.jsx` adds upload and retry; cancel reuses `Icon` "x"), 44px buttons, theme variables, reduced-motion respected.

## Test output (run in a fresh clone of 36d51cd with the zip unzipped over it)

```
npm run lint
✖ 117 problems (0 errors, 117 warnings)      (base commit: 117 warnings, so no new warnings)

npm run build
✓ built in 11.38s

npm run check:budget
PASS  First-load JS (gzip): 137.3 KB (limit 200 KB)
PASS  First-load CSS (gzip): 11.2 KB (limit 40 KB)
PASS  Largest chunk vendor-charts-C08b-oug.js (gzip): 108.2 KB (limit 130 KB)

npm run test:worker
# tests 7  # pass 7  # fail 0
```

`unzip -l`: 22 files, all relative paths, no wrapper folder, no lockfile, no node_modules/dist/.git.

Extra checks I ran (scratch scripts, not in the repo):
- `storage.js` against a mocked XMLHttpRequest and mocked Supabase: 20 checks passed. They cover URL encoding, headers, percent sequence 0, 10, 65, 99, 100 with no duplicates, the 99 cap, server and network error messages, cancel (including an already-aborted signal), a function passed as the third argument, no options, the guard (blocked on localhost, 127.0.0.1 and workers.dev; allowed on the live host; allowed on localhost when `VITE_FILES_BASE_URL` is set), Supabase giving only `null` progress, and a cancelled Supabase upload being removed afterwards.
- `UploadProgress` rendered to HTML: correct ARIA for percent, unknown, queued and error states.
- Both SQL files parse with Postgres's own parser (pglast), including the 6 function bodies and the test blocks. This checks syntax only.

## Not verified (yours to run)
- The migration and `action_counts_tests.sql` have not been run on any database. Column names for `complaints`, `room_transfers`, `rental_requests` and `billing_cycles` come from later migrations because `20260331175502_remote_schema.sql` is empty in the repo. If a column name differs, `business_action_counts` will fail on the scratch project.
- The test file expects an existing active business owned by the given owner account; it flips that business to pending and back inside a rolled-back transaction.
- Nothing was seen in a browser (no browser could be installed here), so there are no 360px screenshots and the badge and progress layout are unchecked visually. Please look at: badge position on the icon rail, on the phone tab bar and in the More sheet; the progress row inside the page cards that use `ImageUploadButton`.
- Not done: the manual test log (create a pending business, see 1 on Businesses, open it, see it clear) and the throttled-connection test for 1 and for 5 files. The steps are: in Chrome DevTools set throttling to "Slow 4G", upload 1 then 5 photos in a rental room form with R2 mode on, and watch each row climb smoothly.

## Assumptions
- `is_super_admin()` and `is_staff(uuid)` exist as used by earlier migrations.
- `business_members` has `business_id`, `user_id`, `status = 'active'`.
- The farm uses the same `orders` table as the shop, scoped by `business_id`.
- A nav item's `id` equals its path segment for the keys used (checked in the three module files).

## Rollback
- Front end: redeploy the previous build, or `git revert` the merge. The old `uploadFile(bucket, path, file)` calls never depended on the new options.
- Database: the new functions and tables are only used by the new front end, so they can stay. If `log_client_error` must go back, re-run its definition from `20261019100001_p5_08_hardening.sql`. To remove the rest: `drop function` the five new functions, then `drop table nav_seen, admin_scan_state` (ask before running destructive statements).
