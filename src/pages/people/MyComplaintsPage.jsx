// src/pages/people/MyComplaintsPage.jsx — NEW FILE
//
// AIM
// /app/:slug/my-complaints (resident) — raise a complaint (title, category, priority, details) and follow the
// replies and status of each one.

import { useState } from "react";
import { Alert, Badge, Button, Card, EmptyState, Input, SelectInput, TextArea } from "../../components/ui";
import { Modal } from "../../components/modals/Modal.jsx";
import SimpleTable from "../../components/data/SimpleTable.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import { createComplaint, listComplaints } from "../../lib/api/people.js";
import { formatDate } from "../../lib/format.js";
import { PageHead } from "../rental/shared.jsx";
import ComplaintThread, { CMP_PRIORITY, CMP_STATUS } from "./ComplaintThread.jsx";

export const CATEGORIES = ["maintenance", "noise", "billing", "security", "cleanliness", "general", "other"]
  .map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));

export default function MyComplaintsPage() {
  const { business } = useBusinessContext();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => listComplaints(business.id), [business.id]);
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState(false);
  const [f, setF] = useState({ title: "", body: "", category: "maintenance", priority: "normal" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!f.title.trim()) { setErr("Give the complaint a short title."); return; }
    setBusy(true); setErr("");
    const { error: x } = await createComplaint(business.id, f);
    setBusy(false);
    if (x) { setErr(x); return; }
    toast.success("Complaint sent", "The manager has been notified.");
    setForm(false); setF({ title: "", body: "", category: "maintenance", priority: "normal" }); reload();
  }
  const cols = [
    { key: "t", label: "Complaint", render: (c) => <span className="rent-strong">{c.title}</span> },
    { key: "c", label: "Type", render: (c) => c.category },
    { key: "p", label: "Priority", render: (c) => CMP_PRIORITY[c.priority] },
    { key: "d", label: "Sent", render: (c) => formatDate(c.created_at) },
    { key: "s", label: "Status", render: (c) => <Badge variant={CMP_STATUS[c.status]?.[0]}>{CMP_STATUS[c.status]?.[1]}</Badge> },
  ];
  return (
    <div className="rent">
      <PageHead title="Complaints" lead="Report a problem and follow what the manager does about it."><Button onClick={() => setForm(true)}>New complaint</Button></PageHead>
      {error && <Alert type="error" message={error} />}
      <SimpleTable loading={loading} columns={cols} rows={data || []} onRowClick={setOpen}
        empty={<Card><EmptyState icon="complaint" compact title="No complaints" description="If something is wrong, press New complaint." /></Card>} />
      {open && <ComplaintThread complaint={open} businessId={business.id} staff={false} onClose={() => setOpen(null)} onChanged={reload} />}
      {form && (
        <Modal isOpen onClose={() => setForm(false)} title="New complaint" size="md"
          footer={<><Button variant="secondary" onClick={() => setForm(false)}>Cancel</Button><Button type="submit" form="new-cmp" loading={busy}>Send</Button></>}>
          <form id="new-cmp" className="rent-form" onSubmit={submit} noValidate>
            {err && <Alert type="error" message={err} />}
            <Input label="Title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="For example: Tap leaks in the corridor" />
            <div className="rent-form__row">
              <SelectInput label="Type" value={f.category} onChange={(v) => setF({ ...f, category: v })} options={CATEGORIES} />
              <SelectInput label="How urgent?" value={f.priority} onChange={(v) => setF({ ...f, priority: v })} options={Object.entries(CMP_PRIORITY).map(([value, label]) => ({ value, label }))} />
            </div>
            <TextArea label="Details" rows={4} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
          </form>
        </Modal>
      )}
    </div>
  );
}
