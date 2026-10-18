// src/pages/people/WorkerPayPage.jsx — NEW FILE
//
// AIM
// /app/:slug/my-pay (worker) — salary history: what was paid, when, by which method, for which period.

import { Alert, Card, EmptyState } from "../../components/ui";
import SimpleTable from "../../components/data/SimpleTable.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import { myWorker, myWorkerPayments } from "../../lib/api/people.js";
import { formatDate } from "../../lib/format.js";
import { METHOD, PageHead, Stat, money } from "../rental/shared.jsx";

export default function WorkerPayPage() {
  const { business } = useBusinessContext();
  const { data, error, loading } = useAsync(async () => {
    const w = await myWorker(business.id);
    if (!w.data) return { data: { worker: null, pays: [] }, error: w.error };
    const p = await myWorkerPayments(w.data.id);
    return { data: { worker: w.data, pays: p.data || [] }, error: p.error };
  }, [business.id]);
  const cols = [
    { key: "d", label: "Paid on", render: (p) => formatDate(p.paid_at) },
    { key: "p", label: "Period", render: (p) => `${formatDate(p.period_start)} – ${formatDate(p.period_end)}` },
    { key: "m", label: "Method", render: (p) => METHOD[p.payment_method] || p.payment_method },
    { key: "a", label: "Amount", align: "right", render: (p) => <span className="rent-money rent-strong">{money(p.amount)}</span> },
  ];
  return (
    <div className="rent">
      <PageHead title="My pay" lead="Your salary payments." />
      {error && <Alert type="error" message={error} />}
      {data?.worker && <div className="rent-stats"><Stat label="Salary" value={money(data.worker.salary)} note={data.worker.pay_cycle} /><Stat label="Payments received" value={data.pays.length} /></div>}
      <SimpleTable loading={loading} columns={cols} rows={data?.pays || []} empty={<Card><EmptyState icon="card" compact title="No payments yet" /></Card>} />
    </div>
  );
}
