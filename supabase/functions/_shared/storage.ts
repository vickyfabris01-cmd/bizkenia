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
