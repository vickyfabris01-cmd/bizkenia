// src/lib/backend.js — NEW FILE
// AIM: the one place the app decides WHERE a server function runs: the Cloudflare Worker (/api/v1/fn/<name>)
// or, as before, a Supabase Edge Function. Moving a function is a setting, not a code change, and going back is
// the same setting. Nothing changes until you set the variables below.
//
//   VITE_BACKEND_FUNCTIONS  comma list of function names that run on the Worker, e.g.
//                           "mpesa-status,mpesa-stk-push,resolve-login,send-email,delete-business,delete-account"
//                           (empty or unset = all stay on Supabase)
//   VITE_BACKEND_URL        optional; default "/api/v1" (this site's own address, no CORS). For local testing against
//                           `wrangler dev` use e.g. http://localhost:8787/api/v1
//   VITE_BACKEND_PUBLIC     "on" = the public lists (businesses, home, market, plans) come through the Worker's cache
//
// invokeFunction(name, { body }) answers like supabase.functions.invoke: { data, error } where error has .message and
// .context (the Response), so the existing error handling in the callers keeps working unchanged.
import { supabase } from "../config/supabase.js";

const env = import.meta.env;
const trim = (s) => String(s || "").replace(/\/+$/, "");
const ON = new Set(String(env.VITE_BACKEND_FUNCTIONS || "").split(",").map((s) => s.trim()).filter(Boolean));
export const BACKEND_URL = trim(env.VITE_BACKEND_URL) || "/api/v1";
export const PUBLIC_VIA_BACKEND = String(env.VITE_BACKEND_PUBLIC || "").toLowerCase() === "on";
export const runsOnBackend = (name) => ON.has(name);

export async function invokeFunction(name, { body } = {}) {
  if (!runsOnBackend(name)) return supabase.functions.invoke(name, { body });
  let token = "";
  try { token = (await supabase.auth.getSession()).data?.session?.access_token || ""; } catch { /* resolve-login is called signed out */ }
  let res;
  try {
    res = await fetch(`${BACKEND_URL}/fn/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    return { data: null, error: { message: "Could not reach the server. Check your connection.", context: undefined } };
  }
  if (res.ok) {
    let data = null;
    try { data = await res.json(); } catch { /* empty answer */ }
    return { data, error: null };
  }
  let message = `Request failed (${res.status}).`;
  try { const j = await res.clone().json(); if (j?.error) message = j.error; } catch { /* not JSON */ }
  return { data: null, error: { message, context: res } };
}

/**
 * Reads one public list through the Worker's cache. Returns the Worker's { data, error, count? }, or null when the
 * switch is off or the Worker could not answer (the caller then asks Supabase directly, as before).
 */
export async function publicRead(name, params = {}) {
  if (!PUBLIC_VIA_BACKEND) return null;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  try {
    const res = await fetch(`${BACKEND_URL}/public/${name}${q.size ? `?${q}` : ""}`);
    if (!res.ok) return null;
    const out = await res.json();
    return out && !out.error ? out : null;
  } catch { return null; }
}
