// src/pages/farm/InventoryPage.jsx — NEW FILE
//
// AIM
// /app/:slug/inventory — supplies: seed, fertiliser, chemicals, feed, tools and fuel. Each item has
// a reorder level; at or below it the item shows a "Low stock" badge. Quantity changes only by
// recording stock in, stock out or a recount (each one is kept in the item's history), so the
// numbers can be trusted. Stock out can never go below zero.

import "./Farm.css";
import { useState } from "react";
import { Alert, Badge, Button, Card, CardBody, EmptyState, Input, SelectInput } from "../../components/ui";
import { ConfirmDialog, Modal } from "../../components/modals/Modal.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { deleteItem, listItems, listMovements, moveStock, saveItem } from "../../lib/api/farm.js";
import { formatDateTime } from "../../lib/format.js";
import { FormModal, ITEM_CATEGORIES, Loading, LoadError, PageHead, Tabs, cap, money, opts, qty, useFarm } from "./shared.jsx";

const MOVES = { in: "Stock in (bought or received)", out: "Stock out (used)", adjust: "Recount (set the exact amount)" };

function itemFields(isNew) {
  return [
    { key: "name", label: "Item", required: true, placeholder: "DAP fertiliser" },
    { key: "category", label: "Type", type: "select", options: opts(ITEM_CATEGORIES) },
    { key: "unit", label: "Unit", required: true, placeholder: "kg, bags, litres" },
    ...(isNew ? [{ key: "quantity", label: "How much you have now", type: "number", min: "0", step: "any" }] : []),
    { key: "reorder_level", label: "Reorder level", type: "number", min: "0", step: "any", helper: "Shows Low stock when the amount is at or below this" },
    { key: "unit_cost", label: "Cost per unit (KSh)", type: "number", min: "0", step: "any" },
    { key: "notes", label: "Notes", type: "textarea" },
  ];
}

function History({ item, onClose }) {
  const { data, error, loading } = useAsync(() => listMovements(item.id, { limit: 50 }), [item.id]);
  return (
    <Modal isOpen onClose={onClose} title={`${item.name} history`} size="md" footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      {error && <Alert type="error" message={error} />}
      {loading ? <p className="farm-card__meta">Loading…</p> : !data?.length ? <p className="farm-card__meta">No movements yet.</p> : (
        <ul className="farm-list">
          {data.map((m) => (
            <li key={m.id}>
              <div className="farm-list__main"><span className="farm-list__title">{m.kind === "in" ? "Stock in" : m.kind === "out" ? "Stock out" : "Recount"} · {qty(m.quantity)} {item.unit}</span>
                <span className="farm-list__sub">{formatDateTime(m.moved_at)}{m.note ? ` · ${m.note}` : ""}</span></div>
              <span className="farm-amount">{qty(m.balance_after)} left</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

export default function InventoryPage() {
  const { bid } = useFarm();
  const toast = useToast();
  const { data: items, error, loading, reload } = useAsync(() => listItems(bid), [bid]);
  const [tab, setTab] = useState("all");
  const [form, setForm] = useState(null);       // { item? }
  const [move, setMove] = useState(null);       // item
  const [history, setHistory] = useState(null); // item
  const [confirm, setConfirm] = useState(null); // item
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [mv, setMv] = useState({ kind: "in", quantity: "", note: "" });
  const [mvErr, setMvErr] = useState("");

  if (loading && !items) return <Loading />;
  if (error) return <LoadError error={error} onRetry={reload} />;
  const isLow = (i) => Number(i.reorder_level) > 0 && Number(i.quantity) <= Number(i.reorder_level);
  const low = items.filter(isLow);
  const shown = tab === "low" ? low : items;

  async function submitMove(e) {
    e.preventDefault();
    if (mv.kind !== "adjust" && !(Number(mv.quantity) > 0)) { setMvErr("Enter an amount above zero."); return; }
    if (mv.kind === "adjust" && (mv.quantity === "" || Number(mv.quantity) < 0)) { setMvErr("Enter the amount you counted."); return; }
    setBusy(true); setMvErr("");
    const { error: e2 } = await moveStock(move.id, mv.kind, mv.quantity, mv.note);
    setBusy(false);
    if (e2) { setMvErr(e2); return; }
    toast.success("Stock updated"); setMove(null); reload();
  }

  return (
    <div className="farm">
      <PageHead title="Inventory and supplies" lead={items.length ? `${items.length} item${items.length === 1 ? "" : "s"}${low.length ? ` · ${low.length} low` : ""}` : "Seed, fertiliser, chemicals, feed and tools"}>
        <Button onClick={() => setForm({})}>Add an item</Button>
      </PageHead>
      {err && <Alert type="error" message={err} />}

      {items.length > 0 && <Tabs label="Stock" value={tab} onChange={setTab} tabs={[{ value: "all", label: "All items", count: items.length }, { value: "low", label: "Low stock", count: low.length }]} />}

      {items.length === 0 ? (
        <Card><EmptyState icon="file" title="No supplies yet" description="Add what you keep in store and set a reorder level, and the app tells you when to restock." action={<Button onClick={() => setForm({})}>Add an item</Button>} /></Card>
      ) : shown.length === 0 ? (
        <Card><EmptyState icon="success" compact title="Nothing is low" description="Every item is above its reorder level." /></Card>
      ) : (
        <div className="farm-cards">
          {shown.map((i) => {
            const pct = Number(i.reorder_level) > 0 ? Math.min(100, Math.round((Number(i.quantity) / (Number(i.reorder_level) * 2)) * 100)) : 100;
            return (
              <Card key={i.id}><CardBody>
                <div className="farm-card__row"><h3 className="farm-card__title">{i.name}</h3>{isLow(i) && <Badge variant="warning">Low stock</Badge>}</div>
                <p className="farm-card__meta">{cap(i.category)}{i.unit_cost != null ? ` · ${money(i.unit_cost)} per ${i.unit}` : ""}</p>
                <p className="farm-stat__value" style={{ margin: "var(--space-2) 0" }}>{qty(i.quantity)} <span className="farm-card__meta">{i.unit}</span></p>
                <div className={`farm-meter${isLow(i) ? " farm-meter--low" : ""}`} role="img" aria-label={`${qty(i.quantity)} ${i.unit} in stock, reorder at ${qty(i.reorder_level)}`}><span style={{ width: `${pct}%` }} /></div>
                <p className="farm-card__meta">Reorder at {qty(i.reorder_level)} {i.unit}</p>
                <div className="farm-split" style={{ marginTop: "var(--space-2)" }}>
                  <Button size="sm" onClick={() => { setMv({ kind: "in", quantity: "", note: "" }); setMvErr(""); setMove(i); }}>Update stock</Button>
                  <Button size="sm" variant="outline" onClick={() => setHistory(i)}>History</Button>
                  <Button size="sm" variant="ghost" onClick={() => setForm({ item: i })}>Edit</Button>
                </div>
              </CardBody></Card>
            );
          })}
        </div>
      )}

      <FormModal open={Boolean(form)} title={form?.item ? "Edit item" : "Add an item"} fields={itemFields(!form?.item)} onClose={() => setForm(null)}
        initial={form?.item ? { ...form.item, unit_cost: form.item.unit_cost ?? "", notes: form.item.notes || "" } : { name: "", category: "fertiliser", unit: "kg", quantity: "", reorder_level: "", unit_cost: "", notes: "" }}
        danger={form?.item ? { label: "Delete", onClick: () => { setConfirm(form.item); setForm(null); } } : undefined}
        onSubmit={async (v) => { const r = await saveItem(bid, v); if (!r.error) { toast.success(form?.item ? "Item updated" : "Item added"); reload(); } return r; }} />

      <Modal isOpen={Boolean(move)} onClose={() => setMove(null)} title={move ? `Update ${move.name}` : ""} size="sm"
        footer={<><Button variant="secondary" onClick={() => setMove(null)}>Cancel</Button><Button type="submit" form="stock-form" loading={busy}>Save</Button></>}>
        {move && (
          <form id="stock-form" className="farm-form" onSubmit={submitMove} noValidate>
            {mvErr && <Alert type="error" message={mvErr} />}
            <p className="farm-card__meta" style={{ margin: 0 }}>Now: {qty(move.quantity)} {move.unit}</p>
            <SelectInput label="What happened" value={mv.kind} onChange={(v) => setMv({ ...mv, kind: v })} options={Object.entries(MOVES).map(([value, label]) => ({ value, label }))} />
            <Input label={mv.kind === "adjust" ? `Amount counted (${move.unit})` : `Amount (${move.unit})`} type="number" min="0" step="any" required value={mv.quantity} onChange={(e) => setMv({ ...mv, quantity: e.target.value })} />
            <Input label="Note" value={mv.note} onChange={(e) => setMv({ ...mv, note: e.target.value })} placeholder="Bought at the agrovet, used on North plot…" />
          </form>
        )}
      </Modal>
      {history && <History item={history} onClose={() => setHistory(null)} />}
      <ConfirmDialog isOpen={Boolean(confirm)} title="Delete this item?" message="Its stock history is deleted too. This cannot be undone." confirmLabel="Delete item" loading={busy}
        onConfirm={async () => { setBusy(true); const r = await deleteItem(confirm.id); setBusy(false); setConfirm(null); if (r.error) setErr(r.error); else { toast.success("Item removed"); reload(); } }}
        onCancel={() => setConfirm(null)} />
    </div>
  );
}
