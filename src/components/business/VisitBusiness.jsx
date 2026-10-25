// src/components/business/VisitBusiness.jsx — NEW FILE
//
// AIM
// A small card on an item's page (product, produce, room type) that says which business it is
// listed by and links to that business's page, so someone who wants to see more can go there.
// Pass the business as loaded by getBusinessBySlug: { id, slug, name, logo_url, logo_design, county, business_type }.

import { Link } from "react-router-dom";
import { Button, Card } from "../ui";
import { typeLabel } from "../../config/counties.js";
import BusinessLogo from "../brand/BusinessLogo.jsx";

export default function VisitBusiness({ business: b, label }) {
  const where = [typeLabel(b.business_type), b.county].filter(Boolean).join(" · ");
  return (
    <Card className="visit-biz" style={{ padding: "var(--space-4)", display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
      <span aria-hidden="true" style={{ flex: "none", width: 44, height: 44, borderRadius: "var(--radius-md)", overflow: "hidden", display: "grid", placeItems: "center", background: "var(--color-primary-soft)", color: "var(--color-on-primary-soft)", fontWeight: "var(--weight-bold)" }}>
        <BusinessLogo business={b} />
      </span>
      <div style={{ flex: "1 1 160px", minWidth: 0 }}>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>{label || "Listed by"}</div>
        <div style={{ fontWeight: "var(--weight-bold)", overflowWrap: "anywhere" }}>{b.name}</div>
        {where && <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>{where}</div>}
      </div>
      <Button as={Link} to={`/b/${b.slug}`} variant="outline">Visit {b.business_type === "shop" ? "shop" : b.business_type === "agriculture" ? "farm" : "business"}</Button>
    </Card>
  );
}
