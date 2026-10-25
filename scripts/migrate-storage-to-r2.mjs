// scripts/migrate-storage-to-r2.mjs
// AIM: copy every file from the three Supabase Storage buckets into R2, through the Worker's admin
// route. Safe to run again and again: files already in R2 are skipped. Nothing is deleted from Supabase.
//
//   PowerShell:
//   $env:SUPABASE_URL="https://xxxx.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="..."        # keep on your laptop only, never commit it
//   $env:FILES_ADMIN_URL="https://your-site/api/files/admin"
//   $env:FILES_ADMIN_SECRET="..."               # the same one you set with wrangler secret put
//   node scripts/migrate-storage-to-r2.mjs --dry-run     # lists what would be copied
//   node scripts/migrate-storage-to-r2.mjs               # copies

import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FILES_ADMIN_URL, FILES_ADMIN_SECRET } = process.env;
const dry = process.argv.includes("--dry-run");
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !FILES_ADMIN_URL || !FILES_ADMIN_SECRET) {
  console.error("Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FILES_ADMIN_URL and FILES_ADMIN_SECRET first.");
  process.exit(1);
}
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BUCKETS = ["business-media", "site-media", "avatars"];

async function* walk(bucket, prefix = "") {
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
    if (!data.length) return;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) yield* walk(bucket, path); // a folder
      else yield path;
    }
    if (data.length < 100) return;
  }
}

// retries a flaky network call a few times before giving up
async function retry(label, fn, tries = 5) {
  for (let i = 1; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= tries) throw e;
      console.log(`  network hiccup on ${label}, retrying (${i}/${tries - 1})...`);
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}

const stats = { copied: 0, skipped: 0, failed: 0 };
for (const bucket of BUCKETS) {
  for await (const path of walk(bucket)) {
    if (dry) { console.log("would copy", bucket, path); stats.copied++; continue; }
    try {
      const { data: blob, error } = await retry(`download ${path}`, () => admin.storage.from(bucket).download(path));
      if (error) { console.error("FAILED download", bucket, path, error.message); stats.failed++; continue; }
      const body = Buffer.from(await blob.arrayBuffer());
      const res = await retry(`upload ${path}`, () => fetch(`${FILES_ADMIN_URL.replace(/\/+$/, "")}/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`, {
        method: "PUT",
        headers: { "X-Admin-Secret": FILES_ADMIN_SECRET, "Content-Type": blob.type || "application/octet-stream" },
        body,
      }));
      if (res.status === 201) { stats.copied++; console.log("copied ", bucket, path); }
      else if (res.status === 409) stats.skipped++;
      else { stats.failed++; console.error("FAILED upload", bucket, path, res.status, await res.text()); }
    } catch (e) {
      stats.failed++; console.error("FAILED (network)", bucket, path, e.cause?.code || e.message);
    }
  }
}
console.log(dry ? "\nDry run." : "\nDone.", stats);
if (stats.failed) process.exitCode = 2;
