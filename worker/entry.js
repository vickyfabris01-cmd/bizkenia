// worker/entry.js — MODIFIED (everything from Part 9 kept; adds /api/v1/*, the Worker-built /sitemap.xml and the cron timers)
import files from "./index.js";
import { handleOrphans } from "./orphans.js";
import { handleShare } from "./share.js";
import { handleStats } from "./stats.js";
import { handleStorage } from "./storage.js";
import { handleV1 } from "./v1/router.js";
import { sitemap as buildSitemap } from "./v1/sitemap.js";
import { runScheduled } from "./v1/cron.js";

// /robots.txt: the file in public/ with a Sitemap line built from the host that was asked, so no domain is written anywhere.
const FALLBACK_ROBOTS = "User-agent: *\nAllow: /\nDisallow: /app/\nDisallow: /admin/\n";
async function robots(request, env) {
  const origin = new URL(request.url).origin;
  let text = FALLBACK_ROBOTS;
  try {
    const res = env.ASSETS ? await env.ASSETS.fetch(new Request(`${origin}/robots.txt`)) : null;
    if (res && res.ok) text = await res.text();
  } catch { /* keep the fallback */ }
  const body = `${text.split("\n").filter((l) => !/^\s*sitemap\s*:/i.test(l)).join("\n").trimEnd()}\n\nSitemap: ${origin}/sitemap.xml\n`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}

// /sitemap.xml: the old way by default; with SITEMAP_IN_WORKER = "true" the Worker builds it itself (worker/v1/sitemap.js) and falls back to the old way if that fails:
// the Supabase function builds it (it needs the SITE_URL secret) and the Worker passes it on.
async function sitemapViaSupabase(env) {
  try {
    const res = await fetch(`${env.SUPABASE_URL}/functions/v1/sitemap`);
    if (!res.ok) return new Response("The sitemap is not available right now.", { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
    return new Response(res.body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
  } catch {
    return new Response("The sitemap is not available right now.", { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === "/robots.txt" && (request.method === "GET" || request.method === "HEAD")) return robots(request, env);
    if (pathname === "/sitemap.xml" && (request.method === "GET" || request.method === "HEAD")) {
      // Opt-in: SITEMAP_IN_WORKER = "true" (wrangler.jsonc) builds it here. Test it first at /api/v1/sitemap. Off = exactly as before.
      if (env.SITEMAP_IN_WORKER === "true") { try { const res = await buildSitemap(request, env, ctx); if (res.ok) return res; } catch { /* fall back below */ } }
      return sitemapViaSupabase(env);
    }
    if (pathname.startsWith("/api/v1/")) return handleV1(request, env, ctx);
    if (pathname === "/api/admin/stats") return handleStats(request, env);
    if (pathname === "/api/admin/storage") return handleStorage(request, env, ctx);
    if (pathname === "/api/admin/orphans" || pathname === "/api/admin/orphans/delete") return handleOrphans(request, env);
    if (pathname.startsWith("/share/")) return handleShare(request, env);
    return files.fetch(request, env, ctx);
  },
  // Cloudflare calls this on the schedules listed under "triggers" in wrangler.jsonc
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(controller, env));
  },
};
