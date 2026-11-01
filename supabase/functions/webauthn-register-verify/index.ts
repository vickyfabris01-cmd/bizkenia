// webauthn-register-verify — step 2 of enabling fingerprint / device-biometrics sign-in.
// The phone has made a new passkey. We use up the challenge we issued to THIS person (single use), check the phone's answer
// (right web address, right relying party, the fingerprint/face/PIN check really happened) and, only then, save the PUBLIC key.
// JWT REQUIRED: deploy WITHOUT --no-verify-jwt (the default). We also read the person from the token ourselves.
// Env: WEBAUTHN_RP_ID, WEBAUTHN_ORIGIN (see webauthn-register-options).
// deno-lint-ignore-file no-explicit-any
import { verifyRegistrationResponse } from "npm:@simplewebauthn/server@13";
import { corsFor, jsonFor } from "../_shared/http.ts";
import { adminClient, signedInUser } from "../_shared/auth.ts";

const MAX_DEVICES = 5;
const TRANSPORTS = ["internal", "hybrid", "usb", "nfc", "ble", "smart-card"];

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
const bytesToB64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
/** The challenge the phone signed, read from clientDataJSON (it is checked again by the library afterwards). */
function challengeOf(clientDataJSON: unknown): string | null {
  try {
    const o = JSON.parse(new TextDecoder().decode(b64uToBytes(String(clientDataJSON))));
    return typeof o.challenge === "string" ? o.challenge : null;
  } catch { return null; }
}
/** A short, plain label for the device list. */
const cleanLabel = (v: unknown) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "This device";

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = jsonFor(cors);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const rp = rpConfig();
  if (!rp) {
    console.error("[webauthn-register-verify] WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN are not set");
    return json({ error: "Fingerprint sign-in is not set up on the server yet." }, 503);
  }

  const admin = adminClient();
  const user = await signedInUser(req, admin);
  if (!user) return json({ error: "Please sign in first." }, 401);

  let body: { response?: any; deviceLabel?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const response = body.response;
  const challenge = challengeOf(response?.response?.clientDataJSON);
  if (!challenge) return json({ error: "Invalid request" }, 400);

  // Use the challenge up first: whatever happens next, it can never be used a second time.
  const { data: fresh } = await admin.rpc("webauthn_consume_challenge", { p_challenge: challenge, p_purpose: "register", p_user: user.id });
  if (fresh !== true) return json({ error: "This request has expired. Please try again." }, 400);

  let result;
  try {
    result = await verifyRegistrationResponse({
      response, expectedChallenge: challenge, expectedOrigin: rp.origins, expectedRPID: rp.rpID, requireUserVerification: true,
    });
  } catch (e) {
    console.error("[webauthn-register-verify] verification failed", (e as Error).message);
    return json({ error: "We could not verify this device. Please try again." }, 400);
  }
  if (!result.verified || !result.registrationInfo) return json({ error: "We could not verify this device. Please try again." }, 400);

  const { count } = await admin.from("webauthn_credentials").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if ((count ?? 0) >= MAX_DEVICES) return json({ error: `You already have ${MAX_DEVICES} devices set up. Remove one first.` }, 409);

  const cred = result.registrationInfo.credential;
  const reported = Array.isArray(response?.response?.transports) ? response.response.transports : [];
  const transports = (cred.transports ?? reported).filter((t: unknown) => typeof t === "string" && TRANSPORTS.includes(t));
  const { data: row, error } = await admin.from("webauthn_credentials").insert({
    user_id: user.id,
    credential_id: cred.id,
    public_key: bytesToB64u(cred.publicKey),
    counter: cred.counter,
    transports,
    device_label: cleanLabel(body.deviceLabel),
  }).select("id, credential_id").single();
  if (error) {
    if (error.code === "23505") return json({ error: "This device is already set up." }, 409);
    console.error("[webauthn-register-verify] save failed", error.message);
    return json({ error: "Could not save this device. Please try again." }, 500);
  }
  return json({ ok: true, id: row.id, credential_id: row.credential_id });
});
