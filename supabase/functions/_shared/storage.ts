// File clean-up for the delete functions. Deleting database rows does not delete the files kept in
// Supabase Storage, so the names are listed first (storage_paths_for) and removed afterwards.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/** Every file name in a bucket whose first folder is `folder` (a business id or a user id). */
export async function pathsFor(admin: SupabaseClient, bucket: string, folder: string): Promise<string[]> {
  const { data } = await admin.rpc("storage_paths_for", { p_bucket: bucket, p_folder: folder });
  return (data as string[] | null) ?? [];
}

/** Removes the files in batches. Returns how many could not be removed (the data is already gone, so this is only logged). */
export async function removePaths(admin: SupabaseClient, bucket: string, paths: string[]): Promise<number> {
  let failed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { error } = await admin.storage.from(bucket).remove(batch);
    if (error) { failed += batch.length; console.error("[storage] could not remove", bucket, error.message); }
  }
  return failed;
}

/**
 * Deletes everything a business or a person keeps in a bucket: the Supabase copies listed earlier
 * (`supabasePaths`, from pathsFor) AND the Cloudflare R2 folder, through the Worker's admin route.
 * Set FILES_ADMIN_URL (https://<your-site>/api/files/admin) and FILES_ADMIN_SECRET as function
 * secrets. Without them only Supabase is cleaned, which is right until you move to R2.
 */
export async function removeFolder(admin: SupabaseClient, bucket: string, folder: string, supabasePaths: string[] = []): Promise<void> {
  if (supabasePaths.length) await removePaths(admin, bucket, supabasePaths);
  const base = Deno.env.get("FILES_ADMIN_URL")?.replace(/\/+$/, "");
  const secret = Deno.env.get("FILES_ADMIN_SECRET");
  if (!base || !secret) return;
  try {
    const res = await fetch(`${base}/remove-folder`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Secret": secret },
      body: JSON.stringify({ bucket, folder }),
    });
    if (!res.ok) console.error("[storage] R2 folder removal failed", bucket, folder, res.status);
  } catch (e) {
    console.error("[storage] R2 folder removal error", bucket, folder, (e as Error).message); // data is already gone; log only
  }
}
