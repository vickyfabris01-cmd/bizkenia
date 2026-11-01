// webauthn-login-verify — step 2 of signing in with fingerprint / device biometrics.
// PUBLIC (nobody is signed in yet): deploy WITH --no-verify-jwt.
// The phone has signed our challenge with the passkey. In this order we: throttle, use up the challenge (single use, so a
// replayed answer finds nothing), find the passkey, verify the signature, web address, relying party and the
// fingerprint/face/PIN check, check the signature counter, make sure the account is switched on, then create a session.
// The session is made with the admin API: generateLink(magiclink) returns a one-time token hash (no email is sent) and the
// browser trades it for a normal session with supabase.auth.verifyOtp({ token_hash, type: "magiclink" }).
// Every failure gives the same plain answer, so nothing says whether a passkey or account exists.
// Throttle: 5 failures per passkey and 20 per address inside 15 minutes (see _shared/rateLimit.ts); identifier "fp:<credential id>".
// Env: WEBAUTHN_RP_ID, WEBAUTHN_ORIGIN (see webauthn-register-options).
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyAuthenticationResponse } from "npm:@simplewebauthn/server@13";
import { corsFor, jsonFor } from "../_shared/http.ts";
import { beginAttempt, clientIp, finishAttempt, tooManyAttempts } from "../_shared/rateLimit.ts";

const FAIL = { error: "Fingerprint sign-in did not work. Please use your password." };

// (The same small helpers are in the other three webauthn-* functions; a shared file was not in this part's file list.)
function rpConfig() {
  const rpID = (Deno.env.get("WEBAUTHN_RP_ID") ?? "").trim();
  const origins = (Deno.env.get("WEBAUTHN_ORIGIN") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return rpID && origins.length ? { rpID, origins } : null;
}
function b64uToBytes(s: string): Uint8Array {
  const p = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(p + "=".repeat((4 - (p.length % 4)) % 4)), (c) => c.charCodeAt(0));
}
/** The challenge the phone signed, read from clientDataJSON (it is checked again by the library afterwards). */
function challengeOf(clientDataJSON: unknown): string | null {
  try {
    const o = JSON.parse(new TextDecoder().decode(b64uToBytes(String(clientDataJSON))));
    return typeof o.challenge === "string" ? o.challenge : null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = jsonFor(cors);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const rp = rpConfig();
  if (!rp) {
    console.error("[webauthn-login-verify] WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN are not set");
    return json({ error: "Fingerprint sign-in is not set up on the server yet." }, 503);
  }

  let body: { response?: any };
  try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const response = body.response;
  const credentialId = response?.id;
  if (typeof credentialId !== "string" || !/^[A-Za-z0-9_-]{1,512}$/.test(credentialId) || typeof response?.response?.clientDataJSON !== "string") {
    return json(FAIL, 400);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // Throttle first, so guessing is slowed even when the passkey id is made up.
  const attempt = await beginAttempt(admin, `fp:${credentialId}`, clientIp(req));
  if (!attempt.allowed) return tooManyAttempts(attempt.retryAfter, cors);

  // Use up the challenge: a second answer to the same challenge finds nothing.
  const challenge = challengeOf(response.response.clientDataJSON);
  if (!challenge) return json(FAIL, 401);
  const { data: fresh } = await admin.rpc("webauthn_consume_challenge", { p_challenge: challenge, p_purpose: "login", p_user: null });
  if (fresh !== true) return json(FAIL, 401);

  const { data: cred, error: credErr } = await admin.from("webauthn_credentials")
    .select("id, user_id, credential_id, public_key, counter, transports").eq("credential_id", credentialId).maybeSingle();
  if (credErr || !cred) return json(FAIL, 401);

  let result;
  try {
    result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origins,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
      credential: { id: cred.credential_id, publicKey: b64uToBytes(cred.public_key), counter: Number(cred.counter), transports: cred.transports ?? [] },
    });
  } catch (e) {
    // Includes a counter that did not move forward (a possibly cloned passkey): refused and logged.
    console.error("[webauthn-login-verify] verification failed", (e as Error).message);
    return json(FAIL, 401);
  }
  if (!result.verified) return json(FAIL, 401);

  // A switched-off account cannot sign in (the answer is only given to someone who really holds the passkey).
  const { data: profile } = await admin.from("profiles").select("is_active").eq("id", cred.user_id).maybeSingle();
  if (profile && profile.is_active === false) return json({ error: "This account has been switched off. Please contact support." }, 403);

  const { error: updErr } = await admin.from("webauthn_credentials")
    .update({ counter: result.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq("id", cred.id);
  if (updErr) { console.error("[webauthn-login-verify] counter not saved", updErr.message); return json(FAIL, 500); }

  const { data: found } = await admin.auth.admin.getUserById(cred.user_id);
  const email = found?.user?.email;
  if (!email) return json(FAIL, 401);
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    console.error("[webauthn-login-verify] session link failed", linkErr?.message);
    return json({ error: "Could not sign you in. Please use your password." }, 500);
  }

  await finishAttempt(admin, attempt.attemptId, true);
  return json({ token_hash: tokenHash, type: "magiclink" });
});
