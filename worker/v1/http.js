// worker/v1/http.js — NEW FILE
// AIM: the small helpers every /api/v1 route shares: JSON answers with one error shape, the origin
// allowlist (CORS), a safe secret comparison, a body reader and a best-effort rate limit.
// Error shape everywhere: { "error": "Plain sentence for the person", "code": "OPTIONAL_MACHINE_CODE" }.

export const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...extra } });

/** CORS: the site itself (same origin) needs none. Other origins must be listed in ALLOWED_ORIGINS (comma separated). */
export function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return {};
  const allowed = new Set([new URL(request.url).origin, ...String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean)]);
  if (!allowed.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Cron-Secret",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** Compares two strings without stopping at the first difference. */
export function sameSecret(a, b) {
  const x = new TextEncoder().encode(String(a ?? "")), y = new TextEncoder().encode(String(b ?? ""));
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

/** The JSON body, or null when it is missing or not JSON. */
export async function readJson(request) {
  try { const b = await request.json(); return b && typeof b === "object" && !Array.isArray(b) ? b : null; } catch { return null; }
}

/** The site's public address: PUBLIC_BASE_URL when set, else the address this request came in on. null when that is not a public https address. */
export function publicBase(request, env) {
  const set = String(env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (set) return set;
  const u = new URL(request.url);
  return u.protocol === "https:" && !/^(localhost|127\.|\[::1\])/.test(u.hostname) ? u.origin : null;
}
export const bearer = (request) => (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Best-effort limiter kept in the memory of one Worker instance: it slows a single noisy visitor but is NOT
// a hard guarantee (instances come and go). For a hard limit add a Cloudflare rate-limiting rule on /api/v1/*
// (Dashboard > Security > WAF > Rate limiting rules). See docs/BACKEND.md.
const hits = new Map();
export function tooMany(key, max, windowMs, now = Date.now()) {
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) for (const k of hits.keys()) { if (!(hits.get(k) || []).some((t) => now - t < windowMs)) hits.delete(k); }
  return list.length > max;
}
export const clientIp = (request) => request.headers.get("CF-Connecting-IP") || "unknown";
export const resetLimits = () => hits.clear(); // for tests
