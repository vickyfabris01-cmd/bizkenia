// send-email — transactional email (approval, rejection, invitations).
// Body: { to, subject, text, html? }. Allowed for a super admin, or to your own address.
// With no RESEND_API_KEY the message is only logged and the call still succeeds, so a flow
// never fails because mail is not set up. Optional secret MAIL_FROM (default onboarding@resend.dev).
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

  let b: { to?: string; subject?: string; text?: string; html?: string };
  try { b = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }
  if (!b.to || !b.subject || !(b.text || b.html)) return json({ error: "to, subject and text are required." }, 400);

  const { data: me } = await admin.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (me?.role !== "super_admin" && b.to.toLowerCase() !== (auth.user.email ?? "").toLowerCase()) {
    return json({ error: "Not allowed." }, 403);
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.log("[send-email] no provider key; logged only:", JSON.stringify({ to: b.to, subject: b.subject }));
    return json({ ok: true, sent: false });
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: Deno.env.get("MAIL_FROM") ?? "onboarding@resend.dev", to: [b.to], subject: b.subject, text: b.text, html: b.html }),
  });
  if (!res.ok) { console.log("[send-email] provider error", res.status); return json({ ok: true, sent: false }); }
  return json({ ok: true, sent: true });
});
