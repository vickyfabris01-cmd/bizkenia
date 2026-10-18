// src/pages/admin/AdminAudit.jsx — NEW FILE (Phase 5, step 3)
//
// AIM
// /admin/audit — the history of important changes, newest first: who did it, when, and what changed
// (business approvals and suspensions, platform settings, price plans, payments recorded by hand or
// changing status, accounts switched on or off). Filter by kind of change, dates or a word. Open a row
// for the before and after values in plain English; the raw record is behind a "Show raw record"
// button. A CSV of the filtered list can be downloaded. The log is read-only: nobody edits it.
// Data: database function admin_audit_feed (migration p5_07). A change made by the system (for example
// the M-Pesa callback confirming a payment) has no person and shows as "System".

import "./Admin.css";
import "./AdminFinance.css";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Badge, Button, Card, EmptyState, Input, SelectInput } from "../../components/ui";
import { Modal } from "../../components/modals/Modal.jsx";
import SimpleTable from "../../components/data/SimpleTable.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { PAGE_SIZE, exportAudit, listAudit } from "../../lib/api/platformFinance.js";
import { AUDIT_ACTIONS, describeAudit } from "../../lib/auditText.js";
import { downloadCsv } from "../../lib/csv.js";
import { Pager, csvWhen, formatWhen } from "./AdminParts.jsx";

const who = (r) => r.actor_name || r.actor_email || (r.actor_id ? "Unknown user" : "System");

function Detail({ row, onClose }) {
  const [raw, setRaw] = useState(false);
  const d = row ? describeAudit(row) : null;
  const close = () => { setRaw(false); onClose(); };
  return (
    <Modal isOpen={!!row} onClose={close} title={d?.title || "Change"} footer={<Button variant="ghost" onClick={close}>Close</Button>}>
      {row && (
        <div className="adm-form">
          <dl className="fin-kv fin-kv--2">
            <div><dt>Who</dt><dd>{who(row)}{row.actor_email && row.actor_name ? <span className="fin-muted"> ({row.actor_email})</span> : null}</dd></div>
            <div><dt>When</dt><dd>{formatWhen(row.created_at)}</dd></div>
            <div style={{ gridColumn: "1 / -1" }}><dt>What</dt><dd>{d.summary}</dd></div>
          </dl>
          {d.changes.length > 0 && (
            <div className="stable-wrap">
              <table className="fin-changes"><thead><tr><th scope="col">Field</th><th scope="col">Before</th><th scope="col">After</th></tr></thead>
                <tbody>{d.changes.map((c, i) => <tr key={i}><td>{c.field}</td><td>{c.from || "—"}</td><td>{c.to || "—"}</td></tr>)}</tbody></table>
            </div>
          )}
          <div><Button size="sm" variant="ghost" onClick={() => setRaw(!raw)}>{raw ? "Hide raw record" : "Show raw record"}</Button></div>
          {raw && <pre className="fin-json">{JSON.stringify({ action: row.action, entity: row.entity, entity_id: row.entity_id, before: row.before, after: row.after }, null, 2)}</pre>}
        </div>
      )}
    </Modal>
  );
}

export default function AdminAudit() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const f = { action: params.get("action") || "", from: params.get("from") || "", to: params.get("to") || "", search: params.get("q") || "" };
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [text, setText] = useState(f.search);
  const [open, setOpen] = useState(null);
  const [exporting, setExporting] = useState(false);
  const badRange = !!(f.from && f.to && f.from > f.to);
  const hasFilter = !!(f.action || f.from || f.to || f.search);

  const set = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    if (!("page" in patch)) next.delete("page");
    setParams(next, { replace: true });
  };
  const list = useAsync(() => (badRange ? Promise.resolve({ data: null, error: null }) : listAudit(f, { page })), [f.action, f.from, f.to, f.search, page]);
  const rows = list.data?.rows || [];

  async function download() {
    setExporting(true);
    const { data, error } = await exportAudit(f);
    setExporting(false);
    if (error) return toast.error(error);
    if (!data.rows.length) return toast.error("There is nothing to download for this filter.");
    downloadCsv(`audit-log-${new Date().toISOString().slice(0, 10)}`, data.rows, [
      { key: "created_at", label: "Date (UTC)", value: (r) => csvWhen(r.created_at) }, { key: "who", label: "Who", value: who },
      { key: "title", label: "Change", value: (r) => describeAudit(r).title }, { key: "summary", label: "Details", value: (r) => describeAudit(r).summary },
      { key: "action", label: "Action code" }, { key: "entity", label: "Area" }, { key: "entity_id", label: "Record ID" },
    ]);
    toast.success(data.truncated ? `Downloaded the newest ${data.rows.length.toLocaleString("en-KE")} of ${data.total.toLocaleString("en-KE")}. Narrow the dates to get the rest.` : `Downloaded ${data.rows.length.toLocaleString("en-KE")} entries.`);
  }

  return (
    <div className="adm">
      <div className="fin-head">
        <div><h2 className="adm__title">Audit log</h2></div>
        <Button variant="outline" loading={exporting} disabled={!rows.length} onClick={download}>Download CSV</Button>
      </div>
      <p className="fin-lead">A read-only record of important changes on the platform. Nobody can edit or delete it.</p>

      <Card>
        <form className="fin-filters fin-filters--wide" role="search" onSubmit={(e) => { e.preventDefault(); set({ q: text.trim() }); }}>
          <div className="fin-filters__search"><Input label="Search" placeholder="Person, business or change" value={text} onChange={(e) => setText(e.target.value)} /></div>
          <div style={{ gridColumn: "span 2" }}><SelectInput label="What happened" value={f.action} options={AUDIT_ACTIONS} onChange={(v) => set({ action: v })} /></div>
          <Input label="From" type="date" value={f.from} max={f.to || undefined} onChange={(e) => set({ from: e.target.value })} />
          <Input label="To" type="date" value={f.to} min={f.from || undefined} onChange={(e) => set({ to: e.target.value })} error={badRange ? "Pick a date after From." : undefined} />
          <div className="fin-filters__actions">
            <Button type="submit">Search</Button>
            {hasFilter && <Button type="button" variant="ghost" onClick={() => { setText(""); setParams({}, { replace: true }); }}>Clear filters</Button>}
          </div>
        </form>
      </Card>

      {list.error ? (
        <><Alert type="error" title="Could not load the audit log" message={list.error} /><div><Button variant="outline" onClick={list.reload}>Try again</Button></div></>
      ) : (
        <>
          <SimpleTable loading={list.loading && !list.data} rows={rows} onRowClick={setOpen}
            empty={<Card><EmptyState icon="file" title={hasFilter ? "Nothing matches these filters" : "No history yet"} description={hasFilter ? "Try other dates or clear the filters." : "Approvals, setting changes and payments are recorded here."} compact /></Card>}
            columns={[
              { key: "created_at", label: "When", render: (r) => formatWhen(r.created_at) },
              { key: "who", label: "Who", render: (r) => (r.actor_id ? <strong>{who(r)}</strong> : <Badge variant="neutral">System</Badge>) },
              { key: "title", label: "Change", render: (r) => describeAudit(r).title },
              { key: "summary", label: "Details", render: (r) => <span className="fin-muted">{describeAudit(r).summary}</span> },
            ]} />
          <Pager page={page} size={PAGE_SIZE} total={list.data?.total || 0} onPage={(p) => set({ page: p > 1 ? String(p) : "" })} />
        </>
      )}
      <Detail row={open} onClose={() => setOpen(null)} />
    </div>
  );
}
