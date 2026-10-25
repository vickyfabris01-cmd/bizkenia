// src/pages/account/AccountPage.jsx — MODIFIED (Phase 6: Delete my account in a Danger zone card)
//
// AIM
// My account: name and phone number (the phone is what allows phone + password sign-in),
// read-only email, change password, theme, sign out, and delete my account (needs the password).
// The picture area shows the person's photo, or the avatar drawn from their saved design. "Change
// avatar" lets them pick another design; a photo, when there is one, still shows first.

import "./Account.css";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Alert, Button, Card, CardBody, CardHeader, Input, PasswordInput, PhoneInput, ThemeToggle, Avatar } from "../../components/ui";
import { useToast } from "../../hooks/useNotifications.js";
import { supabase } from "../../config/supabase.js";
import { useSession } from "../../store/sessionStore.js";
import { useBusinessStore } from "../../store/businessStore.js";
import { cleanKenyanPhone } from "../../components/ui/PhoneInput.jsx";
import { collect, password as vPassword, phone as vPhone, required } from "../../lib/validate.js";
import DeleteAccountCard from "../../components/lifecycle/DeleteAccountCard.jsx";
import AvatarPicker from "../../components/brand/AvatarPicker.jsx";
import { resolveAvatarDesign } from "../../lib/brandStudio/index.js";
import { uploadFile, publicUrl } from "../../lib/storage.js";

export default function AccountPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const profile = useSession((s) => s.profile);
  const user = useSession((s) => s.user);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwErrors, setPwErrors] = useState({});
  const [pwBusy, setPwBusy] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (profile) { setName(profile.full_name || ""); setPhone(cleanKenyanPhone(profile.phone || "")); }
  }, [profile]);

  const [picBusy, setPicBusy] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [designBusy, setDesignBusy] = useState(false);
  const savedDesign = resolveAvatarDesign({ id: user?.id, design: profile?.avatar_design });
  const hasBusiness = useBusinessStore((s) => s.memberships.length > 0);

  async function pickPhoto(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const types = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
    if (!types[f.type]) return setFormError("Use a JPG, PNG or WebP picture.");
    if (f.size > 2 * 1024 * 1024) return setFormError("The picture must be under 2 MB.");
    setFormError(""); setPicBusy(true);
    const path = `${user.id}/${crypto.randomUUID()}.${types[f.type]}`;
    const { error: upErr } = await uploadFile("avatars", path, f);
    if (upErr) { setPicBusy(false); return setFormError(upErr.message); }
    const url = publicUrl("avatars", path);
    const { error } = await useSession.getState().updateProfile({ avatar_url: url });
    setPicBusy(false);
    if (error) return setFormError(error);
    toast.success("Profile picture updated.");
  }

  async function removePhoto() {
    const { error } = await useSession.getState().updateProfile({ avatar_url: null });
    if (error) return setFormError(error);
    toast.success("Profile picture removed.");
  }

  async function saveDesign() {
    if (!draft) return;
    setDesignBusy(true);
    const { error } = await useSession.getState().updateProfile({ avatar_design: draft });
    setDesignBusy(false);
    if (error) return setFormError(error);
    setFormError("");
    setDesignOpen(false);
    setDraft(null);
    toast.success(profile?.avatar_url ? "Avatar saved. It shows if you remove your photo." : "Avatar saved.");
  }

  const google = user?.app_metadata?.provider === "google";

  async function saveProfile(e) {
    e.preventDefault();
    const errs = collect({ name: required(name, "Your name"), phone: phone ? vPhone(phone) : "" });
    setErrors(errs); setFormError("");
    if (Object.keys(errs).length) return;
    setSaving(true);
    const { error } = await useSession.getState().updateProfile({ full_name: name, phone: phone || "" });
    setSaving(false);
    if (error) return setFormError(error);
    toast.success("Your details were saved.");
  }

  async function changePassword(e) {
    e.preventDefault();
    const errs = collect({ pw: vPassword(pw), pw2: pw === pw2 ? "" : "The two passwords do not match." });
    setPwErrors(errs);
    if (Object.keys(errs).length) return;
    setPwBusy(true);
    const { error } = await useSession.getState().updatePassword(pw);
    setPwBusy(false);
    if (error) return setPwErrors({ pw: error });
    setPw(""); setPw2("");
    toast.success("Password changed.");
  }

  async function signOut() {
    await useSession.getState().signOut();
    useBusinessStore.getState().reset();
    navigate("/", { replace: true });
  }

  return (
    <div className="pg pg--narrow">
      <h1 className="pg__title">My account</h1>
      <div className="acct__shortcuts">
        <Button as={Link} to="/account/requests" variant="outline" size="sm">My requests</Button>
        {hasBusiness && <Button as={Link} to="/businesses" variant="outline" size="sm">My businesses</Button>}
      </div>
      <div className="acct__stack">
        <Card>
          <CardHeader title="Your details" />
          <CardBody>
            <form className="acct__form" onSubmit={saveProfile} noValidate>
              {formError && <Alert type="error" message={formError} />}
              <div className="acct__pic">
                <Avatar name={profile?.full_name || user?.email} src={profile?.avatar_url} id={user?.id} design={profile?.avatar_design} size="xl" />
                <div className="acct__pic-actions">
                  <label className="acct__pic-btn">
                    {picBusy ? "Uploading…" : "Change picture"}
                    <input type="file" accept="image/jpeg,image/png,image/webp" disabled={picBusy} onChange={pickPhoto} aria-label="Change profile picture" />
                  </label>
                  {profile?.avatar_url && <Button type="button" variant="ghost" size="sm" onClick={removePhoto}>Remove</Button>}
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setDesignOpen((v) => !v); setDraft(null); }}>{designOpen ? "Close" : "Change avatar"}</Button>
                </div>
              </div>
              {designOpen && (
                <>
                  <AvatarPicker name={profile?.full_name || user?.email} current={savedDesign} value={draft || savedDesign} onChange={setDraft}
                    autoPick={false} title="Pick an avatar" hint="Choose one you like, then save. Your photo, if you have one, still shows first." />
                  <div><Button type="button" loading={designBusy} disabled={!draft} onClick={saveDesign}>Save avatar</Button></div>
                </>
              )}
              <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoComplete="name" />
              <Input label="Email" value={profile?.email || user?.email || ""} disabled helper="Your email is used to sign in and cannot be changed here." />
              <PhoneInput label="Phone number" value={phone} onChange={setPhone} error={errors.phone}
                helper="Sign in with this number and your password." />
              <div><Button type="submit" loading={saving}>Save changes</Button></div>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={google ? "Password (optional)" : "Change password"} />
          <CardBody>
            <form className="acct__form" onSubmit={changePassword} noValidate>
              {google && <Alert type="info" message="You signed in with Google. Set a password if you also want to sign in with your email or phone number." />}
              <PasswordInput label="New password" autoComplete="new-password" showStrength value={pw} onChange={(e) => setPw(e.target.value)} error={pwErrors.pw} />
              <PasswordInput label="Confirm new password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} error={pwErrors.pw2} />
              <div><Button type="submit" variant="outline" loading={pwBusy}>Change password</Button></div>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Appearance" subtitle="Choose light, dark or follow your device." action={<ThemeToggle />} />
        </Card>

        <div><Button variant="outline" onClick={signOut}>Sign out</Button></div>

        <DeleteAccountCard />
      </div>
    </div>
  );
}
