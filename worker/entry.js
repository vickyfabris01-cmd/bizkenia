// worker/entry.js — MODIFIED (restores /api/admin/orphans*; keeps /share/*)
import files from "./index.js";
import { handleOrphans } from "./orphans.js";
import { handleShare } from "./share.js";
import { handleStats } from "./stats.js";

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/admin/stats") return handleStats(request, env);
    if (pathname === "/api/admin/orphans" || pathname === "/api/admin/orphans/delete") return handleOrphans(request, env);
    if (pathname.startsWith("/share/")) return handleShare(request, env);
    return files.fetch(request, env, ctx);
  },
};
