// src/pages/rental/BillingPage.jsx — NEW FILE
//
// AIM
// /app/:slug/billing — the rent invoices ("billing cycles"). Staff create the invoices that are
// due, see who is overdue (late fees are added once, by the settings), filter by status or month,
// and open an invoice to record a payment, send an M-Pesa prompt or waive it.

import "./Rental.css";
import { useMemo, useState } from "react";
import { Alert, Button, Card, EmptyState, Icon, SelectInput } from "../../components/ui";
import SimpleTable from "../../components/data/SimpleTable.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import { generateCycles, listCycles, listPayments } from "../../lib/api/rental.js";
import { formatDate } from "../../lib/format.js";
import InvoiceModal from "./InvoiceModal.jsx";
import { PageHead, Stat, StatusBadge, Tabs, money, personName, roomLabel } from "./shared.jsx";

const monthKey = (d) => String(d).slice(0, 7);
const monthLabel = (k) => new Date(`${k}-01T00:00:00`).toLocaleDateString("en-KE", { month: "long", year: "numeric" });

export default function BillingPage() {
  const { business } = useBusinessContext();
  const bid = business.id;
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(async () => {
    const [c, p] = await Promise.all([listCycles(bid), listPayments(bid)]);
    return { data: { cycles: c.data || [], payments: p.data || [] }, error: c.error || p.error };
  }, [bid]);
  const [tab, setTab] = useState("open");
  const [month, setMonth] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  const cycles = data?.cycles || [];

  const months = useMemo(() => [...new Set(cycles.map((c) => monthKey(c.period_start)))].sort().reverse(), [cycles]);
  const shown = cycles.filter((c) => (!month || monthKey(c.period_start) === month) &&
    (tab === "all" || (tab === "open" ? ["unpaid", "partial", "overdue"].includes(c.status) : c.status === tab)));
  const n = (s) => cycles.filter((c) => (Array.isArray(s) ? s.includes(c.status) : c.status === s)).length;
  const outstanding = cycles.filter((c) => ["unpaid", "partial", "overdue"].includes(c.status)).reduce((s, c) => s + Number(c.balance || 0), 0);
  const overdue = cycles.filter((c) => c.status === "overdue").reduce((s, c) => s + Number(c.balance || 0), 0);

  async function generate() {
    setBusy(true);
    const { data: made, error: err } = await generateCycles(bid);
    setBusy(false);
    if (err) { toast.error(err); return; }
    toast.success(made ? `${made} invoice${made === 1 ? "" : "s"} created` : "Everything is up to date", made ? undefined : "No new invoices were due.");
    reload();
  }

  const columns = [
    { key: "inv", label: "Invoice", render: (c) => <span className="rent-strong">{c.invoice_number}</span> },
    { key: "who", label: "Resident", render: (c) => personName(c.client) },
    { key: "room", label: "Room", render: (c) => roomLabel(c.room) },
    { key: "period", label: "Period", render: (c) => `${formatDate(c.period_start)} – ${formatDate(c.period_end)}` },
    { key: "due", label: "Due", render: (c) => formatDate(c.due_date) },
    { key: "total", label: "Total", align: "right", render: (c) => <span className="rent-money">{money(Number(c.amount_due) + Number(c.late_fee || 0))}</span> },
    { key: "bal", label: "Balance", align: "right", render: (c) => <span className="rent-money">{money(c.balance)}</span> },
    { key: "status", label: "Status", render: (c) => <StatusBadge kind="cycle" status={c.status} /> },
  ];

  return (
    <div className="rent">
      <PageHead title="Billing" lead="Rent invoices for every resident.">
        <Button variant="outline" leftIcon={<Icon name="plus" size={16} />} loading={busy} onClick={generate}>Create due invoices</Button>
      </PageHead>
      {error && <Alert type="error" message={error} />}
      <div className="rent-stats">
        <Stat label="Still to collect" value={money(outstanding)} note={`${n(["unpaid", "partial", "overdue"])} open invoices`} />
        <Stat label="Overdue" value={money(overdue)} note={`${n("overdue")} invoices`} tone={overdue ? "bad" : undefined} />
      </div>
      <div className="rent-bar">
        <SelectInput label="Month" value={month} onChange={setMonth} options={[{ value: "", label: "All months" }, ...months.map((m) => ({ value: m, label: monthLabel(m) }))]} />
      </div>
      <Tabs label="Invoice status" value={tab} onChange={setTab} tabs={[
        { value: "open", label: "To collect", count: n(["unpaid", "partial", "overdue"]) }, { value: "overdue", label: "Overdue", count: n("overdue") },
        { value: "paid", label: "Paid", count: n("paid") }, { value: "all", label: "All", count: cycles.length }]} />
      <SimpleTable loading={loading} columns={columns} rows={shown} onRowClick={setOpen}
        empty={<Card><EmptyState icon="card" compact title="No invoices here" description="Invoices are created when a resident moves in. Use “Create due invoices” at the start of each period." /></Card>} />
      {open && <InvoiceModal cycle={open} payments={data?.payments || []} businessId={bid} onClose={() => setOpen(null)} onChanged={reload} />}
    </div>
  );
}
