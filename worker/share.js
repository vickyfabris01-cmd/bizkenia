// worker/share.js — MODIFIED FILE (the preview follows the owner's share choices: rent price, address)
//
// AIM
// Link previews for shared links. The site is a single-page app, so when someone shares a link on
// WhatsApp, Facebook, X or Telegram, those apps read only the generic <head> of index.html. Shared links
// therefore point at /share/... instead (the share dialog builds them), and this handler:
//
//   - for link-preview bots (WhatsApp, Facebook, X, Telegram, LinkedIn...): returns a tiny page with the
//     right title, description and picture (Open Graph / Twitter card), read from Supabase with the
//     public anon key, so it only ever sees what any visitor sees (active businesses and products);
//   - for everyone else: a plain redirect to the real page (utm_source and utm_medium are kept).
//
//   GET /share/page/(home|explore|pricing)
//   GET /share/b/:slug
//   GET /share/b/:slug/(p|produce|room)/:id
//
// Only these paths wake the Worker ("run_worker_first" in wrangler.jsonc). The rest of the site is still
// served as free static assets. Unknown paths, missing items and any error fall back to a redirect.

const CRAWLERS = /facebookexternalhit|facebot|whatsapp|twitterbot|linkedinbot|telegrambot|slackbot|discordbot|pinterest|skypeuripreview|applebot|redditbot|embedly|vkshare|viber|googlebot|bingbot/i;
const SLUG = "[A-Za-z0-9_-]{1,100}";
const ID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PAGES = {
  home: { path: "/", title: "", desc: "" },
  explore: { path: "/explore", title: "Explore businesses", desc: "Find rentals, shops and farms across Kenya." },
  pricing: { path: "/pricing", title: "Plans and pricing", desc: "Run your rental, shop or farm in one place." },
};
const KIND = { rental: "Rentals", shop: "Online shop", agriculture: "Farm" };

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clip = (s, n) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const ksh = (n) => `KSh ${Number(n || 0).toLocaleString("en-KE")}`;

/** "/share/b/my-shop/p/<uuid>" -> { kind, slug, id, real } or null */
export function parseShare(pathname) {
  let m = pathname.match(/^\/share\/page\/(home|explore|pricing)$/);
  if (m) return { kind: "page", key: m[1], real: PAGES[m[1]].path };
  m = pathname.match(new RegExp(`^/share/b/(${SLUG})$`));
  if (m) return { kind: "business", slug: m[1], real: `/b/${m[1]}` };
  m = pathname.match(new RegExp(`^/share/b/(${SLUG})/(p|produce|room)/(${ID})$`, "i"));
  if (m) return { kind: m[2], slug: m[1], id: m[3], real: `/b/${m[1]}/${m[2]}/${m[3]}` };
  return null;
}

async function supabase(env, path, body) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
      method: body ? "POST" : "GET",
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** What the owner chose to show (rent price, phone, location); see supabase/migrations/20261027100001_share_options.sql. Defaults when nothing is saved. */
async function getOptions(env, businessId) {
  const o = (await supabase(env, "rpc/get_share_options", { p_business: businessId || null })) || {};
  const on = (k) => (typeof o[k] === "boolean" ? o[k] : true);
  return { showRent: on("showRent"), showLocation: on("showLocation") };
}

async function getBrand(env) {
  const rows = await supabase(env, "platform_settings?select=value&key=eq.brand&limit=1");
  const v = rows?.[0]?.value || {};
  return { name: v.name || "BizKenia", tagline: v.tagline || "Manage and grow your business" };
}

/** The ready-made link card saved by the share dialog (see supabase/migrations/20261026100001_share_cards.sql) */
async function storedCard(env, kind, id, key) {
  const c = await supabase(env, "rpc/get_share_card", { p_kind: kind, p_id: id || null, p_key: key || null });
  return c && typeof c.url === "string" && c.url ? c : null;
}

async function buildCard(m, env) {
  const brand = await getBrand(env);
  if (m.kind === "page") {
    const p = PAGES[m.key];
    const sc = await storedCard(env, "site", null, m.key);
    return { brand, title: p.title ? `${p.title} | ${brand.name}` : brand.name, desc: p.desc || `${brand.tagline}. Collect rent, sell online and keep your farm records in one place.`, image: sc?.url || "", wide: Boolean(sc) };
  }
  const [b] = (await supabase(env, `businesses?select=id,name,business_type,description,county,address,logo_url,cover_url&status=eq.active&slug=eq.${encodeURIComponent(m.slug)}&limit=1`)) || [];
  if (!b) return null;
  const opt = await getOptions(env, b.id);
  const where = opt.showLocation ? ([b.address, b.county].filter(Boolean).join(", ") || "Kenya") : "";
  const at = (lead) => (where ? `${lead}${where}` : "");
  const fallbackImage = b.cover_url || b.logo_url || "";

  if (m.kind === "business") {
    const sc = await storedCard(env, "business", b.id);
    return { brand, title: `${b.name} (${KIND[b.business_type] || "Business"}${at(", ")})`, desc: b.description || `${b.name} on ${brand.name}.`, image: sc?.url || fallbackImage, wide: Boolean(sc) };
  }
  if (m.kind === "room") {
    const t = ((await supabase(env, "rpc/list_room_types", { p_business: b.id })) || []).find((x) => x.id === m.id);
    if (!t) return null;
    const hostel = Boolean(t.is_hostel);
    const rent = opt.showRent ? `${ksh(hostel ? t.semester_price : t.monthly_price)} a ${hostel ? "semester" : "month"}. ` : "";
    const sc = await storedCard(env, "room", t.id);
    return { brand, title: `${t.name} | ${b.name}`, desc: `${rent}${t.description || `Room to rent at ${b.name}${at(", ")}.`}`, image: sc?.url || t.images?.[0] || fallbackImage, wide: Boolean(sc) };
  }
  const [p] = (await supabase(env, `products?select=id,business_id,name,description,price,unit,images&status=eq.active&id=eq.${encodeURIComponent(m.id)}&limit=1`)) || [];
  if (!p || p.business_id !== b.id) return null;
  const unit = p.unit && p.unit !== "item" ? ` / ${p.unit}` : "";
  const sc = await storedCard(env, "product", p.id);
  return { brand, title: `${p.name} | ${b.name}`, desc: `${ksh(p.price)}${unit}. ${p.description || `From ${b.name}${at(", ")}.`}`, image: sc?.url || p.images?.[0] || fallbackImage, wide: Boolean(sc) };
}

function html({ card, shareUrl, target, origin }) {
  const abs = (u) => (!u ? `${origin}/icon-512.png` : /^https?:\/\//i.test(u) ? u : `${origin}${u.startsWith("/") ? "" : "/"}${u}`);
  const title = esc(clip(card.title, 90));
  const desc = esc(clip(card.desc, 200));
  const image = esc(abs(card.image));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<meta name="robots" content="noindex,nofollow">
<meta name="description" content="${desc}">
<meta property="og:site_name" content="${esc(card.brand.name)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${esc(shareUrl)}">
<meta property="og:image" content="${image}">${card.wide ? `
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/jpeg">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${image}">
</head><body><p><a href="${esc(target)}">${title}</a></p>
<script>location.replace(${JSON.stringify(target).replace(/</g, "\\u003c")})</script></body></html>`;
}

const redirect = (to) => new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "no-store", Vary: "User-Agent" } });

export async function handleShare(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
  const url = new URL(request.url);
  const m = parseShare(url.pathname);
  if (!m) return redirect(`${url.origin}/`);

  const keep = new URLSearchParams();
  for (const k of ["utm_source", "utm_medium"]) { const v = url.searchParams.get(k); if (v) keep.set(k, v.slice(0, 40)); }
  const q = keep.toString();
  const target = `${url.origin}${m.real}${q ? `?${q}` : ""}`;

  if (!CRAWLERS.test(request.headers.get("User-Agent") || "")) return redirect(target);
  const card = await buildCard(m, env);
  if (!card) return redirect(target);
  return new Response(html({ card, shareUrl: `${url.origin}${url.pathname}${url.search}`, target, origin: url.origin }), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300", Vary: "User-Agent" },
  });
}
