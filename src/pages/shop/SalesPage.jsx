// src/pages/shop/SalesPage.jsx — NEW FILE
//
// AIM
// /app/:slug/sales (shop and farm) — sales made outside the system: cash, M-Pesa sent straight to
// your phone, a neighbour who walked in and asked for something you never listed. Record what was
// sold and how many, and the system takes it out of your store, field or livestock, lowers the
// listing so shoppers see what is really left, and (for a farm) adds the income. A mistake is
// reversed with "Void", which puts everything back and keeps the record.
//
// Two ways to record:
//   from a LISTING     "Tomatoes crate A: 2 sold"   takes the listing down first
//   NOT listed         a store item, crop or livestock group that was never put on sale (farm), or
//                      the shop's own store ("sold from the store")
// If a sale takes more than the unlisted amount, the newest listings are cut back to match and you
// are told which ones.

import "./Shop.css";
import { useState } from "react";
import { Alert, Badge, Button, Card, EmptyState, Input, SelectInput } from "../../components/ui";
import { Modal } from "../../components/modals/Modal.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { listProducts, listRecordedSales, listSources, recordSale, voidSale } from "../../lib/api/shop.js";
import { formatDate } from "../../lib/format.js";
import { Loading, LoadError, PageHead, money, useShop } from "./shared.jsx";

const KIND_LABEL = { item: "Store", crop: "Field", livestock: "Livestock" };
const localDay = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const EMPTY = { what: "", from: "listing", quantity: "", unitPrice: "", buyerName: "", buyerPhone: "", soldOn: "", note: "" };

export default function SalesPage({ farm = false }) {
  const { bid } = useShop();
  const toast = useToast();
  const { data: sales, error, loading, reload } = useAsync(() => listRecordedSales(bid), [bid]);
  const { data: products, reload: reloadProducts } = useAsync(() => listProducts(bid, { limit: 500 }), [bid]);
  const { data: sources, reload: reloadSources } = useAsync(() => (farm ? listSources(bid) : Promise.resolve({ data: null, error: null })), [bid, farm]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [voiding, setVoiding] = useState(null);
  const [reason, setReason] = useState("");

  const listed = (products || []).filter((p) => p.status !== "archived");
  const holdings = sources?.all || [];
  const isProduct = f.what.startsWith("p:");
  const prod = isProduct ? listed.find((p) => p.id === f.what.slice(2)) : null;
  const src = f.what.startsWith("s:") ? holdings.find((s) => `s:${s.key}` === f.what) : null;
  const canChooseSource = Boolean(prod && !prod.source_kind && prod.store_quantity > prod.stock);

  const options = [
    { value: "", label: "Choose what was sold" },
    ...listed.map((p) => ({
      value: `p:${p.id}`,
      label: p.source_kind ? `On sale: ${p.name} (${p.stock} ${p.unit} listed)` : `${farm ? "On sale: " : ""}${p.name} (${p.stock} listed${p.store_quantity > p.stock ? `, ${p.store_quantity - p.stock} in store` : ""})`,
    })),
    ...holdings.map((s) => ({ value: `s:${s.key}`, label: `Not listed: ${KIND_LABEL[s.kind]}: ${s.name} (${s.onhand} ${s.unit} on hand)` })),
  ];

  function pick(value) {
    const p = value.startsWith("p:") ? listed.find((x) => x.id === value.slice(2)) : null;
    setF({ ...f, what: value, from: "listing", unitPrice: p ? String(p.price) : f.unitPrice });
  }

  async function submit(e) {
    e.preventDefault();
    const qty = Number(f.quantity);
    if (!f.what) { setErr("Choose what was sold."); return; }
    if (!(qty > 0)) { setErr("Enter how many were sold."); return; }
    if (f.unitPrice === "" || !(Number(f.unitPrice) >= 0)) { setErr("Enter the price for each."); return; }
    setBusy(true); setErr("");
    const target = prod
      ? { productId: prod.id, fromListing: !canChooseSource || f.from === "listing" }
      : { sourceKind: src.kind, sourceId: src.id };
    const r = await recordSale(bid, { ...target, quantity: qty, unitPrice: f.unitPrice, buyerName: f.buyerName, buyerPhone: f.buyerPhone, soldOn: f.soldOn, note: f.note });
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    const cut = r.data?.trimmed || [];
    toast.success(`Sale recorded: ${money(r.data?.total ?? qty * Number(f.unitPrice))}`);
    if (cut.length) toast.info(`Listings reduced to match your stock: ${cut.map((c) => `${c.name} ${c.was} to ${c.now}`).join(", ")}`);
    setOpen(false); setF(EMPTY); reload(); reloadProducts(); reloadSources();
  }

  async function doVoid() {
    if (reason.trim().length < 3) { setErr("Say why you are voiding this sale."); return; }
    setBusy(true); setErr("");
    const r = await voidSale(voiding.id, reason);
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    toast.success("Sale voided. The stock is back."); setVoiding(null); setReason(""); reload(); reloadProducts(); reloadSources();
  }

  if (loading && !sales) return <Loading />;
  if (error) return <LoadError error={error} onRetry={reload} />;
  const rows = sales || [];
  const month = new Date().toISOString().slice(0, 7);
  const live = rows.filter((s) => !s.voided_at);
  const monthTotal = live.filter((s) => String(s.sold_on).startsWith(month)).reduce((t, s) => t + Number(s.total), 0);

  return (
    <div className="shop">
      <PageHead title="Sales" lead="Sales made outside the system. The stock goes down by itself and the listing shows what is really left.">
        <Button onClick={() => { setF({ ...EMPTY, soldOn: localDay() }); setErr(""); setOpen(true); }}>Record a sale</Button>
      </PageHead>

      {live.length > 0 && <p className="shop-hint">This month: <strong>{money(monthTotal)}</strong> from {live.filter((s) => String(s.sold_on).startsWith(month)).length} recorded sale(s). Online orders are in Orders.</p>}

      {rows.length === 0 ? (
        <Card><EmptyState icon="card" title="No recorded sales yet" description="When someone buys from you outside the system, record it here so your stock and income stay right, even for things you never listed."
          action={<Button onClick={() => { setF({ ...EMPTY, soldOn: localDay() }); setErr(""); setOpen(true); }}>Record a sale</Button>} /></Card>
      ) : (
        <Card>
          <ul className="shop-list" style={{ padding: "0 var(--space-4)" }}>
            {rows.map((s) => (
              <li key={s.id} style={s.voided_at ? { opacity: 0.6 } : undefined}>
                <div className="shop-list__main">
                  <span className="shop-list__title">{s.quantity} {s.unit || ""} {s.item_name}</span>
                  <span className="shop-list__sub">{formatDate(s.sold_on)}{s.buyer_name ? ` · ${s.buyer_name}` : ""}{s.buyer_phone ? ` · ${s.buyer_phone}` : ""}{s.voided_at ? ` · Void: ${s.void_reason}` : ""}</span>
                </div>
                <div className="shop-list__end">
                  {s.voided_at ? <Badge variant="neutral">Void</Badge> : <span className="shop-amount">{money(s.total)}</span>}
                  {!s.voided_at && <Button size="sm" variant="ghost" onClick={() => { setVoiding(s); setReason(""); setErr(""); }}>Void</Button>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Record a sale" size="md"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" form="shop-sale-form" loading={busy}>Save sale</Button></>}>
        <form id="shop-sale-form" className="shop-form" onSubmit={submit} noValidate>
          {err && <Alert type="error" message={err} />}
          <SelectInput label="What was sold?" value={f.what} onChange={pick} options={options} required />
          {canChooseSource && (
            <SelectInput label="Sold from" value={f.from} onChange={(v) => setF({ ...f, from: v })}
              options={[{ value: "listing", label: "The quantity on sale" }, { value: "store", label: "My store (it was not listed)" }]} />
          )}
          {src && <p className="shop-hint" style={{ margin: 0 }}>This was never put on sale. {src.listed > 0 ? `Part of it is offered in listings; if this sale uses that part, those listings are cut back.` : "Nothing else changes."}</p>}
          <div className="shop-form__row">
            <Input label={`How many${prod ? ` ${prod.unit}` : src ? ` ${src.unit}` : ""}`} type="number" min="0" step={prod || (src && src.kind === "livestock") ? "1" : "any"} required value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} />
            <Input label="Price for each (KSh)" type="number" min="0" step="any" required value={f.unitPrice} onChange={(e) => setF({ ...f, unitPrice: e.target.value })} />
          </div>
          <div className="shop-form__row">
            <Input label="Buyer name (optional)" value={f.buyerName} onChange={(e) => setF({ ...f, buyerName: e.target.value })} />
            <Input label="Buyer phone (optional)" inputMode="tel" value={f.buyerPhone} onChange={(e) => setF({ ...f, buyerPhone: e.target.value })} />
          </div>
          <div className="shop-form__row">
            <Input label="Date" type="date" max={localDay()} value={f.soldOn} onChange={(e) => setF({ ...f, soldOn: e.target.value })} />
            <Input label="Note (optional)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </div>
          {f.quantity && f.unitPrice !== "" && <p className="shop-hint" style={{ margin: 0 }}>Total: <strong>{money(Number(f.quantity) * Number(f.unitPrice) || 0)}</strong></p>}
        </form>
      </Modal>

      <Modal isOpen={Boolean(voiding)} onClose={() => setVoiding(null)} title="Void this sale?" size="sm"
        footer={<><Button variant="secondary" onClick={() => setVoiding(null)}>Keep it</Button><Button variant="danger" loading={busy} onClick={doVoid}>Void sale</Button></>}>
        {voiding && (
          <div className="shop-form">
            {err && <Alert type="error" message={err} />}
            <p className="shop-hint" style={{ margin: 0 }}>{voiding.quantity} {voiding.unit || ""} {voiding.item_name} for {money(voiding.total)}. The stock goes back and the income is removed. The record stays, marked void.</p>
            <Input label="Why?" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Typed the wrong amount" />
          </div>
        )}
      </Modal>
    </div>
  );
}
