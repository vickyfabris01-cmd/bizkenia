// src/pages/people/WorkforcePage.jsx — NEW FILE
//
// AIM
// /app/:slug/workforce (owner, manager) — three tabs:
//   Workers     list, add (with or without an account, by email), edit, deactivate/reactivate
//   Attendance  the last 14 days as a sheet; tap a cell to cycle present / absent / half day / leave
//   Payroll     a month at a glance (salary, days present, paid, outstanding) and "Pay salary"

import { useMemo, useState } from "react";
import { Alert, Badge, Button, Card, EmptyState, Input, SelectInput, Skeleton, TextArea } from "../../components/ui";
import { Modal } from "../../components/modals/Modal.jsx";
import SimpleTable from "../../components/data/SimpleTable.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import { addWorker, listAttendance, listWorkers, markAttendance, payWorker, payrollSummary, setWorkerStatus, updateWorker } from "../../lib/api/people.js";
import { formatDate } from "../../lib/format.js";
import { METHOD, PageHead, Tabs, Stat, money, todayISO } from "../rental/shared.jsx";

export const WORKER_ROLES = ["security", "cleaner", "maintenance", "gardener", "receptionist", "driver", "other"].map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));
const CYCLES = [{ value: "monthly", label: "Monthly" }, { value: "biweekly", label: "Every two weeks" }, { value: "weekly", label: "Weekly" }];
const ORDER = ["present", "absent", "half_day", "leave"];
const SHORT = { present: "P", absent: "A", half_day: "½", leave: "L" };
const iso = (d) => d.toISOString().slice(0, 10);

function WorkerForm({ worker, businessId, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ name: worker?.full_name || "", email: worker?.email || "", phone: worker?.phone || "", role: worker?.role || "security",
    salary: worker ? String(worker.salary) : "", pay_cycle: worker?.pay_cycle || "monthly", start: worker?.start_date || todayISO() });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim()) { setErr("Enter the worker's name."); return; }
    if (!(Number(f.salary) >= 0) || f.salary === "") { setErr("Enter the salary."); return; }
    setBusy(true); setErr("");
    const { error } = worker ? await updateWorker(worker.id, f) : await addWorker(businessId, f);
    setBusy(false);
    if (error) { setErr(error); return; }
    toast.success(worker ? "Worker updated" : "Worker added"); onDone(); onClose();
  }
  return (
    <Modal isOpen onClose={onClose} title={worker ? "Edit worker" : "Add a worker"} size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="wk-form" loading={busy}>{worker ? "Save" : "Add worker"}</Button></>}>
      <form id="wk-form" className="rent-form" onSubmit={submit} noValidate>
        {err && <Alert type="error" message={err} />}
        <Input label="Full name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <div className="rent-form__row">
          <SelectInput label="Job" value={f.role} onChange={(v) => setF({ ...f, role: v })} options={WORKER_ROLES} />
          <Input label="Phone" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </div>
        {!worker && <Input label="Email (optional)" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })}
          helper="If the worker signs up or signs in with this email they get a worker portal to check in and see their pay." />}
        <div className="rent-form__row">
          <Input label="Salary (KSh)" type="number" min="0" inputMode="numeric" required value={f.salary} onChange={(e) => setF({ ...f, salary: e.target.value })} />
          <SelectInput label="Paid" value={f.pay_cycle} onChange={(v) => setF({ ...f, pay_cycle: v })} options={CYCLES} />
        </div>
        {!worker && <Input label="Start date" type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />}
      </form>
    </Modal>
  );
}

function PayForm({ worker, onClose, onDone }) {
  const toast = useToast();
  const first = new Date(); first.setDate(1);
  const [f, setF] = useState({ amount: String(Number(worker.outstanding) > 0 ? worker.outstanding : worker.salary), start: iso(first), end: todayISO(), method: "mpesa", notes: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    const { error } = await payWorker(worker.worker_id || worker.id, f);
    setBusy(false);
    if (error) { setErr(error); return; }
    toast.success("Salary recorded"); onDone(); onClose();
  }
  return (
    <Modal isOpen onClose={onClose} title={`Pay ${worker.full_name}`} size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="wk-pay" loading={busy}>Record payment</Button></>}>
      <form id="wk-pay" className="rent-form" onSubmit={submit} noValidate>
        {err && <Alert type="error" message={err} />}
        <div className="rent-form__row">
          <Input label="Amount (KSh)" type="number" min="1" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          <SelectInput label="Paid by" value={f.method} onChange={(v) => setF({ ...f, method: v })} options={Object.entries(METHOD).map(([value, label]) => ({ value, label }))} />
        </div>
        <div className="rent-form__row">
          <Input label="Period from" type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
          <Input label="Period to" type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
        </div>
        <TextArea label="Note (optional)" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </form>
    </Modal>
  );
}

export default function WorkforcePage() {
  const { business } = useBusinessContext();
  const bid = business.id;
  const toast = useToast();
  const [tab, setTab] = useState("workers");
  const [form, setForm] = useState(null);       // null | "new" | worker
  const [pay, setPay] = useState(null);
  const month = useMemo(() => todayISO(), []);

  const workers = useAsync(() => listWorkers(bid), [bid]);
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 13 + i); return iso(d); }), []);
  const att = useAsync(() => (tab === "attendance" ? listAttendance(bid, days[0], days[13]) : Promise.resolve({ data: [], error: null })), [bid, tab]);
  const payroll = useAsync(() => (tab === "payroll" ? payrollSummary(bid, month) : Promise.resolve({ data: [], error: null })), [bid, tab]);

  const active = (workers.data || []).filter((w) => w.status === "active");
  const cell = (wid, d) => (att.data || []).find((a) => a.worker_id === wid && a.date === d);
  async function cycle(w, d) {
    const cur = cell(w.id, d)?.status;
    const next = ORDER[(ORDER.indexOf(cur) + 1) % ORDER.length];
    const { error } = await markAttendance(w.id, d, next);
    if (error) toast.error(error); else att.reload();
  }
  async function toggleStatus(w) {
    const { error } = await setWorkerStatus(w.id, w.status === "active" ? "inactive" : "active");
    if (error) toast.error(error); else workers.reload();
  }

  const cols = [
    { key: "n", label: "Name", render: (w) => <span className="rent-strong">{w.full_name}</span> },
    { key: "r", label: "Job", render: (w) => w.role },
    { key: "p", label: "Phone", render: (w) => w.phone || "—" },
    { key: "s", label: "Salary", align: "right", render: (w) => <span className="rent-money">{money(w.salary)} <small>{w.pay_cycle}</small></span> },
    { key: "a", label: "Portal", render: (w) => (w.user_id ? <Badge variant="success">Linked</Badge> : <Badge variant="neutral">{w.email ? "Waiting for sign up" : "No account"}</Badge>) },
    { key: "t", label: "Status", render: (w) => <Badge variant={w.status === "active" ? "success" : "neutral"}>{w.status}</Badge> },
    { key: "x", label: "", align: "right", render: (w) => (
      <span className="rent-actions" onClick={(e) => e.stopPropagation()} role="presentation">
        <Button size="sm" variant="outline" onClick={() => setForm(w)}>Edit</Button>
        <Button size="sm" variant="ghost" onClick={() => toggleStatus(w)}>{w.status === "active" ? "Deactivate" : "Reactivate"}</Button>
      </span>) },
  ];
  const pcols = [
    { key: "n", label: "Worker", render: (w) => <span className="rent-strong">{w.full_name}</span> },
    { key: "d", label: "Days present", align: "right", render: (w) => w.days_present },
    { key: "a", label: "Absent", align: "right", render: (w) => w.days_absent },
    { key: "s", label: "Salary", align: "right", render: (w) => <span className="rent-money">{money(w.salary)}</span> },
    { key: "p", label: "Paid this month", align: "right", render: (w) => <span className="rent-money">{money(w.paid)}</span> },
    { key: "o", label: "Outstanding", align: "right", render: (w) => <span className="rent-money rent-strong">{money(w.outstanding)}</span> },
    { key: "x", label: "", align: "right", render: (w) => w.status === "active" && <Button size="sm" onClick={() => setPay(w)}>Pay salary</Button> },
  ];
  const totals = (payroll.data || []).reduce((t, w) => ({ paid: t.paid + Number(w.paid), out: t.out + Number(w.outstanding), bill: t.bill + (w.status === "active" ? Number(w.salary) : 0) }), { paid: 0, out: 0, bill: 0 });

  return (
    <div className="rent">
      <PageHead title="Workforce" lead="Security, cleaners, maintenance and other staff who work for your property.">
        <Button onClick={() => setForm("new")}>Add worker</Button>
      </PageHead>
      {(workers.error) && <Alert type="error" message={workers.error} />}
      <Tabs label="Workforce sections" value={tab} onChange={setTab} tabs={[{ value: "workers", label: "Workers", count: active.length }, { value: "attendance", label: "Attendance" }, { value: "payroll", label: "Payroll" }]} />
      {tab === "workers" && <SimpleTable loading={workers.loading} columns={cols} rows={workers.data || []}
        empty={<Card><EmptyState icon="user" compact title="No workers yet" description="Add your guard, cleaner or caretaker to track attendance and pay." /></Card>} />}
      {tab === "attendance" && (att.loading || workers.loading ? <Skeleton height={200} /> : active.length === 0 ? <Card><EmptyState icon="user" compact title="No active workers" /></Card> : (
        <div className="rent-sheet"><table>
          <caption className="rent-muted" style={{ textAlign: "left", paddingBottom: 8 }}>Tap a day to change it: P present, A absent, ½ half day, L leave.</caption>
          <thead><tr><th scope="col">Worker</th>{days.map((d) => <th scope="col" key={d}>{formatDate(d).slice(0, 6)}</th>)}</tr></thead>
          <tbody>{active.map((w) => (
            <tr key={w.id}><td className="rent-strong">{w.full_name}</td>
              {days.map((d) => { const s = cell(w.id, d)?.status; return (
                <td key={d}><button type="button" className={`rent-cell ${s || ""}`} aria-label={`${w.full_name} ${d}: ${s || "not marked"}`} onClick={() => cycle(w, d)}>{s ? SHORT[s] : "–"}</button></td>); })}
            </tr>))}</tbody>
        </table></div>))}
      {tab === "payroll" && (
        <>
          <div className="rent-stats"><Stat label="Monthly salary bill" value={money(totals.bill)} /><Stat label="Paid this month" value={money(totals.paid)} /><Stat label="Outstanding" value={money(totals.out)} tone={totals.out ? "warn" : undefined} /></div>
          <SimpleTable loading={payroll.loading} columns={pcols} rows={(payroll.data || []).map((w) => ({ ...w, id: w.worker_id }))} empty={<Card><EmptyState icon="card" compact title="No payroll yet" /></Card>} />
        </>
      )}
      {form && <WorkerForm worker={form === "new" ? null : form} businessId={bid} onClose={() => setForm(null)} onDone={workers.reload} />}
      {pay && <PayForm worker={pay} onClose={() => setPay(null)} onDone={() => { payroll.reload(); }} />}
    </div>
  );
}
