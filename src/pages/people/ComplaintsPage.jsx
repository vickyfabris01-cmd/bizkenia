// src/pages/people/ComplaintsPage.jsx — NEW FILE
//
// AIM
// /app/:slug/complaints (owner, manager) — triage inbox: filter by status, open a complaint to reply, change its
// status and priority, assign it to a manager or worker, and resolve it.

import { useMemo, useState } from "react";
import { Alert, Badge, Card, EmptyState, Input } from "../../components/ui";
import SimpleTable from "../../components/data/SimpleTable.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import { listComplaints } from "../../lib/api/people.js";
import { formatDate } from "../../lib/format.js";
import { PageHead, Tabs, personName, roomLabel } from "../rental/shared.jsx";
import ComplaintThread, { CMP_PRIORITY, CMP_STATUS } from "./ComplaintThread.jsx";

export default function ComplaintsPage() {
  const { business } = useBusinessContext();
  const { data, error, loading, reload } = useAsync(() => listComplaints(business.id), [business.id]);
  const [tab, setTab] = useState("active");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);
  const all = data || [];
  const rows = useMemo(() => all.filter((c) => {
    const inTab = tab === "active" ? ["open", "in_progress"].includes(c.status) : tab === "done" ? ["resolved", "closed"].includes(c.status) : true;
    return inTab && (!q || `${c.title} ${personName(c.who)}`.toLowerCase().includes(q.toLowerCase()));
  }), [all, tab, q]);
  const urgent = all.filter((c) => ["open", "in_progress"].includes(c.status) && ["high", "urgent"].includes(c.priority)).length;

  const cols = [
    { key: "t", label: "Complaint", render: (c) => <span className="rent-strong">{c.title}</span> },
    { key: "w", label: "Resident", render: (c) => personName(c.who) },
    { key: "r", label: "Room", render: (c) => roomLabel(c.tenancy?.room) },
    { key: "c", label: "Type", render: (c) => c.category },
    { key: "p", label: "Priority", render: (c) => <Badge variant={c.priority === "urgent" ? "error" : c.priority === "high" ? "warning" : "neutral"}>{CMP_PRIORITY[c.priority]}</Badge> },
    { key: "d", label: "Sent", render: (c) => formatDate(c.created_at) },
    { key: "s", label: "Status", render: (c) => <Badge variant={CMP_STATUS[c.status]?.[0]}>{CMP_STATUS[c.status]?.[1]}</Badge> },
  ];
  return (
    <div className="rent">
      <PageHead title="Complaints" lead={urgent ? `${urgent} high priority complaint${urgent === 1 ? "" : "s"} need attention.` : "What residents have reported."} />
      {error && <Alert type="error" message={error} />}
      <Tabs label="Complaint status" value={tab} onChange={setTab}
        tabs={[{ value: "active", label: "Needs action", count: all.filter((c) => ["open", "in_progress"].includes(c.status)).length }, { value: "done", label: "Resolved" }, { value: "all", label: "All" }]} />
      <form className="rent-bar" role="search" onSubmit={(e) => e.preventDefault()}>
        <Input label="Search" placeholder="Title or resident" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>
      <SimpleTable loading={loading} columns={cols} rows={rows} onRowClick={setOpen}
        empty={<Card><EmptyState icon="complaint" compact title="No complaints here" description="New complaints from residents appear in this list." /></Card>} />
      {open && <ComplaintThread complaint={open} businessId={business.id} staff onClose={() => setOpen(null)} onChanged={reload} />}
    </div>
  );
}
