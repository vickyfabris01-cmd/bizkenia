// src/pages/people/MyInvoicesPage.jsx — NEW FILE
//
// AIM
// /app/:slug/my-invoices (resident) — all of my invoices with Pay now (M-Pesa), and Payment history with
// printable receipts.

import { useState } from "react";
import { Alert, Button, Card, EmptyState } from "../../components/ui";
import SimpleTable from "../../components/data/SimpleTable.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import { myCycles, myPayments } from "../../lib/api/people.js";
import { formatDate } from "../../lib/format.js";
import { METHOD, PageHead, StatusBadge, Tabs, money } from "../rental/shared.jsx";
import PayRentModal from "./PayRentModal.jsx";
import ReceiptModal from "./ReceiptModal.jsx";

export default function MyInvoicesPage() {
  const { business } = useBusinessContext();
  const { data, error, loading, reload } = useAsync(async () => {
    const [c, p] = await Promise.all([myCycles(business.id), myPayments(business.id)]);
    return { data: { cycles: c.data || [], payments: p.data || [] }, error: c.error || p.error };
  }, [business.id]);
  const [tab, setTab] = useState("invoices");
  const [pay, setPay] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const payments = (data?.payments || []).filter((p) => p.payment_status === "confirmed" || p.reversed_at);

  const invCols = [
    { key: "inv", label: "Invoice", render: (c) => <span className="rent-strong">{c.invoice_number}</span> },
    { key: "period", label: "Period", render: (c) => `${formatDate(c.period_start)} – ${formatDate(c.period_end)}` },
    { key: "due", label: "Due", render: (c) => formatDate(c.due_date) },
    { key: "total", label: "Total", align: "right", render: (c) => <span className="rent-money">{money(Number(c.amount_due) + Number(c.late_fee || 0))}</span> },
    { key: "bal", label: "Balance", align: "right", render: (c) => <span className="rent-money">{money(c.balance)}</span> },
    { key: "st", label: "Status", render: (c) => <StatusBadge kind="cycle" status={c.status} /> },
    { key: "act", label: "", align: "right", render: (c) => ["unpaid", "partial", "overdue"].includes(c.status) && <Button size="sm" onClick={() => setPay(c)}>Pay now</Button> },
  ];
  const payCols = [
    { key: "d", label: "Date", render: (p) => formatDate(p.paid_at || p.created_at) },
    { key: "m", label: "Method", render: (p) => METHOD[p.payment_method] || p.payment_method },
    { key: "r", label: "Reference", render: (p) => p.mpesa_receipt || p.reference || "—" },
    { key: "i", label: "Invoice", render: (p) => p.cycle?.invoice_number || "—" },
    { key: "a", label: "Amount", align: "right", render: (p) => <span className="rent-money">{money(p.amount)}</span> },
    { key: "s", label: "Status", render: (p) => <StatusBadge kind="payment" status={p.reversed_at ? "reversed" : p.payment_status} /> },
    { key: "x", label: "", align: "right", render: (p) => <Button size="sm" variant="outline" onClick={() => setReceipt(p)}>Receipt</Button> },
  ];

  return (
    <div className="rent">
      <PageHead title="My invoices" lead="Pay rent with M-Pesa and keep your receipts." />
      {error && <Alert type="error" message={error} />}
      <Tabs label="Invoices or payments" value={tab} onChange={setTab} tabs={[{ value: "invoices", label: "Invoices" }, { value: "payments", label: "Payment history" }]} />
      {tab === "invoices"
        ? <SimpleTable loading={loading} columns={invCols} rows={data?.cycles || []} empty={<Card><EmptyState icon="file" compact title="No invoices yet" /></Card>} />
        : <SimpleTable loading={loading} columns={payCols} rows={payments} empty={<Card><EmptyState icon="card" compact title="No payments yet" description="Payments you make appear here with a receipt." /></Card>} />}
      {pay && <PayRentModal cycle={pay} businessId={business.id} onClose={() => setPay(null)} onPaid={reload} />}
      {receipt && <ReceiptModal payment={receipt} business={business} onClose={() => setReceipt(null)} />}
    </div>
  );
}
