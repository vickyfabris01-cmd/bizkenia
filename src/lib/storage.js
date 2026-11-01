// src/lib/storage.js — MODIFIED (Part 8: upload progress, cancel, and the "wrong address" guard)
// AIM: the one place the app talks to file storage. Every upload, delete and picture address goes
// through here, so switching between Supabase Storage and Cloudflare R2 is one setting:
//   VITE_STORAGE_PROVIDER = supabase (default) | r2
// Optional, only for r2:
//   VITE_FILES_API_URL   where uploads go (default: this site's own /api/files)
//   VITE_FILES_BASE_URL  public address of the pictures if you serve R2 from your own domain, e.g.
//                        https://cdn.example.com  (it must serve keys as <bucket>/<path>)
// Results mirror what supabase-js returns ({ error: null | { message } }) so callers barely change.
//
// UPLOAD PROGRESS (Part 8)
//   uploadFile(bucket, path, file, options?)   options is optional, so every old call still works.
//     options.onProgress(percent)   0 to 100 while the file is sent (R2 only: the browser reports it through
//                                   XMLHttpRequest). It is called with null when the size cannot be known:
//                                   Supabase Storage reports no progress, so the screen shows "Uploading..." and
//                                   no number. A percent is never invented.
//     options.signal                an AbortSignal; abort() cancels the upload. The result is
//                                   { error: { message: "Upload cancelled.", cancelled: true } }.
//     (a function passed as `options` is taken as onProgress)
//   subscribeUploads / getUploadSnapshot   a tiny live view of all uploads in flight ({ count, percent }), for
//                                   buttons whose page starts the upload itself (ImageUploadButton shows it).
//   downloadWithProgress(url, onProgress)  for a REAL network download (the response stream gives the percent).
//                                   Files drawn in the browser (posters, CSV) are not downloads and need none.
//
// WRONG ADDRESS GUARD (Part 8)
//   In r2 mode publicUrl() saves the address of THIS page when VITE_FILES_BASE_URL is not set. From localhost, 127.x
//   or a workers.dev preview that would put a broken address into live data, so uploadFile refuses (see
//   uploadBlockedReason). Addresses already stored are never changed.

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

// ---- live view of uploads in flight --------------------------------------------------------------------------------
const inFlight = new Map(); // upload id -> percent (0..100) or null when unknown
const listeners = new Set();
let snapshot = { count: 0, percent: null };
let seq = 0;

function publish() {
  const values = [...inFlight.values()];
  // one unknown upload makes the whole figure unknown: never show a number that is partly invented
  const percent = values.length && values.every((v) => v !== null) ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
  if (snapshot.count === values.length && snapshot.percent === percent) return;
  snapshot = { count: values.length, percent };
  listeners.forEach((fn) => fn());
}
export function subscribeUploads(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export const getUploadSnapshot = () => snapshot;

const CANCELLED = () => ({ error: { message: "Upload cancelled.", cancelled: true } });

// ---- the wrong address guard -----------------------------------------------------------------------------------------
function isTestHost(host) {
  const h = String(host || "").toLowerCase();
  return h === "localhost" || h.endsWith(".localhost") || /^127\./.test(h) || h === "[::1]" || h.endsWith(".workers.dev");
}

/** "" when uploads may go ahead, otherwise the message to show the person. */
export function uploadBlockedReason() {
  if (STORAGE_PROVIDER !== "r2" || trim(env.VITE_FILES_BASE_URL)) return "";
  let host = "";
  try { host = new URL(absolute(apiBase())).hostname; } catch { return ""; }
  return isTestHost(host)
    ? "Uploads are switched off on this test address (localhost or a preview link), because the saved picture address would not work on the live site. Upload from the live site, or ask the developer to set VITE_FILES_BASE_URL."
    : "";
}

// ---- R2: PUT through XMLHttpRequest, because fetch cannot report upload progress -----------------------------------------
function putWithProgress(url, headers, body, report, signal) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let finished = false;
    function onAbort() { xhr.abort(); }
    function finish(result) {
      if (finished) return;
      finished = true;
      signal?.removeEventListener("abort", onAbort);
      resolve(result);
    }
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    let last = -1;
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable || !e.total) return;
      // 99 at most until the server has answered: the last bytes leaving the phone is not "saved" yet
      const pct = Math.min(99, Math.floor((e.loaded / e.total) * 100));
      if (pct !== last) { last = pct; report(pct); }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { report(100); finish({ error: null }); return; }
      let message = "";
      try { message = JSON.parse(xhr.responseText).error || ""; } catch { /* not JSON */ }
      finish({ error: { message: message || `Upload failed (${xhr.status}).` } });
    };
    xhr.onerror = () => finish({ error: { message: "Could not reach the file service. Check your connection." } });
    xhr.ontimeout = xhr.onerror;
    xhr.onabort = () => finish(CANCELLED());
    signal?.addEventListener("abort", onAbort, { once: true });
    xhr.send(body);
  });
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

/** Saves a file. Never overwrites an existing name. `options` (optional): { onProgress, signal }, see the top of this file. */
export async function uploadFile(bucket, path, file, options) {
  const { onProgress, signal } = typeof options === "function" ? { onProgress: options } : options || {};
  const id = ++seq;
  const report = (percent) => {
    inFlight.set(id, percent);
    publish();
    try { onProgress?.(percent); } catch { /* a faulty listener must not break the upload */ }
  };
  try {
    if (signal?.aborted) return CANCELLED();
    if (STORAGE_PROVIDER === "supabase") {
      report(null); // Supabase Storage gives no progress: the screen shows "Uploading..." without a number
      const job = supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
      if (!signal) return await job;
      return await new Promise((resolve) => {
        const onAbort = () => resolve(CANCELLED());
        signal.addEventListener("abort", onAbort, { once: true });
        job.then((res) => {
          signal.removeEventListener("abort", onAbort);
          // cancelled while the file was already on its way: remove it again, nobody points to it
          if (signal.aborted) { if (!res?.error) supabase.storage.from(bucket).remove([path]); return; }
          resolve(res);
        }, () => resolve({ error: { message: "Could not reach the file service. Check your connection." } }));
      });
    }
    const blocked = uploadBlockedReason();
    if (blocked) return { error: { message: blocked } };
    const t = await token();
    if (!t) return { error: { message: "Please sign in again." } };
    report(0);
    return await putWithProgress(`${apiBase()}/${bucket}/${encode(path)}`, { Authorization: `Bearer ${t}`, "Content-Type": file.type }, file, report, signal);
  } finally {
    inFlight.delete(id);
    publish();
  }
}

/**
 * A real network download with a live percent from the response stream.
 * Resolves { blob, error }. onProgress(percent) is called only when the server says how big the file is;
 * otherwise it is called once with null (show a spinner, never a made-up number).
 */
export async function downloadWithProgress(url, onProgress, { signal } = {}) {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return { blob: null, error: { message: `Download failed (${res.status}).` } };
    const total = Number(res.headers.get("Content-Length")) || 0;
    if (!res.body || !total) { onProgress?.(null); return { blob: await res.blob(), error: null }; }
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0, last = -1;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      const pct = Math.min(99, Math.floor((got / total) * 100));
      if (pct !== last) { last = pct; onProgress?.(pct); }
    }
    onProgress?.(100);
    return { blob: new Blob(chunks, { type: res.headers.get("Content-Type") || "" }), error: null };
  } catch (e) {
    if (e?.name === "AbortError") return { blob: null, error: { message: "Download cancelled.", cancelled: true } };
    return { blob: null, error: { message: "Could not download the file. Check your connection." } };
  }
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
