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
// OPTIONAL VAR: PUBLIC_BASE_URL = https://<your live site>  (Safaricom calls <that>/api/v1/mpesa/callback).
//   Leave it empty and the address the browser used to reach the Worker is used (right for the live site).
// With no credentials the answer is { code: "NOT_CONFIGURED" } so the super admin's manual "mark as paid" still works.

import { admin } from "./supabase.js";
import { bearer, json, publicBase, readJson, sameSecret } from "./http.js";

/** Error log for server code: console + a row in client_errors (shows at /admin/errors). Never throws. */
async function logError(db, where, message, detail = "") {
  console.error(`[${where}]`, message, detail);
  try { await db.rpc("log_client_error", { p_message: `${where}: ${message}`.slice(0, 500), p_stack: String(detail).slice(0, 4000) || null, p_url: `edge:${where}`, p_agent: "worker", p_release: null }); } catch { /* never throws */ }
}

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
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error("Safaricom rejected the credentials.");
  const body = await res.json();
  if (!body?.access_token) throw new Error("Safaricom sent no token.");
  return String(body.access_token);
}

/** Daraja's STK Push Query answer -> paid | cancelled | failed | pending | error (same rules as supabase/functions/_shared/daraja.ts). */
export function readStkQuery(body) {
  if (body && body.ResultCode !== undefined && body.ResultCode !== null && String(body.ResultCode).trim() !== "") {
    const code = Number(body.ResultCode);
    if (!Number.isFinite(code)) return { state: "error", message: "Unreadable ResultCode from Safaricom." };
    const desc = String(body.ResultDesc ?? "").slice(0, 300);
    if (code === 0) return { state: "paid" };
    if (code === 4999) return { state: "pending" };
    if (code === 1032) return { state: "cancelled", code, desc };
    return { state: "failed", code, desc };
  }
  const msg = String(body?.errorMessage ?? body?.ResponseDescription ?? "");
  if (body?.errorCode === "500.001.1001" || /being processed|still under processing/i.test(msg)) return { state: "pending" };
  return { state: "error", message: (msg || "No result from Safaricom.").slice(0, 200) };
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
  const base = publicBase(request, env);
  if (!env.MPESA_CONSUMER_KEY || !env.MPESA_CONSUMER_SECRET || !passkey || !env.MPESA_CALLBACK_SECRET || !base) {
    return json({ error: "M-Pesa is not set up on this server yet.", code: "NOT_CONFIGURED" }, 400);
  }

  // Duplicate-prompt block: a second tap (or tab) must not send a second prompt. A pending intent of this user for the same
  // purpose, reference and amount (and plan) from the last 2 minutes is returned instead. Same rule as the Edge Function.
  const DUP_MSG = "A payment prompt was sent a moment ago. Check your phone for the M-Pesa prompt.";
  const findPending = async () => {
    const f = { user_id: `eq.${user.id}`, purpose: `eq.${purpose}`, status: "eq.pending", amount_kes: `eq.${amount}`, created_at: `gte.${new Date(Date.now() - 120_000).toISOString()}` };
    if (purpose === "order") f.order_id = `eq.${orderRef}`;
    else if (purpose === "rent") f.billing_cycle_id = `eq.${cycleRef}`;
    else { f.business_id = `eq.${bizId}`; f.plan_id = `eq.${planRef}`; }
    const { data } = await db.list("payment_intents", { select: "id,created_at", filters: f, order: "created_at.asc,id.asc", limit: 1 });
    return data?.[0] ?? null;
  };
  const already = await findPending();
  if (already) return json({ intentId: already.id, status: "pending", message: DUP_MSG, duplicate: true });

  const ins = await db.insert("payment_intents", {
    user_id: user.id, business_id: bizId, plan_id: planRef, purpose, method: "mpesa_stk",
    amount_kes: amount, phone, status: "pending", billing_cycle_id: cycleRef, tenancy_id: tenancyRef, order_id: orderRef,
  });
  const intent = Array.isArray(ins.data) ? ins.data[0] : null;
  if (ins.error || !intent) return json({ error: "Could not start the payment." }, 500);
  // Two taps at the same moment can both pass the check above. The oldest pending intent wins; the other stops here.
  const first = await findPending();
  if (first && first.id !== intent.id) {
    await db.update("payment_intents", { id: `eq.${intent.id}` }, { status: "failed", result_desc: "Duplicate request, no prompt was sent." });
    return json({ intentId: first.id, status: "pending", message: DUP_MSG, duplicate: true });
  }

  try {
    const token = await darajaToken(env, plat.live);
    const ts = stamp();
    const callback = `${base}/api/v1/mpesa/callback?secret=${encodeURIComponent(env.MPESA_CALLBACK_SECRET)}`;
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
  // A missing, empty or non-numeric Amount is NaN (Number(null) and Number("") would wrongly be 0).
  const rawAmount = items.find((i) => i.Name === "Amount")?.Value;
  const paid = (typeof rawAmount === "number" || (typeof rawAmount === "string" && rawAmount.trim() !== "")) ? Number(rawAmount) : NaN;

  if (cb.ResultCode === 0) {
    if (!Number.isFinite(paid)) {
      // Success without a usable Amount: we cannot check what was paid, so do not mark it paid. It stays pending and reconcile asks Safaricom.
      await logError(db, "mpesa-callback", "Success callback without a usable Amount; left pending for reconcile", `intent ${intent.id} checkout ${cb.CheckoutRequestID}`);
      await db.update("payment_intents", { id: `eq.${intent.id}`, status: "eq.pending" }, { note: "Callback had no usable Amount; waiting for reconcile" });
      return accepted();
    }
    if (Math.round(paid) !== Number(intent.amount_kes)) {
      // Paid a different amount than asked: do not mark it paid; a super admin sorts it out by hand.
      await db.update("payment_intents", { id: `eq.${intent.id}` }, { status: "failed", result_code: 0, result_desc: `Amount mismatch: asked ${intent.amount_kes}, received ${paid}. Receipt ${receipt ?? "?"}` });
      return accepted();
    }
    await db.update("payment_intents", { id: `eq.${intent.id}` }, { result_code: 0, result_desc: cb.ResultDesc });
    const pay = await db.rpc("mark_intent_paid", { p_intent: intent.id, p_receipt: receipt ?? null });
    if (pay.error) {
      // Leave it pending so reconcile retries; Safaricom still gets Accepted (it must not retry on its own).
      await logError(db, "mpesa-callback", "mark_intent_paid failed; left pending for reconcile", `intent ${intent.id} checkout ${cb.CheckoutRequestID}: ${pay.error.message}`);
    }
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
 * Reconcile (run by the cron trigger, see cron.js). Same rules as the Edge Function mpesa-reconcile (Part 3):
 * takes pending M-Pesa prompts older than 2 minutes and younger than 24 hours that were not looked at in the last 90 seconds,
 * claims each (last_checked_at, check_count) so two overlapping runs never take the same one, asks Safaricom (STK Push Query),
 * and: paid -> mark_intent_paid; cancelled/failed -> marked (only while still pending); still processing or no answer -> left for the next run.
 * The query returns no amount or receipt, so the amount asked for at STK time is the amount trusted.
 * Differences from the Edge Function: runs from Cloudflare (no pg_cron / pg_net bookkeeping in your database), and takes at most
 * RECONCILE_BATCH per run (default 6, max 10) so a run stays inside the free plan's 50 outbound requests; the rest are picked up next run.
 * Idle cost: one indexed read (index payment_intents_status_created_idx, Part 3). Switch off with the variable RECONCILE_ENABLED = "false".
 */
export async function reconcile(env, now = Date.now()) {
  if (String(env.RECONCILE_ENABLED ?? "true") === "false") return { skipped: "disabled" };
  if (!env.MPESA_CONSUMER_KEY || !env.MPESA_CONSUMER_SECRET) return { skipped: "no credentials" };
  const db = admin(env);
  const batch = Math.min(Math.max(Number(env.RECONCILE_BATCH) || 6, 1), 10);
  const iso = (ms) => new Date(ms).toISOString();
  const eligible = `(last_checked_at.is.null,last_checked_at.lt.${iso(now - 90_000)})`;

  const { data: rows, error } = await db.list("payment_intents", {
    select: "id,business_id,purpose,check_count,checkout_request_id",
    filters: { status: "eq.pending", method: "eq.mpesa_stk", checkout_request_id: "not.is.null", and: `(created_at.lt.${iso(now - 2 * 60_000)},created_at.gt.${iso(now - 24 * 3_600_000)})`, or: eligible },
    order: "last_checked_at.asc.nullsfirst,created_at.asc", limit: batch,
  });
  if (error) { await logError(db, "mpesa-reconcile", "Could not list pending payments", error.message); return { error: "Could not list pending payments." }; }
  const out = { checked: 0, paid: 0, cancelled: 0, failed: 0, pending: 0, skipped: 0, errors: 0 };
  if (!rows?.length) return out;

  const plat = await platformMpesa(db, env);
  let token = null;
  for (const row of rows) {
    try {
      // Claim it: a second overlapping run cannot pick the same payment within 90 seconds.
      const claim = await db.update("payment_intents", { id: `eq.${row.id}`, status: "eq.pending", or: eligible }, { last_checked_at: iso(Date.now()), check_count: (row.check_count ?? 0) + 1 }, { returning: true });
      if (!claim.data?.length) { out.skipped++; continue; }

      // Whose paybill/till and passkey this payment went to.
      let shortcode = plat.shortcode, passkey = env.MPESA_PASSKEY;
      if (row.purpose !== "subscription") {
        const own = row.business_id ? await businessCreds(db, row.business_id) : null;
        if (own) { shortcode = own.shortcode; passkey = own.passkey; }
        else if (!(row.purpose === "order" && !plat.live)) { // rent always needs the business's own; an order may use the platform's only in the sandbox
          out.skipped++; await logError(db, "mpesa-reconcile", "No M-Pesa credentials to check this payment with", `intent ${row.id} purpose ${row.purpose}`); continue;
        }
      }
      if (!passkey) { out.skipped++; await logError(db, "mpesa-reconcile", "MPESA_PASSKEY is not set; cannot check payment", `intent ${row.id}`); continue; }

      try { token ||= await darajaToken(env, plat.live); }
      catch (e) { out.errors++; await logError(db, "mpesa-reconcile", "Could not get a Safaricom token", String(e.message)); continue; }

      out.checked++;
      const ts = stamp();
      let answer;
      try {
        const res = await fetch(`${darajaBase(plat.live)}/mpesa/stkpushquery/v1/query`, {
          method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(10_000),
          body: JSON.stringify({ BusinessShortCode: shortcode, Password: btoa(`${shortcode}${passkey}${ts}`), Timestamp: ts, CheckoutRequestID: row.checkout_request_id }),
        });
        const body = await res.json().catch(() => null);
        answer = body ? readStkQuery(body) : { state: "error", message: `Safaricom answered HTTP ${res.status} with no body.` };
      } catch (e) { answer = { state: "error", message: String(e.message ?? e).slice(0, 200) }; }

      if (answer.state === "paid") {
        const r = await db.rpc("mark_intent_paid", { p_intent: row.id, p_receipt: null });
        if (r.error) { out.errors++; await logError(db, "mpesa-reconcile", "mark_intent_paid failed; left pending, will retry", `intent ${row.id}: ${r.error.message}`); continue; }
        out.paid++;
        await db.update("payment_intents", { id: `eq.${row.id}` }, { result_code: 0, result_desc: "Confirmed by reconcile (STK query)" });
      } else if (answer.state === "cancelled" || answer.state === "failed") {
        // Only while still pending, so it can never undo a payment the callback just confirmed.
        const r = await db.update("payment_intents", { id: `eq.${row.id}`, status: "eq.pending" }, { status: answer.state, result_code: answer.code, result_desc: answer.desc });
        if (r.error) { out.errors++; await logError(db, "mpesa-reconcile", `Could not mark payment ${answer.state}`, `intent ${row.id}: ${r.error.message}`); } else out[answer.state]++;
      } else if (answer.state === "pending") out.pending++;
      else { out.errors++; await logError(db, "mpesa-reconcile", "STK query gave no answer; left pending", `intent ${row.id}: ${answer.message}`); }
    } catch (e) { out.errors++; await logError(db, "mpesa-reconcile", "Unexpected error", `intent ${row.id}: ${String(e.message)}`); }
  }
  return out;
}
