// src/pages/shop/ShopReportsPage.jsx — NEW FILE (Phase 5, step 3)
//
// AIM
// /app/:slug/reports for a shop (owner only) — three tabs, each with a chart, a table and a
// "Download CSV" button, for the last 12 months:
//   Sales         orders, sales and money received per month
//   Orders        orders by status (awaiting payment, processing, delivered, cancelled ...)
//   Top products  the products that sold the most, by units and by money
// "Sales" leaves out cancelled orders (same rule as the dashboard). "Received" is money already paid.
// Data: report_shop_* views (migration p5_07), read through lib/api/reports.js getShopReport.

import "./Shop.css";
import { useState } from "react";
import { Button, Card, CardBody, CardHeader } from "../../components/ui";
import SimpleTable from "../../components/data/SimpleTable.jsx";
import BarCompare from "../../components/charts/BarCompare.jsx";
import DonutBreakdown from "../../components/charts/DonutBreakdown.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { getShopReport } from "../../lib/api/reports.js";
import { downloadCsv } from "../../lib/csv.js";
import { Loading, LoadError, ORDER_STATUS, PageHead, Stat, Tabs, cap, money, useShop } from "./shared.jsx";

const TABS = [{ value: "sales", label: "Sales" }, { value: "orders", label: "Orders" }, { value: "products", label: "Top products" }];
const shortMonth = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-KE", { month: "short" });
const longMonth = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-KE", { month: "short", year: "numeric" });
const sum = (rows, k) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);
const statusText = (s) => ORDER_STATUS[s]?.[1] || cap(s);

function Section({ title, subtitle, canExport, onExport, children }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} action={<Button size="sm" variant="outline" disabled={!canExport} onClick={onExport}>Download CSV</Button>} />
      <CardBody><div style={{ display: "grid", gap: "var(--space-4)" }}>{children}</div></CardBody>
    </Card>
  );
}
const Table = ({ columns, rows, rowKey, empty }) => <SimpleTable columns={columns} rows={rows} rowKey={rowKey} empty={<p className="shop-hint">{empty}</p>} />;

export default function ShopReportsPage() {
  const { business, bid } = useShop();
  const toast = useToast();
  const [tab, setTab] = useState("sales");
  const { data: d, error, loading, reload } = useAsync(() => getShopReport(bid), [bid]);
  if (loading && !d) return <Loading />;
  if (error) return <LoadError error={error} onRetry={reload} />;

  const file = (name) => `${business.slug}-${name}-${new Date().toISOString().slice(0, 10)}`;
  const exp = (name, rows, cols) => () => { downloadCsv(file(name), rows, cols); toast.success("CSV downloaded"); };
  let body;

  if (tab === "sales") {
    const rows = d.monthly.map((r) => ({ ...r, _k: r.month }));
    const sales = sum(rows, "sales"), orders = sum(rows, "orders");
    const cols = [{ key: "month", label: "Month", render: (r) => longMonth(r.month) }, { key: "orders", label: "Orders", align: "right" }, { key: "sales", label: "Sales", align: "right", render: (r) => money(r.sales) },
      { key: "received", label: "Money received", align: "right", render: (r) => money(r.received) }, { key: "cancelled", label: "Cancelled", align: "right" }];
    const csv = [{ key: "month", label: "Month" }, { key: "orders", label: "Orders" }, { key: "sales", label: "Sales (KSh)" }, { key: "received", label: "Money received (KSh)" }, { key: "cancelled", label: "Cancelled orders" }];
    body = (
      <>
        <div className="shop-stats"><Stat label="Sales, 12 months" value={money(sales)} tone="good" note="Cancelled orders excluded" /><Stat label="Orders, 12 months" value={orders} />
          <Stat label="Average order" value={money(orders ? Math.round(sales / orders) : 0)} /><Stat label="Money received" value={money(sum(rows, "received"))} /></div>
        <Section title="Sales" subtitle="Last 12 months" canExport={rows.some((r) => r.orders || r.cancelled)} onExport={exp("sales", rows, csv)}>
          <BarCompare data={rows.map((r) => ({ label: shortMonth(r.month), sales: r.sales, received: r.received }))} series={[{ key: "sales", label: "Sales" }, { key: "received", label: "Money received" }]}
            format={money} summary="Sales and money received per month" empty="Sales will appear here when you get orders." />
          <Table columns={cols} rows={rows} rowKey="_k" empty="No orders in the last 12 months." />
        </Section>
      </>
    );
  } else if (tab === "orders") {
    const rows = d.status.map((r) => ({ ...r, _k: r.status }));
    const total = sum(rows, "orders");
    const cols = [{ key: "status", label: "Status", render: (r) => statusText(r.status) }, { key: "orders", label: "Orders", align: "right" },
      { key: "total", label: "Value", align: "right", render: (r) => money(r.total) }, { key: "share", label: "Share", align: "right", render: (r) => (total ? `${Math.round((r.orders / total) * 100)}%` : "—") }];
    const csv = [{ key: "status", label: "Status", value: (r) => statusText(r.status) }, { key: "orders", label: "Orders" }, { key: "total", label: "Value (KSh)" }];
    const get = (s) => rows.find((r) => r.status === s)?.orders || 0;
    body = (
      <>
        <div className="shop-stats"><Stat label="All orders" value={total} /><Stat label="Delivered" value={get("delivered")} tone="good" />
          <Stat label="In progress" value={get("paid") + get("processing") + get("shipped") + get("ready_for_pickup")} /><Stat label="Cancelled" value={get("cancelled")} /></div>
        <Section title="Orders by status" subtitle="All time" canExport={rows.length > 0} onExport={exp("orders-by-status", rows, csv)}>
          <DonutBreakdown data={rows.map((r) => ({ name: statusText(r.status), value: r.orders }))} centreLabel={String(total)} summary="Orders by status" empty="No orders yet." />
          <Table columns={cols} rows={rows} rowKey="_k" empty="No orders yet." />
        </Section>
      </>
    );
  } else {
    const rows = d.top;
    const cols = [{ key: "name", label: "Product" }, { key: "units", label: "Units sold", align: "right" }, { key: "orders", label: "Orders", align: "right" }, { key: "revenue", label: "Sales", align: "right", render: (r) => money(r.revenue) }];
    const csv = [{ key: "name", label: "Product" }, { key: "units", label: "Units sold" }, { key: "orders", label: "Orders" }, { key: "revenue", label: "Sales (KSh)" }];
    body = (
      <>
        <div className="shop-stats"><Stat label="Products sold" value={rows.length} /><Stat label="Units sold" value={sum(rows, "units")} /><Stat label="Sales from these" value={money(sum(rows, "revenue"))} /></div>
        <Section title="Top products" subtitle="By sales, all time, cancelled orders excluded" canExport={rows.length > 0} onExport={exp("top-products", rows, csv)}>
          <BarCompare layout="horizontal" data={rows.slice(0, 10).map((r) => ({ label: r.name, sales: r.revenue }))} series={[{ key: "sales", label: "Sales" }]} format={money} summary="Sales by product" empty="Sell a product to see it here." />
          <Table columns={cols} rows={rows} rowKey="_k" empty="No sales yet." />
        </Section>
      </>
    );
  }

  return (
    <div className="shop">
      <PageHead title="Reports" lead="Sales, orders and best sellers for your shop" />
      <Tabs value={tab} onChange={setTab} tabs={TABS} label="Report" />
      {body}
    </div>
  );
}
