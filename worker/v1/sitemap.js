// worker/v1/sitemap.js — NEW FILE (replaces the Edge Function sitemap)
// AIM: public XML list of the pages search engines should know about. GET /sitemap.xml (also /api/v1/sitemap).
// Uses the anon key: it sees only what any visitor sees (active businesses and their active products).
// Same pages as the Edge Function on main: home, explore, shop-rent, every active business (and a shop's browse page), its active
// products, and rooms and farm produce from the same market_listings function the Shop and rent page uses.
// OPTIONAL VAR: SITE_URL = https://<your live site>, no trailing slash. Empty = the address this request came in on. Kept for an hour at the edge.
import { anon } from "./supabase.js";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function sitemap(request, env, ctx) {
  const site = String(env.SITE_URL || "").replace(/\/$/, "") || new URL(request.url).origin;
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(`${new URL(request.url).origin}/sitemap.xml`, { method: "GET" });
  if (cache) { const hit = await cache.match(key); if (hit) return hit; }

  const db = anon(env);
  const urls = [{ loc: `${site}/` }, { loc: `${site}/explore` }, { loc: `${site}/shop-rent` }];
  const { data: biz, error: bizErr } = await db.list("businesses", { select: "id,slug,business_type,updated_at", filters: { status: "eq.active" }, order: "updated_at.desc", limit: 5000 });
  if (bizErr) return new Response("The sitemap is not available right now.", { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } }); // never cache a half-empty sitemap
  const shops = new Map();
  for (const b of biz ?? []) {
    urls.push({ loc: `${site}/b/${b.slug}`, lastmod: b.updated_at });
    if (b.business_type === "shop") { urls.push({ loc: `${site}/b/${b.slug}/browse` }); shops.set(b.id, b.slug); }
  }
  // Pages through market_listings (120 a page, as the function allows) up to `cap` items. Stops quietly on an error.
  const listed = async (kind, cap) => {
    const out = [];
    for (let offset = 0; offset < cap; offset += 120) {
      const { data, error } = await db.rpc("market_listings", { p_kind: kind, p_q: null, p_county: null, p_sort: "new", p_limit: 120, p_offset: offset });
      const items = !error && data && Array.isArray(data.items) ? data.items : [];
      out.push(...items);
      if (items.length < 120) break;
    }
    return out;
  };
  for (const r of await listed("rooms", 1200)) urls.push({ loc: `${site}/b/${r.business_slug}/room/${r.id}`, lastmod: r.created_at });
  for (const f of await listed("farm", 1200)) urls.push({ loc: `${site}/b/${f.business_slug}/produce/${f.id}`, lastmod: f.created_at });
  if (shops.size) {
    // the id list goes in the address, so ask in chunks of 100 shops to keep it short
    const ids = [...shops.keys()];
    for (let i = 0; i < ids.length && i < 2500 && urls.length < 50000; i += 100) { // at most 25 requests: the free plan allows 50 outbound requests per run
      const { data: prods } = await db.list("products", { select: "id,business_id,created_at", filters: { business_id: `in.(${ids.slice(i, i + 100).join(",")})`, status: "eq.active" }, order: "created_at.desc", limit: 5000 });
      for (const p of prods ?? []) urls.push({ loc: `${site}/b/${shops.get(p.business_id)}/p/${p.id}`, lastmod: p.created_at });
    }
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.slice(0, 50000).map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${String(u.lastmod).slice(0, 10)}</lastmod>` : ""}</url>`).join("\n") + `\n</urlset>\n`;
  const res = new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
  if (cache) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
