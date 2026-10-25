// worker/entry.js — NEW FILE
import files from "./index.js";
import { handleStats } from "./stats.js";

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/admin/stats") return handleStats(request, env);
    return files.fetch(request, env, ctx);
  },
};
