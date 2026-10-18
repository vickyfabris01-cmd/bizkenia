// src/pages/rental/InvoiceModal.jsx — NEW FILE
//
// AIM
// One invoice in full: amounts, payments made, and what staff can do with it — record a payment,
// send an M-Pesa prompt to the resident's phone, waive it, copy the share link or open the
// printable page. Used by Billing and Invoices.

import { useState } from "react";
import { Alert, Input, TextArea } from "../../components/ui";
import { Modal } from "../../components/modals/Modal.jsx";
import Button from "../../components/ui/Button.jsx";
import { useToast } from "../../hooks/useNotifications.js";
import { sendRentPrompt, waiveCycle } from "../../lib/api/rental.js";
import { normalizePhone } from "../../lib/mpesa.js";
import { formatDate } from "../../lib/format.js";
import RecordPaymentModal from "./RecordPaymentModal.jsx";
import { METHOD, StatusBadge, copyText, money, personName, roomLabel } from "./shared.jsx";

export const invoiceLink = (c) => `${window.location.origin}/invoice/${c.share_token}`;

export default function InvoiceModal({ cycle: c, payments = [], businessId, onClose, onChanged }) {
  const toast = useToast();
  const [view, setView] = useState("main");     // main | pay | waive | stk
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [phone, setPhone] = useState(c.client?.phone || "");
  const [amount, setAmount] = useState(String(c.balance));
  const mine = payments.filter((p) => p.billing_cycle_id === c.id);
  const openToPay = ["unpaid", "partial", "overdue"].includes(c.status);

  if (view === "pay") return <RecordPaymentModal businessId={businessId} cycle={c} onClose={() => setView("main")} onDone={() => { onChanged(); onClose(); }} />;

  async function copy() {
    if (await copyText(invoiceLink(c))) toast.success("Link copied"); else toast.error("Could not copy. Select the link and copy it.");
  }
  async function waive() {
    setBusy(true); setError("");
    const { error: err } = await waiveCycle(c.id, reason);
    setBusy(false);
    if (err) { setError(err); return; }
    toast.success("Invoice waived");
    onChanged(); onClose();
  }
  async function prompt() {
    let p;
    try { p = normalizePhone(phone); } catch { setError("Enter a valid Safaricom number, like 0712 345 678."); return; }
    setBusy(true); setError("");
    const { error: err } = await sendRentPrompt({ cycleId: c.id, amount: Number(amount), phone: p });
    setBusy(false);
    if (err) { setError(err); return; }
    toast.success("Prompt sent", "Ask the resident to check their phone. The payment appears here once they approve.");
    onClose();
  }

  return (
    <Modal isOpen onClose={onClose} title={`Invoice ${c.invoice_number}`} size="md"
      footer={view === "main" ? <>
        {openToPay && <Button variant="ghost" onClick={() => setView("waive")} style={{ marginRight: "auto" }}>Waive</Button>}
        <Button variant="secondary" onClick={onClose}>Close</Button>
        {openToPay && <Button variant="outline" onClick={() => setView("stk")}>Send M-Pesa prompt</Button>}
        {openToPay && <Button onClick={() => setView("pay")}>Record payment</Button>}
      </> : <>
        <Button variant="secondary" onClick={() => { setView("main"); setError(""); }}>Back</Button>
        {view === "waive" ? <Button variant="danger" loading={busy} onClick={waive}>Waive invoice</Button> : <Button loading={busy} onClick={prompt}>Send prompt</Button>}
      </>}>
      <div className="rent-form">
        {error && <Alert type="error" message={error} />}
        {view === "main" && (
          <>
            <dl className="rent-dl">
              <div><dt>Resident</dt><dd>{personName(c.client)}</dd></div>
              <div><dt>Room</dt><dd>{roomLabel(c.room)}</dd></div>
              <div><dt>Period</dt><dd>{formatDate(c.period_start)} – {formatDate(c.period_end)}</dd></div>
              <div><dt>Due</dt><dd>{formatDate(c.due_date)}</dd></div>
              <div><dt>Rent</dt><dd className="rent-money">{money(c.amount_due)}</dd></div>
              <div><dt>Late fee</dt><dd className="rent-money">{money(c.late_fee)}</dd></div>
              <div><dt>Paid</dt><dd className="rent-money">{money(c.amount_paid)}</dd></div>
              <div><dt>Balance</dt><dd className="rent-money rent-strong">{money(c.balance)}</dd></div>
              <div><dt>Status</dt><dd><StatusBadge kind="cycle" status={c.status} /></dd></div>
            </dl>
            <h3 style={{ margin: 0 }}>Payments</h3>
            <ul className="rent-list">
              {mine.map((p) => (
                <li key={p.id}><span>{METHOD[p.payment_method]}{(p.mpesa_receipt || p.reference) ? ` · ${p.mpesa_receipt || p.reference}` : ""}<small>{formatDate(p.paid_at || p.created_at)}</small></span>
                  <span style={{ textAlign: "right" }} className="rent-money">{money(p.amount)}<small><StatusBadge kind="payment" status={p.payment_status} /></small></span></li>
              ))}
              {!mine.length && <li><span className="rent-muted">No payments yet.</span></li>}
            </ul>
            <div className="rent-copy">
              <code>{invoiceLink(c)}</code>
              <Button size="sm" variant="outline" onClick={copy}>Copy link</Button>
              <Button size="sm" variant="ghost" as="a" href={invoiceLink(c)} target="_blank" rel="noopener noreferrer">Open / print</Button>
            </div>
          </>
        )}
        {view === "waive" && (
          <>
            <p style={{ margin: 0 }}>Waiving cancels what is still owed ({money(c.balance)}). This cannot be undone.</p>
            <TextArea label="Reason (kept on the invoice)" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </>
        )}
        {view === "stk" && (
          <>
            <p style={{ margin: 0 }}>Sends an M-Pesa prompt to the resident's phone. The money goes to your paybill or till set in Settings.</p>
            <Input label="Phone to prompt" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Input label="Amount (KSh)" type="number" min="1" max={c.balance} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </>
        )}
      </div>
    </Modal>
  );
}
