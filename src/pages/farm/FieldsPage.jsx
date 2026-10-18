// src/pages/farm/FieldsPage.jsx — NEW FILE
//
// AIM
// /app/:slug/fields and /app/:slug/fields/:id — land. The list shows every field on one map; tap
// "Add a field", tap its corners on the map and the area in hectares is worked out for you
// (or type the area if you do not want to draw). A field's own page shows its map, its crops and
// lets you redraw or delete it. The map code loads only on these screens.

import "./Farm.css";
import { Suspense, lazy, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Alert, Button, Card, CardBody, CardHeader, EmptyState, Input, Skeleton, TextArea } from "../../components/ui";
import { ConfirmDialog } from "../../components/modals/Modal.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { deleteField, getField, listCrops, listFields, saveField } from "../../lib/api/farm.js";
import { formatHa, fromGeoJson, polygonAreaHa, toGeoJson } from "../../lib/geo.js";
import { Loading, LoadError, PageHead, StatusBadge, useFarm } from "./shared.jsx";

const FieldMap = lazy(() => import("../../components/map/FieldMap.jsx"));
const MapFallback = () => <Skeleton height={360} />;

function FieldEditor({ field, others, onSaved, onCancel }) {
  const { bid } = useFarm();
  const toast = useToast();
  const [name, setName] = useState(field?.name || "");
  const [notes, setNotes] = useState(field?.notes || "");
  const [points, setPoints] = useState(() => fromGeoJson(field?.boundary));
  const [manual, setManual] = useState(field && !field.boundary ? String(field.area_ha || "") : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const drawn = points.length >= 3;
  const area = drawn ? polygonAreaHa(points) : Number(manual) || 0;

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) { setError("Enter a name for the field."); return; }
    if (points.length > 0 && points.length < 3) { setError("Add at least 3 corners, or clear the map to type the area instead."); return; }
    if (!drawn && !(Number(manual) > 0)) { setError("Draw the field on the map, or type its area in hectares."); return; }
    setBusy(true); setError("");
    const { data, error: err } = await saveField(bid, { id: field?.id, name, notes, area_ha: area, boundary: drawn ? toGeoJson(points) : null });
    setBusy(false);
    if (err) { setError(err); return; }
    toast.success(field ? "Field updated" : "Field added");
    onSaved(data);
  }

  return (
    <Card>
      <CardHeader title={field ? "Edit field" : "Add a field"} subtitle="Tap each corner of the field on the map. The area is worked out for you." />
      <CardBody>
        <form className="farm-form" onSubmit={submit} noValidate>
          {error && <Alert type="error" message={error} />}
          <div className="farm-form__row">
            <Input label="Field name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="North plot" />
            <Input label="Area (hectares)" type="number" min="0" step="0.01" value={drawn ? area : manual} disabled={drawn} onChange={(e) => setManual(e.target.value)}
              helper={drawn ? "Worked out from the map" : "Type it here if you do not draw the field"} />
          </div>
          <Suspense fallback={<MapFallback />}>
            <FieldMap editable points={points} onPointsChange={setPoints} polygons={others} height="min(60vh, 460px)" />
          </Suspense>
          <TextArea label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Soil type, water source, access…" />
          <div className="farm-actions">
            <Button type="submit" loading={busy}>{field ? "Save field" : "Add field"}</Button>
            <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function FieldList() {
  const { bid, base } = useFarm();
  const nav = useNavigate();
  const { data, error, loading, reload } = useAsync(async () => {
    const [f, c] = await Promise.all([listFields(bid), listCrops(bid)]);
    return { data: { fields: f.data || [], crops: c.data || [] }, error: f.error || c.error };
  }, [bid]);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState(null);

  if (loading && !data) return <Loading />;
  if (error) return <LoadError error={error} onRetry={reload} />;
  const { fields, crops } = data;
  const total = fields.reduce((a, f) => a + Number(f.area_ha || 0), 0);
  const polygons = fields.filter((f) => f.boundary).map((f) => ({ id: f.id, name: f.name, boundary: f.boundary }));

  return (
    <div className="farm">
      <PageHead title="Fields and land" lead={fields.length ? `${fields.length} field${fields.length === 1 ? "" : "s"} · ${formatHa(total)}` : "Draw your fields on the map"}>
        {!adding && <Button onClick={() => setAdding(true)}>Add a field</Button>}
      </PageHead>

      {adding && <FieldEditor others={polygons} onCancel={() => setAdding(false)} onSaved={(f) => { setAdding(false); reload(); if (f?.id) nav(`${base}/fields/${f.id}`); }} />}

      {!adding && polygons.length > 0 && (
        <Suspense fallback={<MapFallback />}><FieldMap polygons={polygons} selectedId={selected} onSelect={(id) => { setSelected(id); nav(`${base}/fields/${id}`); }} height="min(55vh, 420px)" /></Suspense>
      )}

      {fields.length === 0 && !adding ? (
        <Card><EmptyState icon="home" title="No fields yet" description="Add your first field. You can draw its boundary on the map and the area is calculated for you."
          action={<Button onClick={() => setAdding(true)}>Add a field</Button>} /></Card>
      ) : (
        <div className="farm-cards">
          {fields.map((f) => {
            const mine = crops.filter((c) => c.field_id === f.id);
            const active = mine.filter((c) => c.status === "planted" || c.status === "growing").length;
            return (
              <Link key={f.id} to={`${base}/fields/${f.id}`} className="farm-card">
                <h3 className="farm-card__title">{f.name}</h3>
                <p className="farm-card__meta">{formatHa(f.area_ha)}{f.boundary ? " · on the map" : " · not drawn yet"}</p>
                <div className="farm-card__row"><span className="farm-card__meta">{mine.length} crop{mine.length === 1 ? "" : "s"}</span>{active > 0 && <span className="farm-card__meta">{active} active</span>}</div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FieldDetail({ id }) {
  const { base } = useFarm();
  const nav = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(async () => {
    const f = await getField(id);
    if (f.error || !f.data) return { data: null, error: f.error || null };
    const c = await listCrops(f.data.business_id);
    return { data: { field: f.data, crops: (c.data || []).filter((x) => x.field_id === id) }, error: c.error };
  }, [id]);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [delError, setDelError] = useState("");
  const polygons = useMemo(() => (data?.field?.boundary ? [{ id: data.field.id, name: data.field.name, boundary: data.field.boundary }] : []), [data]);

  if (loading && !data) return <Loading />;
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data) return <Card style={{ margin: "var(--space-8) auto", maxWidth: 520 }}><EmptyState icon="search" title="Field not found" description="It may have been removed." action={<Button as={Link} to={`${base}/fields`}>Back to fields</Button>} /></Card>;
  const { field, crops } = data;

  async function remove() {
    setBusy(true); setDelError("");
    const { error: err } = await deleteField(id);
    setBusy(false); setConfirm(false);
    if (err) { setDelError(err); return; }
    toast.success("Field removed");
    nav(`${base}/fields`);
  }

  return (
    <div className="farm">
      <PageHead title={field.name} lead={`${formatHa(field.area_ha)}${field.boundary ? "" : " · boundary not drawn"}`}>
        <Button as={Link} to={`${base}/fields`} variant="secondary">All fields</Button>
        {!editing && <Button variant="outline" onClick={() => setEditing(true)}>{field.boundary ? "Redraw / edit" : "Draw on map"}</Button>}
        <Button variant="danger" onClick={() => setConfirm(true)}>Delete</Button>
      </PageHead>
      {delError && <Alert type="error" message={delError} />}

      {editing ? (
        <FieldEditor field={field} others={[]} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />
      ) : (
        <>
          {polygons.length > 0 && <Suspense fallback={<MapFallback />}><FieldMap polygons={polygons} selectedId={field.id} height="min(55vh, 420px)" /></Suspense>}
          {field.notes && <Card><CardBody><p style={{ margin: 0, whiteSpace: "pre-line" }}>{field.notes}</p></CardBody></Card>}
          <Card>
            <CardHeader title="Crops in this field" action={<Button as={Link} to={`${base}/crops?field=${field.id}`} size="sm">Add a crop</Button>} />
            <CardBody>
              {crops.length === 0 ? <p className="farm-card__meta">No crops yet.</p> : (
                <ul className="farm-list">
                  {crops.map((c) => (
                    <li key={c.id}>
                      <div className="farm-list__main"><Link to={`${base}/crops/${c.id}`} className="farm-list__title">{c.name}{c.variety ? ` (${c.variety})` : ""}</Link></div>
                      <StatusBadge status={c.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </>
      )}
      <ConfirmDialog isOpen={confirm} title="Delete this field?" message="This cannot be undone. A field that still has crops cannot be deleted."
        confirmLabel="Delete field" loading={busy} onConfirm={remove} onCancel={() => setConfirm(false)} />
    </div>
  );
}

export default function FieldsPage() {
  const params = useParams();
  const id = (params["*"] || "").split("/")[1];
  return id ? <FieldDetail key={id} id={id} /> : <FieldList />;
}
