// src/pages/people/ReceiptModal.jsx — NEW FILE
//
// AIM
// A payment receipt a resident can read and print (Print opens the browser print dialog; the rest of the
// page is hidden while printing).

import { Modal } from "../../components/modals/Modal.jsx";
import Button from "../../components/ui/Button.jsx";
import { formatDateTime, formatDate } from "../../lib/format.js";
import { METHOD, StatusBadge, money } from "../rental/shared.jsx";

export default function ReceiptModal({ payment: p, business, onClose }) {
  return (
    <Modal isOpen onClose={onClose} title="Payment receipt" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button onClick={() => window.print()}>Print</Button></>}>
      <div className="rent-receipt" id="rent-receipt">
        <h3 style={{ margin: 0 }}>{business?.name}</h3>
        <dl className="rent-dl">
          <div><dt>Amount</dt><dd className="rent-money rent-strong">{money(p.amount)}</dd></div>
          <div><dt>Paid on</dt><dd>{formatDateTime(p.paid_at || p.created_at)}</dd></div>
          <div><dt>Method</dt><dd>{METHOD[p.payment_method] || p.payment_method}</dd></div>
          {(p.mpesa_receipt || p.reference) && <div><dt>Reference</dt><dd>{p.mpesa_receipt || p.reference}</dd></div>}
          {p.cycle && <div><dt>For invoice</dt><dd>{p.cycle.invoice_number} ({formatDate(p.cycle.period_start)} – {formatDate(p.cycle.period_end)})</dd></div>}
          <div><dt>Status</dt><dd><StatusBadge kind="payment" status={p.reversed_at ? "reversed" : p.payment_status} /></dd></div>
        </dl>
      </div>
    </Modal>
  );
}
