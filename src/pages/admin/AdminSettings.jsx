// src/pages/admin/AdminSettings.jsx — MODIFIED (a "Share the site" button leads to /admin/share; step 2: the "Business types" switch is removed; only a single business can be locked. Phase 5 step 3: adds the Maintenance mode and Default commission cards. Step 5: the free-form price table is replaced by the fixed plan grid)
//
// AIM
// Platform settings, one card per topic, each saved on its own:
//   Brand           product name, tagline, support email, website (shown across the whole site)
//   Home page hero  background photos for the home page and how often they change (HeroImagesCard)
//   Approval        manual (default) or automatic approval after payment
//   Prices          fixed plan grid per business type: amount and on/off only, plus an optional offer (PlanPricesCard.jsx)
//   M-Pesa          sandbox or live and the shortcode (secret keys live in Edge Function secrets)
//   Maintenance     switch the site to the maintenance page (PlatformControls.jsx)
//   Commission      default commission percent, stored only (PlatformControls.jsx)
// Every save is written to the audit log by the database.

import "./Admin.css";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Card, CardBody, CardHeader, Input, SelectInput, Skeleton, Toggle } from "../../components/ui";
import HeroImagesCard from "./HeroImagesCard.jsx";
import PlanPricesCard from "./PlanPricesCard.jsx";
import { CommissionCard, MaintenanceCard } from "./PlatformControls.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { adminGetSettings, adminSaveSetting } from "../../lib/api/businesses.js";
import { usePlatformStore } from "../../store/platformStore.js";
import { collect, email as vEmail, required } from "../../lib/validate.js";

export default function AdminSettings() {
  const toast = useToast();
  const { data: s, loading, error, reload } = useAsync(() => adminGetSettings(), []);

  const [brand, setBrand] = useState({ name: "", tagline: "", support_email: "", website: "" });
  const [brandErr, setBrandErr] = useState({});
  const [mode, setMode] = useState("manual");
  const [mpesa, setMpesa] = useState({ env: "sandbox", shortcode: "" });
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!s) return;
    setBrand({ name: "", tagline: "", support_email: "", website: "", ...(s.brand || {}) });
    setMode(s.approval?.mode || "manual");
    setMpesa({ env: "sandbox", shortcode: "", ...(s.mpesa || {}) });
  }, [s]);

  async function save(key, value, label) {
    setBusy(key);
    const { error: e } = await adminSaveSetting(key, value);
    setBusy("");
    if (e) return toast.error(e);
    if (key === "brand") usePlatformStore.getState().apply(key, value);
    toast.success(`${label} saved.`);
    reload();
  }

  function saveBrand(e) {
    e.preventDefault();
    const errs = collect({ name: required(brand.name, "Product name"), support_email: vEmail(brand.support_email) });
    setBrandErr(errs);
    if (Object.keys(errs).length) return;
    save("brand", { name: brand.name.trim(), tagline: brand.tagline.trim(), support_email: brand.support_email.trim(), website: brand.website.trim() }, "Brand");
  }

  if (loading) return <div className="adm"><Skeleton height={32} width="30%" /><Skeleton height={180} /><Skeleton height={180} /></div>;

  return (
    <div className="adm">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <h2 className="adm__title" style={{ margin: 0 }}>Settings</h2>
        <Button as={Link} to="/admin/share?open=home" variant="outline">Share the site</Button>
      </div>
      {error && <Alert type="error" message={error} />}

      <Card>
        <CardHeader title="Brand" subtitle="Shown in the header, footer, 404 page, emails and menus." />
        <CardBody>
          <form className="adm-form" onSubmit={saveBrand} noValidate>
            <div className="adm-form__row">
              <Input label="Product name" required value={brand.name} onChange={(e) => setBrand({ ...brand, name: e.target.value })} error={brandErr.name} />
              <Input label="Tagline" value={brand.tagline} onChange={(e) => setBrand({ ...brand, tagline: e.target.value })} />
            </div>
            <div className="adm-form__row">
              <Input label="Support email" type="email" required value={brand.support_email} onChange={(e) => setBrand({ ...brand, support_email: e.target.value })} error={brandErr.support_email} />
              <Input label="Website" value={brand.website} onChange={(e) => setBrand({ ...brand, website: e.target.value })} placeholder="https://" />
            </div>
            <div><Button type="submit" loading={busy === "brand"}>Save brand</Button></div>
          </form>
        </CardBody>
      </Card>

      <HeroImagesCard />

      <Card>
        <CardHeader title="Approval" subtitle="What happens after a business pays its subscription." />
        <CardBody>
          <div className="adm-sec">
            <Toggle label="Approve businesses automatically" checked={mode === "auto"} onChange={(v) => setMode(v ? "auto" : "manual")} />
            <p className="adm-hint">{mode === "auto" ? "Businesses go live as soon as the payment succeeds." : "Each business waits in the review list until you approve it (recommended)."}</p>
            <div><Button loading={busy === "approval"} onClick={() => save("approval", { mode }, "Approval mode")}>Save approval mode</Button></div>
          </div>
        </CardBody>
      </Card>

      <PlanPricesCard />

      <Card>
        <CardHeader title="M-Pesa" subtitle="Secret keys are never stored here. Set them as Edge Function secrets (see docs/phase-1/SETUP.md)." />
        <CardBody>
          <div className="adm-form">
            <div className="adm-form__row">
              <SelectInput label="Mode" value={mpesa.env} onChange={(v) => setMpesa({ ...mpesa, env: v })}
                options={[{ value: "sandbox", label: "Sandbox (testing)" }, { value: "live", label: "Live (real money)" }]} />
              <Input label="Business shortcode" value={mpesa.shortcode} onChange={(e) => setMpesa({ ...mpesa, shortcode: e.target.value })} helper="Sandbox default: 174379" />
            </div>
            <div><Button loading={busy === "mpesa"} onClick={() => save("mpesa", mpesa, "M-Pesa settings")}>Save M-Pesa settings</Button></div>
          </div>
        </CardBody>
      </Card>

      <MaintenanceCard />
      <CommissionCard />
    </div>
  );
}