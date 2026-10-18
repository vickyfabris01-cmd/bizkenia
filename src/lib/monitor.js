// src/lib/monitor.js — NEW FILE (Phase 5, step 4)
//
// AIM
// Tell the owner when the app crashes for a real visitor. Uncaught errors, unhandled promise
// rejections and the error boundaries all call reportError(); it sends a short record to the
// database function log_client_error (migration p5_08). The super admin reads the grouped list at
// /admin/errors. Nothing here can break the app: every step is wrapped, duplicates are dropped and
// at most 5 reports are sent per page load. Development builds only print to the console.

import { supabase } from "../config/supabase.js";

const RELEASE = "1.0.0";
const MAX_PER_LOAD = 5;
const seen = new Set();
let sent = 0;
let installed = false;

export function reportError(error, extra = "") {
  try {
    const message = String((error && error.message) || error || "Unknown error").slice(0, 500);
    if (import.meta.env.DEV) { console.error("[monitor]", message, error); return; }
    if (!supabase || sent >= MAX_PER_LOAD) return;
    const key = message + "|" + (error && error.stack ? String(error.stack).split("\n")[1] || "" : "");
    if (seen.has(key)) return;
    seen.add(key); sent += 1;
    const stack = [extra, error && error.stack].filter(Boolean).join("\n").slice(0, 4000);
    Promise.resolve(supabase.rpc("log_client_error", {
      p_message: message, p_stack: stack, p_url: location.pathname.slice(0, 300),
      p_agent: navigator.userAgent.slice(0, 300), p_release: RELEASE,
    })).catch(() => {});
  } catch { /* monitoring must never throw */ }
}

export function installMonitor() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => {
    if (!e.error && /ResizeObserver/.test(e.message || "")) return; // harmless browser noise
    reportError(e.error || e.message);
  });
  window.addEventListener("unhandledrejection", (e) => reportError(e.reason));
}
