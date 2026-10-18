// src/pages/auth/ConfirmPage.jsx — NEW FILE
//
// AIM
// "Check your email". Shown after sign-up when the email must be confirmed. The person can
// resend the link (with a short wait between sends).

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Alert, Button, Icon } from "../../components/ui";
import AuthLayout from "../../layouts/AuthLayout.jsx";
import { useSession } from "../../store/sessionStore.js";

export default function ConfirmPage() {
  const [params] = useSearchParams();
  const email = params.get("email") || "";
  const [wait, setWait] = useState(30);
  const [msg, setMsg] = useState({ type: "", text: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function resend() {
    setBusy(true);
    const { error } = await useSession.getState().resendConfirmation(email);
    setBusy(false);
    setMsg(error ? { type: "error", text: error } : { type: "success", text: "We sent the link again." });
    if (!error) setWait(30);
  }

  return (
    <AuthLayout title="Check your email"
      subtitle={email ? `We sent a confirmation link to ${email}.` : "We sent you a confirmation link."}
      footer={<Link to="/login">Back to sign in</Link>}>
      <div style={{ display: "grid", placeItems: "center", color: "var(--color-primary)" }}><Icon name="bell" size={40} /></div>
      <p style={{ margin: 0, textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
        Open the email and tap the link to confirm your account. Look in your spam folder if you cannot find it.
      </p>
      {msg.text && <Alert type={msg.type} message={msg.text} />}
      {email && <Button variant="outline" fullWidth disabled={wait > 0} loading={busy} onClick={resend}>
        {wait > 0 ? `Resend email in ${wait}s` : "Resend email"}
      </Button>}
    </AuthLayout>
  );
}
