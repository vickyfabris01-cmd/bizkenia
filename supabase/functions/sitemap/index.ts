// sitemap — public XML list of the pages search engines should know about.
// Deploy WITHOUT JWT verification (crawlers carry no token):  supabase functions deploy sitemap --no-verify-jwt
// Secret: SITE_URL (e.g. https://bizkenia.co.ke, no trailing slash). Uses the anon key, so it can only
// see what any visitor can see (active businesses and their active products).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

Deno.serve(async () => {
  const site = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
  if (!site) return new Response("SITE_URL is not set", { status: 500 });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const urls: { loc: string; lastmod?: string }[] = [{ loc: `${site}/` }, { loc: `${site}/explore` }];

  const { data: biz } = await sb.from("businesses").select("id, slug, business_type, updated_at")
    .eq("status", "active").order("updated_at", { ascending: false }).limit(5000);
  const shops = new Map<string, string>();
  for (const b of biz ?? []) {
    urls.push({ loc: `${site}/b/${b.slug}`, lastmod: b.updated_at });
    if (b.business_type === "shop") { urls.push({ loc: `${site}/b/${b.slug}/browse` }); shops.set(b.id, b.slug); }
  }
  if (shops.size) {
    const { data: prods } = await sb.from("products").select("id, business_id, created_at")
      .in("business_id", [...shops.keys()]).eq("status", "active").order("created_at", { ascending: false }).limit(40000);
    for (const p of prods ?? []) urls.push({ loc: `${site}/b/${shops.get(p.business_id)}/p/${p.id}`, lastmod: p.created_at });
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.slice(0, 50000).map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod.slice(0, 10)}</lastmod>` : ""}</url>`).join("\n") + `\n</urlset>\n`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
});
