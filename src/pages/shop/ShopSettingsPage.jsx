// src/pages/shop/ShopSettingsPage.jsx — MODIFIED (Phase 6: Danger zone — hand over or delete the business)
//
// AIM
// /app/:slug/settings (owner only) — how the shop delivers and takes payment: delivery on or off
// and its fee (with an optional free-delivery amount), pickup and its address, and the optional
// "pay on delivery" choice (off by default, because it changes how stock and orders behave).
// The logo and cover photo are uploaded here too, with the same cards the other business types
// use, and the business profile is edited on the page shared with sign-up.

import "./Shop.css";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Card, CardBody, CardHeader, Input, TextArea, Toggle } from "../../components/ui";
import BusinessLogoCard from "../../components/business/BusinessLogoCard.jsx";
import BusinessCoverCard from "../../components/business/BusinessCoverCard.jsx";
import BusinessDangerZone from "../../components/lifecycle/BusinessDangerZone.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { getShopMpesa, getShopSettings, saveShopMpesa, saveShopSettings } from "../../lib/api/shop.js";
import { Loading, LoadError, PageHead, useShop } from "./shared.jsx";

function MpesaCard({ bid }) {
  const toast = useToast();
  const { data, reload } = useAsync(() => getShopMpesa(bid), [bid]);
  const [code, setCode] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { if (data) setCode(data.shortcode || ""); }, [data]);
  async function save(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await saveShopMpesa(bid, code, key);
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setKey(""); toast.success("M-Pesa details saved"); reload();
  }
  return (
    <Card>
      <CardHeader title="M-Pesa payments" subtitle="Where customers' M-Pesa payments are sent" />
      <CardBody>
        <form className="shop-form" onSubmit={save} noValidate>
          {err && <Alert type="error" message={err} />}
          <Input label="Paybill or till number" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} helper="5 to 7 digits" />
          <Input label="Lipa na M-Pesa passkey" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)}
            helper={data?.has_passkey ? "A passkey is saved. Leave empty to keep it." : "From your Safaricom Daraja app"} />
          <p className="shop-hint">Without these, customers cannot get an M-Pesa prompt on a live system. You can still confirm a payment by hand from the order.</p>
          <div><Button type="submit" loading={busy}>Save M-Pesa details</Button></div>
        </form>
      </CardBody>
    </Card>
  );
}

export default function ShopSettingsPage() {
  const { business, bid } = useShop();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => getShopSettings(bid), [bid]);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { if (data) setF({ ...data, free_delivery_over: data.free_delivery_over ?? "", pickup_address: data.pickup_address || "", delivery_note: data.delivery_note || "" }); }, [data]);

  if ((loading && !data) || !f) return error ? <LoadError error={error} onRetry={reload} /> : <Loading />;
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  async function save(e) {
    e.preventDefault();
    if (f.delivery_enabled && !(Number(f.delivery_fee) >= 0)) { setErr("Enter the delivery fee (0 for free)."); return; }
    if (f.pickup_enabled && !String(f.pickup_address).trim()) { setErr("Enter the address where customers collect orders."); return; }
    setBusy(true); setErr("");
    const r = await saveShopSettings(bid, f);
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    toast.success("Shop settings saved"); reload();
  }

  return (
    <div className="shop">
      <PageHead title="Settings" lead="How you deliver, how customers pay, and how your shop looks." />
      <div className="shop-grid shop-grid--2">
        <Card>
          <CardHeader title="Delivery and payment" subtitle="Applied to every order at checkout" />
          <CardBody>
            <form className="shop-form" onSubmit={save} noValidate>
              {err && <Alert type="error" message={err} />}
              <div className="shop-switches">
                <Toggle label="Deliver to customers" checked={!!f.delivery_enabled} onChange={(v) => set("delivery_enabled", v)} />
                {f.delivery_enabled && (
                  <div className="shop-form__row">
                    <Input label="Delivery fee (KSh)" type="number" min="0" step="any" value={f.delivery_fee} onChange={(e) => set("delivery_fee", e.target.value)} helper="Use 0 for free delivery" />
                    <Input label="Free delivery over (KSh, optional)" type="number" min="0" step="any" value={f.free_delivery_over} onChange={(e) => set("free_delivery_over", e.target.value)} helper="Orders above this amount ship free" />
                  </div>
                )}
                <Toggle label="Customers can collect (pickup)" checked={!!f.pickup_enabled} onChange={(v) => set("pickup_enabled", v)} />
                {f.pickup_enabled && <Input label="Pickup address" value={f.pickup_address} onChange={(e) => set("pickup_address", e.target.value)} placeholder="Shop 12, Moi Avenue, Nakuru" />}
                <Toggle label="Allow pay on delivery" checked={!!f.pay_on_delivery} onChange={(v) => set("pay_on_delivery", v)} />
                <p className="shop-hint">Off by default. When on, customers can place an order without paying first; stock is still set aside, and the order counts as paid when you mark it delivered.</p>
              </div>
              <TextArea label="Delivery note (optional)" rows={3} value={f.delivery_note} onChange={(e) => set("delivery_note", e.target.value)} helper="Shown at checkout, for example delivery times or areas" />
              <div><Button type="submit" loading={busy}>Save settings</Button></div>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Business profile" subtitle="Name, description, phone and place shown to shoppers" />
          <CardBody><Button as={Link} to={`/start/details?business=${business.slug}`} variant="outline">Edit business details</Button></CardBody>
        </Card>
      </div>

      <MpesaCard bid={bid} />

      <div className="shop-grid shop-grid--2">
        <BusinessLogoCard business={business} />
        <BusinessCoverCard business={business} />
      </div>

      <BusinessDangerZone business={business} />
    </div>
  );
}
