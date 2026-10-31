// mpesa-callback — Safaricom calls this when the customer answers the STK prompt.
// It is public (Safaricom has no login), so it is protected by a secret in the URL
// (MPESA_CALLBACK_SECRET, required: with no secret set every call is refused) and it only ever
// updates a payment that we created ourselves. The paid amount must equal the amount we asked for.
// Safe to receive twice: a payment that is already paid stays paid.
import { createClient } from "npm:@supabase/supabase-js@2";
import { logError } from "../_shared/daraja.ts";

const ok = () => new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), { headers: { "Content-Type": "application/json" } });

// compares two strings without stopping at the first difference
function same(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

Deno.serve(async (req) => {
  const expected = Deno.env.get("MPESA_CALLBACK_SECRET") ?? "";
  const given = new URL(req.url).searchParams.get("secret") ?? "";
  if (!expected || !same(given, expected)) return new Response("Forbidden", { status: 403 });

  let payload: any;
  try { payload = await req.json(); } catch { return ok(); }
  const cb = payload?.Body?.stkCallback;
  if (!cb?.CheckoutRequestID) return ok();

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: intent } = await admin.from("payment_intents").select("id, status, amount_kes").eq("checkout_request_id", cb.CheckoutRequestID).maybeSingle();
  if (!intent || intent.status === "success") return ok();

  const items: { Name: string; Value?: string | number }[] = cb.CallbackMetadata?.Item ?? [];
  const receipt = items.find((i) => i.Name === "MpesaReceiptNumber")?.Value as string | undefined;
  // A missing, empty or non-numeric Amount is NaN (Number(null) and Number("") would wrongly be 0).
  const rawAmount = items.find((i) => i.Name === "Amount")?.Value;
  const paid = (typeof rawAmount === "number" || (typeof rawAmount === "string" && rawAmount.trim() !== "")) ? Number(rawAmount) : NaN;

  if (cb.ResultCode === 0) {
    if (!Number.isFinite(paid)) {
      // Success without a usable Amount: we cannot check what was paid, so do not mark it paid.
      // It stays pending and mpesa-reconcile asks Safaricom about it.
      await logError(admin, "mpesa-callback", "Success callback without a usable Amount; left pending for reconcile", `intent ${intent.id} checkout ${cb.CheckoutRequestID}`);
      await admin.from("payment_intents").update({ note: "Callback had no usable Amount; waiting for reconcile" }).eq("id", intent.id).eq("status", "pending");
      return ok();
    }
    if (Math.round(paid) !== Number(intent.amount_kes)) {
      // Paid a different amount than asked: do not mark it paid; a super admin sorts it out by hand.
      await admin.from("payment_intents").update({
        status: "failed", result_code: 0, result_desc: `Amount mismatch: asked ${intent.amount_kes}, received ${paid}. Receipt ${receipt ?? "?"}`,
      }).eq("id", intent.id);
      return ok();
    }
    await admin.from("payment_intents").update({ result_code: 0, result_desc: cb.ResultDesc }).eq("id", intent.id);
    const { error: payErr } = await admin.rpc("mark_intent_paid", { p_intent: intent.id, p_receipt: receipt ?? null });
    if (payErr) {
      // Leave it pending so mpesa-reconcile retries; Safaricom still gets Accepted (it must not retry on its own).
      await logError(admin, "mpesa-callback", "mark_intent_paid failed; left pending for reconcile", `intent ${intent.id} checkout ${cb.CheckoutRequestID}: ${payErr.message}`);
    }
  } else {
    await admin.from("payment_intents").update({
      status: cb.ResultCode === 1032 ? "cancelled" : "failed", result_code: cb.ResultCode, result_desc: cb.ResultDesc,
    }).eq("id", intent.id);
  }
  return ok();
});
