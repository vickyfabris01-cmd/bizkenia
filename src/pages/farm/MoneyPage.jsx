// src/pages/farm/MoneyPage.jsx — NEW FILE
//
// AIM
// /app/:slug/money — farm income and expenses. Two tabs, newest first, with totals for the year.
// Lists load 25 at a time (a "Show more" button gets the next page) so they stay quick on a weak
// connection. Sales of livestock recorded on the Livestock screen appear here automatically.
// Entries can be tied to a crop, which is what makes cost and income per crop in the reports.

import "./Farm.css";
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, CardBody, EmptyState } from "../../components/ui";
import { ConfirmDialog } from "../../components/modals/Modal.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { addExpense, addIncome, deleteExpense, deleteIncome, getFarmSummary, listCrops, listExpenses, listIncome } from "../../lib/api/farm.js";
import { formatDate } from "../../lib/format.js";
import { EXPENSE_CATEGORIES, FormModal, INCOME_SOURCES, Loading, LoadError, PageHead, Stat, Tabs, cap, money, opts, today, useFarm } from "./shared.jsx";

const PAGE = 25;

function usePaged(load, deps) {
  const [rows, setRows] = useState([]);
  const [more, setMore] = useState(false);
  const [state, setState] = useState({ loading: true, error: null });
  const fetchPage = useCallback(async (offset) => {
    const { data, error } = await load({ limit: PAGE, offset });
    if (error) { setState({ loading: false, error }); return; }
    setRows((r) => (offset ? [...r, ...data] : data));
    setMore(data.length === PAGE);
    setState({ loading: false, error: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { setState({ loading: true, error: null }); fetchPage(0); }, [fetchPage]);
  return { rows, more, ...state, next: () => fetchPage(rows.length), reload: () => fetchPage(0) };
}

export default function MoneyPage() {
  const { bid } = useFarm();
  const toast = useToast();
  const [tab, setTab] = useState("income");
  const [form, setForm] = useState(null); // "income" | "expense"
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const income = usePaged((pg) => listIncome(bid, pg), [bid]);
  const expenses = usePaged((pg) => listExpenses(bid, pg), [bid]);
  const sum = useAsync(() => getFarmSummary(bid), [bid]);
  const crops = useAsync(() => listCrops(bid), [bid]);

  const cur = tab === "income" ? income : expenses;
  if (cur.loading && !cur.rows.length && !sum.data) return <Loading />;
  if (cur.error) return <LoadError error={cur.error} onRetry={cur.reload} />;

  const net = sum.data ? sum.data.incomeYear - sum.data.costYear : 0;
  const cropOptions = [{ value: "", label: "Not tied to a crop" }, ...(crops.data || []).map((c) => ({ value: c.id, label: c.name }))];
  const refresh = () => { income.reload(); expenses.reload(); sum.reload(); };

  async function remove() {
    setBusy(true); setErr("");
    const r = confirm.kind === "income" ? await deleteIncome(confirm.id) : await deleteExpense(confirm.id);
    setBusy(false); setConfirm(null);
    if (r.error) setErr(r.error); else { toast.success("Entry removed"); refresh(); }
  }

  return (
    <div className="farm">
      <PageHead title="Income and expenses" lead="What the farm earns and spends">
        <Button onClick={() => setForm("income")}>Add income</Button>
        <Button variant="outline" onClick={() => setForm("expense")}>Add expense</Button>
      </PageHead>
      {err && <Alert type="error" message={err} />}

      {sum.data && (
        <div className="farm-stats">
          <Stat label="Income this year" value={money(sum.data.incomeYear)} tone="good" />
          <Stat label="Expenses this year" value={money(sum.data.costYear)} />
          <Stat label="Net this year" value={money(net)} tone={net < 0 ? "bad" : net > 0 ? "good" : undefined} />
          <Stat label="This month" value={money(sum.data.incomeMonth - sum.data.costMonth)} note={`${money(sum.data.incomeMonth)} in · ${money(sum.data.costMonth)} out`} />
        </div>
      )}

      <Tabs label="Money" value={tab} onChange={setTab} tabs={[{ value: "income", label: "Income" }, { value: "expense", label: "Expenses" }]} />

      <Card><CardBody>
        {cur.rows.length === 0 ? (
          <EmptyState icon="card" compact title={tab === "income" ? "No income recorded" : "No expenses recorded"} description="Record each sale or cost as it happens so your reports are right."
            action={<Button onClick={() => setForm(tab === "income" ? "income" : "expense")}>{tab === "income" ? "Add income" : "Add expense"}</Button>} />
        ) : (
          <>
            <ul className="farm-list">
              {cur.rows.map((r) => (
                <li key={r.id}>
                  <div className="farm-list__main">
                    <span className="farm-list__title">{tab === "income" ? INCOME_SOURCES.find((s) => s.value === r.source)?.label || cap(r.source) : cap(r.category)}{r.crop?.name ? ` · ${r.crop.name}` : ""}</span>
                    <span className="farm-list__sub">{formatDate(tab === "income" ? r.income_date : r.expense_date)}{r.description ? ` · ${r.description}` : ""}</span>
                  </div>
                  <div className="farm-list__end">
                    <span className={`farm-amount farm-amount--${tab === "income" ? "in" : "out"}`}>{tab === "income" ? "+" : "−"}{money(r.amount)}</span>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: tab, id: r.id })} aria-label={`Remove ${money(r.amount)} entry`}>Remove</Button>
                  </div>
                </li>
              ))}
            </ul>
            {cur.more && <div className="farm-more"><Button variant="outline" onClick={cur.next}>Show more</Button></div>}
          </>
        )}
      </CardBody></Card>

      <FormModal open={form === "income"} title="Add income" submitLabel="Save" onClose={() => setForm(null)}
        initial={{ source: "crop_sale", amount: "", date: today(), crop_id: "", description: "" }}
        fields={[
          { key: "source", label: "Source", type: "select", options: INCOME_SOURCES },
          { key: "amount", label: "Amount (KSh)", type: "number", min: "1", step: "any", required: true },
          { key: "date", label: "Date", type: "date", required: true },
          { key: "crop_id", label: "Crop", type: "select", options: cropOptions },
          { key: "description", label: "Details", placeholder: "Sold 20 bags of maize at the market" },
        ]}
        onSubmit={async (v) => {
          if (!(Number(v.amount) > 0)) return { error: "Enter an amount above zero." };
          const r = await addIncome(bid, v); if (!r.error) { toast.success("Income added"); setTab("income"); refresh(); } return r;
        }} />
      <FormModal open={form === "expense"} title="Add expense" submitLabel="Save" onClose={() => setForm(null)}
        initial={{ category: "seeds", amount: "", date: today(), crop_id: "", description: "" }}
        fields={[
          { key: "category", label: "Type of cost", type: "select", options: opts(EXPENSE_CATEGORIES) },
          { key: "amount", label: "Amount (KSh)", type: "number", min: "1", step: "any", required: true },
          { key: "date", label: "Date", type: "date", required: true },
          { key: "crop_id", label: "Crop", type: "select", options: cropOptions },
          { key: "description", label: "Details", placeholder: "10 bags of DAP from the agrovet" },
        ]}
        onSubmit={async (v) => {
          if (!(Number(v.amount) > 0)) return { error: "Enter an amount above zero." };
          const r = await addExpense(bid, v); if (!r.error) { toast.success("Expense added"); setTab("expense"); refresh(); } return r;
        }} />
      <ConfirmDialog isOpen={Boolean(confirm)} title="Remove this entry?" message="It is taken out of your totals and reports. This cannot be undone." confirmLabel="Remove" loading={busy} onConfirm={remove} onCancel={() => setConfirm(null)} />
    </div>
  );
}
