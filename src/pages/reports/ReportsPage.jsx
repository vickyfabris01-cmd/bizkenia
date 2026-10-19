// src/pages/reports/ReportsPage.jsx — NEW FILE
//
// AIM
// /app/:slug/reports — what the owner (and, for rental, managers) need to run the business, with a
// chart, a table and a "Download CSV" button on every tab. One screen serves both business types:
//   rental       Financial summary · Occupancy · Billing overview · Worker costs
//   agriculture  Income and cost · Yield by crop · Cost breakdown
// Numbers come from the report_* views (migration p4_05) for the last 12 months. The CSV download
// is made in the browser and opens in Excel or Google Sheets.

import "./Reports.css";
import { useState } from "react";
import { Alert, Button, Card, CardBody, CardHeader, Skeleton } from "../../components/ui";
import SimpleTable from "../../components/data/SimpleTable.jsx";
import BarCompare from "../../components/charts/BarCompare.jsx";
import DonutBreakdown from "../../components/charts/DonutBreakdown.jsx";
import LineTrend from "../../components/charts/LineTrend.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import { getFarmReport, getRentalReport } from "../../lib/api/reports.js";
import { downloadCsv } from "../../lib/csv.js";
import { formatKsh } from "../../lib/format.js";

const money = formatKsh;
const num = (n) => Number(n || 0).toLocaleString("en-KE", { maximumFractionDigits: 1 });
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "");
const shortMonth = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-KE", { month: "short" });
const longMonth = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-KE", { month: "short", year: "numeric" });
const sum = (rows, k) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);

const RENTAL_TABS = [{ id: "finance", label: "Financial summary" }, { id: "occupancy", label: "Occupancy" }, { id: "billing", label: "Billing overview" }, { id: "workers", label: "Worker costs" }];
const FARM_TABS = [{ id: "finance", label: "Income and cost" }, { id: "yield", label: "Yield by crop" }, { id: "costs", label: "Cost breakdown" }];

function Stat({ label, value }) {
  return <div className="rep-stat"><span className="rep-stat__label">{label}</span><span className="rep-stat__value">{value}</span></div>;
}

function Section({ title, subtitle, onExport, canExport, children }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} action={<Button size="sm" variant="outline" disabled={!canExport} onClick={onExport}>Download CSV</Button>} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

function table(columns, rows, empty = "Nothing to show for this period yet.") {
  return <SimpleTable columns={columns} rows={rows} rowKey="_k" empty={<p className="rep-head__lead">{empty}</p>} />;
}

function RentalReports({ tab, d, file }) {
  const m = d.monthly;
  const toast = useToast();
  const exp = (name, rows, cols) => () => { downloadCsv(file(name), rows, cols); toast.success("CSV downloaded"); };

  if (tab === "finance") {
    const rows = m.map((r) => ({ ...r, _k: r.month }));
    const cols = [
      { key: "month", label: "Month", render: (r) => longMonth(r.month) }, { key: "invoices", label: "Invoices", align: "right" },
      { key: "billed", label: "Billed", align: "right", render: (r) => money(r.billed) }, { key: "collected", label: "Collected", align: "right", render: (r) => money(r.collected) },
      { key: "workerCost", label: "Worker pay", align: "right", render: (r) => money(r.workerCost) }, { key: "net", label: "Collected less worker pay", align: "right", render: (r) => money(r.net) },
    ];
    const csv = [{ key: "month", label: "Month" }, { key: "invoices", label: "Invoices" }, { key: "billed", label: "Billed (KSh)" }, { key: "collected", label: "Collected (KSh)" }, { key: "workerCost", label: "Worker pay (KSh)" }, { key: "net", label: "Collected less worker pay (KSh)" }];
    const billed = sum(m, "billed"), collected = sum(m, "collected");
    return (
      <>
        <div className="rep-stats">
          <Stat label="Billed, 12 months" value={money(billed)} /><Stat label="Collected, 12 months" value={money(collected)} />
          <Stat label="Collection rate" value={billed > 0 ? `${Math.round((collected / billed) * 100)}%` : "—"} /><Stat label="Worker pay" value={money(sum(m, "workerCost"))} />
        </div>
        <Section title="Financial summary" subtitle="Billed and collected, last 12 months" canExport={rows.some((r) => r.billed || r.collected)} onExport={exp("financial-summary", rows, csv)}>
          <BarCompare data={rows.map((r) => ({ label: shortMonth(r.month), billed: r.billed, collected: r.collected }))} series={[{ key: "billed", label: "Billed" }, { key: "collected", label: "Collected" }]}
            format={money} summary="Rent billed and collected per month" empty="Invoices and payments will appear here." />
          {table(cols, rows)}
        </Section>
      </>
    );
  }
  if (tab === "occupancy") {
    const rows = d.occupancy.map((o) => ({ ...o, _k: o.building_id }));
    const rooms = sum(rows, "rooms"), occ = sum(rows, "occupied");
    const cols = [
      { key: "building", label: "Building" }, { key: "rooms", label: "Rooms", align: "right" }, { key: "occupied", label: "Occupied", align: "right" }, { key: "reserved", label: "Reserved", align: "right" },
      { key: "available", label: "Available", align: "right" }, { key: "maintenance", label: "Maintenance", align: "right" }, { key: "rate", label: "Occupancy", align: "right", render: (r) => `${r.rate}%` },
    ];
    const csv = [{ key: "building", label: "Building" }, { key: "rooms", label: "Rooms" }, { key: "occupied", label: "Occupied" }, { key: "reserved", label: "Reserved" }, { key: "available", label: "Available" }, { key: "maintenance", label: "Maintenance" }, { key: "rate", label: "Occupancy (%)" }];
    return (
      <>
        <div className="rep-stats"><Stat label="Rooms" value={rooms} /><Stat label="Occupied" value={occ} /><Stat label="Available" value={sum(rows, "available")} /><Stat label="Occupancy" value={rooms ? `${Math.round((occ / rooms) * 100)}%` : "—"} /></div>
        <Section title="Occupancy" subtitle="Rooms by building" canExport={rows.length > 0} onExport={exp("occupancy", rows, csv)}>
          <BarCompare stacked layout="horizontal" data={rows.map((r) => ({ label: r.building, occupied: r.occupied, reserved: r.reserved, available: r.available, maintenance: r.maintenance }))}
            series={[{ key: "occupied", label: "Occupied" }, { key: "reserved", label: "Reserved" }, { key: "available", label: "Available" }, { key: "maintenance", label: "Maintenance" }]}
            summary="Rooms by status in each building" empty="Add buildings and rooms to see occupancy." />
          {table(cols, rows, "No rooms yet.")}
        </Section>
      </>
    );
  }
  if (tab === "billing") {
    const rows = d.billing.map((b) => ({ ...b, _k: b.status }));
    const cols = [{ key: "status", label: "Status", render: (r) => cap(r.status) }, { key: "invoices", label: "Invoices", align: "right" },
      { key: "billed", label: "Billed", align: "right", render: (r) => money(r.billed) }, { key: "paid", label: "Paid", align: "right", render: (r) => money(r.paid) }, { key: "balance", label: "Balance", align: "right", render: (r) => money(r.balance) }];
    const csv = [{ key: "status", label: "Status" }, { key: "invoices", label: "Invoices" }, { key: "billed", label: "Billed (KSh)" }, { key: "paid", label: "Paid (KSh)" }, { key: "balance", label: "Balance (KSh)" }];
    const open = rows.filter((r) => ["unpaid", "partial", "overdue"].includes(r.status));
    return (
      <>
        <div className="rep-stats"><Stat label="Invoices" value={sum(rows, "invoices")} /><Stat label="Outstanding" value={money(sum(open, "balance"))} />
          <Stat label="Overdue" value={money(sum(rows.filter((r) => r.status === "overdue"), "balance"))} /><Stat label="Paid" value={money(sum(rows, "paid"))} /></div>
        <Section title="Billing overview" subtitle="All invoices by status" canExport={rows.length > 0} onExport={exp("billing-overview", rows, csv)}>
          <DonutBreakdown data={rows.map((r) => ({ name: cap(r.status), value: r.invoices }))} summary="Invoices by status" empty="No invoices yet." />
          {table(cols, rows, "No invoices yet.")}
        </Section>
      </>
    );
  }
  const rows = m.map((r) => ({ ...r, _k: r.month }));
  const cols = [{ key: "month", label: "Month", render: (r) => longMonth(r.month) }, { key: "workers", label: "Workers paid", align: "right" }, { key: "workerCost", label: "Paid out", align: "right", render: (r) => money(r.workerCost) }];
  const csv = [{ key: "month", label: "Month" }, { key: "workers", label: "Workers paid" }, { key: "workerCost", label: "Paid out (KSh)" }];
  return (
    <>
      <div className="rep-stats"><Stat label="Paid, 12 months" value={money(sum(m, "workerCost"))} /><Stat label="Average a month" value={money(sum(m, "workerCost") / 12)} /></div>
      <Section title="Worker costs" subtitle="Salaries paid, last 12 months" canExport={rows.some((r) => r.workerCost)} onExport={exp("worker-costs", rows, csv)}>
        <BarCompare data={rows.map((r) => ({ label: shortMonth(r.month), paid: r.workerCost }))} series={[{ key: "paid", label: "Paid out" }]} format={money} summary="Salaries paid per month" empty="Salary payments will appear here." />
        {table(cols, rows)}
      </Section>
    </>
  );
}

function FarmReports({ tab, d, file }) {
  const toast = useToast();
  const exp = (name, rows, cols) => () => { downloadCsv(file(name), rows, cols); toast.success("CSV downloaded"); };

  if (tab === "finance") {
    const rows = d.monthly.map((r) => ({ ...r, _k: r.month }));
    const income = sum(rows, "income"), cost = sum(rows, "cost");
    const cols = [{ key: "month", label: "Month", render: (r) => longMonth(r.month) }, { key: "income", label: "Income", align: "right", render: (r) => money(r.income) },
      { key: "cost", label: "Cost", align: "right", render: (r) => money(r.cost) }, { key: "profit", label: "Profit", align: "right", render: (r) => money(r.profit) }];
    const csv = [{ key: "month", label: "Month" }, { key: "income", label: "Income (KSh)" }, { key: "cost", label: "Cost (KSh)" }, { key: "profit", label: "Profit (KSh)" }];
    return (
      <>
        <div className="rep-stats"><Stat label="Income, 12 months" value={money(income)} /><Stat label="Cost, 12 months" value={money(cost)} /><Stat label="Profit" value={money(income - cost)} /><Stat label="Margin" value={income > 0 ? `${Math.round(((income - cost) / income) * 100)}%` : "—"} /></div>
        <Section title="Income and cost" subtitle="Last 12 months" canExport={rows.some((r) => r.income || r.cost)} onExport={exp("farm-income-and-cost", rows, csv)}>
          <LineTrend data={rows.map((r) => ({ label: shortMonth(r.month), income: r.income, cost: r.cost }))} series={[{ key: "income", label: "Income" }, { key: "cost", label: "Cost" }]} format={money} summary="Monthly income and cost" empty="Record income and expenses to see this chart." />
          {table(cols, rows)}
        </Section>
      </>
    );
  }
  if (tab === "yield") {
    const rows = d.yields.map((y, i) => ({ ...y, profit: y.income - y.cost, _k: `${y.crop}-${y.field}-${i}` }));
    const cols = [{ key: "crop", label: "Crop" }, { key: "field", label: "Field" }, { key: "area_acres", label: "Acres", align: "right", render: (r) => (r.area_acres == null ? "—" : num(r.area_acres)) },
      { key: "harvested_kg", label: "Harvested (kg)", align: "right", render: (r) => num(r.harvested_kg) }, { key: "kg_per_acre", label: "kg per acre", align: "right", render: (r) => (r.kg_per_acre == null ? "—" : num(r.kg_per_acre)) },
      { key: "cost", label: "Cost", align: "right", render: (r) => money(r.cost) }, { key: "income", label: "Income", align: "right", render: (r) => money(r.income) }];
    const csv = [{ key: "crop", label: "Crop" }, { key: "field", label: "Field" }, { key: "area_acres", label: "Acres" }, { key: "harvested_kg", label: "Harvested (kg)" }, { key: "kg_per_acre", label: "kg per acre" },
      { key: "cost", label: "Cost (KSh)" }, { key: "income", label: "Income (KSh)" }, { key: "profit", label: "Profit (KSh)" }];
    return (
      <>
        <div className="rep-stats"><Stat label="Crops" value={rows.length} /><Stat label="Harvested" value={`${num(sum(rows, "harvested_kg"))} kg`} /><Stat label="Cost tied to crops" value={money(sum(rows, "cost"))} /><Stat label="Income tied to crops" value={money(sum(rows, "income"))} /></div>
        <Section title="Yield by crop" subtitle="All time" canExport={rows.length > 0} onExport={exp("farm-yield-by-crop", rows, csv)}>
          <BarCompare layout="horizontal" data={rows.filter((r) => r.harvested_kg > 0).slice(0, 10).map((r) => ({ label: r.crop, harvested: r.harvested_kg }))} series={[{ key: "harvested", label: "Harvested (kg)" }]} format={(v) => `${num(v)} kg`} summary="Kilograms harvested per crop" empty="Record a harvest to see yield." />
          {table(cols, rows, "No crops yet.")}
        </Section>
      </>
    );
  }
  const rows = d.costs.map((c) => ({ ...c, label: cap(c.category), _k: c.category }));
  const total = sum(rows, "cost");
  const cols = [{ key: "label", label: "Type of cost" }, { key: "entries", label: "Entries", align: "right" }, { key: "cost", label: "Total", align: "right", render: (r) => money(r.cost) }, { key: "share", label: "Share", align: "right", render: (r) => (total > 0 ? `${Math.round((r.cost / total) * 100)}%` : "—") }];
  const csv = [{ key: "label", label: "Type of cost" }, { key: "entries", label: "Entries" }, { key: "cost", label: "Total (KSh)" }];
  return (
    <>
      <div className="rep-stats"><Stat label="Total cost" value={money(total)} /><Stat label="Types of cost" value={rows.length} /></div>
      <Section title="Cost breakdown" subtitle="All time" canExport={rows.length > 0} onExport={exp("farm-cost-breakdown", rows, csv)}>
        <DonutBreakdown data={rows.map((r) => ({ name: r.label, value: r.cost }))} format={money} centreLabel={money(total)} empty="Record expenses to see the breakdown." />
        {table(cols, rows, "No expenses yet.")}
      </Section>
    </>
  );
}

export default function ReportsPage() {
  const { business } = useBusinessContext();
  const farm = business.business_type === "agriculture";
  const tabs = farm ? FARM_TABS : RENTAL_TABS;
  const [tab, setTab] = useState("finance");
  const { data, error, loading, reload } = useAsync(() => (farm ? getFarmReport(business.id) : getRentalReport(business.id)), [business.id, farm]);
  const file = (name) => `${business.slug}-${name}-${new Date().toISOString().slice(0, 10)}`;

  return (
    <div className="rep">
      <div className="rep-head">
        <div><h2 className="rep-head__title">Reports</h2><p className="rep-head__lead">{farm ? "Income, cost and yield for your farm" : "Money, rooms and people for your rental business"}</p></div>
      </div>
      <div className="rep-tabs" role="tablist" aria-label="Report">
        {tabs.map((t) => <button key={t.id} type="button" role="tab" className="rep-tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>
      {error ? (
        <><Alert type="error" title="Could not load the reports" message={error} /><div><Button variant="outline" onClick={reload}>Try again</Button></div></>
      ) : loading && !data ? (
        <div aria-busy="true" aria-label="Loading"><Skeleton height={96} /><Skeleton height={280} /></div>
      ) : farm ? <FarmReports tab={tab} d={data} file={file} /> : <RentalReports tab={tab} d={data} file={file} />}
    </div>
  );
}
