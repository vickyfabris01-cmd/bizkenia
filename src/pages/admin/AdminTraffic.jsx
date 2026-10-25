// src/pages/admin/AdminTraffic.jsx — MODIFIED (ranked lists show 5 rows per page with Previous / Next)
//
// AIM
// /admin/traffic — who visits the site and how much file storage is used. Pick a period (1, 7 or 30
// days). Shows visits and page views per day, the top pages, countries, devices and referrers (five
// rows at a time, with Previous and Next), and the R2 storage and file operations against the free
// allowance. Data comes from the Worker route /api/admin/stats (see worker/stats.js). Days are UTC.

import "./Admin.css";
import "./AdminFinance.css";
import { useMemo, useState } from "react";
import { Alert, Button, Card, CardBody, CardHeader, EmptyState, SelectInput, Skeleton } from "../../components/ui";
import SimpleTable from "../../components/data/SimpleTable.jsx";
import BarCompare from "../../components/charts/BarCompare.jsx";
import useAsync from "../../hooks/useAsync.js";
import { getTrafficStats } from "../../lib/api/adminTraffic.js";
import { Pager, Stat, daysAgo, pct } from "./AdminParts.jsx";

const PRESETS = [
  { value: "1", label: "Today" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
];

const PAGE = 5;

const n = (v) => Number(v || 0).toLocaleString("en-KE");
const MB = 1024 * 1024, GB = 1024 * MB;
const size = (b) => (b >= GB ? `${(b / GB).toFixed(2)} GB` : b >= MB ? `${(b / MB).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const dayLabel = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-KE", { day: "numeric", month: "short", timeZone: "UTC" });
const tone = (used, whole) => (whole > 0 && used / whole >= 0.9 ? "bad" : whole > 0 && used / whole >= 0.7 ? "warn" : undefined);

// One ranked list (pages, countries, ...) shown five rows at a time. It is keyed by the period in the
// page below, so it goes back to page 1 whenever the period changes.
function RankCard({ title, rows, label, icon, loading }) {
  const [page, setPage] = useState(1);
  const all = rows || [];
  const last = Math.max(1, Math.ceil(all.length / PAGE));
  const at = Math.min(page, last);
  return (
    <Card padding="none">
      <CardHeader title={title} />
      <SimpleTable loading={loading} rows={all.slice((at - 1) * PAGE, at * PAGE)} rowKey="name"
        columns={[
          { key: "name", label, render: (x) => <strong>{x.name}</strong> },
          { key: "views", label: "Page views", align: "right", render: (x) => n(x.views) },
          { key: "visits", label: "Visits", align: "right", render: (x) => n(x.visits) },
        ]}
        empty={<EmptyState icon={icon} title="Nothing yet" description="Data appears here after visitors arrive." compact />} />
      {all.length > PAGE && (
        <div style={{ padding: "var(--space-3) var(--space-4)" }}>
          <Pager page={at} size={PAGE} total={all.length} onPage={setPage} />
        </div>
      )}
    </Card>
  );
}

export default function AdminTraffic() {
  const [preset, setPreset] = useState("7");
  const range = useMemo(() => ({ from: daysAgo(Number(preset) - 1), to: daysAgo(0) }), [preset]);
  const stats = useAsync(() => getTrafficStats(range), [range.from, range.to]);
  const d = stats.data, t = d?.traffic, r = d?.r2;
  const first = stats.loading && !d;

  const key = `${range.from}-${range.to}`;

  return (
    <div className="adm">
      <div className="fin-head"><div><h2 className="adm__title">Traffic and storage</h2></div></div>
      <p className="fin-lead">Visits to the site and how much of the free file storage is in use. Days are counted in UTC. Figures can lag a few minutes.</p>

      <Card>
        <div className="fin-filters">
          <SelectInput label="Period" value={preset} options={PRESETS} onChange={setPreset} />
          <div className="fin-filters__actions"><Button variant="outline" onClick={stats.reload}>Refresh</Button></div>
        </div>
      </Card>

      {stats.error ? (
        <><Alert type="error" title="Could not load statistics" message={stats.error} /><div><Button variant="outline" onClick={stats.reload}>Try again</Button></div></>
      ) : (
        <>
          {d?.trafficError && <Alert type="error" title="Visits could not be loaded" message={d.trafficError} />}
          {d?.r2Error && <Alert type="error" title="Storage could not be loaded" message={d.r2Error} />}

          <div className="adm-stats">
            <Stat label="Visits" loading={first} value={t ? n(t.visits) : "—"} />
            <Stat label="Page views" loading={first} value={t ? n(t.views) : "—"} note={t && t.visits ? `${(t.views / t.visits).toFixed(1)} pages per visit` : ""} />
            <Stat label="Storage used" loading={first} value={r ? size(r.storageBytes) : "—"} tone={r ? tone(r.storageBytes, r.free.storage) : undefined}
              note={r ? `${pct(r.storageBytes, r.free.storage)} of ${size(r.free.storage)}, ${n(r.objects)} files` : ""} />
            <Stat label="Writes this month" loading={first} value={r ? n(r.month.classA) : "—"} tone={r ? tone(r.month.classA, r.free.classA) : undefined}
              note={r ? `Class A, of ${n(r.free.classA)} free` : ""} />
            <Stat label="Reads this month" loading={first} value={r ? n(r.month.classB) : "—"} tone={r ? tone(r.month.classB, r.free.classB) : undefined}
              note={r ? `Class B, of ${n(r.free.classB)} free` : ""} />
          </div>

          <Card>
            <CardHeader title="Visits per day" subtitle={d ? `${dayLabel(d.range.from)} to ${dayLabel(d.range.to)}` : ""} />
            <CardBody>
              {first ? <Skeleton height={260} /> : (
                <BarCompare data={(t?.daily || []).map((x) => ({ label: dayLabel(x.date), visits: x.visits, views: x.views }))}
                  series={[{ key: "visits", label: "Visits" }, { key: "views", label: "Page views" }]}
                  format={n} summary="Visits and page views per day" empty="No visits in this period." />
              )}
            </CardBody>
          </Card>

          <div className="fin-grid fin-grid--2">
            <RankCard key={`p-${key}`} title="Top pages" rows={t?.pages} label="Page" icon="file" loading={first} />
            <RankCard key={`c-${key}`} title="Countries" rows={t?.countries} label="Country" icon="users" loading={first} />
            <RankCard key={`d-${key}`} title="Devices" rows={t?.devices} label="Device" icon="users" loading={first} />
            <RankCard key={`r-${key}`} title="Where visitors came from" rows={t?.referrers} label="Referrer" icon="users" loading={first} />
          </div>

          {r && (
            <Card padding="none">
              <CardHeader title="File operations in this period" subtitle={r.clamped ? "Cloudflare keeps only the last 31 days of file activity, so older days are left out." : "Class A is writes and listings, Class B is reads."} />
              <SimpleTable rows={r.range.byAction} rowKey="name"
                empty={<EmptyState icon="file" title="No file activity" compact />}
                columns={[
                  { key: "name", label: "Action", render: (x) => <strong>{x.name}</strong> },
                  { key: "requests", label: "Requests", align: "right", render: (x) => n(x.requests) },
                ]} />
              <p className="fin-lead" style={{ padding: "var(--space-3) var(--space-4)" }}>
                In this period: {n(r.range.classA)} Class A, {n(r.range.classB)} Class B, {n(r.range.other)} other (deletes are free).
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
            }
