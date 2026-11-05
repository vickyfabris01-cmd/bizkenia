// worker/v1/public.js — NEW FILE
// AIM: cached public reads (the first-visit speed-up). The same answer for EVERY visitor, so Cloudflare keeps it
// near the visitor for a minute instead of asking Supabase each time. Runs as the anonymous visitor, so row-level
// security decides what is visible, exactly as when the browser asked Supabase directly.
//   GET /api/v1/public/businesses?search=&type=&county=&limit=&offset=   -> { data, count, error }
//   GET /api/v1/public/home?perType=                                      -> { data: { shop, farm, rooms }, error }
//   GET /api/v1/public/market?kind=&q=&county=&sort=&limit=&offset=       -> { data: { items, total }, error }
//   GET /api/v1/public/counties?kind=                                      -> { data: [...], error }
//   GET /api/v1/public/plans                                               -> { data: [...], error }
//   GET /api/v1/public/stats                                               -> { data, error }
// NEVER add anything user-specific here (orders, invoices, payments, notifications, profiles): it would be shared.
// Only successful answers are kept. Inputs are checked and trimmed so nobody can fill the cache with endless keys.

import { anon } from "./supabase.js";
import { json } from "./http.js";

const TTL = 60; // seconds kept at the edge and in the browser
const CARD_FIELDS = "id,name,slug,business_type,description,county,address,logo_url,logo_design,cover_url,phone,email,whatsapp,created_at";
const TYPES = ["rental", "shop", "agriculture"];
const KINDS = ["shop", "farm", "rooms"];
const SORTS = ["new", "low", "high"];
const int = (v, def, min, max) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : def; };
const text = (v, max) => String(v ?? "").trim().slice(0, max);

async function businesses(env, q) {
  const type = text(q.get("type"), 20);
  if (type && !TYPES.includes(type)) return { status: 400, body: { data: null, error: "Unknown type." } };
  const limit = int(q.get("limit"), 60, 1, 100), offset = int(q.get("offset"), 0, 0, 10000);
  const filters = { status: "eq.active" };
  if (type) filters.business_type = `eq.${type}`;
  const county = text(q.get("county"), 40);
  if (county) filters.county = `eq.${county}`;
  const term = text(q.get("search"), 80).replace(/[%,()*\\]/g, " ").trim();
  if (term) filters.or = `(name.ilike.*${term}*,description.ilike.*${term}*,address.ilike.*${term}*,county.ilike.*${term}*)`;
  const r = await anon(env).list("businesses", { select: CARD_FIELDS, filters, order: "approved_at.desc,id.asc", limit, offset, count: true });
  if (r.error) return { status: 502, body: { data: null, error: r.error.message } };
  return { ok: true, body: { data: r.data || [], count: r.count ?? (r.data || []).length, error: null } };
}

async function home(env, q) {
  const r = await anon(env).rpc("home_listings", { p_per_type: int(q.get("perType"), 4, 1, 12) });
  if (r.error) return { status: 502, body: { data: null, error: r.error.message } };
  const d = r.data || {};
  return { ok: true, body: { data: { shop: d.shop || [], farm: d.farm || [], rooms: d.rooms || [] }, error: null } };
}

async function market(env, q) {
  const kind = text(q.get("kind"), 10), sort = text(q.get("sort") || "new", 10);
  if (!KINDS.includes(kind) || !SORTS.includes(sort)) return { status: 400, body: { data: null, error: "Bad request." } };
  const r = await anon(env).rpc("market_listings", {
    p_kind: kind, p_q: text(q.get("q"), 80) || null, p_county: text(q.get("county"), 40) || null, p_sort: sort,
    p_limit: int(q.get("limit"), 8, 1, 48), p_offset: int(q.get("offset"), 0, 0, 10000),
  });
  if (r.error) return { status: 502, body: { data: null, error: r.error.message } };
  return { ok: true, body: { data: { items: r.data?.items || [], total: Number(r.data?.total || 0) }, error: null } };
}

async function counties(env, q) {
  const kind = text(q.get("kind"), 10);
  if (kind && !KINDS.includes(kind)) return { status: 400, body: { data: null, error: "Bad request." } };
  const r = await anon(env).rpc("market_counties", { p_kind: kind || null });
  return r.error ? { status: 502, body: { data: null, error: r.error.message } } : { ok: true, body: { data: r.data || [], error: null } };
}

const plain = (rpcName) => async (env) => {
  const r = await anon(env).rpc(rpcName, {});
  return r.error ? { status: 502, body: { data: null, error: r.error.message } } : { ok: true, body: { data: r.data ?? null, error: null } };
};

const ROUTES = { businesses, home, market, counties, plans: plain("plan_catalog"), stats: plain("public_stats") };

export async function handlePublic(request, env, ctx, name) {
  const run = ROUTES[name];
  if (!run) return json({ error: "Not found." }, 404);
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

  // The key is built from the CHECKED inputs only (sorted), never from the raw address, so spelling variants share one entry.
  const url = new URL(request.url);
  const q = new URLSearchParams([...url.searchParams.entries()].filter(([k]) => ["search", "type", "county", "limit", "offset", "perType", "kind", "q", "sort"].includes(k)).sort());
  const cacheKey = new Request(`${url.origin}/api/v1/public/${name}?${q.toString()}`, { method: "GET" });
  const cache = typeof caches !== "undefined" ? caches.default : null;
  if (cache) { const hit = await cache.match(cacheKey); if (hit) return hit; }

  const out = await run(env, q);
  if (!out.ok) return json(out.body, out.status, { "Cache-Control": "no-store" });
  const res = json(out.body, 200, { "Cache-Control": `public, max-age=${TTL}` });
  if (cache) ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}
