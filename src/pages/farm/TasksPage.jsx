// src/pages/farm/TasksPage.jsx — NEW FILE
//
// AIM
// /app/:slug/tasks — a simple to-do list for the farm with dates. Tick a task to mark it done.
// Tasks that are due today or late are shown in red, and the owner and managers get an in-app
// reminder for them (once a day) when they open the dashboard or this page.

import "./Farm.css";
import { useEffect, useState } from "react";
import { Alert, Button, Card, CardBody, Checkbox, EmptyState } from "../../components/ui";
import { ConfirmDialog } from "../../components/modals/Modal.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { deleteTask, listCrops, listFields, listTasks, remindTasks, saveTask, setTaskDone } from "../../lib/api/farm.js";
import { formatDate } from "../../lib/format.js";
import { FormModal, Loading, LoadError, PageHead, Tabs, today, useFarm } from "./shared.jsx";

export default function TasksPage() {
  const { bid } = useFarm();
  const toast = useToast();
  const { data: tasks, error, loading, reload } = useAsync(() => listTasks(bid), [bid]);
  const fields = useAsync(() => listFields(bid), [bid]);
  const crops = useAsync(() => listCrops(bid), [bid]);
  const [tab, setTab] = useState("open");
  const [form, setForm] = useState(null); // { task? }
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { remindTasks(bid); }, [bid]);

  if (loading && !tasks) return <Loading />;
  if (error) return <LoadError error={error} onRetry={reload} />;
  const open = tasks.filter((t) => t.status === "open");
  const done = tasks.filter((t) => t.status === "done");
  const shown = tab === "open" ? open : done;
  const late = (t) => t.status === "open" && t.due_date && t.due_date <= today();

  async function toggle(t) {
    const { error: e } = await setTaskDone(t.id, t.status === "open");
    if (e) setErr(e); else reload();
  }

  return (
    <div className="farm">
      <PageHead title="Tasks and reminders" lead={open.length ? `${open.length} open${open.some(late) ? ` · ${open.filter(late).length} due` : ""}` : "Plan the work on your farm"}>
        <Button onClick={() => setForm({})}>Add a task</Button>
      </PageHead>
      {err && <Alert type="error" message={err} />}
      <Tabs label="Tasks" value={tab} onChange={setTab} tabs={[{ value: "open", label: "To do", count: open.length }, { value: "done", label: "Done", count: done.length }]} />

      <Card><CardBody>
        {shown.length === 0 ? (
          <EmptyState icon="check" compact title={tab === "open" ? "Nothing to do" : "No finished tasks yet"} description={tab === "open" ? "Add a task with a date and the app reminds you." : "Tick a task to move it here."}
            action={tab === "open" ? <Button onClick={() => setForm({})}>Add a task</Button> : undefined} />
        ) : (
          <ul className="farm-list">
            {shown.map((t) => (
              <li key={t.id}>
                <Checkbox checked={t.status === "done"} onChange={() => toggle(t)} label={<span className={t.status === "done" ? "farm-done" : ""}>{t.title}</span>} />
                <div className="farm-list__end">
                  <span className={`farm-list__sub${late(t) ? " farm-due" : ""}`}>
                    {t.field?.name || t.crop?.name ? `${t.field?.name || t.crop?.name} · ` : ""}{t.due_date ? `${late(t) ? "Due " : ""}${formatDate(t.due_date)}` : "No date"}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setForm({ task: t })}>Edit</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody></Card>

      <FormModal open={Boolean(form)} title={form?.task ? "Edit task" : "Add a task"} onClose={() => setForm(null)}
        initial={form?.task ? { ...form.task, due_date: form.task.due_date || "", field_id: form.task.field_id || "", crop_id: form.task.crop_id || "", notes: form.task.notes || "" } : { title: "", due_date: "", field_id: "", crop_id: "", notes: "" }}
        fields={[
          { key: "title", label: "Task", required: true, placeholder: "Spray the tomatoes" },
          { key: "due_date", label: "Due date", type: "date" },
          { key: "field_id", label: "Field", type: "select", options: [{ value: "", label: "Any field" }, ...(fields.data || []).map((f) => ({ value: f.id, label: f.name }))] },
          { key: "crop_id", label: "Crop", type: "select", options: [{ value: "", label: "Any crop" }, ...(crops.data || []).map((c) => ({ value: c.id, label: c.name }))] },
          { key: "notes", label: "Notes", type: "textarea" },
        ]}
        danger={form?.task ? { label: "Delete", onClick: () => { setConfirm(form.task); setForm(null); } } : undefined}
        onSubmit={async (v) => { const r = await saveTask(bid, { ...v, id: form?.task?.id }); if (!r.error) { toast.success(form?.task ? "Task updated" : "Task added"); reload(); } return r; }} />
      <ConfirmDialog isOpen={Boolean(confirm)} title="Delete this task?" message="This cannot be undone." confirmLabel="Delete task" loading={busy}
        onConfirm={async () => { setBusy(true); const r = await deleteTask(confirm.id); setBusy(false); setConfirm(null); if (r.error) setErr(r.error); else { toast.success("Task removed"); reload(); } }}
        onCancel={() => setConfirm(null)} />
    </div>
  );
}
