// src/pages/admin/PlatformControls.jsx — NEW FILE (Phase 5, step 3)
//
// AIM
// Two settings cards for Admin > Settings, each saved on its own (like the Hero images card):
//   MaintenanceCard  switch the whole site to the maintenance page, with an optional message.
//                    Super admins keep full access; everyone else sees the page until it is switched off.
//   CommissionCard   the default commission percent. It is STORED AND SHOWN ONLY: nothing is charged
//                    from it, because the platform earns from subscriptions only.
// Both write to platform_settings through adminSaveSetting; the database writes each save to the audit log.

import "./Admin.css";
import "./AdminFinance.css";
import { useEffect, useState } from "react";
import { Alert, Button, Card, CardBody, CardHeader, Input, Skeleton, TextArea, Toggle } from "../../components/ui";
import { ConfirmDialog } from "../../components/modals/Modal.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { adminGetSettings, adminSaveSetting } from "../../lib/api/businesses.js";
import { usePlatformStore } from "../../store/platformStore.js";

const MISSING = "This setting is not in the database yet. Apply migration p5_07 (supabase/migrations/20261018100003_p5_07_platform_views.sql) first.";

// adminSaveSetting only updates an existing row; with no row it returns no data and no error.
async function saveSetting(key, value) {
  const { data, error } = await adminSaveSetting(key, value);
  if (error) return { error };
  if (!data) return { error: MISSING };
  return { error: null };
}

export function MaintenanceCard() {
  const toast = useToast();
  const { data: s, loading } = useAsync(() => adminGetSettings(), []);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [was, setWas] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!s) return;
    setEnabled(!!s.maintenance?.enabled); setWas(!!s.maintenance?.enabled); setMessage(s.maintenance?.message || "");
  }, [s]);

  async function save() {
    setBusy(true);
    const value = { enabled, message: message.trim() };
    const { error } = await saveSetting("maintenance", value);
    setBusy(false); setConfirm(false);
    if (error) return toast.error(error);
    usePlatformStore.getState().apply("maintenance", value);
    setWas(enabled);
    toast.success(enabled ? "Maintenance mode is on." : "Maintenance mode is off.");
  }

  if (loading && !s) return <Card><Skeleton height={140} /></Card>;
  return (
    <Card>
      <CardHeader title="Maintenance mode" subtitle="Show a maintenance page to everyone except super admins." />
      <CardBody>
        <div className="fin-toggle-row">
          {was && <Alert type="warning" title="Maintenance mode is on" message="Visitors and business members see the maintenance page. You can still sign in and use the admin area." />}
          <Toggle label="Put the site in maintenance mode" checked={enabled} onChange={setEnabled} />
          <TextArea label="Message for visitors (optional)" rows={3} maxLength={300} value={message} onChange={(e) => setMessage(e.target.value)}
            helper="For example: We are upgrading and will be back by 6 pm." />
          <p className="adm-hint">This hides the pages from visitors in their browser. It does not stop the database or M-Pesa from receiving requests, so switch it on for short, planned work.</p>
          <div><Button loading={busy} onClick={() => (enabled && !was ? setConfirm(true) : save())}>Save maintenance mode</Button></div>
        </div>
      </CardBody>
      <ConfirmDialog isOpen={confirm} variant="danger" loading={busy} title="Switch maintenance mode on?"
        message="Everyone except super admins will see the maintenance page right away, including business owners and their customers."
        confirmLabel="Switch on" onConfirm={save} onCancel={() => setConfirm(false)} />
    </Card>
  );
}

export function CommissionCard() {
  const toast = useToast();
  const { data: s, loading } = useAsync(() => adminGetSettings(), []);
  const [pct, setPct] = useState("0");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (s) setPct(String(s.finance?.commission_percent ?? 0)); }, [s]);

  async function save() {
    const n = Number(pct);
    if (pct === "" || Number.isNaN(n) || n < 0 || n > 100) { setErr("Enter a number from 0 to 100."); return; }
    setErr(""); setBusy(true);
    const { error } = await saveSetting("finance", { ...(s?.finance || {}), commission_percent: n });
    setBusy(false);
    if (error) return toast.error(error);
    toast.success("Commission saved.");
  }

  if (loading && !s) return <Card><Skeleton height={120} /></Card>;
  return (
    <Card>
      <CardHeader title="Default commission" subtitle="Kept for the future. Nothing is charged from it today." />
      <CardBody>
        <div className="adm-form">
          <Input label="Commission (%)" type="number" min="0" max="100" step="0.5" value={pct} onChange={(e) => setPct(e.target.value)} error={err}
            helper="The platform earns from subscriptions only. Rent and shop sales are not charged a commission." />
          <div><Button loading={busy} onClick={save}>Save commission</Button></div>
        </div>
      </CardBody>
    </Card>
  );
}
