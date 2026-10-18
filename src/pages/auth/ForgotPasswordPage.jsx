// src/pages/auth/ForgotPasswordPage.jsx — NEW FILE
//
// AIM
// Ask for a password-reset link by email. The reply is the same whether or not the email has
// an account, so the page cannot be used to find out who is registered.

import { useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Input } from "../../components/ui";
import AuthLayout from "../../layouts/AuthLayout.jsx";
import { useSession } from "../../store/sessionStore.js";
import { email as vEmail } from "../../lib/validate.js";
import "../../layouts/AuthLayout.css";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const msg = vEmail(email);
    setError(msg);
    if (msg) return;
    setBusy(true);
    const { error: err } = await useSession.getState().sendPasswordReset(email);
    setBusy(false);
    if (err && !/rate|too many/i.test(err)) console.warn("[reset]", err);
    if (err && /rate|too many/i.test(err)) return setError(err);
    setSent(true);
  }

  return (
    <AuthLayout title="Reset your password" subtitle="Enter your email and we will send you a link."
      footer={<Link to="/login">Back to sign in</Link>}>
      {sent ? (
        <Alert type="success" title="Check your email" message="If an account exists for that email, a reset link is on its way." />
      ) : (
        <form className="auth__form" onSubmit={submit} noValidate>
          <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} />
          <Button type="submit" size="lg" fullWidth loading={busy}>Send reset link</Button>
        </form>
      )}
    </AuthLayout>
  );
}
