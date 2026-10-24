// src/pages/shop/InventoryPage.jsx — MODIFIED (shows what is in the store and what is listed)
//
// AIM
// /app/:slug/inventory — how many of each product you have in your store, and how many of those are
// listed for sale (choose how many to list on the Products screen). At or below a product's warning
// level it shows "Low stock". A product that comes from a farm's store, field or livestock is
// counted there, not here. Stock changes only by recording stock in (new stock arrived), stock out
// (lost or used) or a recount; each is kept in the product's history, and stock can never go below
// zero. Sales and cancelled orders change stock automatically and show in the history too.
//
// Props are optional and default to the shop's wording. The farm's Produce stock screen passes its
// own title and nouns (see pages/farm/ProduceStockPage.jsx).

import "./Shop.css";
import { useState } from "react";
import { Alert, Badge, Button, Card, CardBody, EmptyState, Input, SelectInput } from "../../components/ui";
import { Modal } from "../../components/modals/Modal.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { listProducts, listShopMovements, moveShopStock } from "../../lib/api/shop.js";
import { formatDateTime } from "../../lib/format.js";
import { Loading, LoadError, PageHead, Tabs, useShop } from "./shared.jsx";

const MOVES = { in: "Stock in (new stock arrived)", out: "Stock out (lost, damaged or used)", adjust: "Recount (set the exact amount)" };
const KIND = { in: "Stock in", out: "Stock out", adjust: "Recount", sale: "Sold", return: "Returned (order cancelled)" };

function History({ product, onClose }) {
  const { data, error, loading } = useAsync(() => listShopMovements(product.id, { limit: 50 }), [product.id]);
  return (
    <Modal isOpen onClose={onClose} title={`${product.name} history`} size="md" footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      {error && <Alert type="error" message={error} />}
      {loading ? <p className="shop-hint">Loading…</p> : !data?.length ? <p className="shop-hint">No stock changes yet.</p> : (
        <ul className="shop-list">
          {data.map((m) => (
            <li key={m.id}>
              <div className="shop-list__main"><span className="shop-list__title">{KIND[m.kind] || m.kind} · {m.quantity}</span><span className="shop-list__sub">{formatDateTime(m.moved_at)}{m.note ? ` · ${m.note}` : ""}</span></div>
              <span className="shop-amount">{m.balance_after} left</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

export default function InventoryPage({ title = "Inventory", noun = "product", plural = "products" }) {
  const { bid } = useShop();
  const toast = useToast();
  const { data: rows, error, loading, reload } = useAsync(() => listProducts(bid, { limit: 500 }), [bid]);
  const [tab, setTab] = useState("all");
  const [move, setMove] = useState(null);
  const [history, setHistory] = useState(null);
  const [mv, setMv] = useState({ kind: "in", quantity: "", note: "" });
  const [mvErr, setMvErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading && !rows) return <Loading />;
  if (error) return <LoadError error={error} onRetry={reload} />;
  const items = (rows || []).filter((p) => p.status !== "archived");
  const onHand = (p) => (p.source_kind ? p.stock : p.store_quantity);
  const isLow = (p) => onHand(p) <= 0 || (Number(p.low_stock_level) > 0 && onHand(p) <= p.low_stock_level);
  const low = items.filter(isLow);
  const shown = tab === "low" ? low : items;

  async function submit(e) {
    e.preventDefault();
    const n = Number(mv.quantity);
    if (mv.kind !== "adjust" && !(n > 0)) { setMvErr("Enter an amount above zero."); return; }
    if (mv.kind === "adjust" && (mv.quantity === "" || n < 0)) { setMvErr("Enter the amount you counted."); return; }
    setBusy(true); setMvErr("");
    const r = await moveShopStock(move.id, mv.kind, n, mv.note);
    setBusy(false);
    if (r.error) { setMvErr(r.error); return; }
    toast.success("Stock updated"); setMove(null); reload();
  }

  return (
    <div className="shop">
      <PageHead title={title} lead={items.length ? `${items.length} ${items.length === 1 ? noun : plural}${low.length ? ` · ${low.length} low or out` : ""}` : `How many of each ${noun} you have.`} />
      {items.length > 0 && <Tabs label="Stock" value={tab} onChange={setTab} tabs={[{ value: "all", label: `All ${plural}`, count: items.length }, { value: "low", label: "Low or out", count: low.length }]} />}

      {items.length === 0 ? (
        <Card><EmptyState icon="file" title={`No ${plural} yet`} description={`Add ${plural} first, then come here to keep their stock right.`} /></Card>
      ) : shown.length === 0 ? (
        <Card><EmptyState icon="success" compact title="Nothing is low" description={`Every ${noun} is above its warning level.`} /></Card>
      ) : (
        <div className="shop-cards">
          {shown.map((p) => {
            const out = onHand(p) <= 0;
            const pct = Number(p.low_stock_level) > 0 ? Math.min(100, Math.round((onHand(p) / (Number(p.low_stock_level) * 2)) * 100)) : 100;
            return (
              <Card key={p.id}><CardBody>
                <div className="shop-card__row"><h3 className="shop-card__title">{p.name}</h3>{out ? <Badge variant="error">Out of stock</Badge> : isLow(p) ? <Badge variant="warning">Low stock</Badge> : null}</div>
                <p className="shop-stat__value" style={{ margin: "var(--space-2) 0" }}>{onHand(p)} <span className="shop-card__meta">{p.source_kind ? `${p.unit} listed` : `${p.unit} in store`}</span></p>
                <div className={`shop-meter${isLow(p) ? " shop-meter--low" : ""}`} role="img" aria-label={`${onHand(p)} in stock, warning at ${p.low_stock_level}`}><span style={{ width: `${out ? 0 : pct}%` }} /></div>
                <p className="shop-card__meta">{p.source_kind ? "Counted in your store, field or livestock" : `${p.stock} on sale${p.store_quantity > p.stock ? ` · ${p.store_quantity - p.stock} not listed` : ""}`}{p.source_kind ? "" : ` · Warn at ${p.low_stock_level}`}</p>
                <div className="shop-split" style={{ marginTop: "var(--space-2)" }}>
                  <Button size="sm" disabled={Boolean(p.source_kind)} onClick={() => { setMv({ kind: "in", quantity: "", note: "" }); setMvErr(""); setMove(p); }}>Update stock</Button>
                  <Button size="sm" variant="outline" onClick={() => setHistory(p)}>History</Button>
                </div>
              </CardBody></Card>
            );
          })}
        </div>
      )}

      <Modal isOpen={Boolean(move)} onClose={() => setMove(null)} title={move ? `Update ${move.name}` : ""} size="sm"
        footer={<><Button variant="secondary" onClick={() => setMove(null)}>Cancel</Button><Button type="submit" form="shop-stock-form" loading={busy}>Save</Button></>}>
        {move && (
          <form id="shop-stock-form" className="shop-form" onSubmit={submit} noValidate>
            {mvErr && <Alert type="error" message={mvErr} />}
            <p className="shop-hint" style={{ margin: 0 }}>In your store now: {move.store_quantity} {move.unit}</p>
            <SelectInput label="What happened" value={mv.kind} onChange={(v) => setMv({ ...mv, kind: v })} options={Object.entries(MOVES).map(([value, label]) => ({ value, label }))} />
            <Input label={mv.kind === "adjust" ? "Amount counted" : "Amount"} type="number" min="0" step="1" required value={mv.quantity} onChange={(e) => setMv({ ...mv, quantity: e.target.value })} />
            <Input label="Note" value={mv.note} onChange={(e) => setMv({ ...mv, note: e.target.value })} placeholder="Delivery from supplier, damaged in store…" />
          </form>
        )}
      </Modal>
      {history && <History product={history} onClose={() => setHistory(null)} />}
    </div>
  );
}