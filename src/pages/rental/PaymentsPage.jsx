// src/pages/rental/PaymentsPage.jsx — NEW FILE
//
// AIM
// /app/:slug/payments — the money ledger. All payments, the ones that could not be matched to an
// invoice ("Unmatched": match them by hand), and reversed ones. Staff can record a payment,
// reverse a wrong one (the invoice goes back to owing) and match an unmatched one.

import "./Rental.css";
import { useState } from "react";
import { Alert, Badge, Button, Card, EmptyState, Icon, SelectInput, TextArea } from "../../components/ui";
import { Modal } from "../../components/modals/Modal.jsx";
import SimpleTable from "../../components/data/SimpleTable.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import { assignPayment, listCycles, listPayments, reversePayment } from "../../lib/api/rental.js";
import { formatDate, formatDateTime } from "../../lib/format.js";
import RecordPaymentModal from "./RecordPaymentModal.jsx";
import { METHOD, PageHead, StatusBadge, Tabs, money, personName } from "./shared.jsx";

const isUnmatched = (p) => !p.billing_cycle_id && p.payment_status === "confirmed";

function PaymentModal({ p, cycles, onClose, onDone }) {
  const toast = useToast();
  const [mode, setMode] = useState(null);       // reverse | match
  const [reason, setReason] = useState("");
  const [cycleId, setCycleId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fits = cycles.filter((c) => ["unpaid", "partial", "overdue"].includes(c.status) && Number(c.balance) >= Number(p.amount));

  async function run() {
    setBusy(true); setError("");
    const res = mode === "reverse" ? await reversePayment(p.id, reason) : await assignPayment(p.id, cycleId);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    toast.success(mode === "reverse" ? "Payment reversed" : "Payment matched");
    onDone(); onClose();
  }

  return (
    <Modal isOpen onClose={onClose} title={`${money(p.amount)} · ${METHOD[p.payment_method]}`} size="md"
      footer={mode ? <><Button variant="secondary" onClick={() => setMode(null)}>Back</Button>
        <Button variant={mode === "reverse" ? "danger" : "primary"} loading={busy} disabled={mode === "match" && !cycleId} onClick={run}>{mode === "reverse" ? "Reverse payment" : "Match to invoice"}</Button></>
        : <>
          {p.payment_status === "confirmed" && <Button variant="ghost" style={{ marginRight: "auto" }} onClick={() => setMode("reverse")}>Reverse</Button>}
          <Button variant="secondary" onClick={onClose}>Close</Button>
          {isUnmatched(p) && <Button onClick={() => setMode("match")}>Match to an invoice</Button>}
        </>}>
      <div className="rent-form">
        {error && <Alert type="error" message={error} />}
        {!mode && (
          <dl className="rent-dl">
            <div><dt>Status</dt><dd><StatusBadge kind="payment" status={p.payment_status} /></dd></div>
            <div><dt>Resident</dt><dd>{p.client ? personName(p.client) : p.payer_name || "Not matched"}</dd></div>
            <div><dt>Invoice</dt><dd>{p.cycle?.invoice_number || "Not matched"}</dd></div>
            <div><dt>Code / reference</dt><dd>{p.mpesa_receipt || p.reference || "—"}</dd></div>
            <div><dt>Paid</dt><dd>{formatDateTime(p.paid_at || p.created_at)}</dd></div>
            <div><dt>Payer phone</dt><dd>{p.payer_phone || "—"}</dd></div>
            {p.notes && <div style={{ gridColumn: "1 / -1" }}><dt>Notes</dt><dd>{p.notes}</dd></div>}
          </dl>
        )}
        {mode === "reverse" && (<>
          <p style={{ margin: 0 }}>Use this for a payment that was entered by mistake or did not arrive. The invoice goes back to owing {money(p.amount)}.</p>
          <TextArea label="Reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </>)}
        {mode === "match" && (
          <SelectInput label="Invoice that this pays" value={cycleId} onChange={setCycleId} placeholder={fits.length ? "Choose an invoice" : "No invoice has a big enough balance"}
            options={fits.map((c) => ({ value: c.id, label: `${c.invoice_number} · ${personName(c.client)} · owes ${money(c.balance)} · due ${formatDate(c.due_date)}` }))}
            helper="Only invoices that can take the whole amount are listed." />
        )}
      </div>
    </Modal>
  );
}

export default function PaymentsPage() {
  const { business } = useBusinessContext();
  const bid = business.id;
  const { data, error, loading, reload } = useAsync(async () => {
    const [p, c] = await Promise.all([listPayments(bid), listCycles(bid)]);
    return { data: { payments: p.data || [], cycles: c.data || [] }, error: p.error || c.error };
  }, [bid]);
  const [tab, setTab] = useState("all");
  const [open, setOpen] = useState(null);
  const [recording, setRecording] = useState(false);
  const all = data?.payments || [];
  const shown = all.filter((p) => tab === "all" || (tab === "unmatched" ? isUnmatched(p) : p.payment_status === "reversed"));

  const columns = [
    { key: "date", label: "Date", render: (p) => formatDate(p.paid_at || p.created_at) },
    { key: "who", label: "Resident", render: (p) => <span className="rent-strong">{p.client ? personName(p.client) : p.payer_name || "Not matched"}</span> },
    { key: "inv", label: "Invoice", render: (p) => p.cycle?.invoice_number || "—" },
    { key: "method", label: "Paid by", render: (p) => METHOD[p.payment_method] },
    { key: "ref", label: "Code", render: (p) => p.mpesa_receipt || p.reference || "—" },
    { key: "amount", label: "Amount", align: "right", render: (p) => <span className="rent-money">{money(p.amount)}</span> },
    { key: "status", label: "Status", render: (p) => (isUnmatched(p) ? <Badge variant="warning">Unmatched</Badge> : <StatusBadge kind="payment" status={p.payment_status} />) },
  ];

  return (
    <div className="rent">
      <PageHead title="Payments" lead="Every shilling that came in.">
        <Button leftIcon={<Icon name="plus" size={16} />} onClick={() => setRecording(true)}>Record payment</Button>
      </PageHead>
      {error && <Alert type="error" message={error} />}
      <Tabs label="Payment view" value={tab} onChange={setTab} tabs={[
        { value: "all", label: "All", count: all.length }, { value: "unmatched", label: "Unmatched", count: all.filter(isUnmatched).length },
        { value: "reversed", label: "Reversed", count: all.filter((p) => p.payment_status === "reversed").length }]} />
      <SimpleTable loading={loading} columns={columns} rows={shown} onRowClick={setOpen}
        empty={<Card><EmptyState icon="card" compact title="No payments here" description={tab === "unmatched" ? "Payments that cannot be matched to an invoice wait here." : "Payments appear when residents pay or you record one."} /></Card>} />
      {open && <PaymentModal key={open.id} p={open} cycles={data?.cycles || []} onClose={() => setOpen(null)} onDone={reload} />}
      {recording && <RecordPaymentModal businessId={bid} cycles={data?.cycles || []} onClose={() => setRecording(false)} onDone={reload} />}
    </div>
  );
}
