// src/pages/admin/AdminErrors.jsx — NEW FILE (Phase 5, step 4; Part 8: ?status=new and the menu badge)
//
// AIM
// /admin/errors — crashes that real visitors hit, grouped by message, newest first. Each row shows how
// many times, how many different people, when it last happened and on which page. Open a row for the
// technical trace to hand to a developer. Reports older than 30 days are removed automatically.
// Data: database function admin_client_errors (migration p5_08); the browser side is lib/monitor.js.
// The filter is read from the address: /admin/errors?status=new shows only errors that arrived since the admin
// last opened this page (the menu badge links there). Opening the page marks it seen, which clears the badge.

import "./Admin.css";
import "./AdminFinance.css";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Button, Card, EmptyState, SelectInput } from "../../components/ui";
import { Modal } from "../../components/modals/Modal.jsx";
import SimpleTable from "../../components/data/SimpleTable.jsx";
import useAsync from "../../hooks/useAsync.js";
import { listClientErrors } from "../../lib/api/platformFinance.js";
import { formatWhen } from "./AdminParts.jsx";
import { getSeenAt, useActionCountsStore } from "../../store/actionCountsStore.js";

const RANGES = [{ value: "1", label: "Last 24 hours" }, { value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }];

export default function AdminErrors() {
  const [params, setParams] = useSearchParams();
  const onlyNew = params.get("status") === "new";
  const [days, setDays] = useState("7");
  const [open, setOpen] = useState(null);
  // When the admin last opened this page. undefined = still being read, null = never.
  // It is read BEFORE the page is marked as seen, so "new" keeps meaning "since the visit before this one".
  const [seenAt, setSeenAt] = useState(undefined);
  useEffect(() => {
    let dead = false;
    (async () => {
      const at = await getSeenAt("errors");
      if (dead) return;
      setSeenAt(at);
      useActionCountsStore.getState().markSeen("errors");
    })();
    return () => { dead = true; };
  }, []);
  const list = useAsync(() => listClientErrors(onlyNew ? 30 : Number(days)), [days, onlyNew]);
  const [week] = useState(() => Date.now() - 7 * 86400000);
  const since = seenAt ? new Date(seenAt).getTime() : week; // never opened: the last 7 days
  const all = list.data || [];
  const rows = onlyNew ? all.filter((r) => new Date(r.last_seen).getTime() > since) : all;
  const showAll = () => { const n = new URLSearchParams(params); n.delete("status"); setParams(n, { replace: true }); };
  const close = () => setOpen(null);

  return (
    <div className="adm">
      <div className="fin-head"><div><h2 className="adm__title">App errors</h2></div></div>
      <p className="fin-lead">Crashes that visitors ran into, grouped by message. Nothing here means nothing has broken lately.</p>
      <Card>
        {onlyNew ? (
          <div className="fin-filters">
            <p className="fin-lead" style={{ margin: 0 }}>
              {seenAt === undefined ? "Checking what is new…" : seenAt ? `Showing errors since you last looked, ${formatWhen(seenAt)}.` : "Showing errors from the last 7 days."}
            </p>
            <div className="fin-filters__actions"><Button variant="outline" onClick={showAll}>Show all errors</Button></div>
          </div>
        ) : (
          <div className="fin-filters"><SelectInput label="Period" value={days} options={RANGES} onChange={setDays} /></div>
        )}
      </Card>
      {list.error ? (
        <><Alert type="error" title="Could not load errors" message={list.error} /><div><Button variant="outline" onClick={list.reload}>Try again</Button></div></>
      ) : (
        <SimpleTable loading={list.loading && !list.data} rows={rows} onRowClick={setOpen}
          empty={<Card><EmptyState icon="check" title={onlyNew ? "No new errors" : "No errors reported"} description={onlyNew ? "Nothing new has broken since you last looked." : "Great news. Crashes will appear here as they happen."} compact /></Card>}
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
