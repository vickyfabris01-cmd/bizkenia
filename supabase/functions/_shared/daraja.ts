// Daraja (Safaricom M-Pesa) helpers shared by the functions that call Safaricom themselves.
// Used by mpesa-reconcile and by mpesa-stk-push (base URL, token and timestamp; the push request itself stays in mpesa-stk-push).
// Nothing here reads secrets: the caller passes the keys in, and nothing is logged except
// short messages (never keys, passkeys, tokens or phone numbers).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type DarajaEnv = "live" | "sandbox";

export const darajaBase = (env: DarajaEnv) =>
  env === "live" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";

/** yyyyMMddHHmmss, the format Daraja wants for Timestamp (same as mpesa-stk-push). */
export const darajaTimestamp = () => new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);

/** An OAuth token from the consumer key and secret. Throws a short message when Safaricom refuses. */
export async function darajaToken(env: DarajaEnv, key: string, secret: string): Promise<string> {
  const res = await fetch(`${darajaBase(env)}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: "Basic " + btoa(`${key}:${secret}`) },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error("Safaricom rejected the credentials.");
  const body = await res.json();
  if (!body?.access_token) throw new Error("Safaricom sent no token.");
  return String(body.access_token);
}

export type StkQueryResult =
  | { state: "paid" }
  | { state: "cancelled"; code: number; desc: string }
  | { state: "failed"; code: number; desc: string }
  | { state: "pending" }                       // Safaricom is still working on it: ask again later
  | { state: "error"; message: string };      // could not get an answer: leave it, ask again later

/**
 * Turns Daraja's STK Push Query answer into one of the states above. Pure, so it can be tested.
 * ResultCode 0 = paid, 1032 = the customer cancelled, 4999 = still being processed, any other
 * ResultCode = the payment failed. While a payment is still in flight Daraja answers with an HTTP
 * error (errorCode 500.001.1001, "being processed"); that is "pending", not a failure.
 */
export function readStkQuery(body: any): StkQueryResult {
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

/** Asks Daraja what happened to one STK prompt (STK Push Query). Never throws. */
export async function stkQuery(o: {
  env: DarajaEnv; token: string; shortcode: string; passkey: string; checkoutRequestId: string;
}): Promise<StkQueryResult> {
  try {
    const ts = darajaTimestamp();
    const res = await fetch(`${darajaBase(o.env)}/mpesa/stkpushquery/v1/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${o.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: o.shortcode,
        Password: btoa(`${o.shortcode}${o.passkey}${ts}`),
        Timestamp: ts,
        CheckoutRequestID: o.checkoutRequestId,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    let body: any = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    if (!body) return { state: "error", message: `Safaricom answered HTTP ${res.status} with no body.` };
    return readStkQuery(body);
  } catch (e) {
    return { state: "error", message: String((e as Error).message ?? e).slice(0, 200) };
  }
}

/**
 * The repo's error logging for server code: always console.error (shows in the function logs) and
 * also adds a row to client_errors through log_client_error, so it shows at /admin/errors.
 * Best effort: it never throws and never blocks the caller's answer to Safaricom.
 */
export async function logError(admin: SupabaseClient, where: string, message: string, detail = "") {
  console.error(`[${where}]`, message, detail);
  try {
    await admin.rpc("log_client_error", {
      p_message: `${where}: ${message}`.slice(0, 500), p_stack: detail.slice(0, 4000) || null,
      p_url: `edge:${where}`, p_agent: "edge-function", p_release: null,
    });
  } catch { /* logging must never throw */ }
}
