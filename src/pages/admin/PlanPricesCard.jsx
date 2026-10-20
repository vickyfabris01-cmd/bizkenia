// src/pages/admin/PlanPricesCard.jsx — NEW FILE
//
// AIM
// The subscription price grid for the super admin: one block per business type with four fixed rows
// (Monthly, Quarterly, Half a year, Yearly). The admin only types an amount and switches the row on or off.
// The saving each longer plan gives the owner is worked out live from that type's monthly price, the same way
// the database and the Pricing page do it. The database enforces the rules too (see migration p5_13):
//   * the monthly price comes first; longer plans must not cost more than their months at the monthly price;
//   * a plan can only be on sale when it has a price.
// Each type also has one optional Offer plan (own name, one of the four durations, optional start and end
// dates). An offer is only shown to owners while it is on, priced and inside its dates.

import "./PlanPricesCard.css";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, CardHeader, Input, SelectInput, Skeleton, Toggle } from "../../components/ui";
import { Modal } from "../../components/modals/Modal.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { adminListPlans, adminSavePlan } from "../../lib/api/businesses.js";
import { DURATIONS, formatDate, formatKsh, savingFor } from "../../lib/format.js";
import { typeLabel } from "../../config/counties.js";

const TYPES = ["shop", "agriculture", "rental"];
const monthsOf = (code) => DURATIONS.find((d) => d.code === code)?.months || 1;
const isWhole = (v) => /^\d+$/.test(String(v).trim());
const toNum = (v) => (isWhole(v) ? Number(v) : NaN);

export default function PlanPricesCard() {
  const toast = useToast();
  const { data: plans, loading, error, reload } = useAsync(() => adminListPlans(), []);
  const [draft, setDraft] = useState({}); // plan id -> { price, active }
  const [errs, setErrs] = useState({});    // plan id -> message
  const [busy, setBusy] = useState("");
  const [offer, setOffer] = useState(null);
  const [offerErr, setOfferErr] = useState({});

  useEffect(() => {
    const d = {};
    for (const p of plans || []) d[p.id] = { price: String(p.price_kes ?? 0), active: !!p.is_active };
    setDraft(d);
    setErrs({});
  }, [plans]);

  const byType = useMemo(() => {
    const out = {};
    for (const t of TYPES) {
      const rows = (plans || []).filter((p) => p.business_type === t);
      out[t] = {
        slots: DURATIONS.map((d) => rows.find((p) => p.kind === "standard" && p.duration_code === d.code)).filter(Boolean),
        offer: rows.find((p) => p.kind === "offer") || null,
      };
    }
    return out;
  }, [plans]);

  const dirty = (p) => draft[p.id] && (draft[p.id].price !== String(p.price_kes ?? 0) || draft[p.id].active !== !!p.is_active);
  const setRow = (id, patch) => setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  async function saveType(type) {
    const { slots } = byType[type];
    const monthly = slots.find((p) => p.duration_code === "monthly");
    if (!monthly) return;
    const monthlyPrice = toNum(draft[monthly.id]?.price);
    const found = {};
    for (const p of slots) {
      const d = draft[p.id];
      const price = toNum(d.price);
      const months = monthsOf(p.duration_code);
      if (Number.isNaN(price)) found[p.id] = "Enter a whole number of shillings, or 0 if there is no price yet.";
      else if (d.active && price <= 0) found[p.id] = "Enter a price before switching this plan on.";
      else if (price > 0 && p.id !== monthly.id) {
        if (!(monthlyPrice > 0)) found[p.id] = "Set the monthly price first.";
        else if (price > months * monthlyPrice) found[p.id] = `Cannot be more than ${months} months at the monthly price (${formatKsh(months * monthlyPrice)}).`;
      }
    }
    setErrs((e) => ({ ...e, ...Object.fromEntries(slots.map((p) => [p.id, found[p.id] || ""])) }));
    if (Object.keys(found).length) return;

    const changed = slots.filter(dirty);
    if (!changed.length) return toast.info("Nothing to save.");
    // Raising the monthly price: save it first. Lowering it: save the longer plans first, so the database never
    // sees a longer plan that costs more than its months.
    const lowering = dirty(monthly) && monthlyPrice < Number(monthly.price_kes);
    const order = lowering ? [...changed.filter((p) => p.id !== monthly.id), ...changed.filter((p) => p.id === monthly.id)]
                           : [...changed.filter((p) => p.id === monthly.id), ...changed.filter((p) => p.id !== monthly.id)];
    setBusy(type);
    for (const p of order) {
      const { error: e } = await adminSavePlan({ id: p.id, kind: "standard", price_kes: toNum(draft[p.id].price), is_active: draft[p.id].active });
      if (e) {
        setBusy("");
        toast.error(e);
        reload();
        return;
      }
    }
    setBusy("");
    toast.success(`${typeLabel(type)} prices saved.`);
    reload();
  }

  function openOffer(type) {
    const o = byType[type].offer;
    setOfferErr({});
    setOffer(o
      ? { ...o, price_kes: String(o.price_kes ?? 0), description: o.description || "", offer_starts_on: o.offer_starts_on || "", offer_ends_on: o.offer_ends_on || "" }
      : { business_type: type, kind: "offer", name: "", duration_code: "quarterly", price_kes: "", description: "", offer_starts_on: "", offer_ends_on: "", is_active: true });
  }

  async function saveOffer() {
    const found = {};
    const price = toNum(offer.price_kes);
    const monthly = byType[offer.business_type].slots.find((p) => p.duration_code === "monthly");
    const monthlyPrice = Number(monthly?.price_kes || 0);
    if (!offer.name.trim()) found.name = "Give the offer a name.";
    if (Number.isNaN(price) || price <= 0) found.price = "Enter the offer price in whole shillings.";
    else if (!(monthlyPrice > 0)) found.price = "Set the monthly price for this type first.";
    else if (price > monthsOf(offer.duration_code) * monthlyPrice) found.price = `Cannot be more than ${monthsOf(offer.duration_code)} months at the monthly price (${formatKsh(monthsOf(offer.duration_code) * monthlyPrice)}).`;
    if (offer.offer_starts_on && offer.offer_ends_on && offer.offer_ends_on < offer.offer_starts_on) found.offer_ends_on = "The offer cannot end before it starts.";
    setOfferErr(found);
    if (Object.keys(found).length) return;
    setBusy("offer");
    const { error: e } = await adminSavePlan({ ...offer, price_kes: price });
    setBusy("");
    if (e) return toast.error(e);
    toast.success("Offer saved.");
    setOffer(null);
    reload();
  }

  if (loading) return <Card><Skeleton height={28} width="40%" /><Skeleton height={200} style={{ marginTop: 12 }} /></Card>;

  return (
    <>
      <Card>
        <CardHeader
          title="Subscription prices"
          subtitle="Every business type has the same four plans. Type the amount for each, then switch it on. Set the monthly price first; the savings shown to owners are worked out from it." />
        {error && <p className="plan-grid__error" role="alert">{error}</p>}
        <div className="plan-grid">
          {TYPES.map((type) => {
            const { slots, offer: existing } = byType[type];
            const monthly = slots.find((p) => p.duration_code === "monthly");
            const monthlyDraft = toNum(draft[monthly?.id]?.price);
            const anyDirty = slots.some(dirty);
            return (
              <section key={type} className="plan-grid__type" aria-label={`${typeLabel(type)} prices`}>
                <h4 className="plan-grid__title">{typeLabel(type)}</h4>
                {slots.map((p) => {
                  const d = draft[p.id];
                  if (!d) return null;
                  const months = monthsOf(p.duration_code);
                  const price = toNum(d.price);
                  const sv = p.duration_code === "monthly" ? { kes: 0, percent: 0 } : savingFor(monthlyDraft, months, price);
                  return (
                    <div key={p.id} className="plan-grid__row">
                      <div className="plan-grid__row-top">
                        <strong>{DURATIONS.find((x) => x.code === p.duration_code)?.label}</strong>
                        <Toggle label="On sale" checked={d.active} onChange={(v) => setRow(p.id, { active: v })} />
                      </div>
                      <Input label="Price (KSh)" type="number" min="0" step="1" value={d.price}
                        onChange={(e) => setRow(p.id, { price: e.target.value })} error={errs[p.id]}
                        helper={p.duration_code === "monthly" ? "Per month" : `For ${months} months`} />
                      {sv.kes > 0 && <Badge variant="success" size="sm">Owner saves {formatKsh(sv.kes)} ({sv.percent}%)</Badge>}
                      {p.duration_code !== "monthly" && price > 0 && monthlyDraft > 0 && sv.kes === 0 && <Badge variant="neutral" size="sm">No saving (same as paying monthly)</Badge>}
                    </div>
                  );
                })}
                <div><Button loading={busy === type} disabled={!anyDirty} onClick={() => saveType(type)}>Save {typeLabel(type).toLowerCase()} prices</Button></div>

                <div className="plan-grid__offer">
                  <div className="plan-grid__offer-head">
                    <strong>Offer plan</strong>
                    {existing && <Badge variant={existing.is_active ? "success" : "neutral"} size="sm">{existing.is_active ? "On" : "Off"}</Badge>}
                  </div>
                  {existing ? (
                    <p className="plan-grid__hint">
                      {existing.name}: {formatKsh(existing.price_kes)} for {DURATIONS.find((x) => x.code === existing.duration_code)?.label.toLowerCase()}.
                      {existing.offer_starts_on ? ` From ${formatDate(existing.offer_starts_on)}.` : ""}
                      {existing.offer_ends_on ? ` Until ${formatDate(existing.offer_ends_on)}.` : ""}
                    </p>
                  ) : <p className="plan-grid__hint">No offer yet. An offer shows on the Pricing page only while it is on and inside its dates.</p>}
                  <div><Button variant="secondary" size="sm" onClick={() => openOffer(type)}>{existing ? "Edit offer" : "Add offer"}</Button></div>
                </div>
              </section>
            );
          })}
        </div>
      </Card>

      <Modal isOpen={!!offer} onClose={() => setOffer(null)} title={`${offer?.id ? "Edit" : "Add"} offer (${offer ? typeLabel(offer.business_type) : ""})`}
        footer={<><Button variant="ghost" onClick={() => setOffer(null)}>Cancel</Button><Button loading={busy === "offer"} onClick={saveOffer}>Save offer</Button></>}>
        {offer && (
          <div className="adm-form">
            <Input label="Offer name" required value={offer.name} onChange={(e) => setOffer({ ...offer, name: e.target.value })} error={offerErr.name} helper="For example, Launch special" />
            <SelectInput label="Duration" value={offer.duration_code} onChange={(v) => setOffer({ ...offer, duration_code: v })}
              options={DURATIONS.map((d) => ({ value: d.code, label: d.label }))} />
            <Input label="Offer price (KSh)" type="number" min="1" step="1" required value={offer.price_kes} onChange={(e) => setOffer({ ...offer, price_kes: e.target.value })} error={offerErr.price} />
            <div className="adm-form__row">
              <Input label="Starts on (optional)" type="date" value={offer.offer_starts_on} onChange={(e) => setOffer({ ...offer, offer_starts_on: e.target.value })} />
              <Input label="Ends on (optional)" type="date" value={offer.offer_ends_on} onChange={(e) => setOffer({ ...offer, offer_ends_on: e.target.value })} error={offerErr.offer_ends_on} />
            </div>
            <Input label="Description (optional)" value={offer.description} onChange={(e) => setOffer({ ...offer, description: e.target.value })} />
            <Toggle label="Offer is on" checked={!!offer.is_active} onChange={(v) => setOffer({ ...offer, is_active: v })} />
          </div>
        )}
      </Modal>
    </>
  );
}
