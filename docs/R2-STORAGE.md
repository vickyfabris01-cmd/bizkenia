# Moving file storage from Supabase to Cloudflare R2

Pictures (logos, covers, room and product photos, avatars, home hero) can live in R2 instead of
Supabase Storage. One setting switches between them, so you can go back at any time.

How it works: the browser sends the file to `/api/files/...` on your own site (the Worker in
`worker/index.js`). The Worker asks Supabase "may this person write here?" (`can_write_files`, same
rules as before), checks the file really is a JPG/PNG/WebP, then saves it in R2. Reading pictures is
public and cached. The site itself is still served as free static assets; only `/api/files/*` wakes the Worker.

## Order matters. Do these in order.

**1. Bucket** (skip if done). Dashboard > R2 > Create bucket `bizkenia-files`. Leave public access OFF.

**2. Fill in `wrangler.jsonc` > `vars`**: `SUPABASE_URL` and `SUPABASE_ANON_KEY` (public values, the same as your
`VITE_SUPABASE_*`). Keep `ALLOWED_ORIGINS` for local testing, or clear it.

**3. Database function.** Run `supabase/migrations/20261024100001_r2_can_write_files.sql`
(`npx supabase db push`, or paste it in the SQL editor).

**4. Admin secret** (PowerShell, in the project folder). Pick a long random value:
```
npx wrangler secret put FILES_ADMIN_SECRET
```

**5. Deploy** (push to GitHub as usual). Then open `https://<your-site>/api/files/business-media/x` and you
should see `{"error":"Not found."}`. That means the Worker is live and the site still loads normally.
Nothing uses R2 yet.

**6. Copy the old files** (dry run first). Variables are in the header of `scripts/migrate-storage-to-r2.mjs`.
```
node scripts/migrate-storage-to-r2.mjs --dry-run
node scripts/migrate-storage-to-r2.mjs
```
The service-role key is only for this script on your laptop. Never commit it or put it in the Worker.

**7. Switch the site.** In Cloudflare > Workers > bizkenia > Settings > Build > Variables, add
`VITE_STORAGE_PROVIDER = r2` and redeploy. (For local testing put it in `.env.local` and also set
`VITE_FILES_API_URL=https://<your-site>/api/files`.) New uploads now go to R2. Test: upload a logo, a
product photo, an avatar; delete one.

**8. Repoint saved addresses.** Open `scripts/rewrite-storage-urls.sql`, fill in the two prefixes, run it with
`v_apply = false`, check the counts, then set it to `true`. Take a backup first.

**9. Edge functions** (so deleting a business or account also deletes its R2 files):
```
npx supabase secrets set FILES_ADMIN_URL=https://<your-site>/api/files/admin FILES_ADMIN_SECRET=<same secret>
npx supabase functions deploy delete-account delete-business purge-closed-businesses
```

**10. Later (after a week or two).** When nothing points at Supabase Storage any more, empty those three
buckets to free the space.

## Going back
Set `VITE_STORAGE_PROVIDER=supabase` and redeploy. Files uploaded to R2 in the meantime stay in R2, and
their saved addresses keep working because the Worker still serves them.

## Notes
- Serving pictures through the Worker counts toward the Workers free plan (100,000 requests a day). Images are
  cached, so repeat views are cheap. For heavy traffic, connect a custom domain to the bucket and set
  `VITE_FILES_BASE_URL=https://cdn.<your-domain>`; the Worker is then used only for uploads and deletes.
- Saved addresses contain your site's domain. If you change the domain later, run the rewrite script again.
- Limits enforced by the Worker: business and hero photos 5 MB, avatars 2 MB, JPG/PNG/WebP only (checked
  from the file contents, not the name).
- Tests: `npm run test:worker`.
- Private documents (contracts, IDs) need a different route: not public, signed or Worker-checked reads. Not
  included here; ask when you get to it.
