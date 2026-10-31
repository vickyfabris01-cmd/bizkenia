// worker/entry.js — MODIFIED (restores /api/admin/orphans*; keeps /share/*; Part 9: /api/admin/storage, /robots.txt, /sitemap.xml)
import files from "./index.js";
import { handleOrphans } from "./orphans.js";
import { handleShare } from "./share.js";
import { handleStats } from "./stats.js";
import { handleStorage } from "./storage.js";

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

// /sitemap.xml: the Supabase function builds it (it needs the SITE_URL secret); the Worker only passes it on.
async function sitemap(env) {
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
    if (pathname === "/sitemap.xml" && (request.method === "GET" || request.method === "HEAD")) return sitemap(env);
    if (pathname === "/api/admin/stats") return handleStats(request, env);
    if (pathname === "/api/admin/storage") return handleStorage(request, env, ctx);
    if (pathname === "/api/admin/orphans" || pathname === "/api/admin/orphans/delete") return handleOrphans(request, env);
    if (pathname.startsWith("/share/")) return handleShare(request, env);
    return files.fetch(request, env, ctx);
  },
};
