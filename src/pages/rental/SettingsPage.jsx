// src/pages/rental/SettingsPage.jsx — MODIFIED (adds the logo and cover photo cards)
//
// AIM
// /app/:slug/settings (owner only). Billing rules (day rent is due, grace days, late fee) and the
// business's own M-Pesa paybill or till so residents' STK prompts pay into it. The M-Pesa
// passkey is write-only: it is saved but never shown again. The business profile is edited on
// its own page (shared with sign-up). The logo and cover photo are uploaded here
// (BusinessLogoCard, BusinessCoverCard). The platform commission is set by the platform, not here.

import "./Rental.css";
import { useEffect, useState } from "react";
import { Alert, Button, Card, CardBody, CardHeader, Input, Skeleton } from "../../components/ui";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import { getMpesaStatus, getSettings, saveMpesa, saveSettings } from "../../lib/api/rental.js";
import { Link } from "react-router-dom";
import { PageHead } from "./shared.jsx";
import BusinessLogoCard from "../../components/business/BusinessLogoCard.jsx";
import BusinessCoverCard from "../../components/business/BusinessCoverCard.jsx";

const DEFAULTS = { billing_due_day: 5, grace_period_days: 3, late_fee_amount: 500, late_fee_percent: 0 };

export default function SettingsPage() {
  const { business } = useBusinessContext();
  const bid = business.id;
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(async () => {
    const [s, m] = await Promise.all([getSettings(bid), getMpesaStatus(bid)]);
    return { data: { settings: s.data, mpesa: m.data }, error: s.error || m.error };
  }, [bid]);
  const [f, setF] = useState(DEFAULTS);
  const [short, setShort] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState("");
  const [errs, setErrs] = useState({});

  useEffect(() => {
    if (!data) return;
    setF({ ...DEFAULTS, ...Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, data.settings?.[k] ?? DEFAULTS[k]])) });
    setShort(data.mpesa?.shortcode || "");
  }, [data]);

  async function saveRules(e) {
    e.preventDefault();
    const next = {};
    if (!(f.billing_due_day >= 1 && f.billing_due_day <= 28)) next.due = "Choose a day from 1 to 28.";
    if (!(f.grace_period_days >= 0 && f.grace_period_days <= 30)) next.grace = "Choose 0 to 30 days.";
    if (!(f.late_fee_amount >= 0)) next.fee = "Enter 0 or more.";
    if (!(f.late_fee_percent >= 0 && f.late_fee_percent <= 100)) next.pct = "Enter 0 to 100.";
    setErrs(next);
    if (Object.keys(next).length) return;
    setBusy("rules");
    const { error: err } = await saveSettings(bid, f);
    setBusy("");
    if (err) toast.error(err); else { toast.success("Billing rules saved"); reload(); }
  }
  async function saveTill(e) {
    e.preventDefault();
    if (short && !/^\d{5,7}$/.test(short.trim())) { setErrs({ short: "The paybill or till number is 5 to 7 digits." }); return; }
    setErrs({});
    setBusy("mpesa");
    const { error: err } = await saveMpesa(bid, short.trim(), pass.trim());
    setBusy("");
    if (err) { toast.error(err); return; }
    setPass(""); toast.success("M-Pesa details saved"); reload();
  }
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value === "" ? "" : Number(e.target.value) }));

  return (
    <div className="rent">
      <PageHead title="Settings" lead="How you bill and how residents pay you." />
      {error && <Alert type="error" message={error} />}
      {loading ? <Skeleton height={260} /> : (
        <div className="rent-grid2">
          <Card>
            <CardHeader title="Billing rules" subtitle="Applied to every invoice you create" />
            <CardBody>
              <form className="rent-form" onSubmit={saveRules} noValidate>
                <div className="rent-form__row">
                  <Input label="Rent is due on day" type="number" min="1" max="28" value={f.billing_due_day} onChange={set("billing_due_day")} error={errs.due} helper="Of the month the period starts." />
                  <Input label="Grace days" type="number" min="0" max="30" value={f.grace_period_days} onChange={set("grace_period_days")} error={errs.grace} helper="Days after the due date before it is overdue." />
                </div>
                <div className="rent-form__row">
                  <Input label="Late fee (KSh)" type="number" min="0" value={f.late_fee_amount} onChange={set("late_fee_amount")} error={errs.fee} />
                  <Input label="Late fee (% of rent)" type="number" min="0" max="100" value={f.late_fee_percent} onChange={set("late_fee_percent")} error={errs.pct} />
                </div>
                <p className="rent-muted">The late fee is added once, when an invoice becomes overdue.</p>
                <Button type="submit" loading={busy === "rules"}>Save billing rules</Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="M-Pesa for rent" subtitle="Paybill or till that receives rent" />
            <CardBody>
              <form className="rent-form" onSubmit={saveTill} noValidate>
                <Input label="Paybill or till number" inputMode="numeric" value={short} onChange={(e) => setShort(e.target.value)} error={errs.short} />
                <Input label="Passkey" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)}
                  placeholder={data?.mpesa?.has_passkey ? "•••••••• saved. Type to replace" : "Paste the Lipa na M-Pesa passkey"}
                  helper="Stored safely and never shown again. Needed to send M-Pesa prompts." />
                <Alert type={data?.mpesa?.has_passkey && data?.mpesa?.shortcode ? "success" : "info"}
                  message={data?.mpesa?.has_passkey && data?.mpesa?.shortcode ? "M-Pesa prompts are ready. Residents can also pay manually and you can record it." : "Until this is set, residents pay to your paybill or till directly and you record the payment."} />
                <Button type="submit" loading={busy === "mpesa"}>Save M-Pesa details</Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Business profile" subtitle="Name, description, phone and place shown to renters" />
            <CardBody><Button as={Link} to={`/start/details?business=${business.slug}`} variant="outline">Edit business details</Button></CardBody>
          </Card>

          <BusinessLogoCard business={business} />

          <BusinessCoverCard business={business} />
        </div>
      )}
    </div>
  );
}