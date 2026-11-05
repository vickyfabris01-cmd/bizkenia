// worker/entry.js — MODIFIED (adds /api/v1/*, /sitemap.xml and the cron timers; everything else is unchanged)
import files from "./index.js";
import { handleOrphans } from "./orphans.js";
import { handleShare } from "./share.js";
import { handleStats } from "./stats.js";
import { handleV1 } from "./v1/router.js";
import { runScheduled } from "./v1/cron.js";

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/v1/") || pathname === "/sitemap.xml") return handleV1(request, env, ctx);
    if (pathname === "/api/admin/stats") return handleStats(request, env);
    if (pathname === "/api/admin/orphans" || pathname === "/api/admin/orphans/delete") return handleOrphans(request, env);
    if (pathname.startsWith("/share/")) return handleShare(request, env);
    return files.fetch(request, env, ctx);
  },
  // Cloudflare calls this on the schedules listed under "triggers" in wrangler.jsonc
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(controller, env));
  },
};
