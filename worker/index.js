// worker/index.js
// AIM: file storage for BizKenia on Cloudflare R2. This Worker only answers /api/files/* (see
// "run_worker_first" in wrangler.jsonc); every other request is served by the static site as before.
//
//   GET  /api/files/<bucket>/<path>        public read of an image (cached, immutable)
//   PUT  /api/files/<bucket>/<path>        upload   (signed-in user; checked against Supabase)
//   POST /api/files/remove                 delete   {bucket, paths:[...]} (same check)
//   PUT  /api/files/admin/<bucket>/<path>  copy-in for the migration script   (needs the admin secret)
//   POST /api/files/admin/remove-folder    delete a whole folder {bucket, folder} (needs the admin secret)
//
// Who may write is decided by ONE Postgres function, public.can_write_files(), called with the
// user's own token, so the rules stay next to the rest of your row-level security.
// Objects are stored under the key "<bucket>/<path>", so URLs keep the shape the app already parses.

const MB = 1024 * 1024;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const FILE = "[A-Za-z0-9_-]{1,80}\\.(?:jpg|png|webp)";
const BUCKETS = {
  "business-media": { maxBytes: 5 * MB, path: new RegExp(`^${UUID}(?:/[A-Za-z0-9_-]{1,40}){1,3}/${FILE}$`) },
  "site-media": { maxBytes: 5 * MB, path: new RegExp(`^(?:hero|share)/${FILE}$`) },
  avatars: { maxBytes: 2 * MB, path: new RegExp(`^${UUID}/${FILE}$`) },
};
const FOLDER = new RegExp(`^(?:${UUID}|hero|share)$`);

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...extra } });

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return {};
  const allowed = new Set([new URL(request.url).origin, ...String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean)]);
  if (!allowed.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, HEAD, PUT, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Admin-Secret",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

// "/api/files/a/b%20c" -> ["a","b c"], or null if anything looks like path trickery
function parseSegments(pathname) {
  const rest = pathname.slice("/api/files/".length);
  if (!rest) return null;
  const out = [];
  for (const raw of rest.split("/")) {
    let seg;
    try { seg = decodeURIComponent(raw); } catch { return null; }
    if (!seg || seg === "." || seg === ".." || /[\\\u0000-\u001f]/.test(seg)) return null;
    out.push(seg);
  }
  return out;
}

// the real type comes from the file's own first bytes, never from what the browser says
function sniff(b) {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (b.length > 12 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return { ext: "png", type: "image/png" };
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return { ext: "webp", type: "image/webp" };
  return null;
}

// reads the body but gives up as soon as it passes `max` bytes (Content-Length can be missing or wrong)
async function readLimited(body, max) {
  if (!body) return { bytes: new Uint8Array(0) };
  const reader = body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel(); return { tooBig: true }; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.byteLength; }
  return { bytes };
}

function sameSecret(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const isAdmin = (request, env) => sameSecret(request.headers.get("X-Admin-Secret") || "", env.FILES_ADMIN_SECRET || "");

// asks Supabase, as the signed-in user, whether they may write these paths
async function userMayWrite(request, env, bucket, paths) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { status: 401 };
  let res;
  try {
    res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/can_write_files`, {
      method: "POST",
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_bucket: bucket, p_paths: paths }),
    });
  } catch { return { status: 502 }; }
  if (res.status === 401) return { status: 401 };
  if (!res.ok) return { status: 502 };
  return (await res.json()) === true ? { ok: true } : { status: 403 };
}

const NOPE = { 401: "Please sign in again.", 403: "You are not allowed to change these files.", 502: "Could not check your permission. Try again." };

async function upload(request, env, bucket, path, admin) {
  const cfg = BUCKETS[bucket];
  if (!cfg || !cfg.path.test(path)) return json({ error: "That file name is not allowed." }, 400);
  const declared = Number(request.headers.get("Content-Length"));
  if (declared > cfg.maxBytes) return json({ error: `The photo must be under ${cfg.maxBytes / MB} MB.` }, 413);
  if (!admin) {
    const who = await userMayWrite(request, env, bucket, [path]);
    if (!who.ok) return json({ error: NOPE[who.status] }, who.status); // checked BEFORE reading the body
  }
  const read = await readLimited(request.body, cfg.maxBytes);
  if (read.tooBig) return json({ error: `The photo must be under ${cfg.maxBytes / MB} MB.` }, 413);
  const kind = sniff(read.bytes);
  if (!kind || path.slice(path.lastIndexOf(".") + 1) !== kind.ext) return json({ error: "Use a JPG, PNG or WebP photo." }, 415);
  const stored = await env.BIZKENIA_FILES.put(`${bucket}/${path}`, read.bytes, {
    httpMetadata: { contentType: kind.type, cacheControl: "public, max-age=31536000, immutable" },
    onlyIf: { etagDoesNotMatch: "*" }, // never overwrite: same as upsert:false
  });
  if (!stored) return json({ error: "A file with that name already exists." }, 409);
  return json({ ok: true, path }, 201);
}

async function remove(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Bad request." }, 400); }
  const { bucket, paths } = body || {};
  const cfg = BUCKETS[bucket];
  if (!cfg || !Array.isArray(paths) || paths.length < 1 || paths.length > 100 || !paths.every((p) => typeof p === "string" && cfg.path.test(p)))
    return json({ error: "Bad request." }, 400);
  const who = await userMayWrite(request, env, bucket, paths);
  if (!who.ok) return json({ error: NOPE[who.status] }, who.status);
  await env.BIZKENIA_FILES.delete(paths.map((p) => `${bucket}/${p}`));
  return json({ ok: true });
}

async function removeFolder(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Bad request." }, 400); }
  const { bucket, folder } = body || {};
  if (!BUCKETS[bucket] || !FOLDER.test(String(folder))) return json({ error: "Bad request." }, 400);
  const prefix = `${bucket}/${folder}/`;
  let removed = 0, cursor;
  do {
    const page = await env.BIZKENIA_FILES.list({ prefix, cursor, limit: 500 });
    if (page.objects.length) { await env.BIZKENIA_FILES.delete(page.objects.map((o) => o.key)); removed += page.objects.length; }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return json({ ok: true, removed });
}

async function read(request, env, ctx, bucket, path) {
  const cfg = BUCKETS[bucket];
  if (!cfg || !cfg.path.test(path)) return json({ error: "Not found." }, 404);
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const cacheKey = new Request(new URL(request.url).origin + new URL(request.url).pathname, { method: "GET" });
  if (cache && request.method === "GET") { const hit = await cache.match(cacheKey); if (hit) return hit; }
  const obj = await env.BIZKENIA_FILES.get(`${bucket}/${path}`);
  if (!obj) return json({ error: "Not found." }, 404, { "Cache-Control": "no-store" });
  const headers = {
    "Content-Type": obj.httpMetadata?.contentType || "application/octet-stream",
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: obj.httpEtag,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cross-Origin-Resource-Policy": "cross-origin",
  };
  if (request.method === "HEAD") return new Response(null, { headers });
  const res = new Response(obj.body, { headers });
  if (cache) ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(request, env);
    const done = (res) => { for (const [k, v] of Object.entries(cors)) res.headers.set(k, v); return res; };
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/files/")) return new Response("Not found", { status: 404 });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const seg = parseSegments(url.pathname);
    if (!seg) return done(json({ error: "Bad request." }, 400));
    try {
      if (seg[0] === "admin") {
        if (!isAdmin(request, env)) return done(json({ error: "Not allowed." }, 403));
        if (seg[1] === "remove-folder" && request.method === "POST") return done(await removeFolder(request, env));
        if (request.method === "PUT" && seg.length > 2) return done(await upload(request, env, seg[1], seg.slice(2).join("/"), true));
        return done(json({ error: "Not found." }, 404));
      }
      if (seg[0] === "remove" && seg.length === 1 && request.method === "POST") return done(await remove(request, env));
      if (seg.length >= 2) {
        const bucket = seg[0], path = seg.slice(1).join("/");
        if (request.method === "GET" || request.method === "HEAD") return done(await read(request, env, ctx, bucket, path));
        if (request.method === "PUT") return done(await upload(request, env, bucket, path, false));
      }
      return done(json({ error: "Not found." }, 404));
    } catch (err) {
      console.error("[files]", err && err.message);
      return done(json({ error: "Something went wrong. Try again." }, 500));
    }
  },
};
