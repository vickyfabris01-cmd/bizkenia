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
    rpcs: { plan_is_available: () => true, mark_intent_paid: () => null, log_client_error: () => null, login_throttle_begin: () => ({ allowed: true, attempt_id: "att-1" }), login_throttle_finish: () => null, ...seed.rpcs },
    calls: [], daraja: [], inserted: [], patched: [], r2: new Map(), authDeleted: [], storageRemoved: [],
    stkAnswer: { ResponseCode: "0", CheckoutRequestID: "ws_CO_1", MerchantRequestID: "mr1" },
    queryAnswer: { ResultCode: "0", ResultDesc: "ok" },
    ...seed.extra,
  };
  const cond = (row, k, v) => {
    const [op, ...rest] = v.split("."); const val = rest.join(".");
    const cell = row[k];
    if (op === "eq") return String(cell) === val;
    if (op === "gte") return String(cell) >= val;
    if (op === "gt") return cell !== null && cell !== undefined && String(cell) > val;
    if (op === "lt") return cell !== null && cell !== undefined && String(cell) < val;
    if (op === "is") return val === "null" ? (cell === null || cell === undefined) : true;
    if (op === "not") return val === "is.null" ? !(cell === null || cell === undefined) : true;
    return true;
  };
  const group = (row, text, mode) => { // "(a.op.v,b.op.v)"
    const parts = text.replace(/^\(|\)$/g, "").split(",").map((c) => { const i = c.indexOf("."); return cond(row, c.slice(0, i), c.slice(i + 1)); });
    return mode === "or" ? parts.some(Boolean) : parts.every(Boolean);
  };
  const match = (row, params) => {
    for (const [k, v] of params) {
      if (["select", "order", "limit", "offset"].includes(k)) continue;
      if (k === "or") { if (!group(row, v, "or")) return false; continue; }
      if (k === "and") { if (!group(row, v, "and")) return false; continue; }
      if (!cond(row, k, v)) return false;
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
    if (u.host === "api.resend.com") { if (w.resend === "down") throw new Error("offline"); return w.resend ? send(w.resend.body, w.resend.status) : send({ id: "m1" }); }
    if (u.host === "x.supabase.co" && u.pathname === "/functions/v1/sitemap") return new Response("<urlset>old</urlset>", { status: w.oldSitemapStatus || 200 });
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
      if (method === "PATCH") { const patch = JSON.parse(init.body); const hit = rows.filter((r) => match(r, u.searchParams)); hit.forEach((r) => Object.assign(r, patch)); w.patched.push({ table, patch, n: hit.length }); return (init.headers.Prefer || "").includes("representation") ? send(hit.map((r) => ({ ...r }))) : send(undefined, 204); }
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
  CRON_SECRET: "cron-secret", SITE_URL: SITE, SITEMAP_IN_WORKER: "true", ALLOWED_ORIGINS: "http://localhost:5173", BIZKENIA_FILES: R2(), ...extra,
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
  const b = await ok(await call(baseEnv({ MPESA_PASSKEY: "PASTE_DARAJA_PASSKEY_HERE" }), "GET", "/api/v1/health", { headers: { "X-Cron-Secret": "cron-secret" } }));
  assert.equal(b.settings.required.SUPABASE_SERVICE_ROLE_KEY, true);
  assert.equal(b.settings.mpesa.MPESA_PASSKEY, false, "a placeholder counts as empty");
  assert.ok(!("PUBLIC_BASE_URL" in b.settings.mpesa), "the public address is optional now");
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
  // no PUBLIC_BASE_URL: the address the browser used is the callback address, unless it is not a public https address
  const local = await entry.fetch(new Request("http://localhost:8787/api/v1/fn/mpesa-stk-push", { method: "POST", body: JSON.stringify(ORDER), headers: { Authorization: "Bearer tok-user" } }), baseEnv({ PUBLIC_BASE_URL: "" }), ctx());
  assert.equal((await local.json()).code, "NOT_CONFIGURED");
  await ok(await stk(baseEnv({ PUBLIC_BASE_URL: "" }), ORDER));
  assert.equal(w.daraja.find((d) => d.path.includes("processrequest")).body.CallBackURL, `${SITE}/api/v1/mpesa/callback?secret=cb-secret-123`);
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

// ---------- reconcile (same rules as the Edge Function mpesa-reconcile, Part 3) ----------
const mk = (id, mins, extra = {}) => pending({ id, checkout_request_id: `ws-${id}`, created_at: new Date(Date.now() - mins * 60_000).toISOString(), ...extra });
test("reconcile: an idle site costs one read, no claim and NO call to Safaricom", async () => {
  const w = world();
  const r = await reconcile(baseEnv());
  assert.equal(r.checked, 0); assert.equal(w.daraja.length, 0); assert.equal(w.patched.length, 0);
});
test("reconcile: only prompts 2 minutes to 24 hours old, not looked at in the last 90 seconds", async () => {
  const w = world({ tables: { payment_intents: [mk("young", 1), mk("old", 25 * 60), mk("recent", 10, { last_checked_at: new Date(Date.now() - 30_000).toISOString() }), mk("ok", 10, { last_checked_at: new Date(Date.now() - 200_000).toISOString() }), mk("nocheckout", 10, { checkout_request_id: null })] } });
  w.queryAnswer = { ResultCode: "4999" };
  const r = await reconcile(baseEnv());
  assert.equal(r.checked, 1); assert.equal(r.pending, 1);
  assert.equal(w.tables.payment_intents.find((i) => i.id === "ok").check_count, 1, "claimed: last_checked_at and check_count moved");
  assert.equal(w.tables.payment_intents.find((i) => i.id === "young").check_count, undefined);
});
test("reconcile: paid is marked paid (no receipt), cancelled and failed are marked, one token for the whole run", async () => {
  const paid = [];
  const w = world({ tables: { payment_intents: [mk("a", 10), mk("b", 20), mk("c", 30)] }, rpcs: { mark_intent_paid: (a) => { paid.push(a); } } });
  const answers = [{ ResultCode: "0" }, { ResultCode: "1032", ResultDesc: "cancelled" }, { ResultCode: "2001", ResultDesc: "wrong pin" }]; let n = 0;
  const orig = globalThis.fetch;
  globalThis.fetch = async (u, init) => String(u).includes("stkpushquery") ? new Response(JSON.stringify(answers[n++])) : orig(u, init);
  const r = await reconcile(baseEnv());
  assert.deepEqual([r.paid, r.cancelled, r.failed], [1, 1, 1]); assert.deepEqual(paid, [{ p_intent: "a", p_receipt: null }]);
  assert.equal(w.tables.payment_intents[1].status, "cancelled"); assert.equal(w.tables.payment_intents[2].status, "failed");
  assert.equal(w.daraja.filter((d) => d.path.startsWith("/oauth")).length, 1);
});
test("reconcile: 'being processed', no answer and a failed mark-paid all leave the payment PENDING for the next run", async () => {
  const w = world({ tables: { payment_intents: [mk("a", 10), mk("b", 10), mk("c", 10)] }, rpcs: { mark_intent_paid: () => new Error("db down") } });
  const answers = [{ errorCode: "500.001.1001", errorMessage: "The transaction is being processed" }, { weird: true }, { ResultCode: "0" }]; let n = 0;
  const orig = globalThis.fetch;
  globalThis.fetch = async (u, init) => String(u).includes("stkpushquery") ? new Response(JSON.stringify(answers[n++])) : orig(u, init);
  const r = await reconcile(baseEnv());
  assert.equal(r.pending, 1); assert.equal(r.errors, 2); assert.equal(r.paid, 0);
  assert.ok(w.tables.payment_intents.every((i) => i.status === "pending"));
  assert.ok(w.calls.includes("rpc:log_client_error"), "problems are logged to /admin/errors");
});
test("reconcile: two overlapping runs cannot take the same payment (the claim)", async () => {
  const w = world({ tables: { payment_intents: [mk("a", 10)] } }); w.queryAnswer = { ResultCode: "4999" };
  const [x, y] = [await reconcile(baseEnv()), await reconcile(baseEnv())];
  assert.equal(x.checked + y.checked, 1); assert.equal(y.checked, 0);
});
test("reconcile: a rent payment needs the business's own credentials; an order may use the platform's only in the sandbox", async () => {
  const w = world({ tables: { payment_intents: [mk("rent", 10, { purpose: "rent", business_id: BIZ }), mk("ord", 10, { purpose: "order", business_id: BIZ })] } }); w.queryAnswer = { ResultCode: "4999" };
  const r = await reconcile(baseEnv()); assert.equal(r.skipped, 1); assert.equal(r.checked, 1);
  w.tables.payment_intents.forEach((i) => { i.last_checked_at = null; }); w.tables.platform_settings[1].value = { env: "live" };
  const live = await reconcile(baseEnv()); assert.equal(live.skipped, 2);
});
test("reconcile: batch is capped, no credentials or the switch off does nothing", async () => {
  const w = world({ tables: { payment_intents: Array.from({ length: 12 }, (_, i) => mk(`p${i}`, 10 + i)) } }); w.queryAnswer = { ResultCode: "4999" };
  assert.equal((await reconcile(baseEnv({ RECONCILE_BATCH: "4" }))).checked, 4);
  assert.deepEqual(await reconcile(baseEnv({ RECONCILE_ENABLED: "false" })), { skipped: "disabled" });
  assert.deepEqual(await reconcile(baseEnv({ MPESA_CONSUMER_KEY: "" })), { skipped: "no credentials" });
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

// ---------- sign-in by phone (throttled in the database, as on main) ----------
const login = (env, body, headers = {}) => call(env, "POST", "/api/v1/fn/resolve-login", { body, headers });
test("resolve-login: same answer for wrong phone and wrong password; email never returned; success clears the throttle", async () => {
  const fin = [];
  const w = world({ rpcs: { login_email_for_phone: (a) => (a.p_phone === "254712345678" ? "u1@x.test" : null), login_throttle_finish: (a) => { fin.push(a); } } });
  const good = await ok(await login(baseEnv(), { phone: "254712345678", password: "right-pass" }));
  assert.deepEqual(good, { session: { access_token: "A", refresh_token: "R" } }); assert.deepEqual(fin, [{ p_attempt: "att-1", p_success: true }]);
  const badPass = await ok(await login(baseEnv(), { phone: "254712345678", password: "nope" }), 401);
  const noPhone = await ok(await login(baseEnv(), { phone: "254799999999", password: "x" }), 401);
  assert.deepEqual(badPass, noPhone); assert.ok(!JSON.stringify(badPass).includes("u1@x.test")); assert.equal(fin.length, 1, "a failure does not clear the throttle");
});
test("resolve-login: the database says 'too many' -> 429 with retry_after and Retry-After; the phone is not even looked up", async () => {
  const w = world({ rpcs: { login_throttle_begin: () => ({ allowed: false, retry_after: 600 }), login_email_for_phone: () => "u1@x.test" } });
  const res = await login(baseEnv(), { phone: "254712345678", password: "right-pass" }, { "CF-Connecting-IP": "1.2.3.4" });
  assert.equal(res.status, 429); assert.equal(res.headers.get("retry-after"), "600");
  const b = await res.json(); assert.equal(b.retry_after, 600); assert.match(b.error, /10 minutes/);
  assert.equal(w.calls.includes("rpc:login_email_for_phone"), false);
});
test("resolve-login: the visitor's IP comes only from CF-Connecting-IP; a database hiccup never locks people out", async () => {
  let seen;
  const w = world({ rpcs: { login_throttle_begin: (a) => { seen = a; return { allowed: true, attempt_id: "x" }; }, login_email_for_phone: () => "u1@x.test" } });
  await login(baseEnv(), { phone: "254712345678", password: "right-pass" }, { "CF-Connecting-IP": "9.9.9.9", "X-Forwarded-For": "6.6.6.6" });
  assert.equal(seen.p_ip, "9.9.9.9"); assert.equal(seen.p_identifier_max, 5); assert.equal(seen.p_ip_max, 20); assert.equal(seen.p_window_seconds, 900);
  w.rpcs.login_throttle_begin = () => new Error("db down");
  const orig = console.error; console.error = () => {};
  const res = await login(baseEnv(), { phone: "254712345678", password: "right-pass" }); console.error = orig;
  assert.equal(res.status, 200);
  assert.equal((await login(baseEnv(), { phone: "0712", password: "x" })).status, 401);
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
test("sitemap: XML with the site pages, escaped", async () => {
  world({ tables: { businesses: [{ id: BIZ, slug: "mama&sons", business_type: "shop", status: "active", updated_at: "2026-10-01T00:00:00Z" }], products: [{ id: "p1", business_id: BIZ, status: "active", created_at: "2026-10-02T00:00:00Z" }] } });
  const res = await call(baseEnv(), "GET", "/sitemap.xml"); const xml = await res.text();
  assert.equal(res.headers.get("content-type"), "application/xml; charset=utf-8");
  assert.match(xml, /<loc>https:\/\/site\.test\/explore<\/loc>/); assert.match(xml, /mama&amp;sons\/p\/p1/);
});

// ---------- things that came from main's newer Edge Functions ----------
test("stk-push: a second tap for the same order returns the FIRST intent and sends NO second prompt", async () => {
  const w = orderWorld();
  const first = await ok(await stk(baseEnv(), ORDER)); assert.equal(first.status, "pending");
  const pushes = () => w.daraja.filter((d) => d.path.includes("processrequest")).length;
  assert.equal(pushes(), 1);
  const again = await ok(await stk(baseEnv(), ORDER));
  assert.equal(again.duplicate, true); assert.equal(again.intentId, first.intentId); assert.equal(pushes(), 1); assert.equal(w.tables.payment_intents.length, 1);
});
test("stk-push: the duplicate block does not cross purposes or a changed request", async () => {
  const w = orderWorld({ tables: { billing_cycles: [{ id: "cy1", tenant_id: BIZ, tenancy_id: "t1", client_id: U1, status: "open", amount_due: 5000, late_fee: 0, amount_paid: 0, invoice_number: "INV-1" }] } });
  await ok(await stk(baseEnv(), ORDER));
  // a pending prompt for the order must not block a prompt for an invoice
  const rent = await ok(await stk(baseEnv({}), { purpose: "rent", cycleId: "cy1", amount: 1000, phone: "254712345678" }));
  assert.ok(!rent.duplicate);
});
test("stk-push: two taps at the same moment: the oldest intent wins, the other is closed and sends nothing", async () => {
  const w = orderWorld();
  const older = { id: "older", created_at: new Date(Date.now() - 500).toISOString() };
  // the first duplicate check (before our insert) sees nothing; by the second check the other tap's row is there
  let checks = 0; const orig = globalThis.fetch;
  globalThis.fetch = async (u, init) => {
    if ((init?.method || "GET") === "GET" && String(u).includes("/rest/v1/payment_intents?") && String(u).includes("purpose=eq.order")) {
      return new Response(JSON.stringify(++checks === 2 ? [older] : []), { status: 200 });
    }
    return orig(u, init);
  };
  const r = await ok(await stk(baseEnv(), ORDER));
  assert.equal(checks, 2); assert.equal(r.duplicate, true); assert.equal(r.intentId, "older");
  assert.equal(w.daraja.filter((d) => d.path.includes("processrequest")).length, 0);
  assert.equal(w.tables.payment_intents[0].status, "failed"); assert.match(w.tables.payment_intents[0].result_desc, /Duplicate/);
});
test("callback: a success with no usable Amount is NOT marked paid; it stays pending for reconcile", async () => {
  let paid = 0;
  const w = world({ tables: { payment_intents: [pending()] }, rpcs: { mark_intent_paid: () => { paid++; } } });
  for (const items of [[], [{ Name: "Amount", Value: "" }], [{ Name: "Amount", Value: null }], [{ Name: "Amount", Value: "abc" }]]) {
    const r = await call(baseEnv(), "POST", "/api/v1/mpesa/callback?secret=cb-secret-123", { body: { Body: { stkCallback: { CheckoutRequestID: "ws_CO_1", ResultCode: 0, ResultDesc: "ok", CallbackMetadata: { Item: items } } } } });
    assert.equal(r.status, 200);
  }
  assert.equal(paid, 0); assert.equal(w.tables.payment_intents[0].status, "pending"); assert.match(w.tables.payment_intents[0].note, /waiting for reconcile/);
});
test("callback: when marking paid fails the payment stays pending, the problem is logged, and Safaricom still gets Accepted", async () => {
  const w = world({ tables: { payment_intents: [pending()] }, rpcs: { mark_intent_paid: () => new Error("db down") } });
  const orig = console.error; console.error = () => {};
  const r = await call(baseEnv(), "POST", "/api/v1/mpesa/callback?secret=cb-secret-123", { body: cb(0, 1500) }); console.error = orig;
  assert.equal((await r.json()).ResultCode, 0); assert.equal(w.tables.payment_intents[0].status, "pending"); assert.ok(w.calls.includes("rpc:log_client_error"));
});
test("send-email: the provider refusing or being unreachable answers 502 with the reason", async () => {
  const w = world(); const body = { to: "someone@x.test", subject: "Hi", text: "Hello" };
  const env = baseEnv({ RESEND_API_KEY: "re_x" });
  w.resend = { status: 403, body: { message: "You can only send to your own address" } };
  const r = await ok(await call(env, "POST", "/api/v1/fn/send-email", { token: "tok-admin", body }), 502);
  assert.equal(r.ok, false); assert.equal(r.sent, false); assert.match(r.error, /only send to your own/);
  w.resend = "down";
  const r2 = await ok(await call(env, "POST", "/api/v1/fn/send-email", { token: "tok-admin", body }), 502); assert.match(r2.error, /could not be reached/);
});
test("sitemap: includes rooms and farm produce; works without SITE_URL (uses the address asked); a database failure is 502 and never cached", async () => {
  globalThis.caches = { default: fakeCache() };
  const w = world({ tables: { businesses: [{ id: BIZ, slug: "shop1", business_type: "shop", status: "active", updated_at: "2026-10-01T00:00:00Z" }] },
    rpcs: { market_listings: (a) => ({ total: 1, items: [{ id: `${a.p_kind}-1`, business_slug: "farm1", created_at: "2026-10-03T00:00:00Z" }] }) } });
  const xml = await (await call(baseEnv({ SITE_URL: "" }), "GET", "/sitemap.xml")).text();
  assert.match(xml, /https:\/\/site\.test\/b\/farm1\/room\/rooms-1/); assert.match(xml, /https:\/\/site\.test\/b\/farm1\/produce\/farm-1/); assert.match(xml, /b\/shop1\/browse/);
  globalThis.caches = { default: fakeCache() }; w.tables.businesses = null;
  const orig = globalThis.fetch;
  globalThis.fetch = async (u, init) => (String(u).includes("/rest/v1/businesses") ? new Response("{}", { status: 500 }) : orig(u, init));
  const res = await call(baseEnv(), "GET", "/sitemap.xml"); // the Worker version failed: the old Supabase function answers instead
  assert.equal(res.status, 200); assert.equal(await res.text(), "<urlset>old</urlset>");
  w.oldSitemapStatus = 500; const bad = await call(baseEnv(), "GET", "/sitemap.xml");
  assert.equal(bad.status, 502); assert.equal(bad.headers.get("cache-control"), "no-store");
  assert.equal(globalThis.caches.default.m.size, 0, "nothing half-built was cached");
});
test("everything already on main still works through the new entry: robots.txt, share, admin routes", async () => {
  world();
  const robots = await call(baseEnv(), "GET", "/robots.txt"); assert.equal(robots.status, 200); assert.match(await robots.text(), /Sitemap: https:\/\/site\.test\/sitemap\.xml/);
  assert.equal((await call(baseEnv(), "GET", "/api/admin/stats")).status < 500, true);
});
test("sitemap: off by default (the Supabase function answers, as on main); /api/v1/sitemap always shows the Worker version for testing", async () => {
  world({ tables: { businesses: [{ id: BIZ, slug: "shop1", business_type: "shop", status: "active", updated_at: "2026-10-01T00:00:00Z" }] }, rpcs: { market_listings: () => ({ items: [] }) } });
  assert.equal(await (await call(baseEnv({ SITEMAP_IN_WORKER: "false" }), "GET", "/sitemap.xml")).text(), "<urlset>old</urlset>");
  assert.match(await (await call(baseEnv({ SITEMAP_IN_WORKER: "false" }), "GET", "/api/v1/sitemap")).text(), /b\/shop1/);
});
