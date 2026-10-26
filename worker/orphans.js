// worker/orphans.js — NEW FILE
// AIM: finds files in R2 that no database row points to, and lets a super admin delete them.
//   GET  /api/admin/orphans          scan: lists unused files (older than 3 days) with size and age
//   POST /api/admin/orphans/delete   body {keys:[...]} (up to 100): deletes the ones that are STILL unused
// Safety: only a super admin; files younger than 3 days are never listed or deleted (an upload may not be
// saved on its row yet); every delete re-checks the database right before deleting; if the database scan
// finds no picture paths at all, nothing is offered or deleted.

const DAY = 86400000;
const MIN_AGE_DAYS = 3;
const MAX_OBJECTS = 20000;
const BATCH = 1000;
const KEY = /^(?:business-media|site-media|avatars)\/[A-Za-z0-9_\/.-]+$/;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

// is the caller a super admin? returns { status, token }
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
  return { status: (await res.json()) === true ? 200 : 403, token };
}

// asks the database which of these keys nothing points to
async function unreferenced(env, token, keys) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/admin_unreferenced_files`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_keys: keys }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `The database answered ${res.status}. Has the unused-files SQL been run?`);
  }
  const out = await res.json();
  return { refs: Number(out.refs || 0), keys: Array.isArray(out.unreferenced) ? out.unreferenced : [] };
}

async function listAll(env) {
  const out = [];
  let cursor, truncated = false;
  do {
    const page = await env.BIZKENIA_FILES.list({ cursor, limit: 1000 });
    for (const o of page.objects) out.push({ key: o.key, size: o.size, uploaded: o.uploaded.getTime() });
    cursor = page.truncated ? page.cursor : undefined;
    if (out.length >= MAX_OBJECTS && cursor) { truncated = true; break; }
  } while (cursor);
  return { objects: out, truncated };
}

async function scan(request, env, token) {
  const { objects, truncated } = await listAll(env);
  const ours = objects.filter((o) => KEY.test(o.key));
  const flagged = new Set();
  let refs = 0;
  for (let i = 0; i < ours.length; i += BATCH) {
    const r = await unreferenced(env, token, ours.slice(i, i + BATCH).map((o) => o.key));
    refs = Math.max(refs, r.refs);
    for (const k of r.keys) flagged.add(k);
  }
  if (ours.length > 0 && refs === 0)
    return json({ error: "The database scan found no picture paths at all, so nothing is offered for deletion. Nothing was changed." }, 409);

  const now = Date.now();
  const unused = ours.filter((o) => flagged.has(o.key));
  const old = unused.filter((o) => now - o.uploaded >= MIN_AGE_DAYS * DAY).sort((a, b) => a.uploaded - b.uploaded);
  const share = ours.length ? old.length / ours.length : 0;
  return json({
    scanned: ours.length,
    truncated,
    references: refs,
    minAgeDays: MIN_AGE_DAYS,
    tooNew: unused.length - old.length,
    unusedBytes: old.reduce((s, o) => s + o.size, 0),
    warning: ours.length >= 20 && share > 0.5 ? "More than half of all files look unused. Check a few of them before deleting anything." : null,
    orphans: old.map((o) => ({ key: o.key, size: o.size, uploaded: o.uploaded, url: `/api/files/${o.key}` })),
  });
}

async function remove(request, env, token) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Bad request." }, 400); }
  const keys = body && body.keys;
  if (!Array.isArray(keys) || keys.length < 1 || keys.length > 100 || !keys.every((k) => typeof k === "string" && KEY.test(k) && !k.includes("..")))
    return json({ error: "Bad request." }, 400);

  const now = Date.now();
  let missing = 0, tooNew = 0;
  const present = [];
  for (const key of new Set(keys)) {
    const head = await env.BIZKENIA_FILES.head(key);
    if (!head) { missing++; continue; }
    if (now - head.uploaded.getTime() < MIN_AGE_DAYS * DAY) { tooNew++; continue; }
    present.push(key);
  }
  let verdict = { refs: 0, keys: [] };
  if (present.length) verdict = await unreferenced(env, token, present);
  if (present.length && verdict.refs === 0) return json({ error: "The database scan found no picture paths, so nothing was deleted." }, 409);
  const doomed = present.filter((k) => verdict.keys.includes(k));
  if (doomed.length) await env.BIZKENIA_FILES.delete(doomed);
  return json({ ok: true, deleted: doomed.length, skipped: { stillUsed: present.length - doomed.length, tooNew, missing } });
}

export async function handleOrphans(request, env) {
  const { pathname } = new URL(request.url);
  const isScan = pathname === "/api/admin/orphans" && request.method === "GET";
  const isDelete = pathname === "/api/admin/orphans/delete" && request.method === "POST";
  if (!isScan && !isDelete) return json({ error: "Not found." }, 404);
  const who = await check(request, env);
  if (who.status === 401) return json({ error: "Please sign in again." }, 401);
  if (who.status === 403) return json({ error: "Only a super admin can do this." }, 403);
  if (who.status !== 200) return json({ error: "Could not check your permission. Try again." }, 502);
  try {
    return isScan ? await scan(request, env, who.token) : await remove(request, env, who.token);
  } catch (e) {
    return json({ error: String((e && e.message) || "Something went wrong.") }, 502);
  }
          }
