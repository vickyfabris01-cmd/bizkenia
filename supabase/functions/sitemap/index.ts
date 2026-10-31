// sitemap — public XML list of the pages search engines should know about.
// Deploy WITHOUT JWT verification (crawlers carry no token):  supabase functions deploy sitemap --no-verify-jwt
// Secret: SITE_URL (e.g. https://bizkenia.co.ke, no trailing slash). Uses the anon key, so it can only
// see what any visitor can see (active businesses and their active products).
// Rooms (/b/<slug>/room/<id>) and farm produce (/b/<slug>/produce/<id>) come from the same database function the
// "Shop and rent" page uses (market_listings), so a page is listed only while it is listed to visitors: an active
// business, a room type with a free room, a produce item that is active and in stock.
import { createClient } from "npm:@supabase/supabase-js@2";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

Deno.serve(async () => {
  const site = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
  if (!site) return new Response("SITE_URL is not set", { status: 500 });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const urls: { loc: string; lastmod?: string }[] = [{ loc: `${site}/` }, { loc: `${site}/explore` }, { loc: `${site}/shop-rent` }];

  const { data: biz } = await sb.from("businesses").select("id, slug, business_type, updated_at")
    .eq("status", "active").order("updated_at", { ascending: false }).limit(5000);
  const shops = new Map<string, string>();
  // Pages through market_listings (120 a page, as the function allows) up to `cap` items. Stops quietly on an error.
  const listed = async (kind: "farm" | "rooms", cap: number) => {
    const out: { id: string; business_slug: string; created_at?: string }[] = [];
    for (let offset = 0; offset < cap; offset += 120) {
      const { data, error } = await sb.rpc("market_listings", { p_kind: kind, p_q: null, p_county: null, p_sort: "new", p_limit: 120, p_offset: offset });
      const items = (!error && data && Array.isArray(data.items)) ? data.items : [];
      out.push(...items);
      if (items.length < 120) break;
    }
    return out;
  };
  for (const b of biz ?? []) {
    urls.push({ loc: `${site}/b/${b.slug}`, lastmod: b.updated_at });
    if (b.business_type === "shop") { urls.push({ loc: `${site}/b/${b.slug}/browse` }); shops.set(b.id, b.slug); }
  }
  for (const r of await listed("rooms", 5000)) urls.push({ loc: `${site}/b/${r.business_slug}/room/${r.id}`, lastmod: r.created_at });
  for (const f of await listed("farm", 5000)) urls.push({ loc: `${site}/b/${f.business_slug}/produce/${f.id}`, lastmod: f.created_at });
  if (shops.size) {
    const { data: prods } = await sb.from("products").select("id, business_id, created_at")
      .in("business_id", [...shops.keys()]).eq("status", "active").order("created_at", { ascending: false }).limit(40000);
    for (const p of prods ?? []) urls.push({ loc: `${site}/b/${shops.get(p.business_id)}/p/${p.id}`, lastmod: p.created_at });
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.slice(0, 50000).map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod.slice(0, 10)}</lastmod>` : ""}</url>`).join("\n") + `\n</urlset>\n`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
});