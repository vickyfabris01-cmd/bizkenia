// src/pages/rental/InvoicesPage.jsx — NEW FILE
//
// AIM
// /app/:slug/invoices — invoices as documents to share. Each one has a link anyone holding it can
// open and print (no sign-in), so staff can send it by WhatsApp or SMS. Search by invoice number
// or resident, copy the link, or open the printable page.

import "./Rental.css";
import { useState } from "react";
import { Alert, Button, Card, EmptyState, Input } from "../../components/ui";
import SimpleTable from "../../components/data/SimpleTable.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import { listCycles, listPayments } from "../../lib/api/rental.js";
import { formatDate } from "../../lib/format.js";
import InvoiceModal, { invoiceLink } from "./InvoiceModal.jsx";
import { PageHead, StatusBadge, copyText, money, personName, roomLabel } from "./shared.jsx";

export default function InvoicesPage() {
  const { business } = useBusinessContext();
  const bid = business.id;
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(async () => {
    const [c, p] = await Promise.all([listCycles(bid), listPayments(bid)]);
    return { data: { cycles: c.data || [], payments: p.data || [] }, error: c.error || p.error };
  }, [bid]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);
  const rows = (data?.cycles || []).filter((c) => !q || `${c.invoice_number} ${personName(c.client)}`.toLowerCase().includes(q.toLowerCase()));

  async function copy(c) {
    const ok = await copyText(invoiceLink(c));
    if (ok) toast.success("Link copied"); else toast.error("Could not copy. Open the invoice and copy the link from there.");
  }
  const columns = [
    { key: "inv", label: "Invoice", render: (c) => <span className="rent-strong">{c.invoice_number}</span> },
    { key: "who", label: "Resident", render: (c) => personName(c.client) },
    { key: "room", label: "Room", render: (c) => roomLabel(c.room) },
    { key: "period", label: "Period", render: (c) => `${formatDate(c.period_start)} – ${formatDate(c.period_end)}` },
    { key: "total", label: "Total", align: "right", render: (c) => <span className="rent-money">{money(Number(c.amount_due) + Number(c.late_fee || 0))}</span> },
    { key: "status", label: "Status", render: (c) => <StatusBadge kind="cycle" status={c.status} /> },
    { key: "act", label: "", align: "right", render: (c) => (
      <span className="rent-actions" onClick={(e) => e.stopPropagation()} role="presentation">
        <Button size="sm" variant="outline" onClick={() => copy(c)}>Copy link</Button>
        <Button size="sm" variant="ghost" as="a" href={invoiceLink(c)} target="_blank" rel="noopener noreferrer">Print</Button>
      </span>) },
  ];

  return (
    <div className="rent">
      <PageHead title="Invoices" lead="Share an invoice by link, or print it." />
      {error && <Alert type="error" message={error} />}
      <form className="rent-bar" role="search" onSubmit={(e) => e.preventDefault()}>
        <Input label="Search" placeholder="Invoice number or resident" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>
      <SimpleTable loading={loading} columns={columns} rows={rows} onRowClick={setOpen}
        empty={<Card><EmptyState icon="file" compact title="No invoices yet" description="Invoices are created when a resident moves in." /></Card>} />
      {open && <InvoiceModal cycle={open} payments={data?.payments || []} businessId={bid} onClose={() => setOpen(null)} onChanged={reload} />}
    </div>
  );
}
