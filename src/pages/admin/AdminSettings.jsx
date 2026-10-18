// src/pages/admin/AdminSettings.jsx — MODIFIED (step 2: the "Business types" switch is removed; only a single business can be locked. Phase 5 step 3: adds the Maintenance mode and Default commission cards)
//
// AIM
// Platform settings, one card per topic, each saved on its own:
//   Brand           product name, tagline, support email, website (shown across the whole site)
//   Home page hero  background photos for the home page and how often they change (HeroImagesCard)
//   Approval        manual (default) or automatic approval after payment
//   Prices          subscription plans: add, edit, switch off
//   M-Pesa          sandbox or live and the shortcode (secret keys live in Edge Function secrets)
//   Maintenance     switch the site to the maintenance page (PlatformControls.jsx)
//   Commission      default commission percent, stored only (PlatformControls.jsx)
// Every save is written to the audit log by the database.

import "./Admin.css";
import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, Input, SelectInput, Skeleton, Toggle } from "../../components/ui";
import { Modal } from "../../components/modals/Modal.jsx";
import SimpleTable from "../../components/data/SimpleTable.jsx";
import HeroImagesCard from "./HeroImagesCard.jsx";
import { CommissionCard, MaintenanceCard } from "./PlatformControls.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { adminGetSettings, adminListPlans, adminSavePlan, adminSaveSetting } from "../../lib/api/businesses.js";
import { usePlatformStore } from "../../store/platformStore.js";
import { collect, email as vEmail, required } from "../../lib/validate.js";
import { formatKsh, periodLabel } from "../../lib/format.js";
import { typeLabel } from "../../config/counties.js";

const EMPTY_PLAN = { business_type: "rental", code: "", name: "", description: "", price_kes: 1500, period_days: 30, is_active: true, sort: 0 };

export default function AdminSettings() {
  const toast = useToast();
  const { data: s, loading, error, reload } = useAsync(() => adminGetSettings(), []);
  const { data: plans, reload: reloadPlans } = useAsync(() => adminListPlans(), []);

  const [brand, setBrand] = useState({ name: "", tagline: "", support_email: "", website: "" });
  const [brandErr, setBrandErr] = useState({});
  const [mode, setMode] = useState("manual");
  const [mpesa, setMpesa] = useState({ env: "sandbox", shortcode: "" });
  const [busy, setBusy] = useState("");
  const [plan, setPlan] = useState(null);
  const [planErr, setPlanErr] = useState({});

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

  async function savePlan() {
    const errs = collect({
      name: required(plan.name, "Plan name"), code: /^[a-z0-9_]{3,}$/.test(plan.code) ? "" : "Use lowercase letters, numbers and underscores.",
      price_kes: Number(plan.price_kes) >= 0 ? "" : "Enter the price.", period_days: Number(plan.period_days) > 0 ? "" : "Enter the number of days.",
    });
    setPlanErr(errs);
    if (Object.keys(errs).length) return;
    setBusy("plan");
    const { error: e } = await adminSavePlan(plan);
    setBusy("");
    if (e) return toast.error(/duplicate/i.test(e) ? "A plan with this code already exists." : e);
    toast.success("Plan saved.");
    setPlan(null);
    reloadPlans();
  }

  if (loading) return <div className="adm"><Skeleton height={32} width="30%" /><Skeleton height={180} /><Skeleton height={180} /></div>;

  return (
    <div className="adm">
      <h2 className="adm__title">Settings</h2>
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

      <Card padding="none">
        <CardHeader title="Subscription prices" action={<Button size="sm" onClick={() => { setPlanErr({}); setPlan({ ...EMPTY_PLAN }); }}>Add plan</Button>} />
        <SimpleTable rows={plans || []} empty={<EmptyState icon="card" title="No plans" compact />}
          onRowClick={(p) => { setPlanErr({}); setPlan({ ...p }); }}
          columns={[
            { key: "name", label: "Plan", render: (p) => <strong>{p.name}</strong> },
            { key: "type", label: "Type", render: (p) => typeLabel(p.business_type) },
            { key: "price", label: "Price", render: (p) => `${formatKsh(p.price_kes)} ${periodLabel(p.period_days)}` },
            { key: "is_active", label: "Status", render: (p) => <Badge variant={p.is_active ? "success" : "neutral"}>{p.is_active ? "On" : "Off"}</Badge> },
          ]} />
      </Card>

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

      <Modal isOpen={!!plan} onClose={() => setPlan(null)} title={plan?.id ? "Edit plan" : "Add plan"}
        footer={<><Button variant="ghost" onClick={() => setPlan(null)}>Cancel</Button><Button loading={busy === "plan"} onClick={savePlan}>Save plan</Button></>}>
        {plan && (
          <div className="adm-form">
            <Input label="Name" required value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} error={planErr.name} />
            <Input label="Code" required value={plan.code} disabled={!!plan.id} onChange={(e) => setPlan({ ...plan, code: e.target.value })} error={planErr.code} helper="Unique, for example rental_yearly" />
            <SelectInput label="Business type" value={plan.business_type} onChange={(v) => setPlan({ ...plan, business_type: v })}
              options={[{ value: "rental", label: "Rental" }, { value: "agriculture", label: "Agriculture" }, { value: "shop", label: "Shop" }]} />
            <div className="adm-form__row">
              <Input label="Price (KSh)" type="number" min="0" value={plan.price_kes} onChange={(e) => setPlan({ ...plan, price_kes: e.target.value })} error={planErr.price_kes} />
              <Input label="Period (days)" type="number" min="1" value={plan.period_days} onChange={(e) => setPlan({ ...plan, period_days: e.target.value })} error={planErr.period_days} />
            </div>
            <Input label="Description" value={plan.description || ""} onChange={(e) => setPlan({ ...plan, description: e.target.value })} />
            <Toggle label="Plan is on sale" checked={!!plan.is_active} onChange={(v) => setPlan({ ...plan, is_active: v })} />
          </div>
        )}
      </Modal>
    </div>
  );
}