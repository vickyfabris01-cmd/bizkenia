// worker/entry.js — MODIFIED (adds /share/* so shared links show a picture and title)
import files from "./index.js";
import { handleShare } from "./share.js";
import { handleStats } from "./stats.js";

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/admin/stats") return handleStats(request, env);
    if (pathname.startsWith("/share/")) return handleShare(request, env);
    return files.fetch(request, env, ctx);
  },
};
