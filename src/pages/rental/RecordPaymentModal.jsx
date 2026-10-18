// src/pages/rental/RecordPaymentModal.jsx — NEW FILE
//
// AIM
// Records money that was paid outside the app (cash, bank, or an M-Pesa code the resident sent).
// Pass `cycle` to pay one invoice, or `cycles` (open invoices) to let the person choose; leaving
// the invoice empty records an "unmatched" payment to be matched later. The database refuses
// amounts above the balance and M-Pesa codes that were already used.

import { useState } from "react";
import { Alert, Input, SelectInput, TextArea } from "../../components/ui";
import { Modal } from "../../components/modals/Modal.jsx";
import Button from "../../components/ui/Button.jsx";
import { useToast } from "../../hooks/useNotifications.js";
import { recordPayment } from "../../lib/api/rental.js";
import { METHOD, money, personName, todayISO } from "./shared.jsx";

const METHODS = Object.entries(METHOD).map(([value, label]) => ({ value, label }));

export default function RecordPaymentModal({ businessId, cycle, cycles = [], onClose, onDone }) {
  const toast = useToast();
  const open = cycles.filter((c) => ["unpaid", "partial", "overdue"].includes(c.status));
  const [cycleId, setCycleId] = useState(cycle?.id || "");
  const current = cycle || open.find((c) => c.id === cycleId) || null;
  const [f, setF] = useState({ amount: cycle ? String(cycle.balance) : "", method: "mpesa", reference: "", paid_at: todayISO(), notes: "", payer_name: "", payer_phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  function pickCycle(id) {
    setCycleId(id);
    const c = open.find((x) => x.id === id);
    if (c) set("amount", String(c.balance));
  }
  async function submit(e) {
    e.preventDefault();
    if (!(Number(f.amount) > 0)) { setError("Enter an amount above zero."); return; }
    if (f.method === "mpesa" && !f.reference.trim()) { setError("Enter the M-Pesa code (for example SJK1ABC234)."); return; }
    setBusy(true); setError("");
    const { error: err } = await recordPayment(businessId, { ...f, cycle_id: current?.id || null });
    setBusy(false);
    if (err) { setError(err); return; }
    toast.success("Payment recorded");
    onDone(); onClose();
  }

  return (
    <Modal isOpen onClose={onClose} title="Record a payment" size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="rec-pay" loading={busy}>Record payment</Button></>}>
      <form id="rec-pay" className="rent-form" onSubmit={submit} noValidate>
        {error && <Alert type="error" message={error} />}
        {cycle ? (
          <p style={{ margin: 0 }}>Invoice <strong>{cycle.invoice_number}</strong> for {personName(cycle.client)}. Balance {money(cycle.balance)}.</p>
        ) : (
          <SelectInput label="Invoice" value={cycleId} onChange={pickCycle} placeholder="Not matched yet (decide later)"
            options={open.map((c) => ({ value: c.id, label: `${c.invoice_number} · ${personName(c.client)} · owes ${money(c.balance)}` }))}
            helper="Leave empty if you do not know which invoice this pays. You can match it later." />
        )}
        <div className="rent-form__row">
          <Input label="Amount (KSh)" type="number" min="1" inputMode="numeric" required value={f.amount} onChange={(e) => set("amount", e.target.value)} />
          <SelectInput label="Paid by" value={f.method} onChange={(v) => set("method", v)} options={METHODS} />
        </div>
        <div className="rent-form__row">
          <Input label={f.method === "mpesa" ? "M-Pesa code" : "Reference (optional)"} required={f.method === "mpesa"} value={f.reference}
            onChange={(e) => set("reference", e.target.value)} autoCapitalize="characters" />
          <Input label="Date paid" type="date" max={todayISO()} value={f.paid_at} onChange={(e) => set("paid_at", e.target.value)} />
        </div>
        {!current && (
          <div className="rent-form__row">
            <Input label="Payer name (optional)" value={f.payer_name} onChange={(e) => set("payer_name", e.target.value)} />
            <Input label="Payer phone (optional)" inputMode="tel" value={f.payer_phone} onChange={(e) => set("payer_phone", e.target.value)} />
          </div>
        )}
        <TextArea label="Note (optional)" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
      </form>
    </Modal>
  );
}
