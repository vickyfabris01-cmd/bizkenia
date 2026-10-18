// src/pages/rental/TenanciesPage.jsx — NEW FILE
//
// AIM
// /app/:slug/tenancies — every tenancy, current and past, filtered by status. Staff can end a
// current tenancy here. History stays: a room that has had residents is never deleted.

import "./Rental.css";
import { useState } from "react";
import { Alert, Button, Card, EmptyState } from "../../components/ui";
import SimpleTable from "../../components/data/SimpleTable.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import { listTenancies } from "../../lib/api/rental.js";
import { formatDate } from "../../lib/format.js";
import EndTenancyModal from "./EndTenancyModal.jsx";
import { PageHead, StatusBadge, Tabs, money, personName, roomLabel } from "./shared.jsx";

export default function TenanciesPage() {
  const { business } = useBusinessContext();
  const { data, error, loading, reload } = useAsync(() => listTenancies(business.id), [business.id]);
  const [tab, setTab] = useState("active");
  const [ending, setEnding] = useState(null);
  const rows = data || [];
  const shown = rows.filter((t) => (tab === "active" ? t.status === "active" : t.status !== "active"));

  const columns = [
    { key: "name", label: "Resident", render: (t) => <span className="rent-strong">{personName(t.client)}</span> },
    { key: "room", label: "Room", render: (t) => roomLabel(t.room) },
    { key: "rent", label: "Rent", align: "right", render: (t) => <span className="rent-money">{money(t.agreed_price)}</span> },
    { key: "billing", label: "Billing", render: (t) => (t.billing_type === "semester" ? "Per semester" : "Monthly") },
    { key: "in", label: "Moved in", render: (t) => formatDate(t.move_in_date) },
    { key: "out", label: "Moved out", render: (t) => (t.move_out_date ? formatDate(t.move_out_date) : "—") },
    { key: "status", label: "Status", render: (t) => <StatusBadge kind="tenancy" status={t.status} /> },
    { key: "act", label: "", align: "right", render: (t) => (t.status === "active" ? <Button size="sm" variant="outline" onClick={() => setEnding(t)}>End</Button> : null) },
  ];

  return (
    <div className="rent">
      <PageHead title="Tenancies" lead="Who lives where, from when to when." />
      {error && <Alert type="error" message={error} />}
      <Tabs label="Tenancy status" value={tab} onChange={setTab} tabs={[
        { value: "active", label: "Current", count: rows.filter((t) => t.status === "active").length },
        { value: "past", label: "Past", count: rows.filter((t) => t.status !== "active").length }]} />
      <SimpleTable loading={loading} columns={columns} rows={shown}
        empty={<Card><EmptyState icon="swap" compact title={tab === "active" ? "No current tenancies" : "No past tenancies"} description="Tenancies start when a renter accepts an offer or you add a resident." /></Card>} />
      {ending && <EndTenancyModal tenancy={ending} onClose={() => setEnding(null)} onDone={reload} />}
    </div>
  );
}
