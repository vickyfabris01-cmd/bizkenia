// src/pages/storefront/CheckoutPage.jsx — NEW FILE (Phase 5 step 2)
//
// AIM
// /b/:slug/checkout (sign-in required; the cart is kept through sign-in). Three steps:
//   1 Delivery   delivery or pickup, who receives it, phone and address (or pick a saved address)
//   2 Payment    M-Pesa (a prompt on the phone) or, if the shop allows it, pay on delivery
//   3 Review     items, delivery fee, total, and "Place order"
// The database (place_order) checks every price, the stock and the delivery fee again, so nothing
// here can be changed in the browser to get a cheaper order. After placing, M-Pesa orders get their
// prompt straight away and the shopper lands on the order page, which waits for the payment.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Alert, Button, Card, Checkbox, EmptyState, Input, SelectInput, TextArea } from "../../components/ui";
import { COUNTIES } from "../../config/counties.js";
import useAsync from "../../hooks/useAsync.js";
import { getProductsByIds, getShopTerms, listAddresses, placeOrder, saveAddress, sendOrderPrompt } from "../../lib/api/storefront.js";
import { toE164, toLocal } from "../../lib/phone.js";
import { useSession } from "../../store/sessionStore.js";
import { lineTotal, useCart } from "../../store/cartStore.js";
import { CartLines, StoreGate, money } from "./shared.jsx";

const STEPS = ["Delivery", "Payment", "Review"];

export function deliveryFee(terms, subtotal, fulfilment) {
  if (fulfilment !== "delivery") return 0;
  if (terms.free_delivery_over != null && subtotal >= Number(terms.free_delivery_over)) return 0;
  return Number(terms.delivery_fee) || 0;
}

function Checkout({ b }) {
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  const profile = useSession((s) => s.profile);
  const all = useCart((s) => s.lines);
  const lines = useMemo(() => all.filter((l) => l.businessId === b.id), [all, b.id]);
  const { data: terms } = useAsync(() => getShopTerms(b.id), [b.id]);
  const { data: saved } = useAsync(() => listAddresses(), []);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    fulfilment: "delivery", method: "mpesa", name: profile?.full_name || "", phone: profile?.phone ? toLocal(profile.phone) || profile.phone : "",
    county: "", town: "", street: "", shipNotes: "", notes: "", mpesaPhone: "", saveAddr: false, addrId: "",
  });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  // price and stock are checked against the database when the page opens
  useEffect(() => {
    const mine = useCart.getState().linesFor(b.id);
    if (mine.length) getProductsByIds(mine.map((l) => l.productId)).then((r) => { if (r.data) useCart.getState().refresh(r.data); });
  }, [b.id]);
  useEffect(() => { if (terms) setF((s) => ({ ...s, fulfilment: terms.delivery_enabled ? s.fulfilment : "pickup" })); }, [terms]);

  if (!lines.length) {
    return <Card><EmptyState icon="search" title="Your cart is empty" description="Add something first, then come back to check out." action={<Button as={Link} to={`/b/${b.slug}/browse`}>Browse products</Button>} /></Card>;
  }
  if (!terms) return <p className="sf-muted">Loading…</p>;

  const subtotal = lineTotal(lines);
  const fee = deliveryFee(terms, subtotal, f.fulfilment);
  const total = subtotal + fee;
  const payPhone = f.mpesaPhone || f.phone;

  function useAddress(id) {
    const a = (saved || []).find((x) => x.id === id);
    if (!a) { set("addrId", ""); return; }
    setF((s) => ({ ...s, addrId: id, name: a.recipient, phone: a.phone, county: a.county || "", town: a.town || "", street: a.street || "", shipNotes: a.notes || "" }));
  }

  function validateDelivery() {
    if (f.name.trim().length < 2) return "Enter the name of the person receiving the order.";
    if (!toE164(f.phone)) return "Enter a valid Kenyan phone number, like 0712 345 678.";
    if (f.fulfilment === "delivery" && !f.town.trim() && !f.street.trim()) return "Enter the delivery address.";
    return "";
  }
  function next() {
    const e = step === 0 ? validateDelivery() : step === 1 && f.method === "mpesa" && !toE164(payPhone) ? "Enter the M-Pesa phone number that will pay." : "";
    setErr(e);
    if (!e) setStep(step + 1);
  }

  async function place() {
    setBusy(true); setErr("");
    const r = await placeOrder(b.id, lines, { ...f, phone: toE164(f.phone) || f.phone });
    if (r.error) { setBusy(false); setErr(r.error); return; }
    const orderId = r.data;
    if (f.saveAddr && f.fulfilment === "delivery" && !f.addrId) {
      await saveAddress(user.id, { recipient: f.name, phone: f.phone, county: f.county, town: f.town, street: f.street, notes: f.shipNotes, label: f.town || "Address" });
    }
    useCart.getState().clearShop(b.id);
    let prompt = "";
    if (f.method === "mpesa") {
      const p = await sendOrderPrompt(orderId, toE164(payPhone));
      prompt = p.error ? `&prompt=${p.code === "NOT_CONFIGURED" || p.code === "BUSINESS_NOT_CONFIGURED" ? "manual" : "failed"}` : "&prompt=sent";
    }
    navigate(`/orders/${orderId}?placed=1${prompt}`, { replace: true });
  }

  return (
    <>
      <h1 style={{ margin: 0 }}>Checkout</h1>
      <ol className="sf-steps" aria-label="Checkout steps">{STEPS.map((s, i) => <li key={s} aria-current={i === step ? "step" : undefined}>{i + 1}. {s}</li>)}</ol>
      {err && <Alert type="error" message={err} />}
      <div className="sf-checkout">
        <Card>
          <div className="sf-form">
            {step === 0 && (
              <>
                {terms.delivery_enabled && terms.pickup_enabled && (
                  <div className="sf-form" role="radiogroup" aria-label="How do you want to get it?">
                    <label className="sf-choice"><input type="radio" name="ful" checked={f.fulfilment === "delivery"} onChange={() => set("fulfilment", "delivery")} /><span><strong>Delivery</strong><br /><span className="sf-muted">{Number(terms.delivery_fee) > 0 ? money(terms.delivery_fee) : "Free"}</span></span></label>
                    <label className="sf-choice"><input type="radio" name="ful" checked={f.fulfilment === "pickup"} onChange={() => set("fulfilment", "pickup")} /><span><strong>Pickup</strong><br /><span className="sf-muted">Collect at {terms.pickup_address || "the shop"}</span></span></label>
                  </div>
                )}
                {!terms.delivery_enabled && <Alert type="info" message={`Pickup only: collect at ${terms.pickup_address || "the shop"}.`} />}
                {f.fulfilment === "delivery" && (saved || []).length > 0 && (
                  <SelectInput label="Saved address" value={f.addrId} onChange={useAddress} placeholder="Choose a saved address"
                    options={[{ value: "", label: "Enter a new address" }, ...saved.map((a) => ({ value: a.id, label: `${a.label || a.town || "Address"} — ${a.recipient}` }))]} />
                )}
                <div className="sf-row">
                  <Input label="Receiver's name" value={f.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" />
                  <Input label="Phone number" type="tel" inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" placeholder="0712 345 678" />
                </div>
                {f.fulfilment === "delivery" && (
                  <>
                    <div className="sf-row">
                      <SelectInput label="County" value={f.county} onChange={(v) => set("county", v)} placeholder="Choose county" options={COUNTIES.map((c) => (typeof c === "string" ? c : c.value))} />
                      <Input label="Town or area" value={f.town} onChange={(e) => set("town", e.target.value)} />
                    </div>
                    <Input label="Street, building or landmark" value={f.street} onChange={(e) => set("street", e.target.value)} />
                    <TextArea label="Delivery note (optional)" rows={2} value={f.shipNotes} onChange={(e) => set("shipNotes", e.target.value)} helper={terms.delivery_note || undefined} />
                    {!f.addrId && <Checkbox label="Save this address for next time" checked={f.saveAddr} onChange={(e) => set("saveAddr", e.target.checked)} />}
                  </>
                )}
              </>
            )}

            {step === 1 && (
              <div className="sf-form" role="radiogroup" aria-label="How will you pay?">
                <label className="sf-choice"><input type="radio" name="pay" checked={f.method === "mpesa"} onChange={() => set("method", "mpesa")} /><span><strong>M-Pesa</strong><br /><span className="sf-muted">A prompt is sent to your phone. Enter your PIN to pay.</span></span></label>
                {terms.pay_on_delivery && <label className="sf-choice"><input type="radio" name="pay" checked={f.method === "cash_on_delivery"} onChange={() => set("method", "cash_on_delivery")} /><span><strong>Pay on delivery</strong><br /><span className="sf-muted">Pay when you receive the order.</span></span></label>}
                {f.method === "mpesa" && <Input label="M-Pesa phone number" type="tel" inputMode="tel" value={f.mpesaPhone || f.phone} onChange={(e) => set("mpesaPhone", e.target.value)} helper="The number that will receive the prompt" />}
                <TextArea label="Note for the shop (optional)" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
              </div>
            )}

            {step === 2 && (
              <div className="sf-form">
                <CartLines lines={lines} editable={false} />
                <div>
                  <p style={{ margin: 0 }}><strong>{f.fulfilment === "pickup" ? "Pickup" : "Deliver to"}:</strong> {f.name}, {f.phone}</p>
                  <p className="sf-muted">{f.fulfilment === "pickup" ? terms.pickup_address || "At the shop" : [f.street, f.town, f.county].filter(Boolean).join(", ")}</p>
                  <p className="sf-muted"><strong>Payment:</strong> {f.method === "mpesa" ? `M-Pesa (${payPhone})` : "Pay on delivery"}</p>
                </div>
              </div>
            )}

            <div className="sf-split">
              {step > 0 && <Button variant="outline" onClick={() => { setErr(""); setStep(step - 1); }} disabled={busy}>Back</Button>}
              {step < 2 ? <Button onClick={next}>Continue</Button> : <Button loading={busy} onClick={place}>{f.method === "mpesa" ? `Place order and pay ${money(total)}` : "Place order"}</Button>}
            </div>
          </div>
        </Card>

        <Card>
          <h2 style={{ marginTop: 0 }}>Order summary</h2>
          <div className="sf-sum">
            <div><span>Items ({lines.reduce((n, l) => n + l.quantity, 0)})</span><span>{money(subtotal)}</span></div>
            <div><span>{f.fulfilment === "pickup" ? "Pickup" : "Delivery"}</span><span>{fee ? money(fee) : "Free"}</span></div>
            <div className="sf-sum__total"><span>Total</span><span>{money(total)}</span></div>
          </div>
        </Card>
      </div>
    </>
  );
}

export default function CheckoutPage() { return <StoreGate>{(b) => <Checkout b={b} />}</StoreGate>; }
