// src/lib/api/adminFiles.js — NEW FILE
// AIM: talks to the Worker routes /api/admin/orphans (scan) and /api/admin/orphans/delete. Super admin
// only. Every function returns { data, error } and never throws.

import { supabase } from "../../config/supabase.js";

async function call(path, init = {}) {
  if (!supabase) return { data: null, error: "The app is not connected to the database yet." };
  const { data: s } = await supabase.auth.getSession();
  const token = s?.session?.access_token;
  if (!token) return { data: null, error: "Please sign in again." };
  try {
    const res = await fetch(path, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { data: null, error: body.error || "Something went wrong. Try again." };
    return { data: body, error: null };
  } catch {
    return { data: null, error: "Could not reach the server. Check your connection and try again." };
  }
}

/** Lists the unused files (older than the Worker's minimum age) and a few totals. */
export const scanUnusedFiles = () => call("/api/admin/orphans");

/** Deletes unused files, 100 at a time. The Worker re-checks each one before deleting. */
export async function deleteUnusedFiles(keys, onProgress) {
  let deleted = 0, stillUsed = 0, tooNew = 0, missing = 0;
  for (let i = 0; i < keys.length; i += 100) {
    const { data, error } = await call("/api/admin/orphans/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys: keys.slice(i, i + 100) }),
    });
    if (error) return { data: { deleted, stillUsed, tooNew, missing }, error };
    deleted += data.deleted; stillUsed += data.skipped.stillUsed; tooNew += data.skipped.tooNew; missing += data.skipped.missing;
    if (onProgress) onProgress(Math.min(i + 100, keys.length), keys.length);
  }
  return { data: { deleted, stillUsed, tooNew, missing }, error: null };
}
