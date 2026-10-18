// src/pages/people/PayRentModal.jsx — NEW FILE
//
// AIM
// A resident pays one invoice with M-Pesa: enter the phone and amount, an STK prompt is sent to the phone,
// and the modal waits (checks the invoice every 4 seconds for up to 90 seconds) until the money is recorded.
// If the business has not set up M-Pesa yet the person is told to pay the manager directly.

import { useEffect, useRef, useState } from "react";
import { Alert, Input } from "../../components/ui";
import { Modal } from "../../components/modals/Modal.jsx";
import Button from "../../components/ui/Button.jsx";
import { useToast } from "../../hooks/useNotifications.js";
import { useSession } from "../../store/sessionStore.js";
import { sendRentPrompt } from "../../lib/api/rental.js";
import { myCycles } from "../../lib/api/people.js";
import { normalizePhone } from "../../lib/mpesa.js";
import { money } from "../rental/shared.jsx";

export default function PayRentModal({ cycle, businessId, onClose, onPaid }) {
  const toast = useToast();
  const profile = useSession((s) => s.profile);
  const [phone, setPhone] = useState(profile?.phone || "");
  const [amount, setAmount] = useState(String(cycle.balance));
  const [state, setState] = useState("form");          // form | sending | waiting | timeout
  const [error, setError] = useState("");
  const timer = useRef(null);

  useEffect(() => () => clearInterval(timer.current), []);

  async function send() {
    let p;
    try { p = normalizePhone(phone); } catch { setError("Enter a valid Safaricom number, like 0712 345 678."); return; }
    const a = Number(amount);
    if (!(a > 0) || a > Number(cycle.balance)) { setError(`Enter an amount between 1 and ${money(cycle.balance)}.`); return; }
    setError(""); setState("sending");
    const { error: err } = await sendRentPrompt({ cycleId: cycle.id, amount: a, phone: p });
    if (err) { setState("form"); setError(err); return; }
    setState("waiting");
    let tries = 0;
    timer.current = setInterval(async () => {
      tries += 1;
      const { data } = await myCycles(businessId);
      const now = (data || []).find((c) => c.id === cycle.id);
      if (now && Number(now.amount_paid) > Number(cycle.amount_paid)) {
        clearInterval(timer.current);
        toast.success("Payment received", "Thank you. Your receipt is in Payment history.");
        onPaid(); onClose();
      } else if (tries >= 22) { clearInterval(timer.current); setState("timeout"); }
    }, 4000);
  }

  const busy = state === "sending";
  return (
    <Modal isOpen onClose={onClose} title={`Pay invoice ${cycle.invoice_number}`} size="sm"
      footer={<>
        <Button variant="secondary" onClick={onClose}>{state === "waiting" ? "Close" : "Cancel"}</Button>
        {(state === "form" || state === "sending") && <Button loading={busy} onClick={send}>Send M-Pesa prompt</Button>}
        {state === "timeout" && <Button onClick={() => { setState("form"); }}>Try again</Button>}
      </>}>
      <div className="rent-form">
        {error && <Alert type="error" message={error} />}
        {(state === "form" || state === "sending") && (
          <>
            <p style={{ margin: 0 }}>A prompt will appear on your phone. Enter your M-Pesa PIN to pay. You owe <strong>{money(cycle.balance)}</strong>.</p>
            <Input label="M-Pesa phone number" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Input label="Amount (KSh)" type="number" min="1" max={cycle.balance} value={amount} onChange={(e) => setAmount(e.target.value)}
              helper="You can pay part of the balance now." />
          </>
        )}
        {state === "waiting" && <Alert type="info" title="Check your phone" message="Approve the M-Pesa prompt. This window updates as soon as the payment is confirmed." />}
        {state === "timeout" && <Alert type="warning" title="No payment yet" message="We did not receive a confirmation. If money left your phone it will appear in Payment history shortly; otherwise try again." />}
      </div>
    </Modal>
  );
}
