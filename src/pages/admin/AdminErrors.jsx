// src/pages/admin/AdminErrors.jsx — NEW FILE (Phase 5, step 4)
//
// AIM
// /admin/errors — crashes that real visitors hit, grouped by message, newest first. Each row shows how
// many times, how many different people, when it last happened and on which page. Open a row for the
// technical trace to hand to a developer. Reports older than 30 days are removed automatically.
// Data: database function admin_client_errors (migration p5_08); the browser side is lib/monitor.js.

import "./Admin.css";
import "./AdminFinance.css";
import { useState } from "react";
import { Alert, Button, Card, EmptyState, SelectInput } from "../../components/ui";
import { Modal } from "../../components/modals/Modal.jsx";
import SimpleTable from "../../components/data/SimpleTable.jsx";
import useAsync from "../../hooks/useAsync.js";
import { listClientErrors } from "../../lib/api/platformFinance.js";
import { formatWhen } from "./AdminParts.jsx";

const RANGES = [{ value: "1", label: "Last 24 hours" }, { value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }];

export default function AdminErrors() {
  const [days, setDays] = useState("7");
  const [open, setOpen] = useState(null);
  const list = useAsync(() => listClientErrors(Number(days)), [days]);
  const rows = list.data || [];
  const close = () => setOpen(null);

  return (
    <div className="adm">
      <div className="fin-head"><div><h2 className="adm__title">App errors</h2></div></div>
      <p className="fin-lead">Crashes that visitors ran into, grouped by message. Nothing here means nothing has broken lately.</p>
      <Card>
        <div className="fin-filters"><SelectInput label="Period" value={days} options={RANGES} onChange={setDays} /></div>
      </Card>
      {list.error ? (
        <><Alert type="error" title="Could not load errors" message={list.error} /><div><Button variant="outline" onClick={list.reload}>Try again</Button></div></>
      ) : (
        <SimpleTable loading={list.loading && !list.data} rows={rows} onRowClick={setOpen}
          empty={<Card><EmptyState icon="check" title="No errors reported" description="Great news. Crashes will appear here as they happen." compact /></Card>}
          columns={[
            { key: "last_seen", label: "Last seen", render: (r) => formatWhen(r.last_seen) },
            { key: "message", label: "Error", render: (r) => <strong>{r.message}</strong> },
            { key: "times", label: "Times", render: (r) => Number(r.times).toLocaleString("en-KE") },
            { key: "users", label: "People", render: (r) => Number(r.users).toLocaleString("en-KE") },
            { key: "sample_url", label: "Page", render: (r) => <span className="fin-muted">{r.sample_url || "—"}</span> },
          ]} />
      )}
      <Modal isOpen={!!open} onClose={close} title="Error details" footer={<Button variant="ghost" onClick={close}>Close</Button>}>
        {open && (
          <div className="adm-form">
            <p><strong>{open.message}</strong></p>
            <p className="fin-muted">{open.times} time(s), {open.users} signed-in person(s), last on {open.sample_url || "unknown page"}.</p>
            <pre className="fin-json">{open.sample_stack || "No trace was recorded."}</pre>
          </div>
        )}
      </Modal>
    </div>
  );
}
