// src/pages/admin/AdminTransactions.jsx — NEW FILE (Phase 5, step 3)
//
// AIM
// /admin/transactions — every payment on the platform in one list: subscriptions, rent and shop
// orders. Filter by type, status, dates or a word (business, receipt, payer, phone); open a row for
// the full details; download what matches as a CSV. The tiles above the list add up the same
// period. Only subscriptions are the platform's own income; rent and shop money belongs to the
// businesses and is shown here so the platform can see everything that moves through it.
// Data: database functions admin_transactions and admin_transaction_totals (migration p5_07).

import "./Admin.css";
import "./AdminFinance.css";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Alert, Button, Card, EmptyState, Input, SelectInput } from "../../components/ui";
import { Modal } from "../../components/modals/Modal.jsx";
import SimpleTable from "../../components/data/SimpleTable.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import {
  KIND_LABEL, KIND_OPTIONS, METHOD_LABEL, PAGE_SIZE, STATUS_OPTIONS,
  exportTransactions, getTransactionTotals, listTransactions,
} from "../../lib/api/platformFinance.js";
import { downloadCsv } from "../../lib/csv.js";
import { formatKsh } from "../../lib/format.js";
import { KindBadge, Pager, Stat, TxStatusBadge, csvWhen, formatWhen, pct } from "./AdminParts.jsx";

const SOURCE_TEXT = { payment_intent: "M-Pesa or manual payment record", rental_payment: "Rental payment record", order: "Shop order paid on delivery" };

const CSV_COLUMNS = [
  { key: "occurred_at", label: "Date (UTC)", value: (r) => csvWhen(r.occurred_at) },
  { key: "kind", label: "Type", value: (r) => KIND_LABEL[r.kind] || r.kind },
  { key: "status", label: "Status" },
  { key: "business_name", label: "Business" },
  { key: "business_type", label: "Business type" },
  { key: "payer_name", label: "Payer" },
  { key: "payer_phone", label: "Phone" },
  { key: "amount", label: "Amount (KSh)", value: (r) => Number(r.amount) },
  { key: "method", label: "Method", value: (r) => METHOD_LABEL[r.method] || r.method },
  { key: "receipt", label: "M-Pesa receipt" },
  { key: "reference", label: "Reference" },
  { key: "note", label: "Note" },
  { key: "id", label: "ID" },
];

function Detail({ row, onClose }) {
  return (
    <Modal isOpen={!!row} onClose={onClose} title="Transaction"
      footer={<Button variant="ghost" onClick={onClose}>Close</Button>}>
      {row && (
        <dl className="fin-kv fin-kv--2">
          <div><dt>Type</dt><dd><KindBadge kind={row.kind} /></dd></div>
          <div><dt>Status</dt><dd><TxStatusBadge status={row.status} /></dd></div>
          <div><dt>Amount</dt><dd className="fin-amount">{formatKsh(row.amount)}</dd></div>
          <div><dt>When</dt><dd>{formatWhen(row.occurred_at)}</dd></div>
          <div><dt>Business</dt><dd>{row.business_id ? <Link className="fin-link" to={`/admin/businesses/${row.business_id}`}>{row.business_name || "Open business"}</Link> : "—"}</dd></div>
          <div><dt>Paid by</dt><dd>{row.payer_name || "—"}</dd></div>
          <div><dt>Phone</dt><dd>{row.payer_phone || "—"}</dd></div>
          <div><dt>Method</dt><dd>{METHOD_LABEL[row.method] || row.method || "—"}</dd></div>
          <div><dt>M-Pesa receipt</dt><dd>{row.receipt || "—"}</dd></div>
          <div><dt>Reference</dt><dd>{row.reference || "—"}</dd></div>
          <div style={{ gridColumn: "1 / -1" }}><dt>Note or reason</dt><dd>{row.note || "—"}</dd></div>
          <div style={{ gridColumn: "1 / -1" }}><dt>Recorded in</dt><dd>{SOURCE_TEXT[row.source] || row.source}</dd></div>
        </dl>
      )}
    </Modal>
  );
}

export default function AdminTransactions() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const f = { kind: params.get("kind") || "", status: params.get("status") || "", from: params.get("from") || "", to: params.get("to") || "", search: params.get("q") || "" };
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [text, setText] = useState(f.search);
  const [open, setOpen] = useState(null);
  const [exporting, setExporting] = useState(false);
  const badRange = !!(f.from && f.to && f.from > f.to);

  const set = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    if (!("page" in patch)) next.delete("page");
    setParams(next, { replace: true });
  };
  const hasFilter = !!(f.kind || f.status || f.from || f.to || f.search);

  const list = useAsync(() => (badRange ? Promise.resolve({ data: null, error: null }) : listTransactions(f, { page })), [f.kind, f.status, f.from, f.to, f.search, page]);
  const totals = useAsync(() => (badRange ? Promise.resolve({ data: null, error: null }) : getTransactionTotals(f)), [f.kind, f.from, f.to]);
  const t = totals.data;
  const rows = list.data?.rows || [];

  async function download() {
    setExporting(true);
    const { data, error } = await exportTransactions(f);
    setExporting(false);
    if (error) return toast.error(error);
    if (!data.rows.length) return toast.error("There is nothing to download for this filter.");
    downloadCsv(`transactions-${new Date().toISOString().slice(0, 10)}`, data.rows, CSV_COLUMNS);
    toast.success(data.truncated ? `Downloaded the newest ${data.rows.length.toLocaleString("en-KE")} of ${data.total.toLocaleString("en-KE")}. Narrow the dates to get the rest.` : `Downloaded ${data.rows.length.toLocaleString("en-KE")} transactions.`);
  }

  return (
    <div className="adm">
      <div className="fin-head">
        <div><h2 className="adm__title">Transactions</h2></div>
        <Button variant="outline" loading={exporting} disabled={!rows.length} onClick={download}>Download CSV</Button>
      </div>
      <p className="fin-lead">Every payment that moves through the platform. Only subscriptions are the platform's income; rent and shop money belongs to the businesses.</p>

      <div className="adm-stats">
        <Stat label="Money in" tone="good" loading={totals.loading && !t} value={t ? formatKsh(t.volume) : ""} note={t ? `${t.successCount.toLocaleString("en-KE")} successful payments` : ""} />
        <Stat label="Successful" loading={totals.loading && !t} value={t ? pct(t.successCount, t.count) : ""} note={t ? `${t.successCount} of ${t.count}` : ""} />
        <Stat label="Pending" tone={t?.pendingCount ? "warn" : undefined} loading={totals.loading && !t} value={t ? t.pendingCount : ""} note={t ? `${formatKsh(t.pendingAmount)} waiting` : ""} />
        <Stat label="Failed" tone={t?.failedCount ? "bad" : undefined} loading={totals.loading && !t} value={t ? t.failedCount : ""} note={t ? `${pct(t.failedCount, t.count)} of all` : ""} />
        <Stat label="Reversed or refunded" loading={totals.loading && !t} value={t ? t.reversedCount : ""} note={t ? formatKsh(t.reversedAmount) : ""} />
        <Stat label="All transactions" loading={totals.loading && !t} value={t ? t.count.toLocaleString("en-KE") : ""} note={f.from || f.to ? "In the chosen dates" : "All time"} />
      </div>
      {t && (
        <ul className="fin-kinds" aria-label="Money in by type">
          {Object.keys(KIND_LABEL).map((k) => <li key={k}>{KIND_LABEL[k]}s: <b>{formatKsh(t.byKind[k]?.volume)}</b></li>)}
        </ul>
      )}

      <Card>
        <form className="fin-filters fin-filters--wide" role="search" onSubmit={(e) => { e.preventDefault(); set({ q: text.trim() }); }}>
          <div className="fin-filters__search"><Input label="Search" placeholder="Business, receipt, payer or phone" value={text} onChange={(e) => setText(e.target.value)} /></div>
          <SelectInput label="Type" value={f.kind} options={KIND_OPTIONS} onChange={(v) => set({ kind: v })} />
          <SelectInput label="Status" value={f.status} options={STATUS_OPTIONS} onChange={(v) => set({ status: v })} />
          <Input label="From" type="date" value={f.from} max={f.to || undefined} onChange={(e) => set({ from: e.target.value })} />
          <Input label="To" type="date" value={f.to} min={f.from || undefined} onChange={(e) => set({ to: e.target.value })} error={badRange ? "Pick a date after From." : undefined} />
          <div className="fin-filters__actions">
            <Button type="submit">Search</Button>
            {hasFilter && <Button type="button" variant="ghost" onClick={() => { setText(""); setParams({}, { replace: true }); }}>Clear filters</Button>}
          </div>
        </form>
      </Card>

      {(list.error || totals.error) && (
        <>
          <Alert type="error" title="Could not load transactions" message={list.error || totals.error} />
          <div><Button variant="outline" onClick={() => { list.reload(); totals.reload(); }}>Try again</Button></div>
        </>
      )}

      {!list.error && (
        <>
          <SimpleTable loading={list.loading && !list.data} rows={rows} onRowClick={setOpen}
            empty={<Card><EmptyState icon="card" title={hasFilter ? "Nothing matches these filters" : "No transactions yet"}
              description={hasFilter ? "Try other dates or clear the filters." : "Payments appear here as soon as businesses pay or residents and customers pay them."}
              action={hasFilter ? <Button variant="outline" onClick={() => { setText(""); setParams({}, { replace: true }); }}>Clear filters</Button> : undefined} compact /></Card>}
            columns={[
              { key: "occurred_at", label: "Date", render: (r) => formatWhen(r.occurred_at) },
              { key: "kind", label: "Type", render: (r) => <KindBadge kind={r.kind} /> },
              { key: "business_name", label: "Business", render: (r) => <strong>{r.business_name || "—"}</strong> },
              { key: "amount", label: "Amount", align: "right", render: (r) => <span className={`fin-amount${r.status === "failed" || r.status === "reversed" ? " fin-amount--muted" : ""}`}>{formatKsh(r.amount)}</span> },
              { key: "status", label: "Status", render: (r) => <TxStatusBadge status={r.status} /> },
            ]} />
          <Pager page={page} size={PAGE_SIZE} total={list.data?.total || 0} onPage={(p) => set({ page: p > 1 ? String(p) : "" })} />
        </>
      )}
      <Detail row={open} onClose={() => setOpen(null)} />
    </div>
  );
}
