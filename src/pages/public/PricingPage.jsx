// src/pages/public/PricingPage.jsx — MODIFIED (fixed plan durations: one card per business type)
//
// AIM
// Three cards, one for each type of business (shop, agriculture, rental). Each card leads with the monthly
// price and then lists Quarterly, Half a year and Yearly with what the owner saves against paying monthly.
// A plan the super admin has not priced yet shows "Not available yet". An optional Offer plan appears only
// while it is on sale. Everything is read live from plan_catalog(); the savings are worked out by the database.

import "./PricingPage.css";
import { Link } from "react-router-dom";
import { Badge, Button, Card, EmptyState, Skeleton } from "../../components/ui";
import useAsync from "../../hooks/useAsync.js";
import useBrand from "../../hooks/useBrand.js";
import { planCatalog } from "../../lib/api/directory.js";
import { typeLabel } from "../../config/counties.js";
import { billingBlurb, formatDate, formatKsh } from "../../lib/format.js";

const TYPES = ["shop", "agriculture", "rental"];
const BLURB = {
  shop: "Sell your products and take orders online.",
  agriculture: "List your farm produce for buyers to find.",
  rental: "Advertise rooms and houses and collect rent.",
};

function PlanRow({ plan }) {
  const on = plan.available;
  return (
    <li className={`plan-row${on ? "" : " plan-row--off"}`}>
      <div className="plan-row__main">
        <span className="plan-row__name">{plan.duration_label}</span>
        <span className="plan-row__note">{on ? billingBlurb(plan.months) : "Not available yet"}</span>
      </div>
      <div className="plan-row__side">
        {on ? <span className="plan-row__price">{formatKsh(plan.price_kes)}</span> : <span className="plan-row__price plan-row__price--off">—</span>}
        {on && plan.months > 1 && plan.saving_kes > 0 && <Badge variant="success" size="sm">Save {formatKsh(plan.saving_kes)} ({plan.saving_percent}%)</Badge>}
      </div>
    </li>
  );
}

function TypeCard({ type, rows }) {
  const standard = rows.filter((r) => r.kind === "standard");
  const monthly = standard.find((r) => r.duration_code === "monthly");
  const longer = standard.filter((r) => r.duration_code !== "monthly");
  const offer = rows.find((r) => r.kind === "offer");

  return (
    <Card className="price-card tier-card">
      <Badge variant="brand">{typeLabel(type)}</Badge>
      <p className="tier-card__about">{BLURB[type]}</p>

      {monthly?.available ? (
        <p className="price-card__price">{formatKsh(monthly.price_kes)} <span>per month</span></p>
      ) : (
        <p className="tier-card__soon">Not available yet</p>
      )}

      {offer && (
        <div className="tier-card__offer">
          <div className="tier-card__offer-head"><Badge variant="warning" size="sm">Offer</Badge><strong>{offer.name}</strong></div>
          <p className="tier-card__offer-price">{formatKsh(offer.price_kes)} <span>for {offer.duration_label.toLowerCase()}</span></p>
          {offer.saving_kes > 0 && <p className="tier-card__offer-note">You save {formatKsh(offer.saving_kes)} ({offer.saving_percent}%) compared with paying monthly.</p>}
          {offer.description && <p className="tier-card__offer-note">{offer.description}</p>}
          {offer.offer_ends_on && <p className="tier-card__offer-note">Ends {formatDate(offer.offer_ends_on)}</p>}
        </div>
      )}

      <p className="tier-card__sub">Pay for longer and save</p>
      <ul className="plan-rows">{longer.map((p) => <PlanRow key={p.id} plan={p} />)}</ul>

      {monthly?.available || longer.some((p) => p.available) ? (
        <Button as={Link} to={`/start/details?type=${type}`} fullWidth>Start a {typeLabel(type).toLowerCase()} business</Button>
      ) : (
        <Button fullWidth disabled>Not available yet</Button>
      )}
    </Card>
  );
}

export default function PricingPage() {
  const brand = useBrand();
  const { data, error, loading } = useAsync(() => planCatalog(), []);

  return (
    <div className="pg">
      <h1 className="pg__title">Simple pricing</h1>
      <p className="pg__lead">
        Pick the kind of business you run on {brand.name} and how long you want to pay for. The longer the plan, the more you save.
        Pay by M-Pesa. Your business goes live after it is approved.
      </p>

      {loading ? (
        <div className="tier-grid">{TYPES.map((t) => <Card key={t}><Skeleton width="40%" height={20} /><Skeleton width="50%" height={36} style={{ marginTop: 12 }} /><Skeleton height={120} style={{ marginTop: 12 }} /></Card>)}</div>
      ) : error ? (
        <Card><EmptyState icon="info" title="Prices could not be loaded" description={error} /></Card>
      ) : (
        <div className="tier-grid">
          {TYPES.map((t) => <TypeCard key={t} type={t} rows={(data || []).filter((r) => r.business_type === t)} />)}
        </div>
      )}
    </div>
  );
}
