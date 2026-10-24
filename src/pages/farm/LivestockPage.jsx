// src/pages/farm/LivestockPage.jsx — MODIFIED (class of animal; put a group on sale)
//
// AIM
// /app/:slug/livestock — groups of animals (a herd, a flock) and what happens to them:
// vaccination, feeding, treatment, birth, sale and loss. Births add to the head count; sales and
// losses take away (never below zero). A sale with a price is also recorded as farm income, so the
// money screen and reports include it. The latest events show in the list and on the dashboard.

import "./Farm.css";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Card, CardBody, CardHeader, EmptyState } from "../../components/ui";
import { ConfirmDialog } from "../../components/modals/Modal.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { deleteGroup, listEvents, listGroups, recordEvent, saveGroup } from "../../lib/api/farm.js";
import { formatDate } from "../../lib/format.js";
import { EVENT_KINDS, FormModal, Loading, LoadError, PageHead, SPECIES, cap, money, opts, today, useFarm } from "./shared.jsx";

export default function LivestockPage() {
  const { bid, base } = useFarm();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(async () => {
    const [g, e] = await Promise.all([listGroups(bid), listEvents(bid, { limit: 20 })]);
    return { data: { groups: g.data || [], events: e.data || [] }, error: g.error || e.error };
  }, [bid]);
  const [form, setForm] = useState(null);   // { group? }
  const [event, setEvent] = useState(null); // group
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (loading && !data) return <Loading />;
  if (error) return <LoadError error={error} onRetry={reload} />;
  const { groups, events } = data;
  const heads = groups.reduce((a, g) => a + g.head_count, 0);

  return (
    <div className="farm">
      <PageHead title="Livestock" lead={groups.length ? `${heads} animal${heads === 1 ? "" : "s"} in ${groups.length} group${groups.length === 1 ? "" : "s"}` : "Herds and flocks, and what happens to them"}>
        <Button onClick={() => setForm({})}>Add livestock</Button>
      </PageHead>
      {err && <Alert type="error" message={err} />}

      {groups.length === 0 ? (
        <Card><EmptyState icon="users" title="No livestock yet" description="Add a group, such as 'Dairy cows' or 'Layers', then record vaccinations, births and sales." action={<Button onClick={() => setForm({})}>Add livestock</Button>} /></Card>
      ) : (
        <div className="farm-cards">
          {groups.map((g) => (
            <Card key={g.id}><CardBody>
              <h3 className="farm-card__title">{g.name}</h3>
              <p className="farm-card__meta">{cap(g.species)}{g.breed ? ` · ${g.breed}` : ""}{g.animal_class ? ` · ${g.animal_class}` : ""}</p>
              <p className="farm-stat__value" style={{ margin: "var(--space-2) 0" }}>{g.head_count} <span className="farm-card__meta">animal{g.head_count === 1 ? "" : "s"}</span></p>
              <div className="farm-split">
                <Button size="sm" onClick={() => setEvent(g)}>Record event</Button>
                {g.head_count > 0 && <Button as={Link} size="sm" variant="outline" to={`${base}/produce?source=livestock:${g.id}`}>Put on sale</Button>}
                <Button size="sm" variant="ghost" onClick={() => setForm({ group: g })}>Edit</Button>
              </div>
            </CardBody></Card>
          ))}
        </div>
      )}

      {events.length > 0 && (
        <Card>
          <CardHeader title="Recent events" subtitle="Latest 20" />
          <CardBody>
            <ul className="farm-list">
              {events.map((e) => (
                <li key={e.id}>
                  <div className="farm-list__main">
                    <span className="farm-list__title">{cap(e.kind)} · {e.group?.name || "Group"}{e.head_change ? ` (${e.head_change > 0 ? "+" : ""}${e.head_change})` : ""}</span>
                    <span className="farm-list__sub">{formatDate(e.event_date)}{e.notes ? ` · ${e.notes}` : ""}</span>
                  </div>
                  {e.amount != null && Number(e.amount) > 0 && <span className="farm-amount">{money(e.amount)}</span>}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <FormModal open={Boolean(form)} title={form?.group ? "Edit group" : "Add livestock"} onClose={() => setForm(null)}
        fields={[
          { key: "name", label: "Group name", required: true, placeholder: "Dairy cows" },
          { key: "species", label: "Kind of animal", type: "select", options: opts(SPECIES) },
          { key: "breed", label: "Breed", placeholder: "Friesian" },
          { key: "animal_class", label: "Class (optional)", placeholder: "Bull, cow, heifer, ram, layer", helper: "Keep one kind of animal in each group so you can list exactly what you have, such as 5 bulls." },
          ...(form?.group ? [] : [{ key: "head_count", label: "How many animals", type: "number", min: "0", step: "1", required: true }]),
          { key: "notes", label: "Notes", type: "textarea" },
        ]}
        initial={form?.group ? { ...form.group, breed: form.group.breed || "", animal_class: form.group.animal_class || "", notes: form.group.notes || "" } : { name: "", species: "cattle", breed: "", animal_class: "", head_count: "", notes: "" }}
        danger={form?.group ? { label: "Delete", onClick: () => { setConfirm(form.group); setForm(null); } } : undefined}
        onSubmit={async (v) => { const r = await saveGroup(bid, v); if (!r.error) { toast.success(form?.group ? "Group updated" : "Livestock added"); reload(); } return r; }} />

      <FormModal open={Boolean(event)} title={event ? `Record event · ${event.name}` : ""} onClose={() => setEvent(null)}
        initial={{ kind: "vaccination", event_date: today(), heads: "", amount: "", notes: "" }}
        fields={[
          { key: "kind", label: "What happened", type: "select", options: opts(EVENT_KINDS) },
          { key: "event_date", label: "Date", type: "date", required: true },
          { key: "heads", label: "How many animals", type: "number", min: "1", step: "1", required: true, show: (v) => ["birth", "sale", "loss"].includes(v.kind),
            helper: event ? `The group has ${event.head_count} now` : undefined },
          { key: "amount", label: "Sale price, total (KSh)", type: "number", min: "0", step: "any", show: (v) => v.kind === "sale",
            helper: "For a sale this is added to your income" },
          { key: "notes", label: "Notes", type: "textarea", placeholder: "Vaccine used, who bought them…" },
        ]}
        onSubmit={async (v) => { const r = await recordEvent(event.id, v); if (!r.error) { toast.success("Event recorded"); reload(); } return r; }} />

      <ConfirmDialog isOpen={Boolean(confirm)} title="Delete this group?" message="Its events are deleted too. Income already recorded from sales stays." confirmLabel="Delete group" loading={busy}
        onConfirm={async () => { setBusy(true); const r = await deleteGroup(confirm.id); setBusy(false); setConfirm(null); if (r.error) setErr(r.error); else { toast.success("Group removed"); reload(); } }}
        onCancel={() => setConfirm(null)} />
    </div>
  );
}
