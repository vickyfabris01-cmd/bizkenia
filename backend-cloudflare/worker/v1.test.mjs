// Run: node --test worker/v1.test.mjs   (no install needed; Supabase and Safaricom are faked in memory)
import test from "node:test";
import assert from "node:assert/strict";
import entry from "./entry.js";
import { resetLimits } from "./v1/http.js";
import { reconcile } from "./v1/mpesa.js";
import { purgeClosedBusinesses } from "./v1/lifecycle.js";

const U1 = "11111111-1111-4111-8111-111111111111", U2 = "22222222-2222-4222-8222-222222222222";
const BIZ = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", ORD = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", PLAN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SITE = "https://site.test";

// ---------- an in-memory Supabase (PostgREST + Auth) and Safaricom ----------
function world(seed = {}) {
  const w = {
    tables: {
      platform_settings: [{ key: "maintenance", value: { payments: false, businesses: [] } }, { key: "mpesa", value: { env: "sandbox" } }],
      profiles: [{ id: U1, is_active: true, role: "owner" }, { id: U2, is_active: true, role: "super_admin" }],
      payment_intents: [], business_members: [], businesses: [], subscription_plans: [], orders: [], billing_cycles: [], tenant_settings: [], tenant_secrets: [], notifications: [],
      ...seed.tables,
    },
    users: { "tok-user": { id: U1, email: "u1@x.test" }, "tok-admin": { id: U2, email: "boss@x.test" } },
    passwords: { "u1@x.test": "right-pass" },
    rpcs: { plan_is_available: () => true, mark_intent_paid: () => null, ...seed.rpcs },
    calls: [], daraja: [], inserted: [], patched: [], r2: new Map(), authDeleted: [], storageRemoved: [],
    stkAnswer: { ResponseCode: "0", CheckoutRequestID: "ws_CO_1", MerchantRequestID: "mr1" },
    queryAnswer: { ResultCode: "0", ResultDesc: "ok" },
    ...seed.extra,
  };
  const match = (row, params) => {
    for (const [k, v] of params) {
      if (["select", "order", "limit", "offset", "or", "and"].includes(k)) continue;
      const [op, ...rest] = v.split("."); const val = rest.join(".");
      const cell = row[k];
      if (op === "eq" && String(cell) !== val) return false;
      if (op === "gte" && !(String(cell) >= val)) return false;
      if (op === "lt" && !(String(cell) < val)) return false;
      if (op === "not" && val === "is.null" && (cell === null || cell === undefined)) return false;
    }
    return true;
  };
  globalThis.fetch = async (input, init = {}) => {
    const u = new URL(typeof input === "string" ? input : input.url); const method = init.method || "GET";
    w.calls.push(`${method} ${u.host}${u.pathname}`);
    const send = (body, status = 200, headers = {}) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
    if (u.host === "sandbox.safaricom.co.ke" || u.host === "api.safaricom.co.ke") {
      w.daraja.push({ path: u.pathname, body: init.body ? JSON.parse(init.body) : null });
      if (u.pathname.startsWith("/oauth")) return send({ access_token: "daraja-token" });
      if (u.pathname.includes("stkpushquery")) return send(w.queryAnswer);
      return send(w.stkAnswer);
    }
    if (u.host === "api.resend.com") return send({ id: "m1" });
    if (u.host !== "x.supabase.co") return send({}, 404);
    const p = u.pathname;
    if (p === "/auth/v1/user") { const user = w.users[(init.headers.Authorization || "").replace("Bearer ", "")]; return user ? send(user) : send({ msg: "bad jwt" }, 401); }
    if (p === "/auth/v1/token") {
      const { email, password } = JSON.parse(init.body);
      return w.passwords[email] === password ? send({ access_token: "A", refresh_token: "R" }) : send({ error_description: "Invalid login" }, 400);
    }
    if (p === "/auth/v1/logout") return send(undefined, 204);
    if (p.startsWith("/auth/v1/admin/users/")) { w.authDeleted.push(p.split("/").pop()); return send({}); }
    if (p.startsWith("/storage/v1/object/")) { w.storageRemoved.push(JSON.parse(init.body).prefixes); return send([]); }
    if (p.startsWith("/rest/v1/rpc/")) {
      const name = p.split("/").pop(); const args = init.body ? JSON.parse(init.body) : {};
      w.calls.push(`rpc:${name}`);
      const h = w.rpcs[name]; if (!h) return send({ message: "no such function" }, 404);
      const out = h(args, w); if (out instanceof Error) return send({ message: out.message }, 400);
      return send(out === undefined ? null : out);
    }
    if (p.startsWith("/rest/v1/")) {
      const table = p.split("/").pop(); const rows = w.tables[table] || (w.tables[table] = []);
      if (method === "POST") { const arr = [].concat(JSON.parse(init.body)); const made = arr.map((r, i) => ({ id: r.id || `new-${rows.length + i}`, ...r })); rows.push(...made); w.inserted.push({ table, rows: made }); return send(made, 201); }
      if (method === "PATCH") { const patch = JSON.parse(init.body); const hit = rows.filter((r) => match(r, u.searchParams)); hit.forEach((r) => Object.assign(r, patch)); w.patched.push({ table, patch, n: hit.length }); return send(undefined, 204); }
      let out = rows.filter((r) => match(r, u.searchParams));
      const total = out.length; const lim = Number(u.searchParams.get("limit")); if (lim) out = out.slice(0, lim);
      return send(out, 200, { "content-range": `0-${Math.max(out.length - 1, 0)}/${total}` });
    }
    return send({}, 404);
  };
  return w;
}
const R2 = () => { const m = new Map(); return { m, async put(k, v) { m.set(k, v); return {}; }, async list({ prefix }) { return { objects: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false }; }, async delete(keys) { for (const k of [].concat(keys)) m.delete(k); } }; };
const baseEnv = (extra = {}) => ({
  SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service",
  MPESA_CONSUMER_KEY: "ck", MPESA_CONSUMER_SECRET: "cs", MPESA_PASSKEY: "pk", MPESA_CALLBACK_SECRET: "cb-secret-123", PUBLIC_BASE_URL: SITE,
  CRON_SECRET: "cron-secret", SITE_URL: SITE, ALLOWED_ORIGINS: "http://localhost:5173", BIZKENIA_FILES: R2(), ...extra,
});
const ctx = () => ({ waitUntil() {} });
const call = (env, method, path, { body, token, headers = {} } = {}) =>
  entry.fetch(new Request(SITE + path, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers } }), env, ctx());
const ok = async (res, status = 200) => { assert.equal(res.status, status, await res.clone().text()); return res.json(); };
test.beforeEach(() => { resetLimits(); delete globalThis.caches; });

// ---------- foundation ----------
test("health is public and tiny; with the cron secret it lists which settings are filled", async () => {
  world();
  const a = await ok(await call(baseEnv(), "GET", "/api/v1/health"));
  assert.deepEqual(a, { ok: true, service: "bizkenia-api", version: 1 });
  const b = await ok(await call(baseEnv({ MPESA_PASSKEY: "PASTE_DARAJA_PASSKEY_HERE", PUBLIC_BASE_URL: "https://YOUR-LIVE-SITE-ADDRESS" }), "GET", "/api/v1/health", { headers: { "X-Cron-Secret": "cron-secret" } }));
  assert.equal(b.settings.required.SUPABASE_SERVICE_ROLE_KEY, true);
  assert.equal(b.settings.mpesa.MPESA_PASSKEY, false, "a placeholder counts as empty");
  assert.equal(b.settings.mpesa.PUBLIC_BASE_URL, false);
  assert.ok(Object.values(b.settings).every((g) => typeof g === "boolean" || Object.values(g).every((v) => typeof v === "boolean")), "only yes/no, never the values");
});
test("unknown routes and wrong methods get the one error shape", async () => {
  world();
  assert.deepEqual(await ok(await call(baseEnv(), "GET", "/api/v1/nope"), 404), { error: "Not found." });
  assert.equal((await call(baseEnv(), "GET", "/api/v1/fn/mpesa-status")).status, 405);
  assert.equal((await call(baseEnv(), "POST", "/api/v1/fn/not-a-function")).status, 404);
});
test("CORS: only the site and the allowlist; preflight answers 204", async () => {
  world();
  const pre = await call(baseEnv(), "OPTIONS", "/api/v1/fn/mpesa-status", { headers: { Origin: "http://localhost:5173" } });
  assert.equal(pre.status, 204); assert.equal(pre.headers.get("access-control-allow-origin"), "http://localhost:5173");
  const evil = await call(baseEnv(), "OPTIONS", "/api/v1/fn/mpesa-status", { headers: { Origin: "https://evil.example" } });
  assert.equal(evil.headers.get("access-control-allow-origin"), null);
});
test("the old file routes still reach the old Worker through the new entry", async () => {
  world();
  const res = await call(baseEnv(), "GET", "/api/files/business-media/x");
  assert.equal(res.status, 404); assert.deepEqual(await res.json(), { error: "Not found." });
});

// ---------- M-Pesa callback ----------
const cb = (code, amount, id = "ws_CO_1", desc = "done") => ({ Body: { stkCallback: { CheckoutRequestID: id, ResultCode: code, ResultDesc: desc, CallbackMetadata: code === 0 ? { Item: [{ Name: "Amount", Value: amount }, { Name: "MpesaReceiptNumber", Value: "RCP123" }] } : undefined } } });
const pending = (extra = {}) => ({ id: "i1", status: "pending", amount_kes: 1500, checkout_request_id: "ws_CO_1", method: "mpesa_stk", purpose: "subscription", created_at: new Date(Date.now() - 10 * 60_000).toISOString(), ...extra });
test("callback: no or wrong secret -> 403 and nothing changes", async () => {
  const w = world({ tables: { payment_intents: [pending()] } });
  assert.equal((await call(baseEnv(), "POST", "/api/v1/mpesa/callback", { body: cb(0, 1500) })).status, 403);
  assert.equal((await call(baseEnv(), "POST", "/api/v1/mpesa/callback?secret=nope", { body: cb(0, 1500) })).status, 403);
  assert.equal((await call(baseEnv({ MPESA_CALLBACK_SECRET: "" }), "POST", "/api/v1/mpesa/callback?secret=", { body: cb(0, 1500) })).status, 403, "no secret configured = refuse everything");
  assert.equal(w.patched.length, 0);
});
test("callback: a matching payment is marked paid with its receipt", async () => {
  let paid;
  const w = world({ tables: { payment_intents: [pending()] }, rpcs: { mark_intent_paid: (a) => { paid = a; } } });
  const r = await ok(await call(baseEnv(), "POST", "/api/v1/mpesa/callback?secret=cb-secret-123", { body: cb(0, 1500) }));
  assert.equal(r.ResultCode, 0); assert.deepEqual(paid, { p_intent: "i1", p_receipt: "RCP123" });
});
test("callback: a different amount is NOT marked paid", async () => {
  let called = false;
  const w = world({ tables: { payment_intents: [pending()] }, rpcs: { mark_intent_paid: () => { called = true; } } });
  await ok(await call(baseEnv(), "POST", "/api/v1/mpesa/callback?secret=cb-secret-123", { body: cb(0, 1) }));
  assert.equal(called, false); assert.equal(w.tables.payment_intents[0].status, "failed"); assert.match(w.tables.payment_intents[0].result_desc, /Amount mismatch/);
});
test("callback: twice is harmless, unknown id is ignored, 1032 is cancelled, other codes failed", async () => {
  let n = 0;
  const w = world({ tables: { payment_intents: [pending(), pending({ id: "i2", checkout_request_id: "ws2" }), pending({ id: "i3", checkout_request_id: "ws3", status: "success" })] }, rpcs: { mark_intent_paid: () => { n++; } } });
  await call(baseEnv(), "POST", "/api/v1/mpesa/callback?secret=cb-secret-123", { body: cb(1032, 0, "ws2", "cancelled") });
  assert.equal(w.tables.payment_intents[1].status, "cancelled");
  await call(baseEnv(), "POST", "/api/v1/mpesa/callback?secret=cb-secret-123", { body: cb(0, 1500, "ws3") });
  await call(baseEnv(), "POST", "/api/v1/mpesa/callback?secret=cb-secret-123", { body: cb(0, 1500, "ghost") });
  assert.equal(n, 0);
  await call(baseEnv(), "POST", "/api/v1/mpesa/callback?secret=cb-secret-123", { body: cb(2001, 0, "ws_CO_1", "wrong pin") });
  assert.equal(w.tables.payment_intents[0].status, "failed");
  const junk = await call(baseEnv(), "POST", "/api/v1/mpesa/callback?secret=cb-secret-123", { body: { hello: 1 } });
  assert.equal(junk.status, 200);
});

// ---------- STK push ----------
const orderWorld = (extra = {}) => world({ tables: {
  orders: [{ id: ORD, business_id: BIZ, customer_id: U1, status: "pending_payment", payment_status: "unpaid", payment_method: "mpesa", total: "799.50", order_number: "ORD-1" }],
  businesses: [{ id: BIZ, name: "Mama Shop", status: "active", business_type: "shop" }],
  tenant_settings: [{ tenant_id: BIZ, mpesa_shortcode: "600111" }], tenant_secrets: [{ tenant_id: BIZ, mpesa_passkey: "shop-passkey" }], ...extra.tables } });
const stk = (env, body, token = "tok-user") => call(env, "POST", "/api/v1/fn/mpesa-stk-push", { body, token });
const ORDER = { purpose: "order", orderId: ORD, phone: "254712345678" };

test("stk-push: needs sign-in, a valid phone and a known purpose", async () => {
  orderWorld();
  assert.equal((await stk(baseEnv(), ORDER, "")).status, 401);
  assert.equal((await stk(baseEnv(), ORDER, "tok-bad")).status, 401);
  assert.equal((await stk(baseEnv(), { ...ORDER, phone: "0712" })).status, 400);
  assert.equal((await stk(baseEnv(), { ...ORDER, purpose: "gift" })).status, 400);
});
test("stk-push: maintenance level 4 refuses every prompt; nothing is created or charged", async () => {
  const w = orderWorld(); w.tables.platform_settings[0].value = { payments: true };
  const r = await ok(await stk(baseEnv(), ORDER), 503);
  assert.equal(r.code, "MAINTENANCE_PAYMENTS"); assert.equal(w.tables.payment_intents.length, 0); assert.equal(w.daraja.length, 0);
});
test("stk-push: maintenance level 5 refuses a SUBSCRIPTION for a listed business only", async () => {
  const w = orderWorld(); w.tables.platform_settings[0].value = { payments: false, businesses: [BIZ.toUpperCase()] };
  const sub = await ok(await stk(baseEnv(), { purpose: "subscription", businessId: BIZ, planId: PLAN, phone: "254712345678" }), 503);
  assert.equal(sub.code, "MAINTENANCE_BUSINESS");
  const order = await ok(await stk(baseEnv(), ORDER)); assert.equal(order.status, "pending", "an order payment is not a subscription");
});
test("stk-push: FAILS CLOSED when the maintenance setting cannot be read", async () => {
  const w = orderWorld(); w.tables.platform_settings = w.tables.platform_settings.filter((r) => r.key !== "maintenance");
  const r = await ok(await stk(baseEnv(), ORDER), 503); assert.equal(r.code, "MAINTENANCE_UNKNOWN"); assert.equal(w.tables.payment_intents.length, 0);
});
test("stk-push: a paid order creates one intent with the DATABASE amount and the shop's own shortcode", async () => {
  const w = orderWorld();
  const r = await ok(await stk(baseEnv(), { ...ORDER, amount: 1 }));
  assert.equal(r.status, "pending");
  const i = w.tables.payment_intents[0];
  assert.equal(i.amount_kes, 800, "799.50 rounds UP and ignores any amount the browser sent"); assert.equal(i.checkout_request_id, "ws_CO_1");
  const push = w.daraja.find((d) => d.path.includes("processrequest")).body;
  assert.equal(push.BusinessShortCode, "600111"); assert.equal(push.Amount, 800); assert.equal(push.PhoneNumber, "254712345678");
  assert.equal(push.CallBackURL, `${SITE}/api/v1/mpesa/callback?secret=cb-secret-123`);
  assert.equal(push.Password, btoa(`600111shop-passkey${push.Timestamp}`));
});
test("stk-push: somebody else's order is not found; unpaid-on-delivery is refused", async () => {
  const w = orderWorld(); w.tables.orders[0].customer_id = "someone-else";
  assert.equal((await stk(baseEnv(), ORDER)).status, 404);
  w.tables.orders[0].customer_id = U1; w.tables.orders[0].payment_method = "cash";
  assert.equal((await stk(baseEnv(), ORDER)).status, 400);
});
test("stk-push: live mode with a shop that has no M-Pesa set up is refused", async () => {
  const w = orderWorld(); w.tables.tenant_settings = []; w.tables.platform_settings[1].value = { env: "live" };
  const r = await ok(await stk(baseEnv(), ORDER), 400); assert.equal(r.code, "BUSINESS_NOT_CONFIGURED");
});
test("stk-push: no Daraja credentials -> NOT_CONFIGURED and no intent is created", async () => {
  const w = orderWorld();
  const r = await ok(await stk(baseEnv({ MPESA_CONSUMER_KEY: "" }), ORDER), 400); assert.equal(r.code, "NOT_CONFIGURED"); assert.equal(w.tables.payment_intents.length, 0);
  const r2 = await ok(await stk(baseEnv({ MPESA_CALLBACK_SECRET: "" }), ORDER), 400); assert.equal(r2.code, "NOT_CONFIGURED");
  const r3 = await ok(await stk(baseEnv({ PUBLIC_BASE_URL: "" }), ORDER), 400); assert.equal(r3.code, "NOT_CONFIGURED");
});
test("stk-push: a switched-off account and a flood of prompts are refused", async () => {
  const w = orderWorld(); w.tables.profiles[0].is_active = false;
  assert.equal((await stk(baseEnv(), ORDER)).status, 403);
  w.tables.profiles[0].is_active = true;
  w.tables.payment_intents = [1, 2, 3].map((n) => ({ id: `r${n}`, user_id: U1, created_at: new Date().toISOString(), status: "pending" }));
  assert.equal((await stk(baseEnv(), ORDER)).status, 429);
});
test("stk-push: Safaricom refusing marks the intent failed and answers 502", async () => {
  const w = orderWorld(); w.stkAnswer = { ResponseCode: "1", errorMessage: "Bad shortcode" };
  const r = await ok(await stk(baseEnv(), ORDER), 502); assert.equal(r.error, "Bad shortcode");
  assert.equal(w.tables.payment_intents[0].status, "failed");
});
test("stk-push: only the owner can pay a subscription, and only for a plan of the right type that is on sale", async () => {
  const w = orderWorld({ tables: { business_members: [{ business_id: BIZ, user_id: U1, status: "active", role: "manager" }], subscription_plans: [{ id: PLAN, name: "Shop monthly", price_kes: 1500, business_type: "shop" }] } });
  w.tables.businesses[0].status = "pending_payment";
  const body = { purpose: "subscription", businessId: BIZ, planId: PLAN, phone: "254712345678" };
  assert.equal((await stk(baseEnv(), body)).status, 403, "a manager cannot pay");
  w.tables.business_members[0].role = "owner";
  w.rpcs.plan_is_available = () => false;
  assert.equal((await stk(baseEnv(), body)).status, 400, "not on sale");
  w.rpcs.plan_is_available = () => true;
  await ok(await stk(baseEnv(), body)); assert.equal(w.tables.payment_intents[0].amount_kes, 1500);
});

// ---------- status ----------
test("status: the owner of the payment and a super admin may read it; others may not; user_id is never returned", async () => {
  world({ tables: { payment_intents: [{ id: "i9", user_id: U1, status: "pending", amount_kes: 100 }] } });
  const mine = await ok(await call(baseEnv(), "POST", "/api/v1/fn/mpesa-status", { token: "tok-user", body: { intentId: "i9" } }));
  assert.equal(mine.intent.id, "i9"); assert.equal("user_id" in mine.intent, false);
  assert.equal((await call(baseEnv(), "POST", "/api/v1/fn/mpesa-status", { token: "tok-admin", body: { intentId: "i9" } })).status, 200);
  const w = world({ tables: { payment_intents: [{ id: "i9", user_id: "someone-else", status: "pending" }] } });
  assert.equal((await call(baseEnv(), "POST", "/api/v1/fn/mpesa-status", { token: "tok-user", body: { intentId: "i9" } })).status, 403);
  assert.equal((await call(baseEnv(), "POST", "/api/v1/fn/mpesa-status", { token: "", body: { intentId: "i9" } })).status, 401);
  assert.equal((await call(baseEnv(), "POST", "/api/v1/fn/mpesa-status", { token: "tok-user", body: { intentId: "zzz" } })).status, 404);
});

// ---------- reconcile ----------
test("reconcile: an idle site costs one read and NO calls to Safaricom", async () => {
  const w = world();
  const r = await reconcile(baseEnv());
  assert.equal(r.checked, 0); assert.equal(w.daraja.length, 0);
});
test("reconcile: pending prompts 3-60 minutes old are asked about; success is marked paid, cancel is cancelled, young ones left alone", async () => {
  const paid = [];
  const mk = (id, mins, extra = {}) => pending({ id, checkout_request_id: `ws-${id}`, created_at: new Date(Date.now() - mins * 60_000).toISOString(), ...extra });
  const w = world({ tables: { payment_intents: [mk("a", 10), mk("b", 20), mk("young", 1)] }, rpcs: { mark_intent_paid: (a) => { paid.push(a.p_intent); } } });
  let n = 0; w.queryAnswer = null;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (u, init) => { if (String(u).includes("stkpushquery")) { w.daraja.push({ path: "q" }); return new Response(JSON.stringify(n++ === 0 ? { ResultCode: "0", ResultDesc: "ok" } : { ResultCode: "1032", ResultDesc: "cancelled" })); } return origFetch(u, init); };
  const r = await reconcile(baseEnv());
  assert.equal(r.checked, 2); assert.equal(r.paid, 1); assert.equal(r.failed, 1);
  assert.deepEqual(paid, ["a"]); assert.equal(w.tables.payment_intents[1].status, "cancelled"); assert.equal(w.tables.payment_intents[2].status, "pending");
  assert.equal(w.daraja.filter((d) => d.path.startsWith("/oauth")).length, 1, "one token for the whole run");
});
test("reconcile: 'still being processed' is retried next run; very old prompts become timeout; batch is capped; switch-off works", async () => {
  const mk = (id, mins) => pending({ id, checkout_request_id: `ws-${id}`, created_at: new Date(Date.now() - mins * 60_000).toISOString() });
  const w = world({ tables: { payment_intents: [mk("old", 90), ...Array.from({ length: 12 }, (_, i) => mk(`p${i}`, 10 + i))] } });
  w.queryAnswer = { errorCode: "500.001.1001", errorMessage: "The transaction is being processed" };
  const r = await reconcile(baseEnv({ RECONCILE_BATCH: "4" }));
  assert.equal(r.checked, 4); assert.equal(r.waiting, 4);
  assert.equal(w.tables.payment_intents[0].status, "timeout");
  assert.equal(w.tables.payment_intents.filter((i) => i.status === "pending").length, 12, "nothing was changed for the waiting ones");
  assert.deepEqual(await reconcile(baseEnv({ RECONCILE_ENABLED: "false" })), { skipped: "disabled" });
});
test("reconcile: by hand through /cron/reconcile needs the cron secret; the timer entry runs it", async () => {
  world();
  assert.equal((await call(baseEnv(), "POST", "/api/v1/cron/reconcile")).status, 401);
  assert.equal((await call(baseEnv(), "POST", "/api/v1/cron/reconcile", { headers: { "X-Cron-Secret": "wrong" } })).status, 401);
  assert.equal((await call(baseEnv({ CRON_SECRET: "" }), "POST", "/api/v1/cron/reconcile", { headers: { "X-Cron-Secret": "" } })).status, 401);
  const r = await ok(await call(baseEnv(), "POST", "/api/v1/cron/reconcile", { headers: { "X-Cron-Secret": "cron-secret" } })); assert.equal(r.checked, 0);
  const logs = []; const orig = console.log; console.log = (...a) => logs.push(a.join(" "));
  let p; await entry.scheduled({ cron: "*/10 * * * *" }, baseEnv(), { waitUntil(x) { p = x; } }); await p; console.log = orig;
  assert.ok(logs.some((l) => l.includes("[cron] reconcile")));
});

// ---------- public cached reads ----------
function fakeCache() { const m = new Map(); return { m, async match(req) { const h = m.get(req.url); return h && h.clone(); }, async put(req, res) { m.set(req.url, res); } }; }
test("public: businesses are read as the anonymous visitor, count comes from the database, inputs are limited", async () => {
  const w = world({ tables: { businesses: Array.from({ length: 5 }, (_, i) => ({ id: `b${i}`, status: "active", business_type: "shop", name: `S${i}` })) } });
  const r = await ok(await call(baseEnv(), "GET", "/api/v1/public/businesses?type=shop&limit=2&search=" + encodeURIComponent("a%,b(")));
  assert.equal(r.count, 5); assert.equal(r.data.length, 2); assert.equal(r.error, null);
  assert.equal((await call(baseEnv(), "GET", "/api/v1/public/businesses?type=hacker")).status, 400);
  assert.equal((await call(baseEnv(), "GET", "/api/v1/public/market?kind=weapons")).status, 400);
  assert.equal((await call(baseEnv(), "POST", "/api/v1/public/businesses")).status, 405);
  assert.equal((await call(baseEnv(), "GET", "/api/v1/public/orders")).status, 404, "nothing user-specific is reachable here");
});
test("public: the second identical request is served from the edge cache with ZERO database calls; failures are never kept", async () => {
  globalThis.caches = { default: fakeCache() };
  const w = world({ tables: { businesses: [{ id: "b1", status: "active" }] } });
  await ok(await call(baseEnv(), "GET", "/api/v1/public/businesses?limit=5&type=shop&junk=1"));
  const before = w.calls.length;
  const again = await call(baseEnv(), "GET", "/api/v1/public/businesses?type=shop&limit=5&other=2"); // different order and junk: same key
  assert.equal(again.status, 200); assert.equal(w.calls.length, before);
  assert.match(again.headers.get("cache-control"), /max-age=60/);
  w.rpcs.home_listings = () => new Error("boom");
  const bad = await call(baseEnv(), "GET", "/api/v1/public/home"); assert.equal(bad.status, 502); assert.equal(bad.headers.get("cache-control"), "no-store");
  w.rpcs.home_listings = () => ({ shop: [1], farm: [], rooms: [] });
  const good = await ok(await call(baseEnv(), "GET", "/api/v1/public/home")); assert.deepEqual(good.data.shop, [1]);
});

// ---------- sign-in by phone ----------
test("resolve-login: same answer for wrong phone and wrong password; email never returned; slowed after 8 tries", async () => {
  const w = world({ rpcs: { login_email_for_phone: (a) => (a.p_phone === "254712345678" ? "u1@x.test" : null) } });
  const good = await ok(await call(baseEnv(), "POST", "/api/v1/fn/resolve-login", { body: { phone: "254712345678", password: "right-pass" } }));
  assert.deepEqual(good, { session: { access_token: "A", refresh_token: "R" } });
  const badPass = await ok(await call(baseEnv(), "POST", "/api/v1/fn/resolve-login", { body: { phone: "254712345678", password: "nope" } }), 401);
  const noPhone = await ok(await call(baseEnv(), "POST", "/api/v1/fn/resolve-login", { body: { phone: "254799999999", password: "x" } }), 401);
  assert.deepEqual(badPass, noPhone); assert.ok(!JSON.stringify(badPass).includes("u1@x.test"));
  for (let i = 0; i < 5; i++) await call(baseEnv(), "POST", "/api/v1/fn/resolve-login", { body: { phone: "254712345678", password: "x" } });
  assert.equal((await call(baseEnv(), "POST", "/api/v1/fn/resolve-login", { body: { phone: "254712345678", password: "right-pass" } })).status, 429);
});

// ---------- e-mail ----------
test("send-email: others' addresses are for super admins only; with no key it logs and succeeds", async () => {
  world();
  const body = { to: "someone@x.test", subject: "Hi", text: "Hello" };
  assert.equal((await call(baseEnv(), "POST", "/api/v1/fn/send-email", { token: "tok-user", body })).status, 403);
  assert.equal((await call(baseEnv(), "POST", "/api/v1/fn/send-email", { token: "tok-user", body: { ...body, to: "U1@x.test" } })).status, 200);
  const logs = []; const orig = console.log; console.log = (...a) => logs.push(a.join(" "));
  const r = await ok(await call(baseEnv(), "POST", "/api/v1/fn/send-email", { token: "tok-admin", body })); console.log = orig;
  assert.deepEqual(r, { ok: true, sent: false }); assert.ok(logs.some((l) => l.includes("logged only")));
  const sent = await ok(await call(baseEnv({ RESEND_API_KEY: "re_x" }), "POST", "/api/v1/fn/send-email", { token: "tok-admin", body })); assert.equal(sent.sent, true);
  assert.equal((await call(baseEnv(), "POST", "/api/v1/fn/send-email", { token: "", body })).status, 401);
});

// ---------- deletes and purge ----------
test("delete-business: needs the password, a real id, and cleans R2 + Supabase copies when the business is removed at once", async () => {
  const env = baseEnv(); env.BIZKENIA_FILES.m.set(`business-media/${BIZ}/logo/a.jpg`, 1); env.BIZKENIA_FILES.m.set(`business-media/${U2}/logo/keep.jpg`, 1);
  const w = world({ rpcs: { storage_paths_for: () => [`${BIZ}/old.jpg`], owner_close_business: () => "deleted" } });
  assert.equal((await call(env, "POST", "/api/v1/fn/delete-business", { token: "tok-user", body: { businessId: "not-a-uuid", password: "right-pass" } })).status, 400);
  assert.equal((await call(env, "POST", "/api/v1/fn/delete-business", { token: "tok-user", body: { businessId: BIZ, password: "wrong" } })).status, 403);
  assert.equal(w.calls.includes("rpc:owner_close_business"), false, "nothing is closed with a wrong password");
  assert.equal((await call(env, "POST", "/api/v1/fn/delete-business", { token: "", body: { businessId: BIZ, password: "right-pass" } })).status, 401);
  const r = await ok(await call(env, "POST", "/api/v1/fn/delete-business", { token: "tok-user", body: { businessId: BIZ, password: "right-pass" } }));
  assert.equal(r.result, "deleted");
  assert.deepEqual([...env.BIZKENIA_FILES.m.keys()], [`business-media/${U2}/logo/keep.jpg`], "only this business's folder went");
  assert.deepEqual(w.storageRemoved, [[`${BIZ}/old.jpg`]]);
});
test("delete-business: 'closed' keeps the files for the 60-day restore window; the database's refusal is passed on", async () => {
  const env = baseEnv(); env.BIZKENIA_FILES.m.set(`business-media/${BIZ}/logo/a.jpg`, 1);
  const w = world({ rpcs: { storage_paths_for: () => [], owner_close_business: () => "closed" } });
  assert.equal((await ok(await call(env, "POST", "/api/v1/fn/delete-business", { token: "tok-user", body: { businessId: BIZ, password: "right-pass" } }))).result, "closed");
  assert.equal(env.BIZKENIA_FILES.m.size, 1);
  w.rpcs.owner_close_business = () => new Error("This business has an unfinished order.");
  const r = await ok(await call(env, "POST", "/api/v1/fn/delete-business", { token: "tok-user", body: { businessId: BIZ, password: "right-pass" } }), 400);
  assert.match(r.error, /unfinished order/);
});
test("delete-account: password first, database rules next, then the login, then the pictures", async () => {
  const env = baseEnv(); env.BIZKENIA_FILES.m.set(`avatars/${U1}/me.jpg`, 1);
  const w = world({ rpcs: { account_delete_prepare: () => ({ purge: [BIZ] }), storage_paths_for: () => [], purge_business: () => null, account_delete_cleanup: () => null } });
  assert.equal((await call(env, "POST", "/api/v1/fn/delete-account", { token: "tok-user", body: { password: "wrong" } })).status, 403);
  assert.equal(w.authDeleted.length, 0);
  const r = await ok(await call(env, "POST", "/api/v1/fn/delete-account", { token: "tok-user", body: { password: "right-pass" } }));
  assert.deepEqual(r, { ok: true }); assert.deepEqual(w.authDeleted, [U1]); assert.equal(env.BIZKENIA_FILES.m.size, 0);
  w.rpcs.account_delete_prepare = () => new Error("You still own a business.");
  const refused = await ok(await call(env, "POST", "/api/v1/fn/delete-account", { token: "tok-user", body: { password: "right-pass" } }), 400);
  assert.match(refused.error, /still own/); assert.equal(w.authDeleted.length, 1, "refused before deleting anything");
});
test("purge: reminds owners at day 50 and purges at most PURGE_BATCH businesses, leaving the rest for tomorrow", async () => {
  const due = Array.from({ length: 12 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  const purged = [];
  const w = world({ tables: { businesses: [{ id: BIZ, name: "Old Shop", owner_user_id: U1, status: "closed", closed_by_admin: "false", closed_at: new Date(Date.now() - 50.5 * 86400000).toISOString() }] },
    rpcs: { businesses_due_for_purge: () => due, storage_paths_for: () => [], purge_business: (a) => { purged.push(a.p_business); return null; } } });
  const r = await purgeClosedBusinesses(baseEnv({ PURGE_BATCH: "5" }));
  assert.equal(purged.length, 5); assert.equal(r.leftover, 7); assert.equal(r.purged, 5);
  assert.equal(w.inserted.find((x) => x.table === "notifications").rows[0].user_id, U1);
});

// ---------- sitemap ----------
test("sitemap: XML with the site pages, escaped; refuses without SITE_URL", async () => {
  world({ tables: { businesses: [{ id: BIZ, slug: "mama&sons", business_type: "shop", status: "active", updated_at: "2026-10-01T00:00:00Z" }], products: [{ id: "p1", business_id: BIZ, status: "active", created_at: "2026-10-02T00:00:00Z" }] } });
  const res = await call(baseEnv(), "GET", "/sitemap.xml"); const xml = await res.text();
  assert.equal(res.headers.get("content-type"), "application/xml; charset=utf-8");
  assert.match(xml, /<loc>https:\/\/site\.test\/explore<\/loc>/); assert.match(xml, /mama&amp;sons\/p\/p1/);
  assert.equal((await call(baseEnv({ SITE_URL: "" }), "GET", "/sitemap.xml")).status, 500);
});
