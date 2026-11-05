// worker/v1/login.js — NEW FILE (replaces the Edge Function resolve-login)
// AIM: phone number + password sign-in (no SMS). POST /api/v1/fn/resolve-login  body { phone: "2547...", password }
// Looks the account up by phone with the service role, signs in with the account's email and password and
// returns { session: { access_token, refresh_token } }. The email is never sent back. A wrong phone and a wrong
// password give the same answer. A visitor may try 8 times a minute (best effort, see http.js tooMany).
import { admin, anon } from "./supabase.js";
import { clientIp, json, readJson, tooMany } from "./http.js";

export async function resolveLogin(request, env) {
  const FAIL = { error: "The phone number or password is not correct." };
  if (tooMany(`login:${clientIp(request)}`, 8, 60_000)) return json({ error: "Too many tries. Wait a minute and try again." }, 429);
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid request" }, 400);
  const phone = String(body.phone ?? ""), password = String(body.password ?? "");
  if (!/^254[17]\d{8}$/.test(phone) || !password) return json(FAIL, 401);

  const { data: email, error } = await admin(env).rpc("login_email_for_phone", { p_phone: phone });
  if (error || !email) return json(FAIL, 401);
  const r = await anon(env).passwordSignIn(email, password);
  if (r.error) return json(FAIL, 401);
  return json({ session: { access_token: r.session.access_token, refresh_token: r.session.refresh_token } });
}
