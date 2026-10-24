// src/pages/farm/FarmSettingsPage.jsx — MODIFIED (Phase 6 Danger zone; M-Pesa details for online orders)
//
// AIM
// /app/:slug/settings (owner only) — the farm's profile and a summary of how it is set up: name,
// type, status, county, contact details and what has been recorded so far. The profile is edited
// on the same page used at sign-up (it also handles changes that need the platform's review).
// The farm logo and cover photo are uploaded here too (the same cards rental businesses use).

import "./Farm.css";
import { Link } from "react-router-dom";
import { Badge, Button, Card, CardBody, CardHeader } from "../../components/ui";
import BusinessLogoCard from "../../components/business/BusinessLogoCard.jsx";
import BusinessCoverCard from "../../components/business/BusinessCoverCard.jsx";
import BusinessDangerZone from "../../components/lifecycle/BusinessDangerZone.jsx";
import { MpesaCard } from "../shop/ShopSettingsPage.jsx";
import useAsync from "../../hooks/useAsync.js";
import { getFarmSummary } from "../../lib/api/farm.js";
import { formatDate } from "../../lib/format.js";
import { formatAcres } from "../../lib/geo.js";
import { Loading, PageHead, useFarm } from "./shared.jsx";

const STATUS = { active: ["success", "Active"], pending_review: ["warning", "In review"], draft: ["neutral", "Draft"], rejected: ["error", "Needs changes"], suspended: ["error", "Suspended"] };

export default function FarmSettingsPage() {
  const { business, bid } = useFarm();
  const { data: s, loading } = useAsync(() => getFarmSummary(bid), [bid]);
  const [variant, label] = STATUS[business.status] || ["neutral", business.status];
  const row = (k, v) => v ? <li><div className="farm-list__main"><span className="farm-list__sub">{k}</span><span className="farm-list__title">{v}</span></div></li> : null;

  return (
    <div className="farm">
      <PageHead title="Farm settings and profile" lead="How your farm appears on the platform">
        <Button as={Link} to={`/start/details?business=${business.slug}`} variant="outline">Edit farm details</Button>
      </PageHead>

      <div className="farm-grid farm-grid--2">
        <Card>
          <CardHeader title="Profile" action={<Badge variant={variant}>{label}</Badge>} />
          <CardBody>
            <ul className="farm-list">
              {row("Farm name", business.name)}
              {row("County", business.county)}
              {row("Address", business.address)}
              {row("Phone", business.phone)}
              {row("Email", business.email)}
              {row("About", business.description)}
              {row("Started on the platform", business.created_at ? formatDate(business.created_at) : "")}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="What is recorded" subtitle="So far" />
          <CardBody>
            {loading || !s ? <p className="farm-card__meta">Loading…</p> : (
              <ul className="farm-list">
                {row("Land", `${formatAcres(s.hectares)} in ${s.fieldCount} field${s.fieldCount === 1 ? "" : "s"}`)}
                {row("Crops", `${s.cropsCount}`)}
                {row("Livestock", `${s.livestockHeads} animal${s.livestockHeads === 1 ? "" : "s"} in ${s.groups.length} group${s.groups.length === 1 ? "" : "s"}`)}
                {row("Open tasks", `${s.openTasks.length}`)}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="farm-grid farm-grid--2">
        <BusinessLogoCard business={business} />
        <BusinessCoverCard business={business} />
      </div>

      <MpesaCard bid={bid} />

      <BusinessDangerZone business={business} />
    </div>
  );
}
