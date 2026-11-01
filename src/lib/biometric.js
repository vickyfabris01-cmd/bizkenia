// src/lib/biometric.js — NEW FILE (Part 7, job B: fingerprint / device-biometrics sign-in)
//
// AIM
// The browser half of WebAuthn sign-in, using the phone's own navigator.credentials API (no library). The server half is the
// four webauthn-* Edge Functions.
//
// HONEST LIMITS
// On the web the page cannot demand a FINGERPRINT specifically. It asks for the phone's built-in authenticator and requires the
// phone's own check (userVerification "required"); the phone decides whether that is a fingerprint, a face scan or the screen PIN.
// That is why the screens say "Fingerprint / device biometrics". A wrong finger is handled by the phone itself (it asks again or
// falls back to the PIN); the server only ever sees a finished, signed answer.
//
// WHAT IT GIVES
//   biometricSupported()            true when this browser can use a built-in authenticator (needs https or localhost)
//   deviceHasEnrolment()            true when THIS device was enrolled here before (decides if the sign-in button shows)
//   enrolFingerprint()              enrol this device for the signed-in person     -> { error, already? }
//   signInWithFingerprint()         sign in with the passkey on this device        -> { error }
//   listEnrolments() / removeEnrolment(row)   the person's enrolled devices (the database lets them see and delete only their own)
//   isThisDevice(credentialId), deviceLabel(), base64url helpers
// Every method returns { error } instead of throwing, like the session store.

import { supabase, isSupabaseConfigured } from "../config/supabase.js";
import { LOCKED_MESSAGE, useSession } from "../store/sessionStore.js";

// ── base64url (the form WebAuthn data travels in) ───────────────────────────────────────────────
export function bufToB64url(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function b64urlToBuf(str) {
  const p = String(str).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(p + "=".repeat((4 - (p.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

// ── what this device remembers ──────────────────────────────────────────────────────────────────
// Only ids of public credentials (not secret) and a hint. It lets the login page show the button on a device that was enrolled,
// without asking the server who you are.
const KEY = "bizkenia:fp:v1";
function readLocal() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { ids: Array.isArray(v.ids) ? v.ids.filter((x) => typeof x === "string") : [], hint: v.hint === true };
  } catch { return { ids: [], hint: false }; }
}
function writeLocal(v) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode: the button simply will not show */ }
}
const remember = (id) => { const v = readLocal(); writeLocal({ ids: [...new Set([...v.ids, id])], hint: v.hint }); };
const forget = (id) => { const v = readLocal(); writeLocal({ ids: v.ids.filter((x) => x !== id), hint: v.hint }); };

export const deviceHasEnrolment = () => { const v = readLocal(); return v.ids.length > 0 || v.hint; };
export const isThisDevice = (credentialId) => readLocal().ids.includes(credentialId);

export async function biometricSupported() {
  try {
    if (typeof window === "undefined" || !window.isSecureContext || !window.PublicKeyCredential || !navigator.credentials?.create) return false;
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { return false; }
}

/** A short plain name for the device list, from the browser's own description. */
export function deviceLabel() {
  const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
  if (/Android/i.test(ua)) {
    const model = ua.match(/Android[^;)]*;\s*([^;)]+)/)?.[1]?.replace(/\s+Build.*$/, "").trim();
    return model && model.length > 2 && model.length < 40 ? `Android phone (${model})` : "Android phone";
  }
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/CrOS/.test(ua)) return "Chromebook";
  if (/Windows/.test(ua)) return "Windows computer";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Linux/.test(ua)) return "Linux computer";
  return "This device";
}

// ── talking to the Edge Functions ───────────────────────────────────────────────────────────────
async function call(name, body) {
  const { data, error } = await supabase.functions.invoke(name, body ? { body } : undefined);
  if (!error) return { data, error: null };
  let message = "Something went wrong. Please try again.";
  try {
    const b = await error?.context?.json?.();
    if (b?.error) message = b.error;
  } catch { /* generic */ }
  if (/failed to fetch|network/i.test(String(error?.message))) message = "Could not reach the server. Check your internet and try again.";
  return { data: null, error: message };
}

function friendlyError(e) {
  switch (e?.name) {
    case "NotAllowedError":
    case "AbortError": return "The fingerprint check was cancelled or timed out. Please try again.";
    case "SecurityError": return "Fingerprint sign-in is not available on this web address.";
    case "NotSupportedError": return "This device cannot use fingerprint sign-in.";
    default: return "Something went wrong. Please try again.";
  }
}

// ── WebAuthn JSON <-> browser objects ───────────────────────────────────────────────────────────
const decodeCreate = (o) => ({
  ...o,
  challenge: b64urlToBuf(o.challenge),
  user: { ...o.user, id: b64urlToBuf(o.user.id) },
  excludeCredentials: (o.excludeCredentials || []).map((c) => ({ ...c, id: b64urlToBuf(c.id) })),
});
const decodeGet = (o) => ({
  ...o,
  challenge: b64urlToBuf(o.challenge),
  allowCredentials: (o.allowCredentials || []).map((c) => ({ ...c, id: b64urlToBuf(c.id) })),
});
const encodeCreated = (c) => ({
  id: c.id,
  rawId: bufToB64url(c.rawId),
  type: c.type,
  authenticatorAttachment: c.authenticatorAttachment || undefined,
  clientExtensionResults: c.getClientExtensionResults?.() || {},
  response: {
    clientDataJSON: bufToB64url(c.response.clientDataJSON),
    attestationObject: bufToB64url(c.response.attestationObject),
    transports: c.response.getTransports?.() || [],
  },
});
const encodeAsserted = (c) => ({
  id: c.id,
  rawId: bufToB64url(c.rawId),
  type: c.type,
  authenticatorAttachment: c.authenticatorAttachment || undefined,
  clientExtensionResults: c.getClientExtensionResults?.() || {},
  response: {
    clientDataJSON: bufToB64url(c.response.clientDataJSON),
    authenticatorData: bufToB64url(c.response.authenticatorData),
    signature: bufToB64url(c.response.signature),
    userHandle: c.response.userHandle ? bufToB64url(c.response.userHandle) : undefined,
  },
});

// ── enrol ───────────────────────────────────────────────────────────────────────────────────────
/** The signed-in person enables fingerprint / device biometrics on this device. */
export async function enrolFingerprint() {
  if (!isSupabaseConfigured) return { error: "The app is not connected to the database yet." };
  if (!(await biometricSupported())) return { error: "This browser or device cannot use fingerprint sign-in." };
  try {
    const { data: options, error } = await call("webauthn-register-options");
    if (error) return { error };
    const created = await navigator.credentials.create({ publicKey: decodeCreate(options) });
    if (!created) return { error: friendlyError({ name: "NotAllowedError" }) };
    const { error: verr } = await call("webauthn-register-verify", { response: encodeCreated(created), deviceLabel: deviceLabel() });
    if (verr) return { error: verr };
    remember(created.id);
    return { error: null };
  } catch (e) {
    if (e?.name === "InvalidStateError") {
      // This device already holds a passkey for the account (for example, the site data was cleared). Show the sign-in button again.
      writeLocal({ ...readLocal(), hint: true });
      return { error: null, already: true };
    }
    return { error: friendlyError(e) };
  }
}

// ── sign in ─────────────────────────────────────────────────────────────────────────────────────
/** Signs in with the passkey on this device. On success the session store holds the person, like any other sign-in. */
export async function signInWithFingerprint() {
  if (!isSupabaseConfigured) return { error: "The app is not connected to the database yet." };
  if (!(await biometricSupported())) return { error: "This browser or device cannot use fingerprint sign-in." };
  try {
    const { data: options, error } = await call("webauthn-login-options");
    if (error) return { error };
    const asserted = await navigator.credentials.get({ publicKey: decodeGet(options) });
    if (!asserted) return { error: friendlyError({ name: "NotAllowedError" }) };
    const { data, error: verr } = await call("webauthn-login-verify", { response: encodeAsserted(asserted) });
    if (verr) return { error: verr };
    const { data: out, error: otpErr } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: data.type });
    if (otpErr || !out?.session) return { error: "Could not sign you in. Please use your password." };
    remember(asserted.id);
    // Load the profile before returning, so the caller can route by role straight away (same as the password sign-in).
    await useSession.getState()._apply(out.session);
    if (useSession.getState().locked) return { error: LOCKED_MESSAGE };
    return { error: null };
  } catch (e) {
    return { error: friendlyError(e) };
  }
}

// ── the person's enrolled devices ───────────────────────────────────────────────────────────────
/** Rows are filtered by the database: a person only ever sees their own. The public key and counter are never readable. */
export async function listEnrolments() {
  if (!supabase) return { data: [], error: "The app is not connected to the database yet." };
  const { data, error } = await supabase.from("webauthn_credentials")
    .select("id, credential_id, device_label, created_at, last_used_at").order("created_at", { ascending: true });
  return { data: data || [], error: error ? "Could not load your devices. Please try again." : null };
}

/** Removes one device. Allowed from any signed-in session; the database only deletes the person's own rows. */
export async function removeEnrolment(row) {
  if (!supabase) return { error: "The app is not connected to the database yet." };
  const { data, error } = await supabase.from("webauthn_credentials").delete().eq("id", row.id).select("id");
  if (error || !data?.length) return { error: "Could not remove this device. Please try again." };
  forget(row.credential_id);
  return { error: null };
}
