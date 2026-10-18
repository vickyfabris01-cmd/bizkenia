// src/components/auth/GoogleButton.jsx — NEW FILE
//
// AIM
// "Continue with Google". Starts Supabase's Google sign-in. If Google is not switched on in
// the Supabase dashboard yet (see docs/phase-1/SETUP.md), the person sees a clear message
// instead of a broken page.

import { useState } from "react";
import { Alert, Button } from "../ui";
import { useSession } from "../../store/sessionStore.js";

const G = (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
    <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
    <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.8V6.5H1.4a12 12 0 0 0 0 11l4-3.1z" />
    <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.5l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
  </svg>
);

export default function GoogleButton({ next = "", label = "Continue with Google" }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    setError("");
    const { error: e } = await useSession.getState().signInWithGoogle(next);
    if (e) { setError(/provider is not enabled|unsupported provider/i.test(e) ? "Google sign-in is not switched on yet. Use your email or phone for now." : e); setBusy(false); }
  }
  return (
    <>
      <Button type="button" variant="outline" fullWidth loading={busy} onClick={go} leftIcon={G}>{label}</Button>
      {error && <Alert type="warning" message={error} />}
    </>
  );
}