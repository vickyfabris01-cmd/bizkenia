// src/pages/farm/FarmDashboard.jsx — MODIFIED (land shown in acres)
//
// AIM
// /app/:slug for an agriculture business (owner and manager). The farm at a glance: acres of land,
// active plots, yield, income against cost, low stock, tasks that are due and the latest work
// done on crops and livestock. Every figure is worked out from the farm tables, so it changes
// as soon as someone records a harvest, a sale or an expense.

import "./Farm.css";
import { Link } from "react-router-dom";
import { Alert, Button, Card, CardBody, CardHeader, EmptyState } from "../../components/ui";
import LineTrend from "../../components/charts/LineTrend.jsx";
import useAsync from "../../hooks/useAsync.js";
import { getFarmSummary, remindTasks } from "../../lib/api/farm.js";
import { formatDate } from "../../lib/format.js";
import { formatAcres } from "../../lib/geo.js";
import { Loading, LoadError, PageHead, Stat, kg, money, useFarm } from "./shared.jsx";

const MONTH = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-KE", { month: "short" });

export default function FarmDashboard() {
  const { bid, base, business } = useFarm();
  const { data: d, error, loading, reload } = useAsync(async () => {
    const res = await getFarmSummary(bid);
    if (!res.error) remindTasks(bid); // tells the team about tasks due today; the answer is not needed here
    return res;
  }, [bid]);

  if (loading && !d) return <Loading />;
  if (error) return <LoadError error={error} onRetry={reload} />;

  const empty = !d.fieldCount && !d.cropsCount && !d.groups.length;
  const net = d.incomeYear - d.costYear;

  return (
    <div className="farm">
      <PageHead title="Farm dashboard" lead={`${business.name} · this year so far`}>
        <Button as={Link} to={`${base}/fields`} variant="outline">Fields</Button>
        <Button as={Link} to={`${base}/money`}>Record money</Button>
      </PageHead>

      {empty && (
        <Card><EmptyState icon="home" title="Start with your first field" description="Draw a field on the map, add a crop to it, and this page fills with your farm's numbers."
          action={<Button as={Link} to={`${base}/fields`}>Add a field</Button>} /></Card>
      )}

      <div className="farm-stats">
        <Stat label="Land" value={formatAcres(d.hectares)} note={`${d.fieldCount} field${d.fieldCount === 1 ? "" : "s"}`} to={`${base}/fields`} />
        <Stat label="Active plots" value={d.activePlots} note={`${d.cropsCount} crop${d.cropsCount === 1 ? "" : "s"} in total`} to={`${base}/crops`} />
        <Stat label="Harvested this year" value={kg(d.yieldKgYear)} to={`${base}/analytics`} />
        <Stat label="Net this year" value={money(net)} tone={net < 0 ? "bad" : net > 0 ? "good" : undefined} note={`${money(d.incomeYear)} in · ${money(d.costYear)} out`} to={`${base}/money`} />
      </div>

      {d.lowStock.length > 0 && (
        <Alert type="warning" title={`${d.lowStock.length} item${d.lowStock.length === 1 ? " is" : "s are"} low on stock`}
          message={<>{d.lowStock.slice(0, 4).map((i) => i.name).join(", ")}{d.lowStock.length > 4 ? " and more" : ""}. <Link to={`${base}/inventory`}>Open supplies</Link></>} />
      )}

      <div className="farm-grid farm-grid--sidebar">
        <Card>
          <CardHeader title="Income against cost" subtitle="Last 12 months" />
          <CardBody>
            <LineTrend data={d.monthly.map((m) => ({ label: MONTH(m.month), income: m.income, cost: m.cost }))}
              series={[{ key: "income", label: "Income" }, { key: "cost", label: "Cost" }]} format={money}
              summary="Monthly income and cost for the last 12 months" empty="Record income and expenses to see this chart." />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Tasks" subtitle={d.dueTasks.length ? `${d.dueTasks.length} due or overdue` : "Nothing overdue"} />
          <CardBody>
            {d.openTasks.length === 0 ? <p className="farm-card__meta">No open tasks. <Link to={`${base}/tasks`}>Add one</Link></p> : (
              <ul className="farm-list">
                {d.openTasks.slice(0, 5).map((t) => (
                  <li key={t.id}>
                    <div className="farm-list__main">
                      <span className="farm-list__title">{t.title}</span>
                      <span className={`farm-list__sub${t.due_date && t.due_date < new Date().toISOString().slice(0, 10) ? " farm-due" : ""}`}>{t.due_date ? `Due ${formatDate(t.due_date)}` : "No date"}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {d.openTasks.length > 5 && <p className="farm-card__meta"><Link to={`${base}/tasks`}>See all {d.openTasks.length} tasks</Link></p>}
          </CardBody>
        </Card>
      </div>

      <div className="farm-grid farm-grid--2">
        <Card>
          <CardHeader title="Recent activity" subtitle="Crops and livestock" />
          <CardBody>
            {d.recent.length === 0 ? <p className="farm-card__meta">Nothing recorded yet.</p> : (
              <ul className="farm-list">
                {d.recent.map((r) => (
                  <li key={r.id}>
                    <div className="farm-list__main">
                      <span className="farm-list__title">{r.label} · {r.subject}</span>
                      <span className="farm-list__sub">{r.kind === "crop" ? "Crop work" : "Livestock"} · {formatDate(r.when)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Livestock" subtitle={`${d.livestockHeads} animal${d.livestockHeads === 1 ? "" : "s"}`} />
          <CardBody>
            {d.groups.length === 0 ? <p className="farm-card__meta">No groups yet. <Link to={`${base}/livestock`}>Add livestock</Link></p> : (
              <ul className="farm-list">
                {d.groups.slice(0, 5).map((g) => (
                  <li key={g.id}><div className="farm-list__main"><span className="farm-list__title">{g.name}</span><span className="farm-list__sub">{g.species}</span></div><span className="farm-amount">{g.head_count}</span></li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
