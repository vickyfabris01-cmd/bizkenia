// src/pages/auth/SignupPage.jsx — NEW FILE
//
// AIM
// Create an account with name, email, phone number and password (or Google). The phone number
// is what lets the person sign in later with phone + password. After sign-up the person is
// asked to confirm their email (the confirmation page also lets them resend the link).

import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Button, Checkbox, Input, PasswordInput, PhoneInput } from "../../components/ui";
import GoogleButton from "../../components/auth/GoogleButton.jsx";
import AuthLayout from "../../layouts/AuthLayout.jsx";
import { useSession } from "../../store/sessionStore.js";
import { collect, email as vEmail, password as vPassword, phone as vPhone, required } from "../../lib/validate.js";
import AfterSignIn from "../../components/auth/AfterSignIn.jsx";
import { safeNext } from "../../lib/landing.js";
import "../../layouts/AuthLayout.css";

export default function SignupPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  const next = safeNext(params.get("next"), "/");
  const [f, setF] = useState({ fullName: "", email: "", phone: "", password: "", agree: false });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v && v.target ? v.target.value : v }));

  if (user) return <AfterSignIn next={params.get("next")} />;

  async function submit(e) {
    e.preventDefault();
    const errs = collect({
      fullName: required(f.fullName, "Your name"),
      email: vEmail(f.email),
      phone: vPhone(f.phone),
      password: vPassword(f.password),
      agree: f.agree ? "" : "Please accept the terms to continue.",
    });
    setErrors(errs);
    setFormError("");
    if (Object.keys(errs).length) return;
    setBusy(true);
    const res = await useSession.getState().signUp({ fullName: f.fullName, email: f.email, phone: f.phone, password: f.password });
    setBusy(false);
    if (res.error) return setFormError(res.error);
    if (res.needsConfirmation) return navigate(`/confirm?email=${encodeURIComponent(res.email)}`, { replace: true });
    navigate(next, { replace: true });
  }

  return (
    <AuthLayout title="Create your account" subtitle="One account for all your businesses."
      footer={<span>Already have an account? <Link to={`/login${params.get("next") ? `?next=${encodeURIComponent(params.get("next"))}` : ""}`}>Sign in</Link></span>}>
      {formError && <Alert type="error" message={formError} />}
      <form className="auth__form" onSubmit={submit} noValidate>
        <Input label="Full name" autoComplete="name" required value={f.fullName} onChange={set("fullName")} error={errors.fullName} />
        <Input label="Email" type="email" autoComplete="email" required value={f.email} onChange={set("email")} error={errors.email} />
        <PhoneInput label="Phone number" required value={f.phone} onChange={set("phone")} error={errors.phone}
          helper="You can sign in with this number and your password." />
        <PasswordInput label="Password" autoComplete="new-password" required showStrength value={f.password} onChange={set("password")} error={errors.password} />
        <div>
          <Checkbox checked={f.agree} onChange={(e) => set("agree")(e.target.checked)}
            label={<>I agree to the <Link to="/terms" target="_blank">terms</Link> and <Link to="/privacy" target="_blank">privacy notice</Link>.</>} />
          {errors.agree && <p className="ui-field__error" role="alert" style={{ margin: "4px 0 0" }}>{errors.agree}</p>}
        </div>
        <Button type="submit" size="lg" fullWidth loading={busy}>Create account</Button>
      </form>
      <div className="auth__or">or</div>
      <GoogleButton next={next} label="Sign up with Google" />
    </AuthLayout>
  );
}