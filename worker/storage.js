// worker/storage.js — NEW FILE (Part 9, job B)
// AIM: how much R2 space each business uses, for the super admin reports.
//   GET /api/admin/storage            totals per business (cached for 10 minutes)
//   GET /api/admin/storage?refresh=1  list R2 again now (what the Refresh button sends)
// Super admin only (same check as worker/orphans.js). Listing R2 is a metered operation, so the answer is kept
// for 10 minutes in the Worker's cache. Files live under business-media/<businessId>/...; everything else
// (hero pictures, link-preview share cards in site-media/share, avatars, strange keys) is the "Platform" bucket.

import { listAll } from "./orphans.js";

const TTL_SECONDS = 600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

// is the caller a super admin? returns { status } (copied from orphans.js, which keeps its own copy private)
async function check(request, env) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { status: 401 };
  let res;
  try {
    res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/is_super_admin`, {
      method: "POST",
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{}",
    });
  } catch { return { status: 502 }; }
  if (res.status === 401) return { status: 401 };
  if (!res.ok) return { status: 502 };
  return { status: (await res.json()) === true ? 200 : 403 };
}

/** Which part of the platform an R2 key belongs to: { business: "<uuid>" } or { platform: "hero" | "share" | "avatars" | "other" }. */
export function classify(key) {
  const parts = String(key).split("/");
  if (parts[0] === "business-media" && UUID.test(parts[1] || "") && parts.length > 2) return { business: parts[1].toLowerCase() };
  if (parts[0] === "site-media" && parts[1] === "hero") return { platform: "hero" };
  if (parts[0] === "site-media" && parts[1] === "share") return { platform: "share" };
  if (parts[0] === "avatars") return { platform: "avatars" };
  return { platform: "other" };
}

/**
 * Adds up the listing. objects: [{ key, size }]. Pure, so it can be tested.
 * Per business: bytes, files, share (of everything stored) and averageOthers (the mean bytes of the OTHER businesses
 * that have files; null when there are none). "Platform" holds everything that is not under a business folder.
 */
export function summarize(objects) {
  const biz = new Map();
  const platform = { bytes: 0, files: 0, parts: { hero: 0, share: 0, avatars: 0, other: 0 } };
  let bytes = 0, files = 0;
  for (const o of objects) {
    const size = Number(o.size) || 0;
    bytes += size; files += 1;
    const c = classify(o.key);
    if (c.business) {
      const row = biz.get(c.business) || { id: c.business, bytes: 0, files: 0 };
      row.bytes += size; row.files += 1; biz.set(c.business, row);
    } else {
      platform.bytes += size; platform.files += 1; platform.parts[c.platform] += size;
    }
  }
  const rows = [...biz.values()];
  const bizBytes = rows.reduce((s, r) => s + r.bytes, 0);
  const share = (n) => (bytes > 0 ? n / bytes : 0);
  return {
    totals: { bytes, files },
    businesses: rows
      .map((r) => ({ ...r, share: share(r.bytes), averageOthers: rows.length > 1 ? (bizBytes - r.bytes) / (rows.length - 1) : null }))
      .sort((a, b) => b.bytes - a.bytes),
    platform: { ...platform, share: share(platform.bytes) },
  };
}

const cacheKey = (request) => new Request(`${new URL(request.url).origin}/__cache/admin-storage`, { method: "GET" });

export async function handleStorage(request, env, ctx) {
  if (request.method !== "GET") return json({ error: "Not found." }, 404);
  const who = await check(request, env);
  if (who.status === 401) return json({ error: "Please sign in again." }, 401);
  if (who.status === 403) return json({ error: "Only a super admin can do this." }, 403);
  if (who.status !== 200) return json({ error: "Could not check your permission. Try again." }, 502);

  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  const cache = typeof caches !== "undefined" ? caches.default : null;
  if (cache && !refresh) {
    const hit = await cache.match(cacheKey(request));
    if (hit) return json({ ...(await hit.json()), cached: true });
  }
  try {
    const { objects, truncated } = await listAll(env);
    const body = { generatedAt: Date.now(), ttlSeconds: TTL_SECONDS, truncated, objects: objects.length, ...summarize(objects) };
    if (cache) {
      const put = cache.put(cacheKey(request), new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${TTL_SECONDS}` } }));
      if (ctx && ctx.waitUntil) ctx.waitUntil(put); else await put;
    }
    return json({ ...body, cached: false });
  } catch (e) {
    return json({ error: String((e && e.message) || "Could not read the file storage.") }, 502);
  }
}
