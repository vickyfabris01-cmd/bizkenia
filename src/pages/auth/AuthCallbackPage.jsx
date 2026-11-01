// src/pages/auth/AuthCallbackPage.jsx — MODIFIED (Part 7: a Google account without a phone number is asked for one first)
//
// AIM
// Where Google sign-in and email-confirmation links land (/auth/callback). Supabase reads the
// code or token from the address by itself; this page waits for the session, then sends the
// person on to ?next=… (default: see lib/landing.js). If nothing arrives it shows a way back.
// A Google account whose profile has no phone number sees the "Add your phone number" step (components/auth/AfterSignIn.jsx)
// before anything else; once it is saved the page carries on to the normal destination.

import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Spinner } from "../../components/ui";
import AuthLayout from "../../layouts/AuthLayout.jsx";
import { useSession } from "../../store/sessionStore.js";
import { landingFor, safeNext } from "../../lib/landing.js";
import { PhoneStep, needsPhone } from "../../components/auth/AfterSignIn.jsx";

export default function AuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  const profile = useSession((s) => s.profile);
  const [late, setLate] = useState(false);
  const phoneFirst = needsPhone(user, profile);

  useEffect(() => {
    if (!user || !profile || phoneFirst) return undefined;
    let alive = true;
    landingFor(profile, user.id).then((to) => {
      if (alive) navigate(safeNext(params.get("next"), to), { replace: true });
    });
    return () => { alive = false; };
  }, [user, profile, phoneFirst, navigate, params]);

  useEffect(() => {
    const t = setTimeout(() => setLate(true), 8000);
    return () => clearTimeout(t);
  }, []);

  if (phoneFirst) return <PhoneStep />;

  const err = params.get("error_description");
  return (
    <AuthLayout title={err || late ? "We could not sign you in" : "Signing you in…"}>
      {err || late ? (
        <>
          <p style={{ margin: 0, textAlign: "center", color: "var(--color-text-muted)" }}>{err || "The link may have expired. Try again."}</p>
          <Button as={Link} to="/login" size="lg" fullWidth>Back to sign in</Button>
        </>
      ) : (
        <div style={{ display: "grid", placeItems: "center" }}><Spinner size="lg" label="Signing you in" /></div>
      )}
    </AuthLayout>
  );
}