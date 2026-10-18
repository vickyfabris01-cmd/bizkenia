// src/pages/rental/EndTenancyModal.jsx — NEW FILE
//
// AIM
// The small dialog that ends a tenancy (resident moved out, or the stay was ended early).
// Ending frees the room, cancels invoices for periods after the move-out date that are still
// unpaid, and removes the person's resident access. Used by Residents and Tenancies.

import { useState } from "react";
import { Alert, Input, SelectInput } from "../../components/ui";
import { Modal } from "../../components/modals/Modal.jsx";
import Button from "../../components/ui/Button.jsx";
import { useToast } from "../../hooks/useNotifications.js";
import { endTenancy } from "../../lib/api/rental.js";
import { personName, todayISO } from "./shared.jsx";

export default function EndTenancyModal({ tenancy, onClose, onDone }) {
  const toast = useToast();
  const [status, setStatus] = useState("completed");
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true); setError("");
    const { error: err } = await endTenancy(tenancy.id, status, date);
    setBusy(false);
    if (err) { setError(err); return; }
    toast.success("Tenancy ended");
    onDone(); onClose();
  }

  return (
    <Modal isOpen onClose={onClose} title="End tenancy" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" loading={busy} onClick={submit}>End tenancy</Button></>}>
      <div className="rent-form">
        {error && <Alert type="error" message={error} />}
        <p style={{ margin: 0 }}>{personName(tenancy.client)} will lose resident access and room {tenancy.room?.room_number} becomes available again.</p>
        <SelectInput label="Why" value={status} onChange={setStatus} options={[{ value: "completed", label: "Moved out normally" }, { value: "terminated", label: "Ended early" }]} />
        <Input label="Move-out date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
    </Modal>
  );
}
