// src/pages/onboarding/DetailsPage.jsx — NEW FILE
//
// AIM
// Step 2: business details. Two modes:
//   /start/details?type=rental       creates the business (status "awaiting payment") and moves on
//   /start/details?business=<slug>   edits an existing business (used after a rejection)
// Rules: name, county and a description of at least 20 characters are required.

import "./Onboarding.css";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Button, Input, PhoneInput, SelectInput, Skeleton, TextArea } from "../../components/ui";
import Stepper from "./Stepper.jsx";
import { COUNTIES, typeLabel } from "../../config/counties.js";
import { createBusiness, getMyBusiness, updateBusiness } from "../../lib/api/businesses.js";
import { collect, email as vEmail, phone as vPhone, required } from "../../lib/validate.js";
import { toE164 } from "../../lib/phone.js";
import { cleanKenyanPhone } from "../../components/ui/PhoneInput.jsx";
import { useBusinessStore } from "../../store/businessStore.js";
import { useSession } from "../../store/sessionStore.js";
import { useToast } from "../../hooks/useNotifications.js";

export default function DetailsPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const user = useSession((s) => s.user);
  const profile = useSession((s) => s.profile);
  const slug = params.get("business");
  const type = params.get("type") || "rental";
  const editing = Boolean(slug);

  const [biz, setBiz] = useState(null);
  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState("");
  const [f, setF] = useState({ name: "", description: "", county: "", address: "", phone: "", email: "", whatsapp: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v && v.target ? v.target.value : v }));

  useEffect(() => {
    if (!editing) {
      setF((s) => ({ ...s, phone: s.phone || cleanKenyanPhone(profile?.phone || ""), email: s.email || user?.email || "" }));
      return;
    }
    let alive = true;
    getMyBusiness(slug).then(({ data, error }) => {
      if (!alive) return;
      if (error || !data) { setLoadError(error || "Business not found."); setLoading(false); return; }
      setBiz(data);
      setF({ name: data.name || "", description: data.description || "", county: data.county || "", address: data.address || "",
        phone: cleanKenyanPhone(data.phone || ""), email: data.email || "", whatsapp: cleanKenyanPhone(data.whatsapp || "") });
      setLoading(false);
    });
    return () => { alive = false; };
  }, [editing, slug, profile?.phone, user?.email]);

  async function submit(e) {
    e.preventDefault();
    const errs = collect({
      name: required(f.name, "Business name"),
      county: required(f.county, "County"),
      description: f.description.trim().length >= 20 ? "" : "Describe the business in at least 20 characters.",
      phone: vPhone(f.phone),
      email: f.email ? vEmail(f.email) : "",
      whatsapp: f.whatsapp ? vPhone(f.whatsapp) : "",
    });
    setErrors(errs); setFormError("");
    if (Object.keys(errs).length) return;
    const fields = { ...f, phone: `0${toE164(f.phone).slice(3)}`, whatsapp: f.whatsapp ? `0${toE164(f.whatsapp).slice(3)}` : "" };
    setBusy(true);
    if (editing) {
      const { error } = await updateBusiness(biz.id, fields);
      setBusy(false);
      if (error) return setFormError(error);
      await useBusinessStore.getState().load(user.id, true);
      toast.success("Details saved.");
      return navigate(`/start/status?business=${biz.slug}`);
    }
    const { data, error } = await createBusiness({ ...fields, type });
    setBusy(false);
    if (error) return setFormError(error);
    await useBusinessStore.getState().load(user.id, true);
    navigate(`/start/subscribe?business=${data.slug}`);
  }

  if (!editing && (!["rental", "agriculture", "shop"].includes(type))) {
    return (
      <div className="pg pg--narrow">
        <Alert type="warning" title="Choose a business type" message="Please pick a business type to continue." />
        <p><Link to="/start">Back to business types</Link></p>
      </div>
    );
  }

  return (
    <div className="pg pg--narrow">
      <Stepper step={2} />
      <h1 className="pg__title">{editing ? "Update your business details" : "Tell us about your business"}</h1>
      <p className="pg__lead">{editing ? "Fix what the reviewer asked for, then send it again." : `${typeLabel(type)} business. Customers will see these details.`}</p>

      {loading ? (
        <><Skeleton height={44} /><Skeleton height={44} style={{ marginTop: 16 }} /><Skeleton height={120} style={{ marginTop: 16 }} /></>
      ) : loadError ? (
        <Alert type="error" message={loadError} />
      ) : (
        <form className="onb__form" onSubmit={submit} noValidate>
          {formError && <Alert type="error" message={formError} />}
          <Input label="Business name" required value={f.name} onChange={set("name")} error={errors.name} />
          <TextArea label="Description" required rows={4} value={f.description} onChange={set("description")} error={errors.description}
            helper="What you offer, who it is for, and what makes you different." />
          <div className="onb__two">
            <SelectInput label="County" required value={f.county} onChange={set("county")} placeholder="Choose a county" options={COUNTIES} error={errors.county} />
            <Input label="Address or area" value={f.address} onChange={set("address")} placeholder="e.g. Roysambu, Thika Road" />
          </div>
          <div className="onb__two">
            <PhoneInput label="Business phone" required value={f.phone} onChange={set("phone")} error={errors.phone} />
            <PhoneInput label="WhatsApp (optional)" value={f.whatsapp} onChange={set("whatsapp")} error={errors.whatsapp} />
          </div>
          <Input label="Business email (optional)" type="email" value={f.email} onChange={set("email")} error={errors.email} />
          <div className="onb__actions">
            <Button type="button" variant="ghost" onClick={() => navigate(editing ? `/start/status?business=${slug}` : "/start")}>Back</Button>
            <Button type="submit" size="lg" loading={busy}>{editing ? "Save changes" : "Continue to subscription"}</Button>
          </div>
        </form>
      )}
    </div>
  );
}
