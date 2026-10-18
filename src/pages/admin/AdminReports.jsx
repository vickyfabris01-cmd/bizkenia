// src/pages/admin/AdminReports.jsx — NEW FILE (Phase 5, step 3)
//
// AIM
// /admin/reports — reports and analytics for the whole platform, last 12 months, one tab each with a
// chart, a table and "Download CSV":
//   Growth       new users and businesses each month, and the running totals
//   Businesses   how many of each type, and in which status
//   Money        what moved through the platform each month (subscriptions, rent, shop orders)
//   Top businesses  the businesses that handled the most money
// Data: database functions admin_growth_monthly, admin_business_mix, admin_monthly_volume and
// admin_top_businesses (migration p5_07). Styles reuse the Reports screen (rep-) and admin (adm-) classes.

import "../reports/Reports.css";
import "./Admin.css";
import "./AdminFinance.css";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Card, CardBody, CardHeader, Skeleton } from "../../components/ui";
import SimpleTable from "../../components/data/SimpleTable.jsx";
import BarCompare from "../../components/charts/BarCompare.jsx";
import DonutBreakdown from "../../components/charts/DonutBreakdown.jsx";
import LineTrend from "../../components/charts/LineTrend.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { getPlatformReport } from "../../lib/api/platformFinance.js";
import { downloadCsv } from "../../lib/csv.js";
import { STATUS_BADGE, formatDate, formatKsh } from "../../lib/format.js";
import { typeLabel } from "../../config/counties.js";
import { longMonth, shortMonth, sum } from "./AdminParts.jsx";

const TABS = [{ id: "growth", label: "Growth" }, { id: "businesses", label: "Businesses" }, { id: "money", label: "Money" }, { id: "top", label: "Top businesses" }];
const statusText = (s) => STATUS_BADGE[s]?.[1] || s;

function Stat({ label, value }) {
  return <div className="rep-stat"><span className="rep-stat__label">{label}</span><span className="rep-stat__value">{value}</span></div>;
}
function Section({ title, subtitle, canExport, onExport, children }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} action={<Button size="sm" variant="outline" disabled={!canExport} onClick={onExport}>Download CSV</Button>} />
      <CardBody><div className="fin-grid">{children}</div></CardBody>
    </Card>
  );
}
const table = (columns, rows, rowKey, empty) => <SimpleTable columns={columns} rows={rows} rowKey={rowKey} empty={<p className="rep-head__lead">{empty}</p>} />;

export default function AdminReports() {
  const toast = useToast();
  const [tab, setTab] = useState("growth");
  const { data: d, error, loading, reload } = useAsync(() => getPlatformReport(), []);
  const file = (name) => `platform-${name}-${new Date().toISOString().slice(0, 10)}`;
  const exp = (name, rows, cols) => () => { downloadCsv(file(name), rows, cols); toast.success("CSV downloaded"); };

  let body = null;
  if (d) {
    if (tab === "growth") {
      const rows = d.growth;
      const last = rows[rows.length - 1] || {};
      const cols = [{ key: "month", label: "Month", render: (r) => longMonth(r.month) }, { key: "newUsers", label: "New users", align: "right" }, { key: "newBusinesses", label: "New businesses", align: "right" },
        { key: "approved", label: "Approved", align: "right" }, { key: "usersTotal", label: "Users in total", align: "right" }, { key: "businessesTotal", label: "Businesses in total", align: "right" }];
      const csv = [{ key: "month", label: "Month" }, { key: "newUsers", label: "New users" }, { key: "newBusinesses", label: "New businesses" }, { key: "approved", label: "Approved businesses" }, { key: "usersTotal", label: "Users in total" }, { key: "businessesTotal", label: "Businesses in total" }];
      body = (
        <>
          <div className="rep-stats"><Stat label="Users" value={(last.usersTotal || 0).toLocaleString("en-KE")} /><Stat label="Businesses" value={(last.businessesTotal || 0).toLocaleString("en-KE")} />
            <Stat label="New users, 12 months" value={sum(rows, "newUsers").toLocaleString("en-KE")} /><Stat label="New businesses, 12 months" value={sum(rows, "newBusinesses").toLocaleString("en-KE")} /></div>
          <Section title="Growth" subtitle="Last 12 months" canExport={rows.length > 0} onExport={exp("growth", rows, csv)}>
            <LineTrend data={rows.map((r) => ({ label: shortMonth(r.month), users: r.usersTotal, businesses: r.businessesTotal }))} series={[{ key: "users", label: "Users" }, { key: "businesses", label: "Businesses" }]}
              summary="Total users and businesses at the end of each month" empty="Growth appears as people sign up." />
            <BarCompare data={rows.map((r) => ({ label: shortMonth(r.month), users: r.newUsers, businesses: r.newBusinesses }))} series={[{ key: "users", label: "New users" }, { key: "businesses", label: "New businesses" }]}
              summary="New users and new businesses each month" empty="No sign-ups in this period." />
            {table(cols, [...rows].reverse(), "month", "No data yet.")}
          </Section>
        </>
      );
    } else if (tab === "businesses") {
      const rows = d.mix.map((m) => ({ ...m, _k: `${m.type}-${m.status}` }));
      const byType = Object.values(rows.reduce((a, r) => { (a[r.type] ||= { name: typeLabel(r.type), value: 0 }).value += r.businesses; return a; }, {}));
      const active = rows.filter((r) => r.status === "active").reduce((a, r) => a + r.businesses, 0);
      const cols = [{ key: "type", label: "Type", render: (r) => typeLabel(r.type) }, { key: "status", label: "Status", render: (r) => statusText(r.status) }, { key: "businesses", label: "Businesses", align: "right" }];
      const csv = [{ key: "type", label: "Type", value: (r) => typeLabel(r.type) }, { key: "status", label: "Status", value: (r) => statusText(r.status) }, { key: "businesses", label: "Businesses" }];
      body = (
        <>
          <div className="rep-stats"><Stat label="Businesses" value={sum(rows, "businesses")} /><Stat label="Active" value={active} /><Stat label="Types in use" value={byType.length} /></div>
          <Section title="Businesses" subtitle="By type and status, all time" canExport={rows.length > 0} onExport={exp("businesses", rows, csv)}>
            <DonutBreakdown data={byType} centreLabel={String(sum(rows, "businesses"))} summary="Businesses by type" empty="No businesses yet." />
            {table(cols, rows, "_k", "No businesses yet.")}
          </Section>
        </>
      );
    } else if (tab === "money") {
      const rows = d.volume;
      const cols = [{ key: "month", label: "Month", render: (r) => longMonth(r.month) }, { key: "subscription", label: "Subscriptions", align: "right", render: (r) => formatKsh(r.subscription) },
        { key: "rent", label: "Rent", align: "right", render: (r) => formatKsh(r.rent) }, { key: "orders", label: "Shop orders", align: "right", render: (r) => formatKsh(r.orders) }, { key: "payments", label: "Payments", align: "right" }];
      const csv = [{ key: "month", label: "Month" }, { key: "subscription", label: "Subscriptions (KSh)" }, { key: "rent", label: "Rent (KSh)" }, { key: "orders", label: "Shop orders (KSh)" }, { key: "payments", label: "Payments" }];
      body = (
        <>
          <div className="rep-stats"><Stat label="Subscriptions (platform income)" value={formatKsh(sum(rows, "subscription"))} /><Stat label="Rent through the platform" value={formatKsh(sum(rows, "rent"))} />
            <Stat label="Shop sales through the platform" value={formatKsh(sum(rows, "orders"))} /><Stat label="Successful payments" value={sum(rows, "payments").toLocaleString("en-KE")} /></div>
          <Section title="Money" subtitle="Successful payments by month, last 12 months" canExport={rows.some((r) => r.payments)} onExport={exp("money", rows, csv)}>
            <BarCompare stacked data={rows.map((r) => ({ label: shortMonth(r.month), subscription: r.subscription, rent: r.rent, orders: r.orders }))}
              series={[{ key: "subscription", label: "Subscriptions" }, { key: "rent", label: "Rent" }, { key: "orders", label: "Shop orders" }]} format={formatKsh}
              summary="Successful payments by type each month" empty="Payments will appear here." />
            {table(cols, [...rows].reverse(), "month", "No payments yet.")}
          </Section>
        </>
      );
    } else {
      const rows = d.top;
      const cols = [{ key: "name", label: "Business", render: (r) => <Link className="fin-link" to={`/admin/businesses/${r.id}`}>{r.name}</Link> }, { key: "type", label: "Type", render: (r) => typeLabel(r.type) }, { key: "county", label: "County", render: (r) => r.county || "—" },
        { key: "moneyHandled", label: "Money handled", align: "right", render: (r) => formatKsh(r.moneyHandled) }, { key: "payments", label: "Payments", align: "right" }, { key: "subscriptionPaid", label: "Paid to platform", align: "right", render: (r) => formatKsh(r.subscriptionPaid) },
        { key: "lastPayment", label: "Last payment", render: (r) => formatDate(r.lastPayment) }];
      const csv = [{ key: "name", label: "Business" }, { key: "type", label: "Type", value: (r) => typeLabel(r.type) }, { key: "county", label: "County" }, { key: "moneyHandled", label: "Money handled (KSh)" },
        { key: "payments", label: "Payments" }, { key: "subscriptionPaid", label: "Paid to platform (KSh)" }, { key: "lastPayment", label: "Last payment", value: (r) => (r.lastPayment ? String(r.lastPayment).slice(0, 10) : "") }];
      body = (
        <Section title="Top businesses" subtitle="Rent collected and shop sales paid, last 12 months. The platform keeps only the subscription." canExport={rows.length > 0} onExport={exp("top-businesses", rows, csv)}>
          <BarCompare layout="horizontal" data={rows.map((r) => ({ label: r.name, handled: r.moneyHandled }))} series={[{ key: "handled", label: "Money handled" }]} format={formatKsh}
            summary="Money handled by the top businesses" empty="No payments yet." />
          {table(cols, rows, "id", "No payments yet.")}
        </Section>
      );
    }
  }

  return (
    <div className="rep">
      <div className="rep-head"><div><h2 className="rep-head__title">Reports and analytics</h2><p className="rep-head__lead">Growth, businesses and money across the whole platform</p></div></div>
      <div className="rep-tabs" role="tablist" aria-label="Report">
        {TABS.map((t) => <button key={t.id} type="button" role="tab" className="rep-tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>
      {error ? (
        <><Alert type="error" title="Could not load the reports" message={error} /><div><Button variant="outline" onClick={reload}>Try again</Button></div></>
      ) : loading && !d ? <div aria-busy="true" aria-label="Loading"><Skeleton height={96} /><Skeleton height={280} /></div> : body}
    </div>
  );
}
