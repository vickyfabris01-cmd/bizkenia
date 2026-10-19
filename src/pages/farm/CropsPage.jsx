// src/pages/farm/CropsPage.jsx — MODIFIED (acres)
//
// AIM
// /app/:slug/crops and /app/:slug/crops/:id — crop management. The list shows every crop with its
// field and status (planned, planted, growing, harvested). A crop's own page records the work
// done on it (planting, fertilising, spraying, watering), its harvests and its yield per acre,
// and moves it through its status. Planting a crop that was only planned marks it as planted.

import "./Farm.css";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Alert, Button, Card, CardBody, CardHeader, EmptyState } from "../../components/ui";
import { ConfirmDialog } from "../../components/modals/Modal.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { addActivity, addHarvest, deleteActivity, deleteCrop, deleteHarvest, getCrop, listActivities, listCrops, listFields, listHarvests, saveCrop, setCropStatus } from "../../lib/api/farm.js";
import { formatDate } from "../../lib/format.js";
import { acresToHa, formatAcres, haToAcres } from "../../lib/geo.js";
import { ACTIVITY_KINDS, CROP_STATUS, FormModal, Loading, LoadError, PageHead, StatusBadge, Tabs, cap, kg, opts, qty, today, useFarm } from "./shared.jsx";

// Land is stored in hectares but the farmer types and reads acres. `original` is the saved crop (when editing):
// if the acres shown were left alone, the stored hectares are kept exactly so rounding never drifts them.
const acresText = (ha) => (ha == null || ha === "" ? "" : String(Number(haToAcres(ha).toFixed(2))));
const withHectares = (v, original) => ({
  ...v,
  area_ha: v.area_acres === "" || v.area_acres == null ? ""
    : original && original.area_ha != null && String(v.area_acres) === acresText(original.area_ha) ? original.area_ha
    : acresToHa(v.area_acres),
});

const STATUS_OPTIONS = Object.entries(CROP_STATUS).map(([value, [, label]]) => ({ value, label }));

function cropFields(fields) {
  return [
    { key: "field_id", label: "Field", type: "select", required: true, options: fields.map((f) => ({ value: f.id, label: `${f.name} (${formatAcres(f.area_ha)})` })), placeholder: "Choose a field" },
    { key: "name", label: "Crop", required: true, placeholder: "Maize" },
    { key: "variety", label: "Variety", placeholder: "H614" },
    { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    { key: "area_acres", label: "Area used (acres)", type: "number", min: "0", step: "0.01", helper: "Leave empty to use the whole field" },
    { key: "planned_date", label: "Planned planting date", type: "date" },
    { key: "planted_date", label: "Planted on", type: "date" },
    { key: "expected_harvest", label: "Expected harvest", type: "date" },
    { key: "notes", label: "Notes", type: "textarea" },
  ];
}

function CropList() {
  const { bid, base } = useFarm();
  const [params, setParams] = useSearchParams();
  const { data, error, loading, reload } = useAsync(async () => {
    const [c, f] = await Promise.all([listCrops(bid), listFields(bid)]);
    return { data: { crops: c.data || [], fields: f.data || [] }, error: c.error || f.error };
  }, [bid]);
  const toast = useToast();
  const nav = useNavigate();
  const [tab, setTab] = useState("all");
  const presetField = params.get("field");
  const [adding, setAdding] = useState(Boolean(presetField));

  if (loading && !data) return <Loading />;
  if (error) return <LoadError error={error} onRetry={reload} />;
  const { crops, fields } = data;
  const shown = tab === "all" ? crops : crops.filter((c) => c.status === tab);
  const count = (s) => crops.filter((c) => c.status === s).length;

  return (
    <div className="farm">
      <PageHead title="Crops" lead={crops.length ? `${crops.length} crop${crops.length === 1 ? "" : "s"} on your fields` : "What you grow, and when"}>
        <Button onClick={() => setAdding(true)} disabled={!fields.length}>Add a crop</Button>
      </PageHead>
      {!fields.length && <Alert type="info" title="Add a field first" message={<>Crops grow in a field. <Link to={`${base}/fields`}>Add your first field</Link>.</>} />}

      {crops.length > 0 && (
        <Tabs label="Crop status" value={tab} onChange={setTab}
          tabs={[{ value: "all", label: "All", count: crops.length }, ...STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label, count: count(s.value) }))]} />
      )}

      {crops.length === 0 ? (
        fields.length > 0 && <Card><EmptyState icon="home" title="No crops yet" description="Add a crop to a field, then record planting, work and harvests." action={<Button onClick={() => setAdding(true)}>Add a crop</Button>} /></Card>
      ) : shown.length === 0 ? (
        <Card><EmptyState icon="search" compact title="Nothing in this status" description="Pick another tab." /></Card>
      ) : (
        <div className="farm-cards">
          {shown.map((c) => (
            <Link key={c.id} to={`${base}/crops/${c.id}`} className="farm-card">
              <div className="farm-card__row"><h3 className="farm-card__title">{c.name}</h3><StatusBadge status={c.status} /></div>
              <p className="farm-card__meta">{c.variety ? `${c.variety} · ` : ""}{c.field?.name || "No field"} · {formatAcres(c.area_ha ?? c.field?.area_ha)}</p>
              <p className="farm-card__meta">{c.expected_harvest ? `Harvest about ${formatDate(c.expected_harvest)}` : c.planted_date ? `Planted ${formatDate(c.planted_date)}` : "Not planted yet"}</p>
            </Link>
          ))}
        </div>
      )}

      <FormModal open={adding} title="Add a crop" submitLabel="Add crop" fields={cropFields(fields)}
        initial={{ field_id: presetField || "", name: "", variety: "", status: "planned", area_acres: "", planned_date: "", planted_date: "", expected_harvest: "", notes: "" }}
        onClose={() => { setAdding(false); if (presetField) setParams({}, { replace: true }); }}
        onSubmit={async (v) => {
          const res = await saveCrop(bid, withHectares(v));
          if (!res.error) { toast.success("Crop added"); reload(); nav(`${base}/crops/${res.data.id}`); }
          return res;
        }} />
    </div>
  );
}

function CropDetail({ id }) {
  const { bid, base } = useFarm();
  const nav = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(async () => {
    const c = await getCrop(id);
    if (c.error || !c.data) return { data: null, error: c.error || null };
    const [a, h, f] = await Promise.all([listActivities(bid, { cropId: id, limit: 100 }), listHarvests(bid, { cropId: id, limit: 100 }), listFields(bid)]);
    return { data: { crop: c.data, activities: a.data || [], harvests: h.data || [], fields: f.data || [] }, error: a.error || h.error || f.error };
  }, [id, bid]);
  const [modal, setModal] = useState(null); // "activity" | "harvest" | "edit"
  const [confirm, setConfirm] = useState(null); // { kind, id } | "crop"
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (loading && !data) return <Loading />;
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data) return <Card style={{ margin: "var(--space-8) auto", maxWidth: 520 }}><EmptyState icon="search" title="Crop not found" description="It may have been removed." action={<Button as={Link} to={`${base}/crops`}>Back to crops</Button>} /></Card>;
  const { crop, activities, harvests, fields } = data;
  const total = harvests.reduce((a, h) => a + Number(h.quantity_kg), 0);
  const area = Number(crop.area_ha ?? crop.field?.area_ha ?? 0); // hectares, as stored
  const areaAcres = haToAcres(area);

  async function changeStatus(s) {
    const { error: e } = await setCropStatus(id, s);
    if (e) setErr(e); else { toast.success(`Marked as ${CROP_STATUS[s][1].toLowerCase()}`); reload(); }
  }
  async function confirmed() {
    setBusy(true); setErr("");
    const c = confirm;
    const res = c === "crop" ? await deleteCrop(id) : c.kind === "activity" ? await deleteActivity(c.id) : await deleteHarvest(c.id);
    setBusy(false); setConfirm(null);
    if (res.error) { setErr(res.error); return; }
    toast.success("Removed");
    if (c === "crop") nav(`${base}/crops`); else reload();
  }

  const nextStatus = { planned: "planted", planted: "growing", growing: "harvested" }[crop.status];

  return (
    <div className="farm">
      <PageHead title={`${crop.name}${crop.variety ? ` (${crop.variety})` : ""}`} lead={`${crop.field?.name || "No field"} · ${formatAcres(area)}`}>
        <Button as={Link} to={`${base}/crops`} variant="secondary">All crops</Button>
        <Button variant="outline" onClick={() => setModal("edit")}>Edit</Button>
        <Button variant="danger" onClick={() => setConfirm("crop")}>Delete</Button>
      </PageHead>
      {err && <Alert type="error" message={err} />}

      <Card>
        <CardBody>
          <div className="farm-card__row">
            <div className="farm-split"><StatusBadge status={crop.status} />
              {crop.planted_date && <span className="farm-card__meta">Planted {formatDate(crop.planted_date)}</span>}
              {crop.expected_harvest && <span className="farm-card__meta">· Harvest about {formatDate(crop.expected_harvest)}</span>}</div>
            {nextStatus && <Button size="sm" onClick={() => changeStatus(nextStatus)}>Mark as {CROP_STATUS[nextStatus][1].toLowerCase()}</Button>}
          </div>
          {crop.notes && <p style={{ whiteSpace: "pre-line", marginBottom: 0 }}>{crop.notes}</p>}
        </CardBody>
      </Card>

      <div className="farm-stats">
        <div className="farm-stat"><span className="farm-stat__label">Harvested</span><span className="farm-stat__value">{kg(total)}</span><span className="farm-stat__note">{harvests.length} harvest{harvests.length === 1 ? "" : "s"}</span></div>
        <div className="farm-stat"><span className="farm-stat__label">Yield per acre</span><span className="farm-stat__value">{areaAcres > 0 && total > 0 ? kg(total / areaAcres) : "—"}</span></div>
        <div className="farm-stat"><span className="farm-stat__label">Work recorded</span><span className="farm-stat__value">{activities.length}</span></div>
      </div>

      <div className="farm-grid farm-grid--2">
        <Card>
          <CardHeader title="Work done" action={<Button size="sm" onClick={() => setModal("activity")}>Record work</Button>} />
          <CardBody>
            {activities.length === 0 ? <p className="farm-card__meta">Nothing recorded. Add planting, fertilising, spraying or watering.</p> : (
              <ul className="farm-list">
                {activities.map((a) => (
                  <li key={a.id}>
                    <div className="farm-list__main">
                      <span className="farm-list__title">{cap(a.kind)}{a.quantity != null ? ` · ${qty(a.quantity)} ${a.unit || ""}` : ""}</span>
                      <span className="farm-list__sub">{formatDate(a.activity_date)}{a.notes ? ` · ${a.notes}` : ""}</span>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: "activity", id: a.id })} aria-label={`Remove ${a.kind} on ${formatDate(a.activity_date)}`}>Remove</Button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Harvests" action={<Button size="sm" onClick={() => setModal("harvest")}>Record harvest</Button>} />
          <CardBody>
            {harvests.length === 0 ? <p className="farm-card__meta">No harvests yet.</p> : (
              <ul className="farm-list">
                {harvests.map((h) => (
                  <li key={h.id}>
                    <div className="farm-list__main"><span className="farm-list__title">{kg(h.quantity_kg)}</span><span className="farm-list__sub">{formatDate(h.harvest_date)}{h.notes ? ` · ${h.notes}` : ""}</span></div>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: "harvest", id: h.id })} aria-label={`Remove harvest of ${h.quantity_kg} kilograms`}>Remove</Button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <FormModal open={modal === "activity"} title="Record work" submitLabel="Save" onClose={() => setModal(null)}
        initial={{ kind: "fertilising", activity_date: today(), quantity: "", unit: "", notes: "" }}
        fields={[
          { key: "kind", label: "What was done", type: "select", options: opts(ACTIVITY_KINDS) },
          { key: "activity_date", label: "Date", type: "date", required: true },
          { key: "quantity", label: "Amount used", type: "number", min: "0", step: "any", placeholder: "e.g. 50" },
          { key: "unit", label: "Unit", placeholder: "kg, litres, bags" },
          { key: "notes", label: "Notes", type: "textarea" },
        ]}
        onSubmit={async (v) => { const r = await addActivity(bid, { ...v, crop_id: id }); if (!r.error) { toast.success("Work recorded"); reload(); } return r; }} />
      <FormModal open={modal === "harvest"} title="Record harvest" submitLabel="Save" onClose={() => setModal(null)}
        initial={{ harvest_date: today(), quantity_kg: "", notes: "" }}
        fields={[
          { key: "harvest_date", label: "Date", type: "date", required: true },
          { key: "quantity_kg", label: "Amount harvested (kg)", type: "number", min: "0", step: "any", required: true },
          { key: "notes", label: "Notes", type: "textarea" },
        ]}
        onSubmit={async (v) => {
          if (!(Number(v.quantity_kg) > 0)) return { error: "Enter an amount above zero." };
          const r = await addHarvest(bid, { ...v, crop_id: id });
          if (!r.error) { toast.success("Harvest recorded"); reload(); }
          return r;
        }} />
      <FormModal open={modal === "edit"} title="Edit crop" onClose={() => setModal(null)} fields={cropFields(fields)}
        initial={{ id: crop.id, field_id: crop.field_id, name: crop.name, variety: crop.variety || "", status: crop.status, area_acres: acresText(crop.area_ha), planned_date: crop.planned_date || "", planted_date: crop.planted_date || "", expected_harvest: crop.expected_harvest || "", notes: crop.notes || "" }}
        onSubmit={async (v) => { const r = await saveCrop(bid, { ...withHectares(v, crop), id }); if (!r.error) { toast.success("Crop updated"); reload(); } return r; }} />
      <ConfirmDialog isOpen={Boolean(confirm)} title={confirm === "crop" ? "Delete this crop?" : "Remove this record?"}
        message={confirm === "crop" ? "Its work and harvest records are deleted too. This cannot be undone." : "This cannot be undone."}
        confirmLabel="Delete" loading={busy} onConfirm={confirmed} onCancel={() => setConfirm(null)} />
    </div>
  );
}

export default function CropsPage() {
  const params = useParams();
  const id = (params["*"] || "").split("/")[1];
  return id ? <CropDetail key={id} id={id} /> : <CropList />;
}
