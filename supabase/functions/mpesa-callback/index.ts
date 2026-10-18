// mpesa-callback — Safaricom calls this when the customer answers the STK prompt.
// It is public (Safaricom has no login), so it is protected by a secret in the URL
// (MPESA_CALLBACK_SECRET, required: with no secret set every call is refused) and it only ever
// updates a payment that we created ourselves. The paid amount must equal the amount we asked for.
// Safe to receive twice: a payment that is already paid stays paid.
import { createClient } from "npm:@supabase/supabase-js@2";

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
  const paid = Number(items.find((i) => i.Name === "Amount")?.Value);

  if (cb.ResultCode === 0) {
    if (Number.isFinite(paid) && Math.round(paid) !== Number(intent.amount_kes)) {
      // Paid a different amount than asked: do not mark it paid; a super admin sorts it out by hand.
      await admin.from("payment_intents").update({
        status: "failed", result_code: 0, result_desc: `Amount mismatch: asked ${intent.amount_kes}, received ${paid}. Receipt ${receipt ?? "?"}`,
      }).eq("id", intent.id);
      return ok();
    }
    await admin.from("payment_intents").update({ result_code: 0, result_desc: cb.ResultDesc }).eq("id", intent.id);
    await admin.rpc("mark_intent_paid", { p_intent: intent.id, p_receipt: receipt ?? null });
  } else {
    await admin.from("payment_intents").update({
      status: cb.ResultCode === 1032 ? "cancelled" : "failed", result_code: cb.ResultCode, result_desc: cb.ResultDesc,
    }).eq("id", intent.id);
  }
  return ok();
});
