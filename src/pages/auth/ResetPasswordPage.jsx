// src/pages/auth/ResetPasswordPage.jsx — NEW FILE
//
// AIM
// Choose a new password after opening the reset link from the email. The link signs the person
// in temporarily; this page then changes the password. Without a valid link it explains what
// to do instead of showing a dead form.

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Alert, Button, PasswordInput } from "../../components/ui";
import AuthLayout from "../../layouts/AuthLayout.jsx";
import { useSession } from "../../store/sessionStore.js";
import { password as vPassword } from "../../lib/validate.js";
import "../../layouts/AuthLayout.css";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  const loading = useSession((s) => s.loading);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const errs = {};
    const m = vPassword(pw);
    if (m) errs.pw = m;
    if (pw !== confirm) errs.confirm = "The two passwords do not match.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const { error } = await useSession.getState().updatePassword(pw);
    setBusy(false);
    if (error) return setFormError(error);
    setDone(true);
    setTimeout(() => navigate("/", { replace: true }), 1500);
  }

  if (!loading && !user) {
    return (
      <AuthLayout title="Link expired" subtitle="This reset link is not valid any more." footer={<Link to="/login">Back to sign in</Link>}>
        <Button as={Link} to="/forgot-password" size="lg" fullWidth>Get a new link</Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password">
      {done ? (
        <Alert type="success" title="Password changed" message="Taking you to your account…" />
      ) : (
        <>
          {formError && <Alert type="error" message={formError} />}
          <form className="auth__form" onSubmit={submit} noValidate>
            <PasswordInput label="New password" autoComplete="new-password" showStrength value={pw} onChange={(e) => setPw(e.target.value)} error={errors.pw} />
            <PasswordInput label="Confirm password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
            <Button type="submit" size="lg" fullWidth loading={busy}>Change password</Button>
          </form>
        </>
      )}
    </AuthLayout>
  );
}