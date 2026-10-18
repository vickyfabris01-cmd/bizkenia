// src/pages/public/PricingPage.jsx — NEW FILE
//
// AIM
// The subscription prices, read live from the plans table that the super admin edits in
// Admin > Settings. Nothing is hard-coded here. A business pays the plan price by M-Pesa while
// setting up (/start/subscribe).

import { Link } from "react-router-dom";
import { Badge, Button, Card, EmptyState, Skeleton } from "../../components/ui";
import useAsync from "../../hooks/useAsync.js";
import useBrand from "../../hooks/useBrand.js";
import { listPlans } from "../../lib/api/directory.js";
import { typeLabel } from "../../config/counties.js";
import { formatKsh, periodLabel } from "../../lib/format.js";

export default function PricingPage() {
  const brand = useBrand();
  const { data, error, loading } = useAsync(() => listPlans(), []);

  return (
    <div className="pg">
      <h1 className="pg__title">Simple pricing</h1>
      <p className="pg__lead">
        Pay one subscription for your business on {brand.name}. Pay by M-Pesa. Your business goes live after it is approved.
      </p>

      {loading ? (
        <div className="pg-grid pg-grid--3">{[0, 1].map((i) => <Card key={i}><Skeleton width="50%" height={20} /><Skeleton width="40%" height={36} style={{ marginTop: 12 }} /></Card>)}</div>
      ) : error ? (
        <Card><EmptyState icon="info" title="Prices could not be loaded" description={error} /></Card>
      ) : data.length === 0 ? (
        <Card><EmptyState icon="card" title="Prices are not set yet" description="Check back soon." /></Card>
      ) : (
        <div className="pg-grid pg-grid--3">
          {data.map((p) => (
            <Card key={p.id} className="price-card">
              <Badge variant="brand">{typeLabel(p.business_type)}</Badge>
              <h2 style={{ margin: "12px 0 4px" }}>{p.name}</h2>
              <p className="price-card__price">{formatKsh(p.price_kes)} <span>{periodLabel(p.period_days)}</span></p>
              {p.description && <p>{p.description}</p>}
              <Button as={Link} to="/start" fullWidth>Choose and start</Button>
            </Card>
          ))}
        </div>
      )}
      <p style={{ marginTop: 24 }}>Agriculture and shop plans will appear here when those business types open.</p>
    </div>
  );
}
