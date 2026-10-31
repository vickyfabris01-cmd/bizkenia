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

// ---- Part 9: storage used per business (worker/storage.js) ------------------------------------------------
import entry from "./entry.js";
import { summarize, classify } from "./storage.js";
import { handleShare, parseShare } from "./share.js";

const KB = 1024;
const withFetch = async (fn, run) => { const keep = globalThis.fetch; globalThis.fetch = fn; try { return await run(); } finally { globalThis.fetch = keep; } };

test("storage: bytes are summed per business, the average is of the OTHER businesses, share cards count too", () => {
  const out = summarize([
    { key: `business-media/${BIZ}/cover/a.jpg`, size: 100 * KB },
    { key: `business-media/${BIZ}/logo/b.png`, size: 300 * KB },
    { key: `business-media/${OTHER}/cover/c.jpg`, size: 40 * KB },
    { key: "site-media/share/card1.jpg", size: 60 * KB },
    { key: "site-media/hero/h.jpg", size: 20 * KB },
    { key: `avatars/${BIZ}/me.jpg`, size: 10 * KB },
  ]);
  assert.deepEqual(out.totals, { bytes: 530 * KB, files: 6 });
  const a = out.businesses.find((b) => b.id === BIZ), b = out.businesses.find((x) => x.id === OTHER);
  assert.equal(a.bytes, 400 * KB); assert.equal(a.files, 2);
  assert.equal(b.bytes, 40 * KB); assert.equal(b.files, 1);
  assert.equal(a.averageOthers, 40 * KB);   // the other business uses 40 KB
  assert.equal(b.averageOthers, 400 * KB);
  assert.equal(out.businesses[0].id, BIZ);   // biggest first
  assert.ok(Math.abs(a.share - 400 / 530) < 1e-9);
  assert.equal(out.platform.bytes, 90 * KB);  // share cards 60 + hero 20 + avatars 10
  assert.equal(out.platform.parts.share, 60 * KB);
  assert.equal(a.bytes > 3 * a.averageOthers, true); // the UI flags this one (10x)
});
test("storage: one business has nothing to compare with; odd keys go to Platform", () => {
  const one = summarize([{ key: `business-media/${BIZ}/cover/a.jpg`, size: 5 }, { key: "business-media/not-a-uuid/x.jpg", size: 7 }]);
  assert.equal(one.businesses.length, 1); assert.equal(one.businesses[0].averageOthers, null);
  assert.equal(one.platform.bytes, 7);
  assert.deepEqual(classify(`business-media/${BIZ}`), { platform: "other" }); // a bare folder name is not a file
  assert.equal(summarize([]).businesses.length, 0);
});
test("storage route: needs a super admin; an admin gets the numbers", async () => {
  const objs = [{ key: `business-media/${BIZ}/cover/a.jpg`, size: 2048, uploaded: new Date() }, { key: `business-media/${OTHER}/cover/b.jpg`, size: 1024, uploaded: new Date() }];
  const e = { BIZKENIA_FILES: { async list() { return { objects: objs, truncated: false }; } }, SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon" };
  const ask = (tok) => entry.fetch(new Request("https://site.test/api/admin/storage?refresh=1", { headers: tok ? { Authorization: `Bearer ${tok}` } : {} }), e, { waitUntil() {} });
  await withFetch(async (_u, init) => new Response(JSON.stringify(init.headers.Authorization === "Bearer boss"), { status: 200 }), async () => {
    assert.equal((await ask(null)).status, 401);
    assert.equal((await ask("someone")).status, 403);
    const ok = await ask("boss");
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.totals.bytes, 3072); assert.equal(body.businesses[0].averageOthers, 1024); assert.equal(body.truncated, false);
  });
});

// ---- Part 9: link previews (worker/share.js) --------------------------------------------------------------
const PID = "33333333-3333-4333-8333-333333333333";
const share = (path, ua = "Mozilla/5.0 (iPhone)") => handleShare(new Request(`https://site.test${path}`, { headers: { "User-Agent": ua } }), { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon" });
const rowsFor = (rows) => async (u) => new Response(JSON.stringify(String(u).includes("/rpc/") ? null : rows), { status: 200 });

test("share: route parsing", () => {
  assert.deepEqual(parseShare("/share/page/explore"), { kind: "page", key: "explore", real: "/explore" });
  assert.equal(parseShare("/share/page/admin"), null);
  assert.deepEqual(parseShare("/share/b/my-shop"), { kind: "business", slug: "my-shop", real: "/b/my-shop" });
  assert.equal(parseShare(`/share/b/my-shop/p/${PID}`).kind, "p");
  assert.equal(parseShare(`/share/b/my-shop/produce/${PID}`).real, `/b/my-shop/produce/${PID}`);
  assert.equal(parseShare(`/share/b/my-shop/room/${PID}`).kind, "room");
  assert.equal(parseShare("/share/b/my-shop/p/not-a-uuid"), null);
  assert.equal(parseShare("/share/b/my%20shop"), null);
  assert.equal(parseShare("/share/b/my-shop/"), null);
});
test("share: people are redirected, utm_source and utm_medium are kept, other query parts dropped", async () => {
  const r = await share("/share/b/my-shop?utm_source=whatsapp&utm_medium=share&token=secret");
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), "https://site.test/b/my-shop?utm_source=whatsapp&utm_medium=share");
  assert.equal(r.headers.get("vary"), "User-Agent");
});
test("share: unknown path and non-GET fall back safely", async () => {
  const r = await share("/share/nothing/here", "WhatsApp/2.23");
  assert.equal(r.status, 302); assert.equal(r.headers.get("location"), "https://site.test/");
  const post = await handleShare(new Request("https://site.test/share/page/home", { method: "POST" }), {});
  assert.equal(post.status, 405);
});
test("share: a crawler gets a noindex page with escaped text; a missing business falls back to the redirect", async () => {
  const biz = [{ id: PID, name: "<script>alert(1)</script> & \"Co\"", business_type: "shop", description: "5 > 3 & 'quotes'", county: "Kisumu", address: null, logo_url: "", cover_url: "" }];
  await withFetch(rowsFor(biz), async () => {
    for (const ua of ["facebookexternalhit/1.1", "WhatsApp/2.23.20", "Twitterbot/1.0", "TelegramBot (like TwitterBot)"]) {
      const r = await share("/share/b/my-shop", ua);
      assert.equal(r.status, 200, ua);
      const html = await r.text();
      assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
      assert.ok(!html.includes("<script>alert(1)</script>"), "title must be escaped");
      assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Co&quot;"));
      assert.ok(html.includes("5 &gt; 3 &amp; &#39;quotes&#39;"));
      assert.ok(html.includes('og:image" content="https://site.test/icon-512.png"'));
    }
  });
  await withFetch(rowsFor([]), async () => {
    const r = await share("/share/b/gone", "facebookexternalhit/1.1");
    assert.equal(r.status, 302); assert.equal(r.headers.get("location"), "https://site.test/b/gone");
  });
  await withFetch(async () => { throw new Error("down"); }, async () => {
    const r = await share("/share/b/my-shop", "WhatsApp/2.23");
    assert.equal(r.status, 302);
  });
});

// ---- Part 9: /robots.txt and /sitemap.xml (worker/entry.js) -----------------------------------------------
const ROBOTS = "User-agent: *\nAllow: /\nDisallow: /admin/\n\n# The Worker adds the Sitemap line\n";
const assets = { async fetch() { return new Response(ROBOTS); } };
test("robots.txt: the Sitemap line follows the host that was asked", async () => {
  for (const host of ["https://one.example", "https://www.two.example"]) {
    const r = await entry.fetch(new Request(`${host}/robots.txt`), { ASSETS: assets }, { waitUntil() {} });
    assert.equal(r.status, 200); assert.match(r.headers.get("content-type"), /^text\/plain/);
    const t = await r.text();
    assert.ok(t.includes("Disallow: /admin/"));
    assert.equal(t.trimEnd().split("\n").pop(), `Sitemap: ${host}/sitemap.xml`);
    assert.equal(t.match(/^Sitemap:/gim).length, 1);
  }
});
test("robots.txt: an old Sitemap line in the file is replaced; no ASSETS binding still answers", async () => {
  const old = { async fetch() { return new Response(ROBOTS + "Sitemap: https://YOUR-DOMAIN/sitemap.xml\n"); } };
  const t = await (await entry.fetch(new Request("https://x.example/robots.txt"), { ASSETS: old }, { waitUntil() {} })).text();
  assert.ok(!t.includes("YOUR-DOMAIN")); assert.ok(t.endsWith("Sitemap: https://x.example/sitemap.xml\n"));
  const none = await entry.fetch(new Request("https://x.example/robots.txt"), {}, { waitUntil() {} });
  assert.equal(none.status, 200); assert.ok((await none.text()).includes("Sitemap: https://x.example/sitemap.xml"));
});
test("sitemap.xml: passed on from the Supabase function as XML; a failure is a 502, not the app page", async () => {
  const XML = '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>';
  let asked;
  await withFetch(async (u) => { asked = String(u); return new Response(XML, { status: 200 }); }, async () => {
    const r = await entry.fetch(new Request("https://x.example/sitemap.xml"), { SUPABASE_URL: "https://p.supabase.co" }, { waitUntil() {} });
    assert.equal(asked, "https://p.supabase.co/functions/v1/sitemap");
    assert.equal(r.status, 200); assert.match(r.headers.get("content-type"), /^application\/xml/); assert.equal(await r.text(), XML);
  });
  await withFetch(async () => new Response("SITE_URL is not set", { status: 500 }), async () => {
    assert.equal((await entry.fetch(new Request("https://x.example/sitemap.xml"), { SUPABASE_URL: "https://p.supabase.co" }, { waitUntil() {} })).status, 502);
  });
});
