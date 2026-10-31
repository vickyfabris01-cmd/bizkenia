// resolve-login — phone number + password sign-in (no SMS).
// The browser sends { phone: "2547…", password }. We look the account up by phone with the
// service role, sign in with the account's email and password, and return the session.
// The email is never sent back. A wrong phone and a wrong password give the same answer.
// Throttled (see _shared/rateLimit.ts): after 5 wrong tries for one phone, or 20 from one IP, inside 15 minutes
// the answer is HTTP 429 with retry_after. Unknown phones are counted like known ones, so this reveals nothing.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsFor, jsonFor } from "../_shared/http.ts";
import { beginAttempt, clientIp, finishAttempt, tooManyAttempts } from "../_shared/rateLimit.ts";


Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = jsonFor(cors);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { phone?: string; password?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const phone = String(body.phone ?? "");
  const password = String(body.password ?? "");
  const FAIL = { error: "The phone number or password is not correct." };
  if (!/^254[17]\d{8}$/.test(phone) || !password) return json(FAIL, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const attempt = await beginAttempt(admin, phone, clientIp(req));
  if (!attempt.allowed) return tooManyAttempts(attempt.retryAfter, cors);

  const { data: email, error } = await admin.rpc("login_email_for_phone", { p_phone: phone });
  if (error || !email) return json(FAIL, 401);

  const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
  const { data, error: signErr } = await anon.auth.signInWithPassword({ email, password });
  if (signErr || !data.session) return json(FAIL, 401);
  await finishAttempt(admin, attempt.attemptId, true);

  return json({ session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token } });
});
