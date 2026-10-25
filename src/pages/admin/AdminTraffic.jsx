// src/pages/admin/AdminTraffic.jsx — NEW FILE
//
// AIM
// /admin/traffic — who visits the site and how much file storage is used. Pick a period (1, 7 or 30
// days). Shows visits and page views per day, the top pages, countries, devices and referrers, and
// the R2 storage and file operations against the free allowance. Data comes from the Worker route
// /api/admin/stats (see worker/stats.js). Days are UTC.

import "./Admin.css";
import "./AdminFinance.css";
import { useMemo, useState } from "react";
import { Alert, Button, Card, CardBody, CardHeader, EmptyState, SelectInput, Skeleton } from "../../components/ui";
import SimpleTable from "../../components/data/SimpleTable.jsx";
import BarCompare from "../../components/charts/BarCompare.jsx";
import useAsync from "../../hooks/useAsync.js";
import { getTrafficStats } from "../../lib/api/adminTraffic.js";
import { Stat, daysAgo, pct } from "./AdminParts.jsx";

const PRESETS = [
  { value: "1", label: "Today" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
];

const n = (v) => Number(v || 0).toLocaleString("en-KE");
const MB = 1024 * 1024, GB = 1024 * MB;
const size = (b) => (b >= GB ? `${(b / GB).toFixed(2)} GB` : b >= MB ? `${(b / MB).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const dayLabel = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-KE", { day: "numeric", month: "short", timeZone: "UTC" });
const tone = (used, whole) => (whole > 0 && used / whole >= 0.9 ? "bad" : whole > 0 && used / whole >= 0.7 ? "warn" : undefined);

export default function AdminTraffic() {
  const [preset, setPreset] = useState("7");
  const range = useMemo(() => ({ from: daysAgo(Number(preset) - 1), to: daysAgo(0) }), [preset]);
  const stats = useAsync(() => getTrafficStats(range), [range.from, range.to]);
  const d = stats.data, t = d?.traffic, r = d?.r2;
  const first = stats.loading && !d;

  const nameCol = (label) => ({ key: "name", label, render: (x) => <strong>{x.name}</strong> });
  const numCols = [
    { key: "views", label: "Page views", align: "right", render: (x) => n(x.views) },
    { key: "visits", label: "Visits", align: "right", render: (x) => n(x.visits) },
  ];
  const list = (title, rows, label, icon) => (
    <Card padding="none">
      <CardHeader title={title} />
      <SimpleTable loading={first} rows={rows || []} rowKey="name" columns={[nameCol(label), ...numCols]}
        empty={<EmptyState icon={icon} title="Nothing yet" description="Data appears here after visitors arrive." compact />} />
    </Card>
  );

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
            {list("Top pages", t?.pages, "Page", "file")}
            {list("Countries", t?.countries, "Country", "users")}
            {list("Devices", t?.devices, "Device", "users")}
            {list("Where visitors came from", t?.referrers, "Referrer", "users")}
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
