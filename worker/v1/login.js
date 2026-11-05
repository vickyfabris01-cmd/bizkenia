// worker/v1/login.js — NEW FILE (replaces the Edge Function resolve-login; same rules as its current version on main)
// AIM: phone number + password sign-in (no SMS). POST /api/v1/fn/resolve-login  body { phone: "2547...", password }
// Looks the account up by phone with the service role, signs in with the account's email and password and
// returns { session: { access_token, refresh_token } }. The email is never sent back. A wrong phone and a wrong
// password give the same answer.
// Throttled IN THE DATABASE (login_throttle_begin / login_throttle_finish, migration 20261027100005_login_attempts, the same
// functions the Edge Function uses): after 5 wrong tries for one phone, or 20 from one IP, inside 15 minutes the answer is
// HTTP 429 with retry_after. Unknown phones are counted like known ones, so this reveals nothing. If the database cannot be
// reached the attempt is allowed (and logged), so a database hiccup never locks everybody out.
import { admin, anon } from "./supabase.js";
import { json, readJson } from "./http.js";

const LIMITS = { identifierMax: 5, ipMax: 20, windowSeconds: 15 * 60 };

async function beginAttempt(db, identifier, ip) {
  try {
    const { data, error } = await db.rpc("login_throttle_begin", {
      p_identifier: identifier, p_ip: ip, p_identifier_max: LIMITS.identifierMax, p_ip_max: LIMITS.ipMax, p_window_seconds: LIMITS.windowSeconds,
    });
    if (error || !data) throw new Error(error?.message ?? "no answer");
    if (data.allowed === false) return { allowed: false, retryAfter: Math.max(1, Number(data.retry_after) || 1) };
    return { allowed: true, attemptId: data.attempt_id ?? null };
  } catch (e) {
    console.error("[login] throttle begin failed, allowing the attempt", e.message);
    return { allowed: true, attemptId: null };
  }
}

async function finishAttempt(db, attemptId, success) {
  if (!attemptId) return;
  try { const { error } = await db.rpc("login_throttle_finish", { p_attempt: attemptId, p_success: success }); if (error) console.error("[login] throttle finish failed", error.message); }
  catch (e) { console.error("[login] throttle finish failed", e.message); }
}

export async function resolveLogin(request, env) {
  const FAIL = { error: "The phone number or password is not correct." };
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid request" }, 400);
  const phone = String(body.phone ?? ""), password = String(body.password ?? "");
  if (!/^254[17]\d{8}$/.test(phone) || !password) return json(FAIL, 401);

  const db = admin(env);
  // Cloudflare sets CF-Connecting-IP; a visitor cannot choose it. No header (local testing) = only the per-phone limit applies.
  const ip = (request.headers.get("CF-Connecting-IP") || "").trim().slice(0, 64) || null;
  const attempt = await beginAttempt(db, phone, ip);
  if (!attempt.allowed) {
    const minutes = Math.max(1, Math.ceil(attempt.retryAfter / 60));
    return json({ error: `Too many sign-in attempts. Please wait ${minutes} ${minutes === 1 ? "minute" : "minutes"} and try again.`, retry_after: attempt.retryAfter }, 429, { "Retry-After": String(attempt.retryAfter) });
  }

  const { data: email, error } = await db.rpc("login_email_for_phone", { p_phone: phone });
  if (error || !email) return json(FAIL, 401);
  const r = await anon(env).passwordSignIn(email, password);
  if (r.error) return json(FAIL, 401);
  await finishAttempt(db, attempt.attemptId, true);
  return json({ session: { access_token: r.session.access_token, refresh_token: r.session.refresh_token } });
}
