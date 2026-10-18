// src/pages/admin/AdminRevenue.jsx — NEW FILE (Phase 5, step 3)
//
// AIM
// /admin/revenue — what businesses pay the platform. Subscriptions are the platform's only income
// (no commission is charged), so this screen shows: this month against last month, the last 12
// months and all time, how many subscriptions are running or about to end, revenue by month and by
// business type, and the latest subscription payments. Numbers come from the same list as the
// Transactions screen, so the two always agree. A CSV of the monthly figures can be downloaded.

import "./Admin.css";
import "./AdminFinance.css";
import { Link } from "react-router-dom";
import { Alert, Button, Card, CardBody, CardHeader, EmptyState, Skeleton } from "../../components/ui";
import SimpleTable from "../../components/data/SimpleTable.jsx";
import BarCompare from "../../components/charts/BarCompare.jsx";
import DonutBreakdown from "../../components/charts/DonutBreakdown.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { getRevenue, listTransactions } from "../../lib/api/platformFinance.js";
import { downloadCsv } from "../../lib/csv.js";
import { formatKsh } from "../../lib/format.js";
import { typeLabel } from "../../config/counties.js";
import { Stat, formatWhen, longMonth, shortMonth } from "./AdminParts.jsx";

export default function AdminRevenue() {
  const toast = useToast();
  const rev = useAsync(() => getRevenue(), []);
  const recent = useAsync(() => listTransactions({ kind: "subscription", status: "success" }, { page: 1, size: 10 }), []);
  const d = rev.data;

  const change = d && d.lastMonth > 0 ? Math.round(((d.thisMonth - d.lastMonth) / d.lastMonth) * 100) : null;
  const changeNote = !d ? "" : change === null ? (d.thisMonth > 0 ? "No revenue last month" : "") : `${change >= 0 ? "Up" : "Down"} ${Math.abs(change)}% on last month (${formatKsh(d.lastMonth)})`;

  function download() {
    downloadCsv(`revenue-by-month-${new Date().toISOString().slice(0, 10)}`, d.monthly, [
      { key: "month", label: "Month" }, { key: "revenue", label: "Subscription revenue (KSh)" },
      { key: "payments", label: "Payments" }, { key: "payingBusinesses", label: "Paying businesses" },
    ]);
    toast.success("CSV downloaded");
  }

  return (
    <div className="adm">
      <div className="fin-head">
        <div><h2 className="adm__title">Revenue</h2></div>
        <Button variant="outline" disabled={!d || !d.monthly.some((m) => m.revenue)} onClick={download}>Download CSV</Button>
      </div>
      <p className="fin-lead">What businesses pay the platform in subscriptions. This is the platform's only income: no commission is charged on rent or shop sales.</p>

      {rev.error ? (
        <><Alert type="error" title="Could not load revenue" message={rev.error} /><div><Button variant="outline" onClick={rev.reload}>Try again</Button></div></>
      ) : (
        <>
          <div className="adm-stats">
            <Stat label="This month" tone="good" loading={rev.loading && !d} value={d ? formatKsh(d.thisMonth) : ""} note={changeNote} />
            <Stat label="Last 12 months" loading={rev.loading && !d} value={d ? formatKsh(d.twelveMonths) : ""} note={d ? `${d.payingBusinesses} paying businesses, all time` : ""} />
            <Stat label="All time" loading={rev.loading && !d} value={d ? formatKsh(d.allTime) : ""} note={d ? `${d.payments} payments` : ""} />
            <Stat label="Running subscriptions" loading={rev.loading && !d} value={d ? d.activeSubscriptions : ""} to="/admin/businesses?status=active" />
            <Stat label="Ending within 7 days" tone={d?.expiringSoon ? "warn" : undefined} loading={rev.loading && !d} value={d ? d.expiringSoon : ""} note={d?.expiringSoon ? "They need to renew" : "None about to end"} />
            <Stat label="Average payment" loading={rev.loading && !d} value={d ? formatKsh(d.payments ? Math.round(d.allTime / d.payments) : 0) : ""} />
          </div>

          <div className="fin-grid fin-grid--2">
            <Card>
              <CardHeader title="Revenue by month" subtitle="Last 12 months" />
              <CardBody>
                {rev.loading && !d ? <Skeleton height={260} /> : (
                  <BarCompare data={(d?.monthly || []).map((m) => ({ label: shortMonth(m.month), revenue: m.revenue }))} series={[{ key: "revenue", label: "Subscriptions" }]}
                    format={formatKsh} summary="Subscription revenue per month" empty="Subscription payments will appear here." />
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Revenue by business type" subtitle="Last 12 months" />
              <CardBody>
                {rev.loading && !d ? <Skeleton height={220} /> : (
                  <DonutBreakdown data={(d?.byType || []).map((t) => ({ name: typeLabel(t.type), value: t.revenue }))} format={formatKsh}
                    centreLabel={formatKsh((d?.byType || []).reduce((a, t) => a + t.revenue, 0))} empty="No subscription payments yet." />
                )}
              </CardBody>
            </Card>
          </div>

          <Card padding="none">
            <CardHeader title="Monthly figures" />
            <SimpleTable loading={rev.loading && !d} rows={[...(d?.monthly || [])].reverse()} rowKey="month"
              empty={<EmptyState icon="card" title="No revenue yet" compact />}
              columns={[
                { key: "month", label: "Month", render: (r) => longMonth(r.month) },
                { key: "revenue", label: "Revenue", align: "right", render: (r) => <span className="fin-amount">{formatKsh(r.revenue)}</span> },
                { key: "payments", label: "Payments", align: "right" },
                { key: "payingBusinesses", label: "Paying businesses", align: "right" },
              ]} />
          </Card>

          <Card padding="none">
            <CardHeader title="Latest subscription payments" action={<Button as={Link} to="/admin/transactions?kind=subscription&status=success" variant="ghost" size="sm">See all</Button>} />
            <SimpleTable loading={recent.loading && !recent.data} rows={recent.data?.rows || []}
              empty={<EmptyState icon="card" title="No subscription payments yet" description="They appear here when a business pays." compact />}
              columns={[
                { key: "occurred_at", label: "Date", render: (r) => formatWhen(r.occurred_at) },
                { key: "business_name", label: "Business", render: (r) => r.business_id ? <Link className="fin-link" to={`/admin/businesses/${r.business_id}`}>{r.business_name}</Link> : "—" },
                { key: "receipt", label: "Receipt", render: (r) => r.receipt || "—" },
                { key: "amount", label: "Amount", align: "right", render: (r) => <span className="fin-amount">{formatKsh(r.amount)}</span> },
              ]} />
          </Card>
        </>
      )}
    </div>
  );
}
