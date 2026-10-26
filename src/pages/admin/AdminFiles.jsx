// src/pages/admin/AdminFiles.jsx — NEW FILE
//
// AIM
// /admin/files — finds pictures in file storage that nothing in the database points to (left behind by
// a failed save or a deleted record) and lets the super admin delete them. Nothing happens until you
// press Scan. Files younger than 3 days are never shown. Deleting always asks first, and the server
// checks every file again right before deleting it. Five files per page, Previous and Next.

import "./Admin.css";
import "./AdminFinance.css";
import { useState } from "react";
import { Alert, Button, Card, CardBody, CardHeader, Checkbox, EmptyState } from "../../components/ui";
import { ConfirmDialog } from "../../components/modals/Modal.jsx";
import { useToast } from "../../hooks/useNotifications.js";
import { scanUnusedFiles, deleteUnusedFiles } from "../../lib/api/adminFiles.js";
import { Pager, Stat } from "./AdminParts.jsx";

const PAGE = 5;
const n = (v) => Number(v || 0).toLocaleString("en-KE");
const MB = 1024 * 1024, GB = 1024 * MB;
const size = (b) => (b >= GB ? `${(b / GB).toFixed(2)} GB` : b >= MB ? `${(b / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const age = (t) => { const d = Math.floor((Date.now() - t) / 86400000); return d < 1 ? "today" : d === 1 ? "1 day old" : `${d} days old`; };

export default function AdminFiles() {
  const toast = useToast();
  const [state, setState] = useState({ loading: false, data: null, error: null });
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState(() => new Set());
  const [ask, setAsk] = useState(null); // "selected" | "all" | null
  const [busy, setBusy] = useState(false);

  const d = state.data;
  const rows = d?.orphans || [];
  const last = Math.max(1, Math.ceil(rows.length / PAGE));
  const at = Math.min(page, last);
  const shown = rows.slice((at - 1) * PAGE, at * PAGE);

  async function scan() {
    setState((s) => ({ ...s, loading: true, error: null }));
    const { data, error } = await scanUnusedFiles();
    setState({ loading: false, data: error ? null : data, error });
    setPicked(new Set());
    setPage(1);
  }

  const toggle = (key) => setPicked((p) => { const x = new Set(p); if (x.has(key)) x.delete(key); else x.add(key); return x; });
  const pickPage = () => setPicked((p) => { const x = new Set(p); shown.forEach((r) => x.add(r.key)); return x; });
  const pickAll = () => setPicked(new Set(rows.map((r) => r.key)));

  async function confirm() {
    const keys = ask === "all" ? rows.map((r) => r.key) : [...picked];
    setBusy(true);
    const { data, error } = await deleteUnusedFiles(keys);
    setBusy(false);
    setAsk(null);
    if (error) toast.error(error);
    else toast.success(`Deleted ${n(data.deleted)} file${data.deleted === 1 ? "" : "s"}.${data.stillUsed ? ` ${n(data.stillUsed)} turned out to be in use and were kept.` : ""}`);
    scan();
  }

  const count = ask === "all" ? rows.length : picked.size;
  const bytes = (ask === "all" ? rows : rows.filter((r) => picked.has(r.key))).reduce((s, r) => s + r.size, 0);

  return (
    <div className="adm">
      <div className="fin-head"><div><h2 className="adm__title">Unused files</h2></div></div>
      <p className="fin-lead">Pictures in file storage that no record points to, for example left behind by a failed save. Press Scan to look. Files less than 3 days old are never shown, and nothing is deleted without your confirmation.</p>

      <Card>
        <div className="fin-filters">
          <div className="fin-filters__actions"><Button onClick={scan} loading={state.loading}>{d ? "Scan again" : "Scan for unused files"}</Button></div>
        </div>
      </Card>

      {state.error && <Alert type="error" title="Could not scan" message={state.error} />}
      {d?.truncated && <Alert type="warning" title="Large storage" message="Only the first 20,000 files were checked." />}
      {d?.warning && <Alert type="warning" title="Check before deleting" message={d.warning} />}

      {d && (
        <>
          <div className="adm-stats">
            <Stat label="Files checked" value={n(d.scanned)} />
            <Stat label="Unused" value={n(rows.length)} note={rows.length ? size(d.unusedBytes) : ""} />
            <Stat label="Kept for now" value={n(d.tooNew)} note={`Unused but under ${d.minAgeDays} days old`} />
          </div>

          <Card padding="none">
            <CardHeader title="Unused files" subtitle={rows.length ? "Oldest first. Tick the ones to delete." : ""} />
            {!rows.length ? (
              <CardBody><EmptyState icon="file" title="Nothing to clean up" description="Every file is in use or too new to judge." compact /></CardBody>
            ) : (
              <>
                <div style={{ display: "grid" }}>
                  {shown.map((r) => (
                    <div key={r.key} style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", padding: "var(--space-3) var(--space-4)", borderTop: "1px solid var(--color-border, rgba(128,128,128,.25))" }}>
                      <Checkbox checked={picked.has(r.key)} onChange={() => toggle(r.key)} aria-label={`Select ${r.key}`} />
                      <img src={r.url} alt="" loading="lazy" width="56" height="56" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                        style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, flex: "none", background: "rgba(128,128,128,.15)" }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, wordBreak: "break-all" }}>{r.key.split("/").slice(1).join("/")}</div>
                        <div className="fin-lead" style={{ margin: 0 }}>{r.key.split("/")[0]} · {size(r.size)} · {age(r.uploaded)}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: "var(--space-3) var(--space-4)", display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                  <Button size="sm" variant="outline" onClick={pickPage}>Select this page</Button>
                  <Button size="sm" variant="outline" onClick={pickAll}>Select all {n(rows.length)}</Button>
                  <Button size="sm" variant="outline" onClick={() => setPicked(new Set())} disabled={!picked.size}>Clear</Button>
                </div>
                {rows.length > PAGE && <div style={{ padding: "0 var(--space-4) var(--space-3)" }}><Pager page={at} size={PAGE} total={rows.length} onPage={setPage} /></div>}
                <div style={{ padding: "var(--space-3) var(--space-4)", display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                  <Button variant="danger" disabled={!picked.size} onClick={() => setAsk("selected")}>Delete selected ({n(picked.size)})</Button>
                  <Button variant="outline" onClick={() => setAsk("all")}>Delete all {n(rows.length)}</Button>
                </div>
              </>
            )}
          </Card>
        </>
      )}

      <ConfirmDialog isOpen={!!ask} onCancel={() => setAsk(null)} onConfirm={confirm} loading={busy} variant="danger"
        title={`Delete ${n(count)} file${count === 1 ? "" : "s"}?`} confirmLabel="Delete for good"
        message={`This removes ${n(count)} file${count === 1 ? "" : "s"} (${size(bytes)}) from storage and cannot be undone. Each one is checked against the database again just before it is deleted, and any that are in use are kept.`} />
    </div>
  );
}
