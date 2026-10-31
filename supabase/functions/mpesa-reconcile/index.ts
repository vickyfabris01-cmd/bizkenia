// mpesa-reconcile — finds M-Pesa payments whose callback never arrived (or could not be applied) and
// asks Safaricom what happened (STK Push Query), so a customer who was charged still gets activated.
// Run every 2 minutes by the scheduler (see the Part 3 report). Deploy WITHOUT the sign-in check and
// protect it with the CRON_SECRET secret, sent in the x-cron-secret header (same as purge-closed-businesses):
//   supabase functions deploy mpesa-reconcile --no-verify-jwt
// Takes payment_intents that are still pending, older than 2 minutes and younger than 24 hours, at most
// 50 per run, and not looked at in the last 90 seconds. Paid -> mark_intent_paid (same RPC as the callback).
// Cancelled or failed -> marked so. Still processing, or no answer -> left pending for the next run.
// The query does not return an amount, so the amount asked for at STK push time is the amount trusted.
// Credentials follow mpesa-stk-push: subscriptions use the platform's passkey and shortcode; rent needs the
// business's own saved paybill/till; an order uses the shop's own when saved, else the platform's (sandbox only).
// Answers { checked, paid, cancelled, failed, pending, skipped, errors }.
import { adminClient } from "../_shared/auth.ts";
import { darajaToken, logError, stkQuery, type DarajaEnv } from "../_shared/daraja.ts";

const MIN_AGE_MS = 2 * 60_000;
const MAX_AGE_MS = 24 * 3_600_000;
const RECHECK_MS = 90_000;
const MAX_PER_RUN = 50;
const PARALLEL = 5;

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// compares two strings without stopping at the first difference
function same(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  // Fail closed: with no secret set every call is refused.
  const expected = Deno.env.get("CRON_SECRET") ?? "";
  const given = req.headers.get("x-cron-secret") ?? "";
  if (!expected || !same(given, expected)) return reply({ error: "Forbidden" }, 403);

  const key = Deno.env.get("MPESA_CONSUMER_KEY");
  const secret = Deno.env.get("MPESA_CONSUMER_SECRET");
  if (!key || !secret) return reply({ error: "M-Pesa is not set up on this server yet.", code: "NOT_CONFIGURED" }, 503);

  const admin = adminClient();
  const { data: setting } = await admin.from("platform_settings").select("value").eq("key", "mpesa").maybeSingle();
  const env: DarajaEnv = setting?.value?.env === "live" ? "live" : "sandbox";
  const platformShortcode: string = Deno.env.get("MPESA_SHORTCODE") || setting?.value?.shortcode || "174379";
  const platformPasskey = Deno.env.get("MPESA_PASSKEY") ?? "";

  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const recheckBefore = iso(now - RECHECK_MS);
  const eligible = `last_checked_at.is.null,last_checked_at.lt.${recheckBefore}`;

  const { data: rows, error: listErr } = await admin.from("payment_intents")
    .select("id, business_id, purpose, check_count, checkout_request_id")
    .eq("status", "pending").eq("method", "mpesa_stk").not("checkout_request_id", "is", null)
    .lt("created_at", iso(now - MIN_AGE_MS)).gt("created_at", iso(now - MAX_AGE_MS))
    .or(eligible)
    .order("last_checked_at", { ascending: true, nullsFirst: true }).order("created_at", { ascending: true })
    .limit(MAX_PER_RUN);
  if (listErr) {
    await logError(admin, "mpesa-reconcile", "Could not list pending payments", listErr.message);
    return reply({ error: "Could not list pending payments." }, 500);
  }

  const out = { checked: 0, paid: 0, cancelled: 0, failed: 0, pending: 0, skipped: 0, errors: 0 };
  let token: Promise<string> | null = null;   // one OAuth token per run, fetched when first needed

  async function handle(row: { id: string; business_id: string | null; purpose: string; check_count: number | null; checkout_request_id: string }) {
    // Claim it: a second overlapping run cannot pick the same payment within 90 seconds.
    const { data: claimed } = await admin.from("payment_intents")
      .update({ last_checked_at: iso(Date.now()), check_count: (row.check_count ?? 0) + 1 })
      .eq("id", row.id).eq("status", "pending").or(eligible).select("id");
    if (!claimed?.length) { out.skipped++; return; }

    // Whose paybill/till and passkey this payment went to.
    let shortcode = platformShortcode, passkey = platformPasskey;
    if (row.purpose !== "subscription") {
      let own = false;
      if (row.business_id) {
        const { data: ts } = await admin.from("tenant_settings").select("mpesa_shortcode").eq("tenant_id", row.business_id).maybeSingle();
        const { data: sec } = await admin.from("tenant_secrets").select("mpesa_passkey").eq("tenant_id", row.business_id).maybeSingle();
        if (ts?.mpesa_shortcode && sec?.mpesa_passkey) { shortcode = ts.mpesa_shortcode; passkey = sec.mpesa_passkey; own = true; }
      }
      // Rent always needs the business's own; an order may use the platform's only in the sandbox.
      if (!own && !(row.purpose === "order" && env !== "live")) {
        out.skipped++;
        await logError(admin, "mpesa-reconcile", "No M-Pesa credentials to check this payment with", `intent ${row.id} purpose ${row.purpose}`);
        return;
      }
    }
    if (!passkey) {
      out.skipped++;
      await logError(admin, "mpesa-reconcile", "MPESA_PASSKEY is not set; cannot check payment", `intent ${row.id}`);
      return;
    }

    let tok: string;
    try { tok = await (token ??= darajaToken(env, key!, secret!)); }
    catch (e) {
      token = null; out.errors++;
      await logError(admin, "mpesa-reconcile", "Could not get a Safaricom token", String((e as Error).message));
      return;
    }

    out.checked++;
    const r = await stkQuery({ env, token: tok, shortcode, passkey, checkoutRequestId: row.checkout_request_id });

    if (r.state === "paid") {
      const { error } = await admin.rpc("mark_intent_paid", { p_intent: row.id, p_receipt: null });
      if (error) {
        out.errors++;
        await logError(admin, "mpesa-reconcile", "mark_intent_paid failed; left pending, will retry", `intent ${row.id}: ${error.message}`);
        return;
      }
      out.paid++;
      await admin.from("payment_intents").update({ result_code: 0, result_desc: "Confirmed by reconcile (STK query)" }).eq("id", row.id);
    } else if (r.state === "cancelled" || r.state === "failed") {
      // Only while still pending, so it can never undo a payment the callback just confirmed.
      const { error } = await admin.from("payment_intents")
        .update({ status: r.state === "cancelled" ? "cancelled" : "failed", result_code: r.code, result_desc: r.desc })
        .eq("id", row.id).eq("status", "pending");
      if (error) { out.errors++; await logError(admin, "mpesa-reconcile", "Could not mark payment " + r.state, `intent ${row.id}: ${error.message}`); }
      else out[r.state]++;
    } else if (r.state === "pending") {
      out.pending++;
    } else {
      out.errors++;
      await logError(admin, "mpesa-reconcile", "STK query gave no answer; left pending", `intent ${row.id}: ${r.message}`);
    }
  }

  for (let i = 0; i < (rows ?? []).length; i += PARALLEL) {
    await Promise.all((rows ?? []).slice(i, i + PARALLEL).map((row) =>
      handle(row).catch(async (e) => { out.errors++; await logError(admin, "mpesa-reconcile", "Unexpected error", `intent ${row.id}: ${String((e as Error).message)}`); })));
  }
  return reply(out);
});
