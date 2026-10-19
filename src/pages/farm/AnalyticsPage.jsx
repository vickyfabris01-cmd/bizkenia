// src/pages/farm/AnalyticsPage.jsx — MODIFIED (land and yield per acre)
//
// AIM
// /app/:slug/analytics — the farm's numbers as charts: income against cost by month, harvest by
// month, yield per crop, and where the money goes (cost by category). Figures come from the same
// records as the dashboard. For tables and CSV downloads, use Reports.

import "./Farm.css";
import { Link } from "react-router-dom";
import { Button, Card, CardBody, CardHeader } from "../../components/ui";
import BarCompare from "../../components/charts/BarCompare.jsx";
import DonutBreakdown from "../../components/charts/DonutBreakdown.jsx";
import LineTrend from "../../components/charts/LineTrend.jsx";
import useAsync from "../../hooks/useAsync.js";
import { getFarmSummary } from "../../lib/api/farm.js";
import { getFarmReport } from "../../lib/api/reports.js";
import { formatAcres, haToAcres } from "../../lib/geo.js";
import { Loading, LoadError, PageHead, Stat, cap, kg, money, useFarm } from "./shared.jsx";

const MONTH = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-KE", { month: "short" });

export default function AnalyticsPage() {
  const { bid, base } = useFarm();
  const { data, error, loading, reload } = useAsync(async () => {
    const [s, r] = await Promise.all([getFarmSummary(bid), getFarmReport(bid)]);
    return { data: { s: s.data, r: r.data }, error: s.error || r.error };
  }, [bid]);

  if (loading && !data) return <Loading />;
  if (error) return <LoadError error={error} onRetry={reload} />;
  const { s, r } = data;
  const net = s.incomeYear - s.costYear;
  const perAcre = s.hectares > 0 ? s.yieldKgYear / haToAcres(s.hectares) : 0; // s.hectares is the stored value; yield is shown per acre

  return (
    <div className="farm">
      <PageHead title="Farm analytics" lead="How the farm is doing">
        <Button as={Link} to={`${base}/reports`} variant="outline">Reports and CSV</Button>
      </PageHead>

      <div className="farm-stats">
        <Stat label="Land" value={formatAcres(s.hectares)} note={`${s.activePlots} active plot${s.activePlots === 1 ? "" : "s"}`} />
        <Stat label="Harvested this year" value={kg(s.yieldKgYear)} note={s.hectares > 0 && s.yieldKgYear > 0 ? `${kg(perAcre)} per acre of land` : undefined} />
        <Stat label="Income this year" value={money(s.incomeYear)} tone="good" />
        <Stat label="Net this year" value={money(net)} tone={net < 0 ? "bad" : net > 0 ? "good" : undefined} note={`${money(s.costYear)} spent`} />
      </div>

      <div className="farm-grid farm-grid--2">
        <Card><CardHeader title="Income against cost" subtitle="Last 12 months" /><CardBody>
          <LineTrend data={s.monthly.map((m) => ({ label: MONTH(m.month), income: m.income, cost: m.cost }))} series={[{ key: "income", label: "Income" }, { key: "cost", label: "Cost" }]}
            format={money} summary="Monthly income and cost for the last 12 months" empty="Record income and expenses to see this chart." />
        </CardBody></Card>
        <Card><CardHeader title="Harvest by month" subtitle="Kilograms" /><CardBody>
          <BarCompare data={s.monthly.map((m) => ({ label: MONTH(m.month), harvested: m.harvestKg }))} series={[{ key: "harvested", label: "Harvested (kg)" }]}
            format={kg} summary="Kilograms harvested per month" empty="Record a harvest on a crop to see this chart." />
        </CardBody></Card>
        <Card><CardHeader title="Yield per crop" subtitle="Total harvested" /><CardBody>
          <BarCompare layout="horizontal" data={r.yields.filter((y) => y.harvested_kg > 0).slice(0, 8).map((y) => ({ label: y.crop, harvested: y.harvested_kg }))}
            series={[{ key: "harvested", label: "Harvested (kg)" }]} format={kg} summary="Kilograms harvested per crop" empty="No harvests recorded yet." />
        </CardBody></Card>
        <Card><CardHeader title="Where the money goes" subtitle="Cost by type, last 12 months" /><CardBody>
          <DonutBreakdown data={s.costByCategory.map((c) => ({ name: cap(c.name), value: c.value }))} format={money} centreLabel={money(s.costYear)} empty="Record expenses to see the breakdown." />
        </CardBody></Card>
      </div>

      <Card><CardHeader title="Crops by stage" /><CardBody>
        <div className="farm-stats">
          {s.cropsByStatus.map((c) => <Stat key={c.status} label={cap(c.status)} value={c.count} />)}
        </div>
      </CardBody></Card>
    </div>
  );
}
