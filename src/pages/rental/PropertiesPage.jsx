// src/pages/rental/PropertiesPage.jsx — NEW FILE
//
// AIM
// /app/:slug/properties — buildings and rooms. Owners and managers add, edit and remove
// buildings and rooms, upload room photos, set monthly (and optional semester) rent and mark a
// room as under maintenance. Occupied and reserved rooms change status only through tenancies
// and offers, never by hand.

import "./Rental.css";
import { useMemo, useState } from "react";
import { Alert, Button, Card, CardBody, EmptyState, Icon, Input, SelectInput, Skeleton, TextArea } from "../../components/ui";
import PhotoUploader from "../../components/ui/PhotoUploader.jsx";
import { ConfirmDialog, Modal } from "../../components/modals/Modal.jsx";
import SimpleTable from "../../components/data/SimpleTable.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import { deleteBuilding, deleteRoom, listBuildings, listRooms, saveBuilding, saveRoom } from "../../lib/api/rental.js";
import { PageHead, ROOM_TYPES, StatusBadge, money } from "./shared.jsx";

const STATUS_FILTER = [
  { value: "", label: "All statuses" }, { value: "available", label: "Available" }, { value: "occupied", label: "Occupied" },
  { value: "reserved", label: "Reserved" }, { value: "maintenance", label: "Maintenance" },
];

function BuildingModal({ open, onClose, businessId, building, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const form = f ?? { name: building?.name || "", address: building?.address || "", description: building?.description || "", total_floors: building?.total_floors || 1 };
  const set = (k, v) => setF({ ...form, [k]: v });

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Enter the building name."); return; }
    setBusy(true); setError("");
    const { error: err } = await saveBuilding(businessId, { ...form, id: building?.id });
    setBusy(false);
    if (err) { setError(err); return; }
    toast.success(building ? "Building updated" : "Building added");
    onSaved(); onClose();
  }
  async function remove() {
    setBusy(true);
    const { error: err } = await deleteBuilding(building.id);
    setBusy(false); setConfirm(false);
    if (err) { setError(err); return; }
    toast.success("Building removed");
    onSaved(); onClose();
  }

  return (
    <>
      <Modal isOpen={open} onClose={onClose} title={building ? "Edit building" : "Add a building"} size="md"
        footer={<>
          {building && <Button variant="danger" onClick={() => setConfirm(true)} style={{ marginRight: "auto" }}>Delete</Button>}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="building-form" loading={busy}>Save</Button>
        </>}>
        <form id="building-form" className="rent-form" onSubmit={submit} noValidate>
          {error && <Alert type="error" message={error} />}
          <Input label="Building name" required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Block A" />
          <Input label="Address" value={form.address} onChange={(e) => set("address", e.target.value)} />
          <Input label="Floors" type="number" min="1" max="60" value={form.total_floors} onChange={(e) => set("total_floors", e.target.value)} />
          <TextArea label="Description" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
        </form>
      </Modal>
      <ConfirmDialog isOpen={confirm} title="Delete this building?" message="This cannot be undone. A building that still has rooms cannot be deleted."
        confirmLabel="Delete building" loading={busy} onConfirm={remove} onCancel={() => setConfirm(false)} />
    </>
  );
}

function RoomModal({ open, onClose, businessId, room, buildings, defaultBuilding, onSaved }) {
  const toast = useToast();
  const blank = { building_id: defaultBuilding || buildings[0]?.id || "", room_number: "", room_type: "single", capacity: 1, monthly_price: "", semester_price: "", description: "", amenitiesText: "", images: [], status: "available" };
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const form = f ?? (room ? { ...room, semester_price: room.semester_price ?? "", description: room.description || "", amenitiesText: (room.amenities || []).join(", "), images: room.images || [] } : blank);
  const set = (k, v) => setF({ ...form, [k]: v });
  const locked = room && ["occupied", "reserved"].includes(room.status);

  async function submit(e) {
    e.preventDefault();
    if (!form.building_id) { setError("Choose a building. Add one first if the list is empty."); return; }
    if (!form.room_number.trim()) { setError("Enter the room number."); return; }
    if (!(Number(form.monthly_price) > 0)) { setError("Enter the monthly rent."); return; }
    setBusy(true); setError("");
    const amenities = form.amenitiesText.split(",").map((s) => s.trim()).filter(Boolean);
    const { error: err } = await saveRoom(businessId, { ...form, amenities, id: room?.id, status: locked ? undefined : form.status });
    setBusy(false);
    if (err) { setError(err); return; }
    toast.success(room ? "Room updated" : "Room added");
    onSaved(); onClose();
  }
  async function remove() {
    setBusy(true);
    const { error: err } = await deleteRoom(room.id);
    setBusy(false); setConfirm(false);
    if (err) { setError(err); return; }
    toast.success("Room removed");
    onSaved(); onClose();
  }

  return (
    <>
      <Modal isOpen={open} onClose={onClose} title={room ? `Room ${room.room_number}` : "Add a room"} size="lg"
        footer={<>
          {room && !locked && <Button variant="danger" onClick={() => setConfirm(true)} style={{ marginRight: "auto" }}>Delete</Button>}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="room-form" loading={busy}>Save</Button>
        </>}>
        <form id="room-form" className="rent-form" onSubmit={submit} noValidate>
          {error && <Alert type="error" message={error} />}
          {locked && <Alert type="info" message={`This room is ${room.status}. Its status changes with its tenancy or offer.`} />}
          <div className="rent-form__row">
            <SelectInput label="Building" required value={form.building_id} onChange={(v) => set("building_id", v)}
              options={buildings.map((b) => ({ value: b.id, label: b.name }))} placeholder="Choose a building" />
            <Input label="Room number" required value={form.room_number} onChange={(e) => set("room_number", e.target.value)} placeholder="A101" />
          </div>
          <div className="rent-form__row">
            <SelectInput label="Type" value={form.room_type} onChange={(v) => set("room_type", v)} options={ROOM_TYPES} />
            <Input label="People it sleeps" type="number" min="1" max="20" value={form.capacity} onChange={(e) => set("capacity", e.target.value)} />
          </div>
          <div className="rent-form__row">
            <Input label="Monthly rent (KSh)" required type="number" min="0" inputMode="numeric" value={form.monthly_price} onChange={(e) => set("monthly_price", e.target.value)} />
            <Input label="Semester rent (KSh)" type="number" min="0" inputMode="numeric" value={form.semester_price} onChange={(e) => set("semester_price", e.target.value)} helper="Optional. For hostels billed every 6 months." />
          </div>
          {!locked && (
            <SelectInput label="Status" value={form.status === "maintenance" ? "maintenance" : "available"} onChange={(v) => set("status", v)}
              options={[{ value: "available", label: "Available to rent" }, { value: "maintenance", label: "Under maintenance (hidden from renters)" }]} />
          )}
          <Input label="What it has" value={form.amenitiesText} onChange={(e) => set("amenitiesText", e.target.value)} helper="Separate with commas: Water, Security, Wi-Fi" />
          <TextArea label="Description" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
          <PhotoUploader businessId={businessId} folder="rooms" value={form.images} onChange={(v) => set("images", v)} label="Photos (up to 4)" />
        </form>
      </Modal>
      <ConfirmDialog isOpen={confirm} title="Delete this room?" message="This cannot be undone. A room that has had residents cannot be deleted; mark it as under maintenance instead."
        confirmLabel="Delete room" loading={busy} onConfirm={remove} onCancel={() => setConfirm(false)} />
    </>
  );
}

export default function PropertiesPage() {
  const { business } = useBusinessContext();
  const bid = business.id;
  const { data, error, loading, reload } = useAsync(async () => {
    const [b, r] = await Promise.all([listBuildings(bid), listRooms(bid)]);
    return { data: { buildings: b.data || [], rooms: r.data || [] }, error: b.error || r.error };
  }, [bid]);
  const [buildingId, setBuildingId] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [bModal, setBModal] = useState(null);   // null | { building? }
  const [rModal, setRModal] = useState(null);   // null | { room? }

  const buildings = data?.buildings || [];
  const rooms = data?.rooms || [];
  const shown = useMemo(() => rooms.filter((r) =>
    (!buildingId || r.building_id === buildingId) && (!status || r.status === status) &&
    (!q || r.room_number.toLowerCase().includes(q.toLowerCase()))), [rooms, buildingId, status, q]);
  const countIn = (id, s) => rooms.filter((r) => r.building_id === id && (!s || r.status === s)).length;

  const columns = [
    { key: "room_number", label: "Room", render: (r) => <span className="rent-strong">{r.room_number}</span> },
    { key: "building", label: "Building", render: (r) => r.building?.name || "—" },
    { key: "room_type", label: "Type", render: (r) => r.room_type.charAt(0).toUpperCase() + r.room_type.slice(1) },
    { key: "monthly_price", label: "Monthly rent", align: "right", render: (r) => <span className="rent-money">{money(r.monthly_price)}</span> },
    { key: "status", label: "Status", render: (r) => <StatusBadge kind="room" status={r.status} /> },
    { key: "act", label: "", align: "right", render: (r) => <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setRModal({ room: r }); }}>Edit</Button> },
  ];

  return (
    <div className="rent">
      <PageHead title="Properties" lead="Your buildings and rooms. Renters see available rooms on your public page.">
        <Button variant="outline" leftIcon={<Icon name="plus" size={16} />} onClick={() => setBModal({})}>Add building</Button>
        <Button leftIcon={<Icon name="plus" size={16} />} onClick={() => setRModal({})} disabled={!buildings.length} title={buildings.length ? undefined : "Add a building first"}>Add room</Button>
      </PageHead>
      {error && <Alert type="error" message={error} />}

      {loading ? <Skeleton height={120} /> : !buildings.length ? (
        <Card><EmptyState icon="building" title="Add your first building" description="Rooms live inside buildings. Start with a building, then add its rooms."
          action={<Button onClick={() => setBModal({})}>Add building</Button>} /></Card>
      ) : (
        <>
          <div className="rent-buildings">
            {buildings.map((b) => (
              <Card key={b.id} className="rent-building">
                <h3>{b.name}</h3>
                <p className="rent-muted">{[b.address, `${b.total_floors} floor${b.total_floors === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</p>
                <p className="rent-muted">{countIn(b.id)} rooms · {countIn(b.id, "available")} available · {countIn(b.id, "occupied")} occupied</p>
                <div className="rent-actions">
                  <Button size="sm" variant="outline" onClick={() => setBModal({ building: b })}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setBuildingId(b.id); }}>Show rooms</Button>
                </div>
              </Card>
            ))}
          </div>

          <form className="rent-bar" role="search" onSubmit={(e) => e.preventDefault()}>
            <Input label="Find a room" placeholder="Room number" value={q} onChange={(e) => setQ(e.target.value)} />
            <SelectInput label="Building" value={buildingId} onChange={setBuildingId} options={[{ value: "", label: "All buildings" }, ...buildings.map((b) => ({ value: b.id, label: b.name }))]} />
            <SelectInput label="Status" value={status} onChange={setStatus} options={STATUS_FILTER} />
          </form>

          <SimpleTable columns={columns} rows={shown} onRowClick={(r) => setRModal({ room: r })}
            empty={<Card><EmptyState icon="search" title={rooms.length ? "No rooms match" : "No rooms yet"} compact
              description={rooms.length ? "Try another building or status." : "Add your first room to this building."}
              action={!rooms.length && <Button onClick={() => setRModal({})}>Add room</Button>} /></Card>} />
        </>
      )}

      {bModal && <BuildingModal open key={bModal.building?.id || "new-b"} businessId={bid} building={bModal.building} onClose={() => setBModal(null)} onSaved={reload} />}
      {rModal && <RoomModal open key={rModal.room?.id || "new-r"} businessId={bid} room={rModal.room} buildings={buildings}
        defaultBuilding={buildingId} onClose={() => setRModal(null)} onSaved={reload} />}
    </div>
  );
}
