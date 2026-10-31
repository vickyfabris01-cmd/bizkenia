# Part 2 report: orphan function fix (BizKenia)

## 1. Read this first

1. **The production function definition was never pasted** (the `pg_get_functiondef` block in the brief was empty). I could not read it, so I could not say which columns it already checked. The migration is written to be safe without it (section 6, "Safety guards"), but **it replaces the old function entirely, so if the old one counted a column that is not in my list (section 4), that column would stop being counted.** Before running this on production, save the old definition and compare it with the list in section 4 (deploy step 3 in section 7). Pasting it to me lets me do that diff.
2. **The migration is `20261027100002_...`, not `20261027100001_...`.** `20261027100001_share_options.sql` already exists in the repo, so the name in the brief would collide on the version number. Part 3's report refers to slots 2 and 3 of the 20261027 series as other parts' migrations. If another part has taken `100002`, rename my file to the next free number before pushing. Nothing inside the file depends on its name.
3. **`main` moved while I worked.** See section 2. It does not touch any file of this part.
4. **Already-damaged share cards are not repaired by this fix.** See section 10.

## 2. Base commit

- **Base: `865b56e8b0d5e6d5d944d660a28353bcb3a59b64`** ("part 3 & 4 #report", 2026-10-30), the tip of `main` when I packaged this.
- The brief had a placeholder instead of a hash, so I started from the tip of `main` at that moment, `e6b67ddf77e777a324e7c7c2e0cae85a2275a8a0` ("share rework", 2026-10-28).
- `main` then moved by one commit (`865b56e`, a fast-forward of `e6b67dd`). It adds `part-03-report.md`, `part-04-report.md`, the notification bell files, the two M-Pesa edge functions and `20261027100004_payment_reconcile.sql`. It touches nothing this part edits, and `worker/orphans.js` is unchanged. I had made no commits, so I fast-forwarded my checkout to `865b56e`, did not rebase, and verified on a fresh clone of `865b56e`.
- The repo is read-only for me: nothing was pushed, no branch or PR was created.

## 3. Files

**NEW (2)**

| Path | Purpose |
| --- | --- |
| `supabase/migrations/20261027100002_orphan_function_all_refs.sql` | Puts `admin_unreferenced_files` in version control and makes it count every file column, including `share_cards` |
| `supabase/tests/orphan_function_tests.sql` | Proves it (see section 8). Added because the migration changes who can execute the function (revoke from `public, anon`, grant to `authenticated`), which the SQL rules say needs a test file. It was not in the brief's FILES line. |

**MODIFIED:** none. `worker/orphans.js` is untouched (the return shape did not need to change).

**Deleted or moved:** none, so no `git rm` / `git mv` commands.

**Shared files other parts may edit:** none modified.

## 4. Columns that store a file path or address

I audited every migration in the repo, `scripts/rewrite-storage-urls.sql`, the seeds, and every place in `src/` that calls `uploadFile`, `publicUrl` or `removeFiles` (7 call sites in 6 files), plus the Worker's bucket and path rules.

**Counted by the new function (8 places):**

| Table.column | Type | How it is filled | Stored as |
| --- | --- | --- | --- |
| `businesses.logo_url` | text | `businessMedia.js` | full address |
| `businesses.cover_url` | text | `businessMedia.js` | full address |
| `profiles.avatar_url` | text | `AccountPage.jsx` | full address |
| `products.images` | text[] | `shop.js` (`uploadProductPhoto`) | full addresses |
| `room_types.images` | jsonb | `PhotoUploader` via `rental.js` | array of full addresses |
| `rooms.images` | jsonb | copied from the room type (`20261020100001_room_types.sql` line 167) | array of full addresses |
| `hero_images.storage_path` | text | `hero.js` | **bare path**, bucket is always `site-media` (the function adds the prefix) |
| `share_cards.card` | jsonb | `set_share_card` | `{ v, bucket, path, url }`: the function reads the `url` and also `bucket` + `path` |

**Looked at and deliberately NOT counted:**

| Column | Why |
| --- | --- |
| `audit_log.before` / `after` | They copy old rows on update (for example the old `logo_url`). Counting them would keep every replaced file "in use" for ever. |
| `businesses.logo_design`, `profiles.avatar_design` | Drawn from a small recipe, no file. |
| `client_errors.url` | A page address, not a file. |
| `platform_settings.value` | Only `brand`, `modules`, `maintenance`, `approval`, `mpesa`: no pictures. |
| `help_articles.body`, `announcements.body`, `messages.body` | Plain text; nothing in the app embeds uploaded pictures there. |
| Farm tables (`crops`, `livestock_*`, `farm_*`, `harvests`...) | The brief mentions "farm records", but none has a file column. |
| `notifications.link`, `orders.*`, `payments.*` | Internal links and text, no file paths. |

**Which were missing from the production function: I cannot tell you.** That needs the definition that was not pasted. What I can say for certain:

- `share_cards` was missing, because that is the problem in the brief and the table only exists since `20261026100001`.
- Every other row in the table above is unconfirmed. If you paste the production definition I will diff it against this list.
- **Unknown tables.** `businesses`, `profiles`, `rooms`, `buildings`, `floors`, `tenancies`, `workers`, `tenant_branding` and a few others were created before the migrations in this repo, so I cannot see their full column lists. `tenant_branding` is not used anywhere in `src/`. I found no sign of a picture column on them except `rooms.images`, but the test file has a drift scan (section 8) that checks the real database for any other column holding a storage path. **Run it on a copy of production data before you trust this list.**

## 5. Migration order

Only one migration: `20261027100002_orphan_function_all_refs.sql`.

- It needs `share_cards` (`20261026100001`) and `hero_images` (`20261016100007`), and nothing after them. It does not depend on `share_options` or on part 3's `100004`.
- If part 3's `100004` is already applied on the target before mine, the Supabase CLI will refuse a lower version with "found local migration files to be inserted before the last migration". Use `npx supabase db push --include-all`.
- It is re-runnable (create or replace, revoke and grant are idempotent). It does not drop or edit any old migration, and contains no destructive statement.

## 6. What the migration does

- Redefines `public.admin_unreferenced_files(p_keys text[])` with `create or replace`: same name, same argument, answer `{ refs, unreferenced }`, so `worker/orphans.js` works untouched.
- Still super admin only: `security definer`, `search_path = public`, `auth.uid()` must exist and `coalesce(is_super_admin(), false)` must be true, otherwise it raises `42501` "Only the platform owner can do this."
- `revoke all ... from public, anon; grant execute ... to authenticated;`
- Finds references by reading each column as text and picking out every `bucket/path` (`business-media|site-media|avatars`), so it works for Supabase Storage addresses, R2 addresses through the Worker, a custom CDN, query strings, and text / text[] / jsonb alike. Keys are matched exactly, so a key that is only the start of a pointed-to file is still reported unused.
- `refs` = the number of distinct files the database points to (any bucket). The Worker only uses it as a "zero means refuse to delete anything" safety net.

**Safety guards (because the production definition is unknown):**

- The return type of an existing function cannot be changed by `create or replace`. The migration reads the existing function's return type (`json` or `jsonb`) and reuses it; a new database gets `jsonb`.
- If the function exists with an argument list other than `(p_keys text[])`, or more than one version exists, the migration **stops with a clear message and changes nothing**.

## 7. Deploy steps, in order

1. **Scratch Supabase project first, never production.** Apply the migration (`npx supabase db push`, or paste it in the SQL editor).
2. On the scratch project run `supabase/tests/orphan_function_tests.sql` in the SQL editor. Expect one result row: `ALL ORPHAN-FUNCTION CHECKS PASS`. For the drift scan to mean anything, use a scratch copy that holds real data.
3. **Production, before changing anything,** save the current definition so you can compare and roll back:
   `select pg_get_functiondef('public.admin_unreferenced_files(text[])'::regprocedure);` and keep the output.
   **Compare it with section 4.** Every table and column the old body reads must either be in my list or be something you are sure no longer holds files. If the old one reads a column I do not have, add it to the function (both in the migration and in the column list of the test file) before applying. Also run the drift scan from the test file against production data (a read-only check; if you do not want to run the whole file on production, run only its last section against a restored copy).
4. Apply the migration on production (`npx supabase db push`, add `--include-all` if the CLI asks).
5. Check in the app: Admin, Unused files, run a scan. Share card pictures (`.../share/...`) must not be listed.
6. No Worker or front-end deploy is needed (`worker/orphans.js` and `src/` are unchanged).

**New environment variables:** none.

## 8. Test output

### 8.1 SQL, on a throwaway local PostgreSQL 16 (not Supabase)

I could not use a Supabase project (none attached), so I ran a throwaway local cluster with stand-ins for `auth.uid()`, `is_super_admin()`, `profiles`, `businesses`, `products`, `rooms` and the other tables that live outside this repo. The cluster is deleted. **Please repeat step 2 above on a real scratch project.**

```
Scenario A, fresh database:        returns jsonb | argument: p_keys text[]
  re-run:                          ok (no error)
  execute granted to:              authenticated (and the owner); revoked from anon and public

Scenario B, production-like old function returning JSON, anon could execute it:
  before: json ; anon can execute: t
  after : json ; anon can execute: f      (return type kept, anon revoked)
  functions named admin_unreferenced_files afterwards: 1

Scenario C, existing function with arguments (p_keys jsonb):
  ERROR: public.admin_unreferenced_files already exists with arguments (p_keys jsonb).
         Expected (p_keys text[]). Nothing was changed.
  still only the original: p_keys jsonb
```

`supabase/tests/orphan_function_tests.sql` against the new function:

```
             result
---------------------------------
 ALL ORPHAN-FUNCTION CHECKS PASS
```

The same file against an old-style function that ignores `share_cards` (to prove the test can fail):

```
ERROR:  FAILED: a SITE share card (url + bucket + path) does not appear as unused
```

What the test file covers: signed-out visitor refused; signed-in non-admin refused; a file nothing points to is reported; answer shape `{ refs: number, unreferenced: [...] }`; empty and null `p_keys`; **share card (site, with url + bucket + path) not listed as unused, and listed again once its row is gone**; business card with only a url; product card with only bucket + path; `businesses.logo_url` and `cover_url` (with `?v=3`); `profiles.avatar_url`; `products.images`; `room_types.images`; `rooms.images`; `hero_images.storage_path`; a key that is only the start of a pointed-to file stays unused; and the drift scan. Everything runs in one transaction that ends with `rollback`, so it leaves no data behind (after my first, aborted run I confirmed no test rows remained).

The drift scan, shown working: I added a stand-in table with a `letterhead` text column holding a picture address, and the test failed with:

```
FAILED: these columns hold a storage path but admin_unreferenced_files does not count them
(a file they point to could be deleted): tenant_branding_demo.letterhead
```

(That table was only in my scratch database.)

### 8.2 Speed

Measured on the scratch cluster as the `authenticated` role (single process, the worst case): 40,000 products with 2 photos, 20,000 rooms, 5,000 share cards = 105,000 distinct references, 1,000 keys asked.

```
refs = 105000, unreferenced = 333 of 1000, Time: 3659 ms
```

That is about 35 microseconds per reference. At the Worker's own scan cap (20,000 files) a call is roughly 0.7 s, and a full scan is up to 20 calls. At 100,000 references one call is under 4 s, below Supabase's default 8 s statement timeout. If the platform ever gets that large, the next step would be computing the references once per scan; I did not do it, to keep the change small.

### 8.3 Repo checks, on a fresh clone of `865b56e` with the two files unzipped over it

```
npm ci                 added 361 packages in 8s
npm run build          exit 0, "built in 7.66s"
npm run check:budget   exit 0
  PASS  First-load JS (gzip): 134.4 KB (limit 200 KB)
  PASS  First-load CSS (gzip): 10.5 KB (limit 40 KB)
  PASS  Largest chunk vendor-charts-C08b-oug.js (gzip): 108.2 KB (limit 130 KB)
npm run test:worker    exit 0   # tests 7, pass 7, fail 0
npm run lint           exit 2, did not run (pre-existing, see below)
```

**`npm run lint` is broken at the base commit,** before and independent of my change:

- the script passes `--ext`, which flat-config ESLint rejects: `Invalid option '--ext'`;
- without the flag it still fails: ESLint 8.57.1 is installed, but `eslint.config.js` imports `eslint/config`, an ESLint 9 API (`ERR_PACKAGE_PATH_NOT_EXPORTED`).

I did not fix it (out of scope, and the brief says no dependency bumps). My change contains no JavaScript.

`git status` after the checks showed only my two new files as untracked (`dist/` and `node_modules/` are ignored); no tracked file was changed.

### 8.4 Zip

```
supabase/migrations/20261027100002_orphan_function_all_refs.sql
supabase/tests/orphan_function_tests.sql
2 files
```

Relative paths from the repo root, no wrapper folder, no absolute paths, no `node_modules`, `dist`, `.git`, screenshots, report or lockfile. Both files are UTF-8, LF line endings, no BOM. Safe for `unzip -o` at the repo root.

## 9. Assumptions

1. **Base commit** is the tip of `main` (the brief had a placeholder).
2. **Version number** `100002`, because `100001` is taken (see section 1).
3. **The function's contract** (argument `p_keys` as a text array, answer `{ refs, unreferenced }`, keys shaped `bucket/path`) is inferred from `worker/orphans.js` lines 35 to 48 and its `KEY` pattern. I could not see the production definition. The migration refuses to run if the argument list differs, and keeps the existing return type.
4. **`refs` means** the number of distinct referenced files across all buckets. The old meaning is unknown; the Worker only checks for zero.
5. **The error text** for a non-admin is new ("Only the platform owner can do this.", the wording `set_share_card` uses). The Worker checks `is_super_admin` first, so people never see it.
6. **Base-table columns** (`rooms.images`, `profiles.avatar_url`, `businesses.logo_url`) exist because later migrations and `src/` use them. `rooms.images` is jsonb because `room_types.images` (jsonb) is inserted into it; the function reads columns as text, so it would also work if it were `text[]`.
7. The test file was **not run on a real Supabase project**, only on local PostgreSQL 16 with stand-ins.

## 10. Follow-up you should know about (not done here)

Between `20261026100001` and this fix, the Unused files tool could already have deleted a card picture. Because the share code only compares the fingerprint (`ensureShareCard` in `src/lib/api/shareCards.js`), a card row whose file is gone still looks "current" and the link preview stays broken until that item's data changes. This fix stops new deletions; it does not repair old ones, and I cannot tell from here whether any happened (R2 is not visible from the database).

Possible repairs, both in the sharing code you told me not to touch: have `ensureShareCard` check the file still exists before trusting a stored card, or, after you check which cards are broken, delete those `share_cards` rows (destructive, so only with your say) so they are drawn again the next time someone opens Share.

## 11. Rollback

- The new function counts every column in section 4. It is only less cautious than the old one if the old one counted a column that is not in that list, which is why deploy step 3 compares them.
- To go back, run the definition you saved in step 3 of the deploy steps. Re-running it restores the old body, and the argument list and return type are the same, so no drop is needed. If you did not save it, ask and I will write the previous behaviour from the repo contract.
- Dropping the function would break the Unused files page, so do not do that.
