// webauthn-login-options — step 1 of signing in with fingerprint / device biometrics.
// PUBLIC (nobody is signed in yet): deploy WITH --no-verify-jwt.
// Hands out a fresh single-use challenge. No account is named: the phone shows the passkeys it holds for this site and the
// person picks one (a "discoverable" passkey), so nothing here reveals whether an account exists.
// Throttle: a generous per-address limit (this endpoint gives nothing away, the limit only stops someone filling the
// challenge table). The address is NOT counted in the shared per-IP bucket of the sign-in throttle, because many Kenyan
// mobile customers share one address and must not lock each other out. See _shared/rateLimit.ts.
// Env: WEBAUTHN_RP_ID, WEBAUTHN_ORIGIN (see webauthn-register-options).
import { createClient } from "npm:@supabase/supabase-js@2";
import { generateAuthenticationOptions } from "npm:@simplewebauthn/server@13";
import { corsFor, jsonFor } from "../_shared/http.ts";
import { beginAttempt, clientIp, tooManyAttempts } from "../_shared/rateLimit.ts";

/** 120 requests per address per 15 minutes. ipMax is unused because the address is passed as the identifier, not as the ip. */
const OPTIONS_LIMITS = { identifierMax: 120, ipMax: 1_000_000, windowSeconds: 15 * 60 };

// (The same small helper is in the other three webauthn-* functions; a shared file was not in this part's file list.)
function rpConfig() {
  const rpID = (Deno.env.get("WEBAUTHN_RP_ID") ?? "").trim();
  const origins = (Deno.env.get("WEBAUTHN_ORIGIN") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return rpID && origins.length ? { rpID, origins } : null;
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = jsonFor(cors);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const rp = rpConfig();
  if (!rp) {
    console.error("[webauthn-login-options] WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN are not set");
    return json({ error: "Fingerprint sign-in is not set up on the server yet." }, 503);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // Without a trustworthy address header there is nothing to count against, so the request goes ahead.
  const ip = clientIp(req);
  if (ip) {
    const attempt = await beginAttempt(admin, `fpo:${ip}`, null, OPTIONS_LIMITS);
    if (!attempt.allowed) return tooManyAttempts(attempt.retryAfter, cors);
  }

  await admin.rpc("webauthn_purge_challenges"); // housekeeping; a failure here does not matter

  const options = await generateAuthenticationOptions({ rpID: rp.rpID, userVerification: "required", timeout: 60_000 });
  const { error } = await admin.from("webauthn_challenges").insert({ challenge: options.challenge, purpose: "login", user_id: null });
  if (error) {
    console.error("[webauthn-login-options] challenge not saved", error.message);
    return json({ error: "Could not start. Please try again." }, 500);
  }
  return json(options);
});
