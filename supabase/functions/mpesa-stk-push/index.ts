// mpesa-stk-push — starts an M-Pesa STK prompt (Daraja, sandbox or live).
// Body: { purpose: "subscription", businessId, planId, phone: "2547…" }
//    or { purpose: "rent", cycleId, amount, phone: "2547…" }   (Phase 2: a resident or the business staff)
//    or { purpose: "order", orderId, phone: "2547…" }          (Phase 5: the customer pays a shop order; the amount is the order total)
// Subscription amounts always come from the database (the plan price). A rent amount is checked
// against the invoice balance. Rent is paid into the BUSINESS's own paybill/till
// (tenant_settings.mpesa_shortcode + tenant_secrets.mpesa_passkey, saved by the owner).
// Secrets (Supabase > Edge Functions > Secrets): MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET,
// MPESA_PASSKEY, optional MPESA_SHORTCODE (else platform_settings.mpesa.shortcode), and
// MPESA_CALLBACK_SECRET (any long random text; added to the callback URL).
// With no credentials the function answers { code: "NOT_CONFIGURED" } so the app can offer the
// super admin's manual "mark as paid" and testing is never blocked.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsFor, jsonFor } from "../_shared/http.ts";


Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = jsonFor(cors);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: auth } = await admin.auth.getUser(token);
  const user = auth?.user;
  if (!user) return json({ error: "Please sign in first." }, 401);

  // Maintenance guard (levels 4 and 5 of Admin > Settings > Maintenance). Fails closed: if the setting cannot be read, no prompt is sent.
  //   level 4  payments: true            every prompt (subscription, rent, order) is refused
  //   level 5  businesses: [business id]  a subscription prompt for a listed business is refused
  {
    const { data: maint, error: maintErr } = await admin.from("platform_settings").select("value").eq("key", "maintenance").maybeSingle();
    const m = maint?.value;
    if (maintErr || !m || typeof m !== "object" || Array.isArray(m)) {
      return json({ error: "Payments are paused for a short while. Nothing was charged. Please try again later.", code: "MAINTENANCE_UNKNOWN" }, 503);
    }
    if (m.payments === true) {
      return json({ error: "Payments are paused for a short while. Nothing was charged. Please try again later.", code: "MAINTENANCE_PAYMENTS" }, 503);
    }
    if (Array.isArray(m.businesses) && m.businesses.length > 0) {
      const peek = await req.clone().json().catch(() => null);
      const listed = m.businesses.map((b: unknown) => String(b).toLowerCase());
      if ((peek?.purpose ?? "subscription") === "subscription" && listed.includes(String(peek?.businessId ?? "").toLowerCase())) {
        return json({ error: "Subscription payments are not open for this business yet. Please try again later or contact support.", code: "MAINTENANCE_BUSINESS" }, 503);
      }
    }
  }

  // A switched-off account does nothing, and nobody can flood phones with prompts.
  const { data: prof } = await admin.from("profiles").select("is_active").eq("id", user.id).maybeSingle();
  if (prof && prof.is_active === false) return json({ error: "This account has been switched off." }, 403);
  const { count: recent } = await admin.from("payment_intents").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).gte("created_at", new Date(Date.now() - 60_000).toISOString());
  if ((recent ?? 0) >= 3) return json({ error: "Too many payment prompts. Wait a minute and try again." }, 429);

  let body: Record<string, string>;
  try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const { purpose = "subscription", businessId, planId, cycleId, orderId } = body;
  const phone = String(body.phone ?? "");
  if (!["subscription", "rent", "order"].includes(purpose)) return json({ error: "Unsupported payment type." }, 400);
  if (!/^254[17]\d{8}$/.test(phone)) return json({ error: "Enter a valid Kenyan phone number." }, 400);

  const key = Deno.env.get("MPESA_CONSUMER_KEY");
  const secret = Deno.env.get("MPESA_CONSUMER_SECRET");
  let passkey = Deno.env.get("MPESA_PASSKEY");
  const { data: setting } = await admin.from("platform_settings").select("value").eq("key", "mpesa").maybeSingle();
  const env = setting?.value?.env === "live" ? "live" : "sandbox";
  let shortcode = Deno.env.get("MPESA_SHORTCODE") || setting?.value?.shortcode || "174379";

  let bizId: string; let bizName: string; let amount: number; let desc: string;
  let planRef: string | null = null; let cycleRef: string | null = null; let tenancyRef: string | null = null; let orderRef: string | null = null;

  if (purpose === "subscription") {
    // Only the business owner can pay for it, and only while it is waiting for payment.
    const { data: member } = await admin.from("business_members").select("role")
      .eq("business_id", businessId).eq("user_id", user.id).eq("status", "active").maybeSingle();
    const { data: biz } = await admin.from("businesses").select("id, name, status, business_type").eq("id", businessId).maybeSingle();
    if (!biz || member?.role !== "owner") return json({ error: "You cannot pay for this business." }, 403);
    if (!["pending_payment", "draft"].includes(biz.status)) return json({ error: "This business is already paid for." }, 400);
    const { data: plan } = await admin.from("subscription_plans").select("id, name, price_kes, business_type")
      .eq("id", planId).maybeSingle();
    if (!plan || plan.business_type !== biz.business_type) return json({ error: "This plan is not available." }, 400);
    // The database decides what is on sale: switched on, priced and (for an offer) inside its dates.
    const { data: onSale } = await admin.rpc("plan_is_available", { p_plan: plan.id });
    if (onSale !== true || !(Number(plan.price_kes) > 0)) return json({ error: "This plan is not available." }, 400);
    bizId = biz.id; bizName = biz.name; amount = plan.price_kes; planRef = plan.id; desc = `Subscription ${plan.name}`;
  } else if (purpose === "order") {
    // Only the customer who placed the order, and only while it is unpaid. The amount is the order total.
    const { data: ord } = await admin.from("orders").select("id, business_id, customer_id, status, payment_status, payment_method, total, order_number")
      .eq("id", orderId ?? "").maybeSingle();
    if (!ord || ord.customer_id !== user.id) return json({ error: "Order not found." }, 404);
    if (ord.payment_method !== "mpesa") return json({ error: "This order is paid on delivery." }, 400);
    if (ord.status !== "pending_payment" || ord.payment_status !== "unpaid") return json({ error: "This order needs no payment." }, 400);
    const { data: biz } = await admin.from("businesses").select("id, name, status").eq("id", ord.business_id).maybeSingle();
    if (!biz || biz.status !== "active") return json({ error: "This shop is not open." }, 400);
    amount = Math.ceil(Number(ord.total));
    if (!(amount >= 1)) return json({ error: "Nothing to pay." }, 400);
    // The shop's own paybill/till when it has saved one. Without one, only the sandbox may use the platform's.
    const { data: ts } = await admin.from("tenant_settings").select("mpesa_shortcode").eq("tenant_id", biz.id).maybeSingle();
    const { data: sec } = await admin.from("tenant_secrets").select("mpesa_passkey").eq("tenant_id", biz.id).maybeSingle();
    if (ts?.mpesa_shortcode && sec?.mpesa_passkey) { shortcode = ts.mpesa_shortcode; passkey = sec.mpesa_passkey; }
    else if (env === "live") {
      return json({ error: "This shop has not set up M-Pesa prompts yet. Please contact the shop.", code: "BUSINESS_NOT_CONFIGURED" }, 400);
    }
    bizId = biz.id; bizName = biz.name; orderRef = ord.id; desc = `Order ${ord.order_number}`;
  } else {
    const { data: cycle } = await admin.from("billing_cycles")
      .select("id, tenant_id, tenancy_id, client_id, status, amount_due, late_fee, amount_paid, invoice_number").eq("id", cycleId ?? "").maybeSingle();
    if (!cycle) return json({ error: "Invoice not found." }, 404);
    const { data: member } = await admin.from("business_members").select("role")
      .eq("business_id", cycle.tenant_id).eq("user_id", user.id).eq("status", "active").maybeSingle();
    const isStaff = member?.role === "owner" || member?.role === "manager";
    if (cycle.client_id !== user.id && !isStaff) return json({ error: "Invoice not found." }, 404);
    if (["paid", "waived", "cancelled"].includes(cycle.status)) return json({ error: "This invoice needs no payment." }, 400);
    const balance = Number(cycle.amount_due) + Number(cycle.late_fee ?? 0) - Number(cycle.amount_paid ?? 0);
    amount = Math.ceil(Number(body.amount));
    if (!(amount >= 1) || amount > balance) return json({ error: `Enter an amount up to KSh ${balance}.` }, 400);
    const { data: biz } = await admin.from("businesses").select("id, name, status").eq("id", cycle.tenant_id).maybeSingle();
    if (!biz || biz.status !== "active") return json({ error: "This business is not active." }, 400);
    const { data: ts } = await admin.from("tenant_settings").select("mpesa_shortcode").eq("tenant_id", cycle.tenant_id).maybeSingle();
    const { data: sec } = await admin.from("tenant_secrets").select("mpesa_passkey").eq("tenant_id", cycle.tenant_id).maybeSingle();
    if (!ts?.mpesa_shortcode || !sec?.mpesa_passkey) {
      return json({ error: "This business has not set up M-Pesa prompts. Pay to its paybill or till and send the code to the manager.", code: "BUSINESS_NOT_CONFIGURED" }, 400);
    }
    shortcode = ts.mpesa_shortcode; passkey = sec.mpesa_passkey;
    bizId = biz.id; bizName = biz.name; cycleRef = cycle.id; tenancyRef = cycle.tenancy_id; desc = `Rent ${cycle.invoice_number ?? ""}`;
  }

  // Fail closed: without the callback secret the payment could never be confirmed safely.
  if (!key || !secret || !passkey || !Deno.env.get("MPESA_CALLBACK_SECRET")) {
    return json({ error: "M-Pesa is not set up on this server yet.", code: "NOT_CONFIGURED" }, 400);
  }

  const { data: intent, error: insErr } = await admin.from("payment_intents").insert({
    user_id: user.id, business_id: bizId, plan_id: planRef, purpose, method: "mpesa_stk",
    amount_kes: amount, phone, status: "pending", billing_cycle_id: cycleRef, tenancy_id: tenancyRef, order_id: orderRef,
  }).select("id").single();
  if (insErr) return json({ error: "Could not start the payment." }, 500);

  const base = env === "live" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
  try {
    const tokenRes = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: "Basic " + btoa(`${key}:${secret}`) },
    });
    if (!tokenRes.ok) throw new Error("Safaricom rejected the credentials.");
    const { access_token } = await tokenRes.json();

    const ts = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
    const callbackSecret = Deno.env.get("MPESA_CALLBACK_SECRET") ?? "";
    const stk = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: btoa(`${shortcode}${passkey}${ts}`),
        Timestamp: ts,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: phone,
        PartyB: shortcode,
        PhoneNumber: phone,
        CallBackURL: `${url}/functions/v1/mpesa-callback?secret=${encodeURIComponent(callbackSecret)}`,
        AccountReference: bizName.slice(0, 12),
        TransactionDesc: desc.slice(0, 20),
      }),
    });
    const res = await stk.json();
    if (res.ResponseCode !== "0") throw new Error(res.errorMessage || res.ResponseDescription || "M-Pesa could not send the prompt.");
    await admin.from("payment_intents").update({
      checkout_request_id: res.CheckoutRequestID, merchant_request_id: res.MerchantRequestID,
    }).eq("id", intent.id);
    return json({ intentId: intent.id, status: "pending", message: "Check your phone for the M-Pesa prompt." });
  } catch (e) {
    await admin.from("payment_intents").update({ status: "failed", result_desc: String((e as Error).message) }).eq("id", intent.id);
    return json({ error: String((e as Error).message) }, 502);
  }
});
