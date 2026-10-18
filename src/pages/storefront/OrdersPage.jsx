// src/pages/storefront/OrdersPage.jsx — NEW FILE (Phase 5 step 2)
//
// AIM
// /orders — my orders from every shop, newest first, each with its status and total.
// /orders/:id — one order (OrderDetail): items, where it goes, a tracking timeline, "Pay now" with
// M-Pesa while it is unpaid (the page checks the payment every few seconds), cancel while unpaid,
// and "Get help", which opens a support ticket linked to the order (Phase 3 help desk).

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Alert, Badge, Button, Card, EmptyState, Input, Skeleton, TextArea } from "../../components/ui";
import { ConfirmDialog, Modal } from "../../components/modals/Modal.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { cancelMyOrder, createOrderTicket, getMyOrder, listMyOrders, orderPayment, sendOrderPrompt } from "../../lib/api/storefront.js";
import { formatDateTime } from "../../lib/format.js";
import { toE164 } from "../../lib/phone.js";
import { money } from "./shared.jsx";
import "./Storefront.css";
import "../public/BusinessPage.css";

export const ORDER_STATUS = {
  pending_payment: ["warning", "Awaiting payment"], paid: ["info", "Paid"], processing: ["info", "Being prepared"],
  shipped: ["brand", "On the way"], ready_for_pickup: ["brand", "Ready for pickup"], delivered: ["success", "Delivered"], cancelled: ["neutral", "Cancelled"],
};
const badge = (s) => { const [v, t] = ORDER_STATUS[s] || ["neutral", s]; return <Badge variant={v}>{t}</Badge>; };

export default function MyOrdersPage() {
  const { data, error, loading, reload } = useAsync(() => listMyOrders({ limit: 50 }), []);
  return (
    <div className="pg pg--narrow sf">
      <h1 className="pg__title">My orders</h1>
      {error && <Alert type="error" message={error} />}
      {loading && !data ? <Skeleton height={90} /> : (data || []).length === 0 ? (
        <Card><EmptyState icon="file" title="No orders yet" description="When you buy from a shop, your orders appear here." action={<Button as={Link} to="/explore?type=shop">Find a shop</Button>} /></Card>
      ) : (
        <div className="sf-lines">
          {data.map((o) => (
            <Link key={o.id} to={`/orders/${o.id}`} className="sf-order">
              <span><strong>{o.order_number}</strong><br /><span className="sf-muted">{o.business?.name} · {formatDateTime(o.created_at)}</span></span>
              <span className="sf-split">{badge(o.status)}<strong>{money(o.total)}</strong></span>
            </Link>
          ))}
        </div>
      )}
      {error && <Button variant="outline" onClick={reload}>Try again</Button>}
    </div>
  );
}

function HelpModal({ order, onClose, onDone }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function send(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await createOrderTicket(order.id, subject, body);
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    onDone(r.data);
  }
  return (
    <Modal isOpen onClose={onClose} title={`Help with ${order.order_number}`} size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button loading={busy} onClick={send}>Send to support</Button></>}>
      <form className="sf-form" onSubmit={send} noValidate>
        {err && <Alert type="error" message={err} />}
        <Input label="What is the problem?" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Item missing, late delivery, wrong item…" />
        <TextArea label="Tell us more" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
        <p className="sf-muted">The platform support team and the shop are told. Replies arrive in My tickets.</p>
      </form>
    </Modal>
  );
}

export function OrderDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: o, error, loading, reload } = useAsync(() => getMyOrder(id), [id]);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [help, setHelp] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [waiting, setWaiting] = useState(params.get("prompt") === "sent");
  const [phone, setPhone] = useState("");
  const tries = useRef(0);

  // after a prompt is sent, check the payment every 4 seconds for up to 2 minutes
  useEffect(() => {
    if (!waiting) return undefined;
    tries.current = 0;
    const t = setInterval(async () => {
      tries.current += 1;
      const r = await orderPayment(id);
      const paid = r.data?.payment_status === "paid";
      const failed = ["failed", "cancelled", "timeout"].includes(r.data?.last_attempt?.status);
      if (paid || failed || tries.current >= 30) {
        clearInterval(t); setWaiting(false); reload();
        if (failed) setErr(r.data.last_attempt.result_desc || "The payment was not completed.");
        if (paid) toast.success("Payment received");
      }
    }, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, id]);

  if (loading && !o) return <div className="pg pg--narrow"><Skeleton height={200} /></div>;
  if (error || !o) return <div className="pg pg--narrow"><Card><EmptyState icon="search" title="Order not found" description={error || undefined} action={<Button as={Link} to="/orders">My orders</Button>} /></Card></div>;

  const unpaid = o.status === "pending_payment" && o.payment_status === "unpaid";
  const pn = params.get("prompt");

  async function pay() {
    const p = toE164(phone || o.customer_phone);
    if (!p) { setErr("Enter a valid Kenyan phone number."); return; }
    setBusy("pay"); setErr("");
    const r = await sendOrderPrompt(o.id, p);
    setBusy("");
    if (r.error) { setErr(r.error); return; }
    setWaiting(true);
  }
  async function cancel() {
    setBusy("cancel");
    const r = await cancelMyOrder(o.id);
    setBusy(""); setConfirm(false);
    if (r.error) { setErr(r.error); return; }
    toast.success("Order cancelled"); reload();
  }

  return (
    <div className="pg pg--narrow sf">
      <nav className="bpage__crumbs" aria-label="Breadcrumb"><Link to="/orders">My orders</Link> / <span>{o.order_number}</span></nav>
      <div className="sf-bar" style={{ border: 0 }}><h1 className="pg__title" style={{ margin: 0 }}>{o.order_number}</h1>{badge(o.status)}</div>
      {params.get("placed") && <Alert type="success" title="Order placed" message={o.payment_method === "mpesa" && unpaid ? "Complete the M-Pesa payment to confirm it." : "The shop has been told."} />}
      {pn === "manual" && unpaid && <Alert type="info" message="This shop confirms M-Pesa payments by hand. Pay to the shop's till or paybill and tell them your order number." />}
      {pn === "failed" && unpaid && !err && <Alert type="warning" message="We could not send the M-Pesa prompt. Try Pay now." />}
      {err && <Alert type="error" message={err} />}
      {waiting && <Alert type="info" title="Check your phone" message="Enter your M-Pesa PIN to pay. This page updates by itself." />}

      {unpaid && o.payment_method === "mpesa" && !waiting && (
        <Card><div className="sf-form">
          <Input label="M-Pesa phone number" type="tel" value={phone || o.customer_phone} onChange={(e) => setPhone(e.target.value)} />
          <div className="sf-split"><Button loading={busy === "pay"} onClick={pay}>Pay {money(o.total)} with M-Pesa</Button>
            <Button variant="ghost" onClick={() => setConfirm(true)}>Cancel order</Button></div>
        </div></Card>
      )}

      <Card>
        <h2 style={{ marginTop: 0 }}>Items from <Link to={`/b/${o.business?.slug}`}>{o.business?.name}</Link></h2>
        <ul className="sf-lines">
          {o.items.map((i) => (
            <li className="sf-line" key={i.id}>
              <div className="sf-line__img" style={i.product?.images?.[0] ? { backgroundImage: `url(${i.product.images[0]})` } : undefined} />
              <div><div className="sf-line__name">{i.name}</div><p className="sf-muted">{i.quantity} × {money(i.unit_price)}</p></div>
              <div className="sf-price">{money(i.line_total)}</div>
            </li>
          ))}
        </ul>
        <div className="sf-sum" style={{ marginTop: "var(--space-4)" }}>
          <div><span>Items</span><span>{money(o.subtotal)}</span></div>
          <div><span>{o.fulfilment === "pickup" ? "Pickup" : "Delivery"}</span><span>{o.delivery_fee > 0 ? money(o.delivery_fee) : "Free"}</span></div>
          <div className="sf-sum__total"><span>Total</span><span>{money(o.total)}</span></div>
        </div>
        <p className="sf-muted" style={{ marginTop: "var(--space-3)" }}>
          {o.fulfilment === "pickup" ? "You will collect this order." : `Delivering to ${o.customer_name}, ${[o.ship_street, o.ship_town, o.ship_county].filter(Boolean).join(", ")}.`}
          {" "}Payment: {o.payment_method === "mpesa" ? "M-Pesa" : "on delivery"} ({o.payment_status}).
        </p>
      </Card>

      <Card>
        <h2 style={{ marginTop: 0 }}>Tracking</h2>
        <ul className="sf-timeline">
          <li><strong>Order placed</strong><span className="sf-muted">{formatDateTime(o.created_at)}</span></li>
          {o.events.map((e) => <li key={e.id}><strong>{(ORDER_STATUS[e.status] || [0, e.status])[1]}</strong><span className="sf-muted">{formatDateTime(e.created_at)}{e.note ? ` · ${e.note}` : ""}</span></li>)}
        </ul>
      </Card>

      <Card>
        <h2 style={{ marginTop: 0 }}>Need help?</h2>
        {o.tickets.length > 0 && <p className="sf-muted">Your help request: <Link to={`/help/tickets?t=${o.tickets[0].id}`}>{o.tickets[0].subject}</Link></p>}
        <div className="sf-split">
          <Button variant="outline" onClick={() => setHelp(true)}>Get help with this order</Button>
          {o.business?.phone && <Button as="a" href={`tel:${o.business.phone}`} variant="ghost">Call the shop</Button>}
        </div>
      </Card>

      {help && <HelpModal order={o} onClose={() => setHelp(false)} onDone={(tid) => { setHelp(false); navigate(`/help/tickets?t=${tid}`); }} />}
      <ConfirmDialog isOpen={confirm} title="Cancel this order?" message="Nothing has been charged. The items go back on sale." confirmLabel="Cancel order" loading={busy === "cancel"} onConfirm={cancel} onCancel={() => setConfirm(false)} />
    </div>
  );
}
