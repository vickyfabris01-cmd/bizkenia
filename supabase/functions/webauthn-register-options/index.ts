// webauthn-register-options — step 1 of enabling fingerprint / device-biometrics sign-in on a phone.
// The signed-in person asks for "registration options". We hand back a fresh single-use challenge and the rules the phone
// must follow: a built-in (platform) authenticator only, a discoverable passkey, and the fingerprint/face/PIN check REQUIRED.
// JWT REQUIRED: deploy WITHOUT --no-verify-jwt (the default). We also read the person from the token ourselves.
// The relying party id and the allowed web address come from the env vars WEBAUTHN_RP_ID and WEBAUTHN_ORIGIN, never from
// the request, so a page on another site cannot get a valid challenge for ours.
// deno-lint-ignore-file no-explicit-any
import { generateRegistrationOptions } from "npm:@simplewebauthn/server@13";
import { corsFor, jsonFor } from "../_shared/http.ts";
import { adminClient, signedInUser } from "../_shared/auth.ts";

const MAX_DEVICES = 5;

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
    console.error("[webauthn-register-options] WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN are not set");
    return json({ error: "Fingerprint sign-in is not set up on the server yet." }, 503);
  }

  const admin = adminClient();
  const user = await signedInUser(req, admin);
  if (!user) return json({ error: "Please sign in first." }, 401);

  await admin.rpc("webauthn_purge_challenges"); // housekeeping; a failure here does not matter

  const { data: existing, error } = await admin.from("webauthn_credentials").select("credential_id, transports").eq("user_id", user.id);
  if (error) {
    console.error("[webauthn-register-options] list failed", error.message);
    return json({ error: "Could not start. Please try again." }, 500);
  }
  if ((existing?.length ?? 0) >= MAX_DEVICES) {
    return json({ error: `You already have ${MAX_DEVICES} devices set up. Remove one first.` }, 409);
  }

  const options = await generateRegistrationOptions({
    rpName: "BizKenia",
    rpID: rp.rpID,
    userName: user.email ?? user.id,
    userDisplayName: String(user.user_metadata?.full_name || user.email || "BizKenia user"),
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    // a device the person already enrolled is refused a second time
    excludeCredentials: (existing ?? []).map((c: any) => ({ id: c.credential_id, transports: c.transports ?? [] })),
    authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "required", userVerification: "required" },
    timeout: 60_000,
  });

  const { error: saveErr } = await admin.from("webauthn_challenges").insert({ challenge: options.challenge, purpose: "register", user_id: user.id });
  if (saveErr) {
    console.error("[webauthn-register-options] challenge not saved", saveErr.message);
    return json({ error: "Could not start. Please try again." }, 500);
  }
  return json(options);
});
