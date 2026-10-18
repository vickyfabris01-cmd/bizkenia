// src/pages/rental/PublicInvoicePage.jsx — NEW FILE
//
// AIM
// /invoice/:token — one invoice for anyone who holds its link (no sign-in), laid out to be read on
// a phone or printed. It shows the amounts, payments received and how to pay. The link is the only
// key: it exposes this single invoice and nothing else.

import "./Rental.css";
import { Link, useParams } from "react-router-dom";
import { Button, Card, EmptyState, Skeleton } from "../../components/ui";
import useAsync from "../../hooks/useAsync.js";
import { getPublicInvoice } from "../../lib/api/rental.js";
import { formatDate } from "../../lib/format.js";
import { METHOD, StatusBadge, money } from "./shared.jsx";

export default function PublicInvoicePage() {
  const { token } = useParams();
  const { data: v, error, loading } = useAsync(() => getPublicInvoice(token), [token]);

  if (loading) return <div className="pg pg--narrow"><Skeleton height={320} /></div>;
  if (!v) {
    return <div className="pg pg--narrow"><Card><EmptyState icon="file" title="Invoice not found" description={error || "The link may be wrong or the invoice was removed."}
      action={<Button as={Link} to="/">Go to home</Button>} /></Card></div>;
  }
  return (
    <div className="pg">
      <article className="rent-invoice">
        <div className="rent-invoice__top">
          <div><h1 className="pg__title" style={{ marginBottom: 4 }}>Invoice {v.invoice_number}</h1><p className="rent-muted">{v.business.name}</p>
            <p className="rent-muted">{[v.business.address, v.business.phone, v.business.email].filter(Boolean).join(" · ")}</p></div>
          <div style={{ textAlign: "right" }}><StatusBadge kind="cycle" status={v.status} /><p className="rent-muted" style={{ marginTop: 8 }}>Due {formatDate(v.due_date)}</p></div>
        </div>
        <dl className="rent-dl">
          <div><dt>Billed to</dt><dd>{v.resident || "—"}</dd></div>
          <div><dt>Room</dt><dd>{v.room || "—"}</dd></div>
          <div><dt>Period</dt><dd>{formatDate(v.period_start)} – {formatDate(v.period_end)}</dd></div>
        </dl>
        <table className="rent-invoice__table">
          <tbody>
            <tr><td>Rent ({v.billing_type === "semester" ? "semester" : "monthly"})</td><td className="rent-money">{money(v.amount_due)}</td></tr>
            {Number(v.late_fee) > 0 && <tr><td>Late fee</td><td className="rent-money">{money(v.late_fee)}</td></tr>}
            {(v.payments || []).map((p, i) => <tr key={i}><td>Paid {formatDate(p.paid_at)} · {METHOD[p.method]}</td><td className="rent-money">− {money(p.amount)}</td></tr>)}
            <tr className="rent-invoice__total"><td>Balance to pay</td><td className="rent-money">{money(v.balance)}</td></tr>
          </tbody>
        </table>
        {Number(v.balance) > 0 && (
          <Card><p style={{ margin: 0 }}><strong>How to pay.</strong> {v.pay_to ? <>M-Pesa paybill or till <strong>{v.pay_to}</strong>, account <strong>{v.invoice_number}</strong>.</> : "Ask the business for its payment details."} Send the M-Pesa code to the manager.</p></Card>
        )}
        <div className="no-print rent-actions"><Button onClick={() => window.print()}>Print or save as PDF</Button></div>
      </article>
    </div>
  );
}
