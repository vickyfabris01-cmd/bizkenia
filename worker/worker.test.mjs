// Run: node --test worker/worker.test.mjs   (no install needed)
import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.js";

const BIZ = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
const HTML = new TextEncoder().encode("<html><script>alert(1)</script></html>");

function fakeR2() {
  const m = new Map();
  return {
    m,
    async put(k, v, o) { if (o?.onlyIf && m.has(k)) return null; m.set(k, { v, o }); return { key: k }; },
    async get(k) { const e = m.get(k); return e && { body: e.v, httpMetadata: e.o.httpMetadata, httpEtag: '"x"' }; },
    async delete(keys) { for (const k of [].concat(keys)) m.delete(k); },
    async list({ prefix }) { return { objects: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false }; },
  };
}
// Supabase says yes only for the token "staff" and only inside BIZ's folder
globalThis.fetch = async (_u, init) => {
  const tok = init.headers.Authorization.replace("Bearer ", "");
  const { p_paths } = JSON.parse(init.body);
  return new Response(JSON.stringify(tok === "staff" && p_paths.every((p) => p.startsWith(BIZ + "/"))), { status: 200 });
};
const env = () => ({ BIZKENIA_FILES: fakeR2(), SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon", FILES_ADMIN_SECRET: "s3cret", ALLOWED_ORIGINS: "http://localhost:5173" });
const call = (e, method, path, { body, headers } = {}) =>
  worker.fetch(new Request("https://site.test" + path, { method, body, headers }), e, { waitUntil() {} });
const put = (e, path, body, tok = "staff") => call(e, "PUT", path, { body, headers: tok ? { Authorization: `Bearer ${tok}` } : {} });

test("staff can upload, public can read, nosniff set", async () => {
  const e = env(); const p = `/api/files/business-media/${BIZ}/cover/a1.jpg`;
  assert.equal((await put(e, p, JPG)).status, 201);
  const r = await call(e, "GET", p);
  assert.equal(r.status, 200); assert.equal(r.headers.get("content-type"), "image/jpeg");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
});
test("no token -> 401, wrong user -> 403, other business folder -> 403", async () => {
  const e = env(); const p = `/api/files/business-media/${BIZ}/cover/a1.jpg`;
  assert.equal((await put(e, p, JPG, null)).status, 401);
  assert.equal((await put(e, p, JPG, "stranger")).status, 403);
  assert.equal((await put(e, `/api/files/business-media/${OTHER}/cover/a1.jpg`, JPG)).status, 403);
  assert.equal(e.BIZKENIA_FILES.m.size, 0);
});
test("html renamed to .jpg is refused; extension must match real type", async () => {
  const e = env();
  assert.equal((await put(e, `/api/files/business-media/${BIZ}/cover/a.jpg`, HTML)).status, 415);
  assert.equal((await put(e, `/api/files/business-media/${BIZ}/cover/a.png`, JPG)).status, 415);
});
test("too big, existing name, traversal, unknown bucket, svg name", async () => {
  const e = env(); const big = new Uint8Array(2 * 1024 * 1024 + 1); big.set(JPG);
  assert.equal((await put(e, `/api/files/avatars/${BIZ}/a.jpg`, big)).status, 413);
  await put(e, `/api/files/business-media/${BIZ}/cover/a.jpg`, JPG);
  assert.equal((await put(e, `/api/files/business-media/${BIZ}/cover/a.jpg`, JPG)).status, 409);
  assert.equal((await put(e, `/api/files/business-media/${BIZ}/../${OTHER}/a.jpg`, JPG)).status, 400);
  assert.equal((await put(e, `/api/files/secrets/${BIZ}/a.jpg`, JPG)).status, 400);
  assert.equal((await put(e, `/api/files/business-media/${BIZ}/cover/a.svg`, JPG)).status, 400);
});
test("remove needs permission", async () => {
  const e = env(); const path = `${BIZ}/cover/a.jpg`;
  await put(e, `/api/files/business-media/${path}`, JPG);
  const rm = (tok) => call(e, "POST", "/api/files/remove", { body: JSON.stringify({ bucket: "business-media", paths: [path] }), headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
  assert.equal((await rm("stranger")).status, 403); assert.equal(e.BIZKENIA_FILES.m.size, 1);
  assert.equal((await rm("staff")).status, 200); assert.equal(e.BIZKENIA_FILES.m.size, 0);
});
test("admin routes need the secret; remove-folder empties a folder", async () => {
  const e = env(); const p = `/api/files/admin/business-media/${BIZ}/logo/z.jpg`;
  assert.equal((await put(e, p, JPG, "staff")).status, 403);
  assert.equal((await call(e, "PUT", p, { body: JPG, headers: { "X-Admin-Secret": "s3cret" } })).status, 201);
  const rf = (s) => call(e, "POST", "/api/files/admin/remove-folder", { body: JSON.stringify({ bucket: "business-media", folder: BIZ }), headers: { "X-Admin-Secret": s } });
  assert.equal((await rf("wrong")).status, 403);
  assert.equal((await rf("s3cret")).status, 200); assert.equal(e.BIZKENIA_FILES.m.size, 0);
});
test("CORS only for the site and listed origins", async () => {
  const e = env();
  const ok = await call(e, "OPTIONS", "/api/files/remove", { headers: { Origin: "http://localhost:5173" } });
  assert.equal(ok.headers.get("access-control-allow-origin"), "http://localhost:5173");
  const bad = await call(e, "OPTIONS", "/api/files/remove", { headers: { Origin: "https://evil.test" } });
  assert.equal(bad.headers.get("access-control-allow-origin"), null);
});
