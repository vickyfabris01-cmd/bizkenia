// src/pages/shop/OrdersPage.jsx — NEW FILE (Phase 5)
//
// AIM
// /app/:slug/orders — the shop's orders. Tabs: New, Processing, On the way (shipped or ready for
// pickup), Completed, Cancelled, All. Open an order to see the items, the customer, where it goes,
// how it was paid and its timeline, and move it along: process, ship (or ready for pickup),
// deliver, or cancel. Cancelling puts the stock back. Each step notifies the customer. A paid
// order that is cancelled needs a refund, which is done outside the app (M-Pesa).

import "./Shop.css";
import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, EmptyState, Input } from "../../components/ui";
import { ConfirmDialog, Modal } from "../../components/modals/Modal.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { ORDER_GROUPS, getOrder, listOrders, markOrderPaid, setOrderStatus } from "../../lib/api/shop.js";
import { formatDateTime } from "../../lib/format.js";
import { Loading, LoadError, OrderBadge, PageHead, Tabs, cap, money, useShop } from "./shared.jsx";

const TABS = [
  { value: "new", label: "New" }, { value: "processing", label: "Processing" }, { value: "onway", label: "On the way" },
  { value: "done", label: "Completed" }, { value: "cancelled", label: "Cancelled" }, { value: "", label: "All" },
];
const ACTION = { processing: "Start processing", shipped: "Mark as shipped", ready_for_pickup: "Ready for pickup", delivered: "Mark as delivered", cancelled: "Cancel order" };

// the steps the database allows from each state (the database checks them again)
export function nextSteps(o) {
  switch (o.status) {
    case "pending_payment": return [...(o.payment_method === "cash_on_delivery" ? ["processing"] : []), "cancelled"];
    case "paid": return ["processing", "cancelled"];
    case "processing": return [o.fulfilment === "pickup" ? "ready_for_pickup" : "shipped", "cancelled"];
    case "shipped": case "ready_for_pickup": return ["delivered"];
    default: return [];
  }
}

function Detail({ id, onClose, onChanged }) {
  const toast = useToast();
  const { data: o, error, loading, reload } = useAsync(() => getOrder(id), [id]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState("");

  async function step(status) {
    setBusy(status); setErr("");
    const r = await setOrderStatus(id, status, note);
    setBusy(""); setConfirm(false);
    if (r.error) { setErr(r.error); return; }
    toast.success(`Order ${cap(status).toLowerCase()}`);
    setNote(""); reload(); onChanged();
  }

  async function confirmPaid() {
    const receipt = window.prompt("M-Pesa code from your statement (optional)", "");
    if (receipt === null) return;
    setBusy("paid"); setErr("");
    const r = await markOrderPaid(id, receipt);
    setBusy("");
    if (r.error) { setErr(r.error); return; }
    toast.success("Payment confirmed"); reload(); onChanged();
  }

  const steps = o ? nextSteps(o) : [];
  return (
    <Modal isOpen onClose={onClose} title={o ? `Order ${o.order_number}` : "Order"} size="md" footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      {(error || err) && <Alert type="error" message={error || err} />}
      {loading && !o ? <p className="shop-hint">Loading…</p> : o && (
        <div className="shop-form">
          <div className="shop-badges"><OrderBadge status={o.status} /><Badge variant={o.payment_status === "paid" ? "success" : "warning"}>{o.payment_status === "paid" ? "Paid" : cap(o.payment_status)}</Badge><Badge variant="neutral">{o.payment_method === "mpesa" ? "M-Pesa" : "Pay on delivery"}</Badge></div>
          <p className="shop-hint" style={{ margin: 0 }}>Placed {formatDateTime(o.created_at)}</p>

          <ul className="shop-lines" aria-label="Items">
            {o.items.map((i) => <li key={i.id}><span>{i.quantity} × {i.name}</span><span>{money(i.line_total)}</span></li>)}
            <li><span>Delivery</span><span>{money(o.delivery_fee)}</span></li>
          </ul>
          <div className="shop-total"><span>Total</span><span>{money(o.total)}</span></div>

          <div>
            <p className="shop-list__title" style={{ margin: 0 }}>{o.customer_name}</p>
            <p className="shop-hint" style={{ margin: 0 }}><a href={`tel:${o.customer_phone}`}>{o.customer_phone}</a></p>
            <p className="shop-hint" style={{ margin: 0 }}>{o.fulfilment === "pickup" ? "Customer will collect the order." : [o.ship_street, o.ship_town, o.ship_county].filter(Boolean).join(", ") || "No address given."}</p>
            {o.ship_notes && <p className="shop-hint" style={{ margin: 0 }}>Delivery note: {o.ship_notes}</p>}
            {o.notes && <p className="shop-hint" style={{ margin: 0 }}>Customer note: {o.notes}</p>}
          </div>

          {o.status === "cancelled" && o.payment_status === "paid" && <Alert type="warning" message="This order was paid. Send the refund through M-Pesa, outside the app." />}

          <div>
            <p className="shop-list__title" style={{ margin: "0 0 var(--space-2)" }}>Timeline</p>
            <ul className="shop-timeline">
              <li><span className="shop-list__title">Order placed</span><span className="shop-hint">{formatDateTime(o.created_at)}</span></li>
              {o.events.map((e) => <li key={e.id}><span className="shop-list__title">{(ORDER_LABEL[e.status] || cap(e.status))}</span><span className="shop-hint">{formatDateTime(e.created_at)}{e.note ? ` · ${e.note}` : ""}</span></li>)}
            </ul>
          </div>

          {o.status === "pending_payment" && o.payment_method === "mpesa" && (
            <Alert type="info" message="Waiting for the customer's M-Pesa payment. If you already received it on your till or paybill, confirm it here.">
            </Alert>
          )}
          {o.status === "pending_payment" && o.payment_method === "mpesa" && (
            <div><Button variant="outline" loading={busy === "paid"} onClick={confirmPaid}>Confirm M-Pesa payment</Button></div>
          )}

          {steps.length > 0 && (
            <>
              <Input label="Note for the customer (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Rider will call before arriving" />
              <div className="shop-split">
                {steps.map((s) => s === "cancelled"
                  ? <Button key={s} variant="ghost" onClick={() => setConfirm(true)}>{ACTION[s]}</Button>
                  : <Button key={s} loading={busy === s} disabled={Boolean(busy)} onClick={() => step(s)}>{ACTION[s]}</Button>)}
              </div>
            </>
          )}
        </div>
      )}
      <ConfirmDialog isOpen={confirm} title="Cancel this order?" message="The stock is put back and the customer is told. A paid order needs a refund from you." confirmLabel="Cancel order" loading={busy === "cancelled"} onConfirm={() => step("cancelled")} onCancel={() => setConfirm(false)} />
    </Modal>
  );
}

const ORDER_LABEL = { pending_payment: "Awaiting payment", paid: "Paid", processing: "Processing", shipped: "Shipped", ready_for_pickup: "Ready for pickup", delivered: "Delivered", cancelled: "Cancelled" };

export default function OrdersPage() {
  const { bid } = useShop();
  const [group, setGroup] = useState("new");
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [limit, setLimit] = useState(25);
  const [open, setOpen] = useState(null);

  useEffect(() => { const t = setTimeout(() => { setTerm(search); setLimit(25); }, 300); return () => clearTimeout(t); }, [search]);
  const { data: rows, error, loading, reload } = useAsync(() => listOrders(bid, { group, search: term, limit: limit + 1 }), [bid, group, term, limit]);

  if (loading && !rows) return <Loading />;
  if (error) return <LoadError error={error} onRetry={reload} />;
  const items = (rows || []).slice(0, limit);
  const more = (rows || []).length > limit;

  return (
    <div className="shop">
      <PageHead title="Orders" lead="Process each order, ship it, and keep the customer informed." />
      <Tabs label="Order status" value={group} onChange={(v) => { setGroup(v); setLimit(25); }} tabs={TABS} />
      <div className="shop-bar"><Input label="Search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order number or customer name" /></div>

      {items.length === 0 ? (
        <Card><EmptyState icon="file" title={term ? "No orders match" : group === "new" ? "No new orders" : "Nothing here"}
          description={term ? "Try a different search." : "Orders appear here as soon as shoppers place them."} compact /></Card>
      ) : (
        <>
          <div style={{ display: "grid", gap: "var(--space-3)" }}>
            {items.map((o) => (
              <button type="button" key={o.id} className="shop-order" onClick={() => setOpen(o.id)} aria-label={`Open order ${o.order_number}`}>
                <span style={{ display: "grid", gap: 2 }}>
                  <span className="shop-list__title">{o.order_number}</span>
                  <span className="shop-hint">{o.customer_name} · {formatDateTime(o.created_at)}</span>
                </span>
                <span className="shop-badges"><OrderBadge status={o.status} /><span className="shop-amount">{money(o.total)}</span></span>
              </button>
            ))}
          </div>
          {more && <div className="shop-more"><Button variant="outline" onClick={() => setLimit(limit + 25)}>Show more</Button></div>}
        </>
      )}
      {open && <Detail id={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </div>
  );
}
