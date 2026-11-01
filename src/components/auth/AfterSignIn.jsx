// src/components/auth/AfterSignIn.jsx — MODIFIED (Part 7: the "Add your phone number" step for Google accounts)
//
// AIM
// Shown when a signed-in person opens the login or sign-up page: works out where they belong
// (see lib/landing.js) and sends them there. `next` (from ?next=…) wins when it is safe.
//
// PHONE STEP (Part 7)
// A person who signs in with Google has no password and no phone number, so phone sign-in and M-Pesa prompts would
// not work for them. needsPhone() is true for a Google account whose profile has no phone number; while it is true,
// <PhoneStep/> is shown instead of sending the person on. AuthCallbackPage.jsx uses the same two exports, because
// Google sends people back to /auth/callback. When the number is saved the profile reloads, needsPhone() turns false
// and the normal onboarding carries on. Password sign-in (email or phone) never shows this step.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, PhoneInput } from "../ui";
import { FullPageLoader } from "../../router/guards.jsx";
import AuthLayout from "../../layouts/AuthLayout.jsx";
import { supabase } from "../../config/supabase.js";
import { useSession } from "../../store/sessionStore.js";
import { landingFor, safeNext } from "../../lib/landing.js";
import { toE164 } from "../../lib/phone.js";
import { phone as vPhone } from "../../lib/validate.js";
import "../../layouts/AuthLayout.css";

/** True for a Google account whose profile has no phone number yet. */
export function needsPhone(user, profile) {
  if (!user || !profile || profile.phone) return false;
  const meta = user.app_metadata || {};
  return meta.provider === "google" || (Array.isArray(meta.providers) && meta.providers.includes("google"));
}

/** "Add your phone number": one field, checked for a valid Kenyan mobile and for not being used by another account. */
export function PhoneStep() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const bad = vPhone(phone);
    if (bad) return setError(bad);
    setError("");
    setBusy(true);
    const e164 = toE164(phone);
    const { data: free } = await supabase.rpc("phone_available", { p_phone: e164 });
    if (free === false) {
      setBusy(false);
      return setError("This phone number is already used by another account. Use a different number.");
    }
    const { error: err } = await useSession.getState().updateProfile({ phone });
    setBusy(false);
    if (err) setError(err);
    // On success the profile reloads, needsPhone() turns false and the page moves on by itself.
  }

  async function signOut() {
    await useSession.getState().signOut();
    navigate("/login", { replace: true });
  }

  return (
    <AuthLayout title="Add your phone number" subtitle="You signed in with Google. Your phone number lets you sign in with it later and receive M-Pesa prompts.">
      {error && <Alert type="error" message={error} />}
      <form className="auth__form" onSubmit={submit} noValidate>
        <PhoneInput label="Phone number" required autoFocus value={phone} onChange={setPhone}
          helper="A Safaricom or Airtel number, like 0712 345 678." />
        <Button type="submit" size="lg" fullWidth loading={busy}>Save and continue</Button>
        <Button type="button" variant="ghost" fullWidth disabled={busy} onClick={signOut}>Sign out</Button>
      </form>
    </AuthLayout>
  );
}

export default function AfterSignIn({ next }) {
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  const profile = useSession((s) => s.profile);
  const phoneFirst = needsPhone(user, profile);

  useEffect(() => {
    if (!user || !profile || phoneFirst) return undefined;
    let alive = true;
    landingFor(profile, user.id).then((to) => {
      if (alive) navigate(safeNext(next, to), { replace: true });
    });
    return () => { alive = false; };
  }, [user, profile, phoneFirst, next, navigate]);

  if (phoneFirst) return <PhoneStep />;
  return <FullPageLoader />;
}
