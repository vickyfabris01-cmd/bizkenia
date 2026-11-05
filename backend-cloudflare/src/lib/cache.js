// src/lib/cache.js — NEW FILE
//
// AIM
// A tiny memory for PUBLIC reads (the same answer for every visitor), so going Home -> Explore -> Home does not
// start from nothing each time. It shows the last answer at once and, when that answer is a little old,
// quietly fetches a new one for the next visit ("stale while revalidate").
//
//   cached(key, loader)   loader returns { data, error }. Same key within `fresh` ms: the saved answer, no request.
//                         Older than `fresh` but younger than `maxAge`: the saved answer now + one quiet refresh.
//                         Older than `maxAge` or never loaded: wait for the loader.
//   clearCache(prefix)    forget saved answers (all, or those whose key starts with prefix)
//
// RULES: only answers WITHOUT an error are saved. Two calls for the same key at the same time share one request.
// Use it ONLY for data that is the same for everyone. Never for orders, invoices, payments, notifications or profiles.
// The memory lives in the browser tab and is gone on reload.

const FRESH_MS = 60 * 1000;        // use as is, no request at all
const MAX_AGE_MS = 10 * 60 * 1000; // older than this is never shown; wait for a new answer
const MAX_KEYS = 60;               // searches create many keys; keep the newest

const saved = new Map();     // key -> { at, value }
const inFlight = new Map();  // key -> Promise

function load(key, loader) {
  if (inFlight.has(key)) return inFlight.get(key);
  const request = Promise.resolve()
    .then(loader)
    .then((res) => {
      if (res && !res.error) {
        saved.delete(key);
        saved.set(key, { at: Date.now(), value: res });
        if (saved.size > MAX_KEYS) saved.delete(saved.keys().next().value);
      }
      return res;
    })
    .catch((e) => ({ data: null, error: e?.message || "Something went wrong" }))
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

export function cached(key, loader, { fresh = FRESH_MS, maxAge = MAX_AGE_MS } = {}) {
  const hit = saved.get(key);
  const age = hit ? Date.now() - hit.at : Infinity;
  if (hit && age <= maxAge) {
    if (age > fresh) load(key, loader); // show what we have now, refresh quietly for next time
    return Promise.resolve(hit.value);
  }
  return load(key, loader);
}

export function clearCache(prefix = "") {
  for (const k of [...saved.keys()]) if (k.startsWith(prefix)) saved.delete(k);
}
