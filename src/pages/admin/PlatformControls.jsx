// src/pages/admin/PlatformControls.jsx — NEW FILE (Phase 5, step 3; maintenance levels)
//
// AIM
// Two settings cards for Admin > Settings, each saved on its own (like the Hero images card):
//   MaintenanceCard  the five maintenance levels (whole system, all dashboards, one business type, all M-Pesa,
//                    some businesses' subscriptions), a page picker and an optional message. Super admins keep full
//                    access; everyone else sees the maintenance page (or is refused an M-Pesa prompt) until it is switched off.
//   CommissionCard   the default commission percent. It is STORED AND SHOWN ONLY: nothing is charged
//                    from it, because the platform earns from subscriptions only.
// Both write to platform_settings through adminSaveSetting; the database writes each save to the audit log.

import "./Admin.css";
import "./AdminFinance.css";
import { useEffect, useState } from "react";
import { Alert, Button, Card, CardBody, CardHeader, Checkbox, Icon, Input, Skeleton, TextArea, Toggle } from "../../components/ui";
import { ConfirmDialog } from "../../components/modals/Modal.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { adminGetSettings, adminListBusinesses, adminSaveSetting } from "../../lib/api/businesses.js";
import { maintenanceActive, normalizeMaintenance, usePlatformStore } from "../../store/platformStore.js";
import { describeMaintenance } from "../../components/feedback/MaintenanceBanner.jsx";
import { PAGE_OPTIONS } from "../../router/routes";
import { BUSINESS_TYPES } from "../../config/counties.js";

const MISSING = "This setting is not in the database yet. Apply migration p5_07 (supabase/migrations/20261018100003_p5_07_platform_views.sql) first.";

// adminSaveSetting only updates an existing row; with no row it returns no data and no error.
async function saveSetting(key, value) {
  const { data, error } = await adminSaveSetting(key, value);
  if (error) return { error };
  if (!data) return { error: MISSING };
  return { error: null, data };
}

function Group({ title, hint, children }) {
  return (
    <fieldset style={{ border: 0, margin: 0, padding: 0, display: "grid", gap: "var(--space-2)", minWidth: 0 }}>
      <legend style={{ padding: 0, marginBottom: "var(--space-1)", fontWeight: "var(--weight-semibold)", color: "var(--color-text)" }}>{title}</legend>
      {hint && <p className="adm-hint">{hint}</p>}
      {children}
    </fieldset>
  );
}

const withItem = (list, item, on) => (on ? [...new Set([...list, item])] : list.filter((x) => x !== item));
const EMPTY = { system: false, allDashboards: false, types: [], pages: [], payments: false, businesses: [], message: "" };

export function MaintenanceCard() {
  const toast = useToast();
  const { data: s, loading } = useAsync(() => adminGetSettings(), []);
  const { data: bizList } = useAsync(() => adminListBusinesses(), []);
  const [saved, setSaved] = useState(() => normalizeMaintenance(null));
  const [form, setForm] = useState(EMPTY);
  const [find, setFind] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (!s) return;
    const m = normalizeMaintenance(s.maintenance);
    setSaved(m); setForm({ system: m.system, allDashboards: m.allDashboards, types: m.types, pages: m.pages, payments: m.payments, businesses: m.businesses, message: m.message });
  }, [s]);

  // What this save would switch ON that is not on now. Anything in here needs a confirmation.
  const added = {
    ...normalizeMaintenance(null),
    system: form.system && !saved.system,
    allDashboards: form.allDashboards && !saved.allDashboards,
    types: form.types.filter((t) => !saved.types.includes(t)),
    pages: form.pages.filter((p) => !saved.pages.includes(p)),
    payments: form.payments && !saved.payments,
    businesses: form.businesses.filter((b) => !saved.businesses.includes(b)),
  };
  const addsSomething = maintenanceActive(added);

  async function save(override) {
    setBusy(true);
    const v = override || form;
    const value = { system: v.system, allDashboards: v.allDashboards, types: v.types, pages: v.pages, payments: v.payments, businesses: v.businesses, message: v.message.trim() };
    const { error, data } = await saveSetting("maintenance", value);
    setBusy(false); setConfirm(false);
    if (error) return toast.error(error);
    const next = normalizeMaintenance(data?.value || value);
    usePlatformStore.getState().apply("maintenance", next);
    setSaved(next);
    setForm({ system: next.system, allDashboards: next.allDashboards, types: next.types, pages: next.pages, payments: next.payments, businesses: next.businesses, message: next.message });
    toast.success(maintenanceActive(next) ? "Maintenance settings saved." : "Maintenance is off.");
  }

  const businesses = bizList || [];
  const nameOf = (id) => businesses.find((b) => b.id === id)?.name || `Business ${id.slice(0, 8)}`;
  const term = find.trim().toLowerCase();
  const matches = businesses
    .filter((b) => !term || `${b.name} ${b.county || ""} ${b.email || ""}`.toLowerCase().includes(term))
    .slice(0, 8);

  if (loading && !s) return <Card><Skeleton height={140} /></Card>;
  return (
    <Card>
      <CardHeader title="Maintenance" subtitle="Switch off the whole site, the dashboards, one business type, one page, or M-Pesa. Super admins are never blocked." />
      <CardBody>
        <div className="fin-toggle-row">
          {maintenanceActive(saved) && <Alert type="warning" title="Maintenance is on" message={describeMaintenance(saved)} />}

          <Group title="Level 1: whole system" hint="Only super admins can use the site. Everyone else sees the maintenance page, including business owners and customers.">
            <Toggle label="Put the whole site in maintenance" checked={form.system} onChange={(v) => set({ system: v })} />
          </Group>

          <Group title="Level 2: all dashboards" hint="Everything under /app (every business dashboard). Public pages keep working.">
            <Toggle label="Put all business dashboards in maintenance" checked={form.allDashboards} onChange={(v) => set({ allDashboards: v })} />
          </Group>

          <Group title="Level 3: one business type" hint="Only the dashboards of the types you tick. Public pages and the other types keep working.">
            {BUSINESS_TYPES.map((t) => (
              <Checkbox key={t.value} label={`${t.label} dashboards`} checked={form.types.includes(t.value)} onChange={(e) => set({ types: withItem(form.types, t.value, e.target.checked) })} />
            ))}
          </Group>

          <Group title="Level 4: all money handling" hint="Blocks every M-Pesa prompt (subscriptions, rent and shop orders). Use it while Daraja is being set up. The server refuses the prompt, not just the screen.">
            <Toggle label="Block all M-Pesa payments" checked={form.payments} onChange={(v) => set({ payments: v })} />
          </Group>

          <Group title="Level 5: some businesses' subscriptions" hint="Blocks the subscription prompt only for the businesses you pick, for example new ones with no billing set up yet.">
            <Input label="Find a business" type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Name, county or email" />
            <div style={{ display: "grid", gap: "var(--space-1)" }}>
              {matches.length === 0 && <p className="adm-hint">No business matches.</p>}
              {matches.map((b) => (
                <Checkbox key={b.id} label={`${b.name} (${String(b.status).replace(/_/g, " ")})`} checked={form.businesses.includes(b.id)}
                  onChange={(e) => set({ businesses: withItem(form.businesses, b.id, e.target.checked) })} />
              ))}
            </div>
            {form.businesses.length > 0 && (
              <ul aria-label="Businesses with subscription payments blocked" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                {form.businesses.map((id) => (
                  <li key={id}>
                    <Button size="sm" variant="outline" aria-label={`Remove ${nameOf(id)}`} onClick={() => set({ businesses: withItem(form.businesses, id, false) })}
                      rightIcon={<Icon name="x" size={14} />}>{nameOf(id)}</Button>
                  </li>
                ))}
              </ul>
            )}
          </Group>

          <Group title="Pages" hint="Tick a page to show the maintenance page there. The rest of the site keeps working. Sign-in pages cannot be ticked.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "var(--space-1) var(--space-3)", maxHeight: 280, overflowY: "auto", padding: "var(--space-2)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)" }}>
              {PAGE_OPTIONS.map((p) => (
                <Checkbox key={p.key} label={p.label} checked={form.pages.includes(p.key)} onChange={(e) => set({ pages: withItem(form.pages, p.key, e.target.checked) })} />
              ))}
            </div>
          </Group>

          <TextArea label="Message for visitors (optional)" rows={3} maxLength={300} value={form.message} onChange={(e) => set({ message: e.target.value })}
            helper="For example: We are upgrading and will be back by 6 pm. It is shown on the maintenance page and in the warning strip." />
          <p className="adm-hint">Levels 1 to 3 and pages hide screens in the browser only; they do not stop the database from answering. Levels 4 and 5 are enforced by the server for M-Pesa prompts. Every change is written to the audit log.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
            <Button loading={busy} onClick={() => (addsSomething ? setConfirm(true) : save())}>Save maintenance settings</Button>
            {maintenanceActive(saved) && <Button variant="outline" disabled={busy} onClick={() => save({ ...EMPTY, message: form.message })}>Turn everything off</Button>}
          </div>
        </div>
      </CardBody>
      <ConfirmDialog isOpen={confirm} variant="danger" loading={busy} title="Switch these on?"
        message={`${describeMaintenance(added)} This takes effect right away for everyone except super admins.`}
        confirmLabel="Switch on" onConfirm={() => save()} onCancel={() => setConfirm(false)} />
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
