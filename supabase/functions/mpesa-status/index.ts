// mpesa-status — the browser asks "did my payment go through?".
// Body: { intentId }. Only the person who started the payment (or a super admin) can read it.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsFor, jsonFor } from "../_shared/http.ts";


Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = jsonFor(cors);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: auth } = await admin.auth.getUser(token);
  if (!auth?.user) return json({ error: "Please sign in first." }, 401);

  let body: { intentId?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const { data: intent } = await admin.from("payment_intents")
    .select("id, user_id, status, amount_kes, mpesa_receipt, result_code, result_desc, business_id").eq("id", body.intentId ?? "").maybeSingle();
  if (!intent) return json({ error: "Payment not found." }, 404);
  const { data: me } = await admin.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (intent.user_id !== auth.user.id && me?.role !== "super_admin") return json({ error: "Not allowed." }, 403);
  const { user_id: _omit, ...safe } = intent;
  return json({ intent: safe });
});
