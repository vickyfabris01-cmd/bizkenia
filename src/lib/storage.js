// src/lib/storage.js
// AIM: the one place the app talks to file storage. Every upload, delete and picture address goes
// through here, so switching between Supabase Storage and Cloudflare R2 is one setting:
//   VITE_STORAGE_PROVIDER = supabase (default) | r2
// Optional, only for r2:
//   VITE_FILES_API_URL   where uploads go (default: this site's own /api/files)
//   VITE_FILES_BASE_URL  public address of the pictures if you serve R2 from your own domain, e.g.
//                        https://cdn.example.com  (it must serve keys as <bucket>/<path>)
// Results mirror what supabase-js returns ({ error: null | { message } }) so callers barely change.

import { supabase } from "../config/supabase.js";

const env = import.meta.env;
export const STORAGE_PROVIDER = String(env.VITE_STORAGE_PROVIDER || "supabase").toLowerCase() === "r2" ? "r2" : "supabase";
const trim = (s) => String(s || "").replace(/\/+$/, "");
const encode = (path) => String(path).split("/").map(encodeURIComponent).join("/");
const apiBase = () => trim(env.VITE_FILES_API_URL) || "/api/files";
const absolute = (u) => (/^https?:\/\//.test(u) ? u : `${window.location.origin}${u}`);

async function token() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || "";
}

async function r2(method, url, init) {
  try {
    const res = await fetch(url, { method, ...init });
    if (res.ok) return { error: null };
    let message = "";
    try { message = (await res.json()).error || ""; } catch { /* not JSON */ }
    return { error: { message: message || `Upload failed (${res.status}).` } };
  } catch {
    return { error: { message: "Could not reach the file service. Check your connection." } };
  }
}

/** Saves a file. Never overwrites an existing name. */
export async function uploadFile(bucket, path, file) {
  if (STORAGE_PROVIDER === "supabase") return supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
  const t = await token();
  if (!t) return { error: { message: "Please sign in again." } };
  return r2("PUT", `${apiBase()}/${bucket}/${encode(path)}`, { headers: { Authorization: `Bearer ${t}`, "Content-Type": file.type }, body: file });
}

/** Deletes files (a list of paths in one bucket). */
export async function removeFiles(bucket, paths) {
  if (!paths.length) return { error: null };
  if (STORAGE_PROVIDER === "supabase") return supabase.storage.from(bucket).remove(paths);
  const t = await token();
  if (!t) return { error: { message: "Please sign in again." } };
  return r2("POST", `${apiBase()}/remove`, { headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, body: JSON.stringify({ bucket, paths }) });
}

/** The address a picture is shown from. */
export function publicUrl(bucket, path) {
  if (STORAGE_PROVIDER === "supabase") return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  const base = trim(env.VITE_FILES_BASE_URL);
  return `${base || absolute(apiBase())}/${bucket}/${encode(path)}`;
}
