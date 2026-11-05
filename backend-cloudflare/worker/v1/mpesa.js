// worker/v1/mpesa.js — NEW FILE (replaces the Edge Functions mpesa-stk-push, mpesa-callback, mpesa-status)
// AIM: start an M-Pesa prompt, receive Safaricom's answer, let the browser ask "did it go through?", and
// (reconcile) ask Safaricom about prompts whose answer never arrived. The rules are copied one for one from the
// Edge Functions they replace; the money rules did not change.
//
//   POST /api/v1/fn/mpesa-stk-push    signed-in; body { purpose: subscription|rent|order, ... phone }
//   POST /api/v1/fn/mpesa-status      signed-in; body { intentId }
//   POST /api/v1/mpesa/callback?secret=...   Safaricom (no login; protected by MPESA_CALLBACK_SECRET in the URL)
//
// SECRETS (npx wrangler secret put <NAME>):
//   MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET   Daraja portal > My Apps > your app
//   MPESA_PASSKEY                                 Daraja portal > APIs > M-Pesa Express > passkey (sandbox passkey is public)
//   MPESA_CALLBACK_SECRET                         any long random text YOU invent (>= 32 characters)
// OPTIONAL: MPESA_SHORTCODE (else platform_settings.mpesa.shortcode, else the sandbox 174379).
// PUBLIC VAR: PUBLIC_BASE_URL = https://<your live site>  (Safaricom calls <that>/api/v1/mpesa/callback).
// With no credentials the answer is { code: "NOT_CONFIGURED" } so the super admin's manual "mark as paid" still works.

import { admin } from "./supabase.js";
import { bearer, json, readJson, sameSecret } from "./http.js";

const PAUSED = "Payments are paused for a short while. Nothing was charged. Please try again later.";

const darajaBase = (live) => (live ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke");
const stamp = () => new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);

/** Platform mpesa setting: "live" or "sandbox", and the platform shortcode. */
async function platformMpesa(db, env) {
  const { data } = await db.one("platform_settings", { select: "value", filters: { key: "eq.mpesa" } });
  const v = data?.value || {};
  return { live: v.env === "live", shortcode: env.MPESA_SHORTCODE || v.shortcode || "174379" };
}

/** Asks Safaricom for a short-lived token. Throws an Error with a plain message. */
async function darajaToken(env, live) {
  const res = await fetch(`${darajaBase(live)}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: "Basic " + btoa(`${env.MPESA_CONSUMER_KEY}:${env.MPESA_CONSUMER_SECRET}`) },
  });
  if (!res.ok) throw new Error("Safaricom rejected the credentials.");
  return (await res.json()).access_token;
}

/** The shortcode and passkey a given business uses (its own paybill/till when saved). */
async function businessCreds(db, businessId) {
  const { data: ts } = await db.one("tenant_settings", { select: "mpesa_shortcode", filters: { tenant_id: `eq.${businessId}` } });
  const { data: sec } = await db.one("tenant_secrets", { select: "mpesa_passkey", filters: { tenant_id: `eq.${businessId}` } });
  return ts?.mpesa_shortcode && sec?.mpesa_passkey ? { shortcode: ts.mpesa_shortcode, passkey: sec.mpesa_passkey } : null;
}

// ---------------------------------------------------------------------------------------------------------------
export async function stkPush(request, env) {
  const db = admin(env);
  const user = await db.userFor(bearer(request));
  if (!user) return json({ error: "Please sign in first." }, 401);

  const body = await readJson(request);

  // Maintenance guard (levels 4 and 5). FAILS CLOSED: if the setting cannot be read, no prompt is sent.
  {
    const { data: maint, error: maintErr } = await db.one("platform_settings", { select: "value", filters: { key: "eq.maintenance" } });
    const m = maint?.value;
    if (maintErr || !m || typeof m !== "object" || Array.isArray(m)) return json({ error: PAUSED, code: "MAINTENANCE_UNKNOWN" }, 503);
    if (m.payments === true) return json({ error: PAUSED, code: "MAINTENANCE_PAYMENTS" }, 503);
    if (Array.isArray(m.businesses) && m.businesses.length > 0) {
      const listed = m.businesses.map((b) => String(b).toLowerCase());
      if ((body?.purpose ?? "subscription") === "subscription" && listed.includes(String(body?.businessId ?? "").toLowerCase())) {
        return json({ error: "Subscription payments are not open for this business yet. Please try again later or contact support.", code: "MAINTENANCE_BUSINESS" }, 503);
      }
    }
  }

  // A switched-off account does nothing, and nobody can flood phones with prompts.
  const { data: prof } = await db.one("profiles", { select: "is_active", filters: { id: `eq.${user.id}` } });
  if (prof && prof.is_active === false) return json({ error: "This account has been switched off." }, 403);
  const recent = await db.list("payment_intents", { select: "id", filters: { user_id: `eq.${user.id}`, created_at: `gte.${new Date(Date.now() - 60_000).toISOString()}` }, limit: 3 });
  if ((recent.data?.length ?? 0) >= 3) return json({ error: "Too many payment prompts. Wait a minute and try again." }, 429);

  if (!body) return json({ error: "Invalid request" }, 400);
  const { purpose = "subscription", businessId, planId, cycleId, orderId } = body;
  const phone = String(body.phone ?? "");
  if (!["subscription", "rent", "order"].includes(purpose)) return json({ error: "Unsupported payment type." }, 400);
  if (!/^254[17]\d{8}$/.test(phone)) return json({ error: "Enter a valid Kenyan phone number." }, 400);

  const plat = await platformMpesa(db, env);
  let { shortcode } = plat;
  let passkey = env.MPESA_PASSKEY;
  let bizId, bizName, amount, desc;
  let planRef = null, cycleRef = null, tenancyRef = null, orderRef = null;

  if (purpose === "subscription") {
    const { data: member } = await db.one("business_members", { select: "role", filters: { business_id: `eq.${businessId}`, user_id: `eq.${user.id}`, status: "eq.active" } });
    const { data: biz } = await db.one("businesses", { select: "id,name,status,business_type", filters: { id: `eq.${businessId}` } });
    if (!biz || member?.role !== "owner") return json({ error: "You cannot pay for this business." }, 403);
    if (!["pending_payment", "draft"].includes(biz.status)) return json({ error: "This business is already paid for." }, 400);
    const { data: plan } = await db.one("subscription_plans", { select: "id,name,price_kes,business_type", filters: { id: `eq.${planId}` } });
    if (!plan || plan.business_type !== biz.business_type) return json({ error: "This plan is not available." }, 400);
    const { data: onSale } = await db.rpc("plan_is_available", { p_plan: plan.id });
    if (onSale !== true || !(Number(plan.price_kes) > 0)) return json({ error: "This plan is not available." }, 400);
    bizId = biz.id; bizName = biz.name; amount = plan.price_kes; planRef = plan.id; desc = `Subscription ${plan.name}`;
  } else if (purpose === "order") {
    const { data: ord } = await db.one("orders", { select: "id,business_id,customer_id,status,payment_status,payment_method,total,order_number", filters: { id: `eq.${orderId ?? ""}` } });
    if (!ord || ord.customer_id !== user.id) return json({ error: "Order not found." }, 404);
    if (ord.payment_method !== "mpesa") return json({ error: "This order is paid on delivery." }, 400);
    if (ord.status !== "pending_payment" || ord.payment_status !== "unpaid") return json({ error: "This order needs no payment." }, 400);
    const { data: biz } = await db.one("businesses", { select: "id,name,status", filters: { id: `eq.${ord.business_id}` } });
    if (!biz || biz.status !== "active") return json({ error: "This shop is not open." }, 400);
    amount = Math.ceil(Number(ord.total));
    if (!(amount >= 1)) return json({ error: "Nothing to pay." }, 400);
    const own = await businessCreds(db, biz.id);
    if (own) { shortcode = own.shortcode; passkey = own.passkey; }
    else if (plat.live) return json({ error: "This shop has not set up M-Pesa prompts yet. Please contact the shop.", code: "BUSINESS_NOT_CONFIGURED" }, 400);
    bizId = biz.id; bizName = biz.name; orderRef = ord.id; desc = `Order ${ord.order_number}`;
  } else {
    const { data: cycle } = await db.one("billing_cycles", { select: "id,tenant_id,tenancy_id,client_id,status,amount_due,late_fee,amount_paid,invoice_number", filters: { id: `eq.${cycleId ?? ""}` } });
    if (!cycle) return json({ error: "Invoice not found." }, 404);
    const { data: member } = await db.one("business_members", { select: "role", filters: { business_id: `eq.${cycle.tenant_id}`, user_id: `eq.${user.id}`, status: "eq.active" } });
    const isStaff = member?.role === "owner" || member?.role === "manager";
    if (cycle.client_id !== user.id && !isStaff) return json({ error: "Invoice not found." }, 404);
    if (["paid", "waived", "cancelled"].includes(cycle.status)) return json({ error: "This invoice needs no payment." }, 400);
    const balance = Number(cycle.amount_due) + Number(cycle.late_fee ?? 0) - Number(cycle.amount_paid ?? 0);
    amount = Math.ceil(Number(body.amount));
    if (!(amount >= 1) || amount > balance) return json({ error: `Enter an amount up to KSh ${balance}.` }, 400);
    const { data: biz } = await db.one("businesses", { select: "id,name,status", filters: { id: `eq.${cycle.tenant_id}` } });
    if (!biz || biz.status !== "active") return json({ error: "This business is not active." }, 400);
    const own = await businessCreds(db, cycle.tenant_id);
    if (!own) return json({ error: "This business has not set up M-Pesa prompts. Pay to its paybill or till and send the code to the manager.", code: "BUSINESS_NOT_CONFIGURED" }, 400);
    shortcode = own.shortcode; passkey = own.passkey;
    bizId = biz.id; bizName = biz.name; cycleRef = cycle.id; tenancyRef = cycle.tenancy_id; desc = `Rent ${cycle.invoice_number ?? ""}`;
  }

  // Fail closed: without the callback secret and the public address the payment could never be confirmed safely.
  if (!env.MPESA_CONSUMER_KEY || !env.MPESA_CONSUMER_SECRET || !passkey || !env.MPESA_CALLBACK_SECRET || !env.PUBLIC_BASE_URL) {
    return json({ error: "M-Pesa is not set up on this server yet.", code: "NOT_CONFIGURED" }, 400);
  }

  const ins = await db.insert("payment_intents", {
    user_id: user.id, business_id: bizId, plan_id: planRef, purpose, method: "mpesa_stk",
    amount_kes: amount, phone, status: "pending", billing_cycle_id: cycleRef, tenancy_id: tenancyRef, order_id: orderRef,
  });
  const intent = Array.isArray(ins.data) ? ins.data[0] : null;
  if (ins.error || !intent) return json({ error: "Could not start the payment." }, 500);

  try {
    const token = await darajaToken(env, plat.live);
    const ts = stamp();
    const callback = `${String(env.PUBLIC_BASE_URL).replace(/\/+$/, "")}/api/v1/mpesa/callback?secret=${encodeURIComponent(env.MPESA_CALLBACK_SECRET)}`;
    const stk = await fetch(`${darajaBase(plat.live)}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: shortcode, Password: btoa(`${shortcode}${passkey}${ts}`), Timestamp: ts,
        TransactionType: "CustomerPayBillOnline", Amount: amount, PartyA: phone, PartyB: shortcode, PhoneNumber: phone,
        CallBackURL: callback, AccountReference: String(bizName).slice(0, 12), TransactionDesc: String(desc).slice(0, 20),
      }),
    });
    const res = await stk.json();
    if (res.ResponseCode !== "0") throw new Error(res.errorMessage || res.ResponseDescription || "M-Pesa could not send the prompt.");
    await db.update("payment_intents", { id: `eq.${intent.id}` }, { checkout_request_id: res.CheckoutRequestID, merchant_request_id: res.MerchantRequestID });
    return json({ intentId: intent.id, status: "pending", message: "Check your phone for the M-Pesa prompt." });
  } catch (e) {
    await db.update("payment_intents", { id: `eq.${intent.id}` }, { status: "failed", result_desc: String(e.message) });
    return json({ error: String(e.message) }, 502);
  }
}

// ---------------------------------------------------------------------------------------------------------------
const accepted = () => json({ ResultCode: 0, ResultDesc: "Accepted" });

export async function callback(request, env) {
  const given = new URL(request.url).searchParams.get("secret") ?? "";
  if (!env.MPESA_CALLBACK_SECRET || !sameSecret(given, env.MPESA_CALLBACK_SECRET)) return new Response("Forbidden", { status: 403 });

  const payload = await readJson(request);
  const cb = payload?.Body?.stkCallback;
  if (!cb?.CheckoutRequestID) return accepted();

  const db = admin(env);
  const { data: intent } = await db.one("payment_intents", { select: "id,status,amount_kes", filters: { checkout_request_id: `eq.${cb.CheckoutRequestID}` } });
  if (!intent || intent.status === "success") return accepted(); // unknown, or already paid: safe to receive twice

  const items = cb.CallbackMetadata?.Item ?? [];
  const receipt = items.find((i) => i.Name === "MpesaReceiptNumber")?.Value;
  const paid = Number(items.find((i) => i.Name === "Amount")?.Value);

  if (cb.ResultCode === 0) {
    if (Number.isFinite(paid) && Math.round(paid) !== Number(intent.amount_kes)) {
      // Paid a different amount than asked: do not mark it paid; a super admin sorts it out by hand.
      await db.update("payment_intents", { id: `eq.${intent.id}` }, { status: "failed", result_code: 0, result_desc: `Amount mismatch: asked ${intent.amount_kes}, received ${paid}. Receipt ${receipt ?? "?"}` });
      return accepted();
    }
    await db.update("payment_intents", { id: `eq.${intent.id}` }, { result_code: 0, result_desc: cb.ResultDesc });
    await db.rpc("mark_intent_paid", { p_intent: intent.id, p_receipt: receipt ?? null });
  } else {
    await db.update("payment_intents", { id: `eq.${intent.id}` }, { status: cb.ResultCode === 1032 ? "cancelled" : "failed", result_code: cb.ResultCode, result_desc: cb.ResultDesc });
  }
  return accepted();
}

// ---------------------------------------------------------------------------------------------------------------
export async function status(request, env) {
  const db = admin(env);
  const user = await db.userFor(bearer(request));
  if (!user) return json({ error: "Please sign in first." }, 401);
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid request" }, 400);
  const { data: intent } = await db.one("payment_intents", {
    select: "id,user_id,status,amount_kes,mpesa_receipt,result_code,result_desc,business_id", filters: { id: `eq.${String(body.intentId ?? "")}` },
  });
  if (!intent) return json({ error: "Payment not found." }, 404);
  const { data: me } = await db.one("profiles", { select: "role", filters: { id: `eq.${user.id}` } });
  if (intent.user_id !== user.id && me?.role !== "super_admin") return json({ error: "Not allowed." }, 403);
  const { user_id: _omit, ...safe } = intent;
  return json({ intent: safe });
}

// ---------------------------------------------------------------------------------------------------------------
/**
 * Reconcile (run by the cron trigger, see cron.js): for prompts still "pending" whose answer never arrived,
 * ask Safaricom (STK Push Query) what happened. Cheap when idle: ONE indexed read, and nothing else when nothing is pending.
 *   - only prompts 3 to 60 minutes old (younger ones may still be answered; older ones are marked "timeout")
 *   - at most RECONCILE_BATCH per run (default 6) so one run stays inside the free plan's 50 outbound requests
 * Switch off at any time with the variable RECONCILE_ENABLED = "false".
 */
export async function reconcile(env, now = Date.now()) {
  if (String(env.RECONCILE_ENABLED ?? "true") === "false") return { skipped: "disabled" };
  const db = admin(env);
  const batch = Math.min(Math.max(Number(env.RECONCILE_BATCH) || 6, 1), 10);

  // 1. prompts that were never answered within the hour: close them as "timeout" (a late success callback can still win)
  const stale = await db.update("payment_intents", { status: "eq.pending", method: "eq.mpesa_stk", created_at: `lt.${new Date(now - 60 * 60_000).toISOString()}` },
    { status: "timeout", result_desc: "No answer from M-Pesa within an hour." });

  // 2. the ones worth asking about
  const { data: rows, error } = await db.list("payment_intents", {
    select: "id,business_id,purpose,amount_kes,checkout_request_id,created_at",
    filters: { status: "eq.pending", method: "eq.mpesa_stk", checkout_request_id: "not.is.null", created_at: `lt.${new Date(now - 3 * 60_000).toISOString()}` },
    order: "created_at.asc", limit: batch,
  });
  if (error) return { error: error.message };
  if (!rows?.length) return { checked: 0, staleError: stale.error?.message };
  if (!env.MPESA_CONSUMER_KEY || !env.MPESA_CONSUMER_SECRET) return { skipped: "no credentials" };

  const plat = await platformMpesa(db, env);
  let token;
  const out = { checked: 0, paid: 0, failed: 0, waiting: 0, errors: 0 };
  for (const it of rows) {
    out.checked++;
    try {
      let shortcode = plat.shortcode, passkey = env.MPESA_PASSKEY;
      if (it.purpose !== "subscription" && it.business_id) {
        const own = await businessCreds(db, it.business_id);
        if (own) { shortcode = own.shortcode; passkey = own.passkey; } else if (it.purpose === "rent") { out.errors++; continue; }
      }
      if (!passkey) { out.errors++; continue; }
      token ||= await darajaToken(env, plat.live);
      const ts = stamp();
      const res = await fetch(`${darajaBase(plat.live)}/mpesa/stkpushquery/v1/query`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ BusinessShortCode: shortcode, Password: btoa(`${shortcode}${passkey}${ts}`), Timestamp: ts, CheckoutRequestID: it.checkout_request_id }),
      });
      const a = await res.json().catch(() => ({}));
      if (a.ResultCode === undefined || a.ResultCode === null) { out.waiting++; continue; } // "being processed" or an error answer: ask again next run
      const code = Number(a.ResultCode);
      if (code === 0) {
        await db.update("payment_intents", { id: `eq.${it.id}` }, { result_code: 0, result_desc: a.ResultDesc || "Confirmed by reconcile" });
        const r = await db.rpc("mark_intent_paid", { p_intent: it.id, p_receipt: null });
        r.error ? out.errors++ : out.paid++;
      } else {
        await db.update("payment_intents", { id: `eq.${it.id}` }, { status: code === 1032 ? "cancelled" : "failed", result_code: code, result_desc: a.ResultDesc || "Not paid" });
        out.failed++;
      }
    } catch { out.errors++; }
  }
  return out;
}
