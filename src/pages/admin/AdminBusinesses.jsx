// src/pages/admin/AdminBusinesses.jsx — NEW FILE
//
// AIM
// /admin/businesses (list with status filter and search) and /admin/businesses/:id (one business
// with owner, subscription, payments and the decision buttons). One file because the admin
// frame hands both paths to this screen.

import "./Admin.css";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, Input, SelectInput, Skeleton, TextArea } from "../../components/ui";
import { ConfirmDialog, Modal } from "../../components/modals/Modal.jsx";
import SimpleTable from "../../components/data/SimpleTable.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { adminGetBusiness, adminListBusinesses, adminRecordPayment, adminReview, plansForType } from "../../lib/api/businesses.js";
import { STATUS_BADGE, formatDate, formatDateTime, formatKsh } from "../../lib/format.js";
import { typeLabel } from "../../config/counties.js";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending approval" },
  { value: "active", label: "Active" },
  { value: "rejected", label: "Needs changes" },
  { value: "suspended", label: "Suspended" },
  { value: "pending_payment", label: "Awaiting payment" },
];

function StatusBadge({ status }) {
  const [variant, text] = STATUS_BADGE[status] || ["neutral", status];
  return <Badge variant={variant}>{text}</Badge>;
}

function List() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") || "";
  const q = params.get("q") || "";
  const [text, setText] = useState(q);
  const { data, error, loading } = useAsync(() => adminListBusinesses({ status, search: q }), [status, q]);
  const set = (k, v) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }); };

  return (
    <div className="adm">
      <h2 className="adm__title">Businesses</h2>
      <form className="adm__bar" role="search" onSubmit={(e) => { e.preventDefault(); set("q", text.trim()); }}>
        <Input label="Search" placeholder="Name, county or email" value={text} onChange={(e) => setText(e.target.value)} />
        <SelectInput label="Status" value={status} options={STATUS_OPTIONS} onChange={(v) => set("status", v)} />
        <Button type="submit" style={{ flex: "0 0 auto" }}>Search</Button>
      </form>
      {error && <Alert type="error" message={error} />}
      <SimpleTable loading={loading} rows={data || []} onRowClick={(r) => navigate(`/admin/businesses/${r.id}`)}
        empty={<Card><EmptyState icon="building" title="No businesses found" description="Try another status or search." compact /></Card>}
        columns={[
          { key: "name", label: "Business", render: (r) => <strong>{r.name}</strong> },
          { key: "type", label: "Type", render: (r) => typeLabel(r.business_type) },
          { key: "county", label: "County" },
          { key: "created_at", label: "Created", render: (r) => formatDate(r.created_at) },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
        ]} />
    </div>
  );
}

function Detail({ id }) {
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => adminGetBusiness(id), [id]);
  const [dialog, setDialog] = useState(null); // approve | reject | suspend | reinstate | pay
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [busy, setBusy] = useState(false);
  const [planOptions, setPlanOptions] = useState([]);
  const [planId, setPlanId] = useState("");
  const [receipt, setReceipt] = useState("");

  if (loading) return <div className="adm"><Skeleton height={32} width="40%" /><Skeleton height={200} /></div>;
  if (error || !data?.business) {
    return <div className="adm"><Card><EmptyState icon="search" title="Business not found" description={error || ""} action={<Button as={Link} to="/admin/businesses">Back to list</Button>} /></Card></div>;
  }
  const { business: b, members, subscriptions, payments } = data;
  const owner = members.find((m) => m.role === "owner");

  async function openPay() {
    const { data: plans } = await plansForType(b.business_type);
    setPlanOptions((plans || []).map((p) => ({ value: p.id, label: `${p.name} — ${formatKsh(p.price_kes)}` })));
    setPlanId(plans?.[0]?.id || "");
    setDialog("pay");
  }
  function open(kind) { setReason(""); setReasonError(""); setDialog(kind); }

  async function run() {
    setBusy(true);
    let res;
    if (dialog === "pay") res = await adminRecordPayment(b.id, planId, receipt, "Recorded by super admin");
    else {
      if ((dialog === "reject") && reason.trim().length < 3) { setReasonError("Give a reason the owner can act on."); setBusy(false); return; }
      res = await adminReview(b.id, dialog, reason.trim() || null);
    }
    setBusy(false);
    if (res.error) { toast.error(res.error); return; }
    toast.success({ approve: "Business approved.", reject: "Business sent back to the owner.", suspend: "Business suspended.", reinstate: "Business reinstated.", pay: "Payment recorded." }[dialog]);
    setDialog(null);
    reload();
  }

  return (
    <div className="adm adm-detail">
      <div>
        <Button as={Link} to="/admin/businesses" variant="ghost" size="sm">← Businesses</Button>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginTop: 8 }}>
          <h2 className="adm__title">{b.name}</h2><StatusBadge status={b.status} />
        </div>
      </div>

      {b.status === "rejected" && <Alert type="error" title="Sent back to the owner" message={b.rejection_reason} />}

      <div className="adm-actions">
        {b.status === "pending" && <>
          <Button onClick={() => open("approve")}>Approve</Button>
          <Button variant="danger" onClick={() => open("reject")}>Reject with reason</Button>
        </>}
        {b.status === "rejected" && <Button onClick={() => open("approve")}>Approve anyway</Button>}
        {b.status === "active" && <Button variant="danger" onClick={() => open("suspend")}>Suspend</Button>}
        {b.status === "suspended" && <Button onClick={() => open("reinstate")}>Reinstate</Button>}
        {(b.status === "pending_payment" || b.status === "draft") && <Button variant="secondary" onClick={openPay}>Record payment</Button>}
        {b.status === "active" && <Button as={Link} to={`/b/${b.slug}`} variant="ghost">Public page</Button>}
      </div>

      <Card>
        <CardHeader title="Details" />
        <CardBody>
          <dl className="adm-dl">
            <div><dt>Type</dt><dd>{typeLabel(b.business_type)}</dd></div>
            <div><dt>County</dt><dd>{b.county || "-"}</dd></div>
            <div><dt>Address</dt><dd>{b.address || "-"}</dd></div>
            <div><dt>Phone</dt><dd>{b.phone || "-"}</dd></div>
            <div><dt>Email</dt><dd>{b.email || "-"}</dd></div>
            <div><dt>Submitted</dt><dd>{b.submitted_at ? formatDateTime(b.submitted_at) : "-"}</dd></div>
            <div style={{ gridColumn: "1 / -1" }}><dt>Description</dt><dd>{b.description || "-"}</dd></div>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Owner and managers" />
        <CardBody>
          {members.length === 0 ? <p className="adm-hint">No members.</p> : (
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
              {members.map((m) => (
                <li key={m.user_id}><strong>{m.profile?.full_name || m.profile?.email}</strong> · {m.role}{m.profile?.email ? ` · ${m.profile.email}` : ""}{m.profile?.phone ? ` · ${m.profile.phone}` : ""}</li>
              ))}
            </ul>
          )}
          {owner && <p className="adm-hint" style={{ marginTop: 8 }}>Exactly one owner per business.</p>}
        </CardBody>
      </Card>

      <Card padding="none">
        <CardHeader title="Payments" />
        <SimpleTable rows={payments} empty={<p className="adm-hint" style={{ padding: 16 }}>No payments yet.</p>}
          columns={[
            { key: "created_at", label: "Date", render: (r) => formatDateTime(r.created_at) },
            { key: "amount_kes", label: "Amount", render: (r) => formatKsh(r.amount_kes) },
            { key: "method", label: "Method", render: (r) => (r.method === "manual" ? "Manual" : "M-Pesa STK") },
            { key: "mpesa_receipt", label: "Receipt", render: (r) => r.mpesa_receipt || "-" },
            { key: "status", label: "Status", render: (r) => <Badge variant={r.status === "success" ? "success" : r.status === "pending" ? "warning" : "error"}>{r.status}</Badge> },
          ]} />
      </Card>

      <Card padding="none">
        <CardHeader title="Subscriptions" />
        <SimpleTable rows={subscriptions} empty={<p className="adm-hint" style={{ padding: 16 }}>No subscription yet.</p>}
          columns={[
            { key: "period_start", label: "From", render: (r) => formatDate(r.period_start) },
            { key: "period_end", label: "Until", render: (r) => formatDate(r.period_end) },
            { key: "amount_kes", label: "Amount", render: (r) => formatKsh(r.amount_kes) },
          ]} />
      </Card>

      <ConfirmDialog isOpen={dialog === "approve" || dialog === "reinstate"} variant="info" loading={busy}
        title={dialog === "reinstate" ? "Reinstate this business?" : "Approve this business?"}
        message={dialog === "reinstate" ? "The business becomes active again." : "It becomes visible to the public and the owner is notified."}
        confirmLabel={dialog === "reinstate" ? "Reinstate" : "Approve"} onConfirm={run} onCancel={() => setDialog(null)} />

      <Modal isOpen={dialog === "reject" || dialog === "suspend"} onClose={() => setDialog(null)}
        title={dialog === "suspend" ? "Suspend business" : "Reject business"}
        footer={<><Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button><Button variant="danger" loading={busy} onClick={run}>{dialog === "suspend" ? "Suspend" : "Send back to owner"}</Button></>}>
        <TextArea label={dialog === "suspend" ? "Reason (optional)" : "Reason for the owner"} required={dialog === "reject"} rows={4} value={reason}
          onChange={(e) => setReason(e.target.value)} error={reasonError} helper="The owner sees this message." />
      </Modal>

      <Modal isOpen={dialog === "pay"} onClose={() => setDialog(null)} title="Record a payment"
        footer={<><Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button><Button loading={busy} onClick={run} disabled={!planId}>Record payment</Button></>}>
        <div className="adm-form">
          <SelectInput label="Plan" value={planId} options={planOptions} onChange={setPlanId} />
          <Input label="M-Pesa receipt (optional)" value={receipt} onChange={(e) => setReceipt(e.target.value)} />
          <p className="adm-hint">Use this for a payment made outside the app. The business then moves to review (or goes live when approval is automatic).</p>
        </div>
      </Modal>
    </div>
  );
}

export default function AdminBusinesses() {
  const rest = (useParams()["*"] || "").split("/");
  const id = rest[1];
  return id ? <Detail id={id} /> : <List />;
}