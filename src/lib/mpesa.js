// =============================================================================
// lib/mpesa.js — the browser's side of M-Pesa
//
//   normalizePhone(phone)                  any Kenyan number -> 254712345678 (throws if it is not one)
//   startStk({ purpose, ... })             asks the `mpesa-stk-push` Edge Function to send the prompt
//                                          (while payments are in maintenance the error says so in plain words; err.code starts with MAINTENANCE)
//   watchPayment(intentId, onChange)       polls `mpesa-status` until the payment is no longer pending
//
// The browser never talks to Safaricom: Daraja keys live in Edge Function secrets, `mpesa-callback`
// records the result, and the database decides what a successful payment changes.
// =============================================================================

/**
 * "0712345678", "+254712345678", "254712345678" and "712345678" all become "254712345678".
 * @throws {Error} when the text is not a valid Kenyan mobile number
 */
export function normalizePhone(phone) {
  if (!phone) throw new Error("Phone number is required");
  const cleaned = String(phone).replace(/[\s\-().]/g, "");
  if (/^254[17]\d{8}$/.test(cleaned)) return cleaned;
  if (/^\+254[17]\d{8}$/.test(cleaned)) return cleaned.slice(1);
  if (/^0[17]\d{8}$/.test(cleaned)) return "254" + cleaned.slice(1);
  if (/^[17]\d{8}$/.test(cleaned)) return "254" + cleaned;
  throw new Error(`Cannot parse "${phone}" as a valid Kenya phone number`);
}

import { supabase } from "../config/supabase.js";

const PAUSED = "Payments are paused for a short while. Nothing was charged. Please try again later.";

/** The server refuses prompts with code MAINTENANCE_* (503) while payments are in maintenance: always show a friendly sentence. */
function stkMessage(message, code, status) {
  const down = String(code || "").startsWith("MAINTENANCE");
  if (down && message) return message;
  if (down || status === 503) return PAUSED;
  return message || "Could not start the payment.";
}

/** Starts an M-Pesa prompt on the customer's phone. Returns { intentId, simulated }. */
export async function startStk({ purpose = "subscription", businessId, planId, phone, amount, reference }) {
  if (!supabase) throw new Error("The app is not connected to the database yet.");
  const { data, error } = await supabase.functions.invoke("mpesa-stk-push", {
    body: { purpose, businessId, planId, phone, amount, reference },
  });
  if (error) {
    let message = error.message;
    let code;
    const status = error.context?.status;
    try {
      const body = await error.context?.json?.();
      if (body?.error) message = body.error;
      code = body?.code;
    } catch { /* keep the generic message */ }
    const err = new Error(stkMessage(message, code, status));
    err.code = code || (status === 503 ? "MAINTENANCE_PAYMENTS" : undefined); // e.g. "NOT_CONFIGURED" when no Daraja credentials are set
    throw err;
  }
  if (data?.error) { const err = new Error(stkMessage(data.error, data.code)); err.code = data.code; throw err; }
  return data; // { intentId, status, simulated?, message }
}

/**
 * Calls onChange(intent) now and every few seconds until the payment is success, failed,
 * cancelled or timeout. Returns a function that stops watching.
 */
export function watchPayment(intentId, onChange, { everyMs = 3000, maxMs = 120000 } = {}) {
  let stopped = false;
  const started = Date.now();
  async function tick() {
    if (stopped) return;
    const { data } = await supabase.functions.invoke("mpesa-status", { body: { intentId } });
    if (stopped) return;
    if (data?.intent) onChange(data.intent);
    const done = data?.intent && data.intent.status !== "pending";
    if (done) return;
    if (Date.now() - started > maxMs) {
      onChange({ ...(data?.intent || { id: intentId }), status: "timeout" });
      return;
    }
    setTimeout(tick, everyMs);
  }
  tick();
  return () => { stopped = true; };
}
