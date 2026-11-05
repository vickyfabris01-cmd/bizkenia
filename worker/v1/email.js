// worker/v1/email.js — NEW FILE (replaces the Edge Function send-email)
// AIM: transactional email (approval, rejection, invitations). POST /api/v1/fn/send-email  body { to, subject, text, html? }
// Allowed for a super admin, or to your own address. With no RESEND_API_KEY the message is only logged and the call answers
// { ok: true, sent: false }, so a flow never fails because mail is not set up. When the provider REFUSES the message (or cannot be
// reached) the answer is { ok: false, sent: false, error } with status 502, so the caller can tell the person (same as the Edge Function).
// NOTE: the default sender onboarding@resend.dev only delivers to the Resend account owner's own address; verify a domain in Resend for others.
// SECRETS: RESEND_API_KEY  (resend.com > API Keys > Create; npx wrangler secret put RESEND_API_KEY)
// VARS:    MAIL_FROM       e.g. "BizKenia <no-reply@YOUR-VERIFIED-DOMAIN>" (a domain verified in Resend; default onboarding@resend.dev)
import { admin } from "./supabase.js";
import { bearer, json, readJson } from "./http.js";

export async function sendEmail(request, env) {
  const db = admin(env);
  const user = await db.userFor(bearer(request));
  if (!user) return json({ error: "Please sign in first." }, 401);
  const b = await readJson(request);
  if (!b) return json({ error: "Invalid request" }, 400);
  if (!b.to || !b.subject || !(b.text || b.html)) return json({ error: "to, subject and text are required." }, 400);

  const { data: me } = await db.one("profiles", { select: "role", filters: { id: `eq.${user.id}` } });
  if (me?.role !== "super_admin" && String(b.to).toLowerCase() !== String(user.email ?? "").toLowerCase()) return json({ error: "Not allowed." }, 403);

  if (!env.RESEND_API_KEY) {
    console.log("[send-email] no provider key; logged only:", JSON.stringify({ to: b.to, subject: b.subject }));
    return json({ ok: true, sent: false });
  }
  let res;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.MAIL_FROM || "onboarding@resend.dev", to: [b.to], subject: b.subject, text: b.text, html: b.html }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    console.log("[send-email] provider unreachable", String(e.message ?? e).slice(0, 200));
    return json({ ok: false, sent: false, error: "The email service could not be reached. Try again." }, 502);
  }
  if (!res.ok) {
    let reason = "";
    try { const body = await res.json(); reason = String(body?.message ?? body?.error ?? ""); } catch { /* not JSON */ }
    console.log("[send-email] provider error", res.status, reason.slice(0, 200));
    return json({ ok: false, sent: false, error: reason.slice(0, 300) || `The email service refused the message (${res.status}).` }, 502);
  }
  return json({ ok: true, sent: true });
}
