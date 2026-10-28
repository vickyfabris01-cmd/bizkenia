// src/pages/rental/PropertiesPage.jsx — MODIFIED FILE (room types; after a new room type is saved it offers to share it, and each room type has a share icon. Both open the platform picker on the spot, with no page change)
//
// AIM
// /app/:slug/properties — buildings, room types and rooms. An owner or manager describes a kind of
// room ONCE (name, building, rent, photos, what it has) and says how many there are with a number
// range (A, 1 to 20 makes A1 … A20). The rooms are created from it, so there is no more filling in
// the same form 100 times. Editing a type reaches all its rooms; a new rent also reaches every
// resident, who is notified. A switch on each type lets renters pick their own free room.
// Occupied and reserved rooms change status only through tenancies and offers, never by hand.

import "./Rental.css";
import "./RoomTypes.css";
import { useMemo, useState } from "react";
import ShareButton from "../../components/share/ShareButton.jsx";
import { useShare } from "../../components/share/shareContext.js";
import { Alert, Badge, Button, Card, CardBody, EmptyState, Icon, Input, SelectInput, Skeleton, TextArea, Toggle } from "../../components/ui";
import PhotoUploader from "../../components/ui/PhotoUploader.jsx";
import { ConfirmDialog, Modal } from "../../components/modals/Modal.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import {
  addRooms, deleteBuilding, deleteRoom, deleteRoomType, listBuildings, listRoomTypes, listRooms,
  saveBuilding, saveRoomType, setRoomMaintenance,
} from "../../lib/api/rental.js";
import { HOSTEL_KINDS, KINDS, PageHead, StatusBadge, kindLabel, money } from "./shared.jsx";

const MAX_AT_ONCE = 300;
const byNumber = (a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true });

/** The name a type will get: its kind, then "Single room (1)", "(2)" if the building has one already. */
export function nameFor(kind, takenNames) {
  const base = kindLabel(kind);
  const taken = new Set(takenNames);
  if (!taken.has(base)) return base;
  let n = 1;
  while (taken.has(`${base} (${n})`)) n += 1;
  return `${base} (${n})`;
}

/** "A", 7, 2 -> "A07"; pad 0 -> "A7". */
function numberFor(prefix, n, pad) {
  const s = String(n);
  return `${prefix}${pad > 0 && s.length < pad ? s.padStart(pad, "0") : s}`;
}

/** Plain-English problem with the range fields, or "". */
function rangeProblem(r) {
  const from = Number(r.from), to = Number(r.to);
  if (r.from === "" || r.to === "" || !Number.isInteger(from) || !Number.isInteger(to) || from < 0) return "Enter the first and last room number, like 1 to 20.";
  if (to < from) return "The last number must be the same as or higher than the first.";
  if (to - from + 1 > MAX_AT_ONCE) return `Add up to ${MAX_AT_ONCE} rooms at a time.`;
  return "";
}

function rangePreview(r) {
  if (rangeProblem(r)) return "";
  const from = Number(r.from), to = Number(r.to), pad = Number(r.pad) || 0, prefix = (r.prefix || "").trim();
  const count = to - from + 1;
  return count === 1 ? `Creates 1 room: ${numberFor(prefix, from, pad)}` : `Creates ${count} rooms: ${numberFor(prefix, from, pad)} … ${numberFor(prefix, to, pad)}`;
}

function RangeFields({ r, set }) {
  const preview = rangePreview(r);
  return (
    <>
      <div className="rtype-range">
        <Input label="Prefix" value={r.prefix} onChange={(e) => set("prefix", e.target.value)} placeholder="A" helper="Letters before the number" />
        <Input label="From number" type="number" min="0" inputMode="numeric" value={r.from} onChange={(e) => set("from", e.target.value)} />
        <Input label="To number" type="number" min="0" inputMode="numeric" value={r.to} onChange={(e) => set("to", e.target.value)} />
        <SelectInput label="Digits" value={String(r.pad)} onChange={(v) => set("pad", v)}
          options={[{ value: "0", label: "1, 2, 3" }, { value: "2", label: "01, 02, 03" }, { value: "3", label: "001, 002, 003" }]} />
      </div>
      <p className="rtype-preview" aria-live="polite">{preview || "Enter the range to see the room numbers."}</p>
      <p className="rent-muted">Room numbers must be different across your whole business, so put the block in the prefix (A, B, Hostel-).</p>
    </>
  );
}

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
      <ConfirmDialog isOpen={confirm} title="Delete this building?" message="This cannot be undone. A building that still has room types or rooms cannot be deleted."
        confirmLabel="Delete building" loading={busy} onConfirm={remove} onCancel={() => setConfirm(false)} />
    </>
  );
}

function TypeModal({ open, onClose, businessId, type, buildings, defaultBuilding, occupied, held, allTypes, onSaved, onCreated }) {
  const toast = useToast();
  const blank = {
    building_id: defaultBuilding || buildings[0]?.id || "", is_hostel: false, kind: "single", capacity: 1, monthly_price: "", semester_price: "",
    description: "", amenitiesText: "", images: [], allow_self_pick: false, prefix: "", from: "1", to: "", pad: "0",
  };
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const form = f ?? (type
    ? { ...type, semester_price: type.semester_price ?? "", description: type.description || "", amenitiesText: (type.amenities || []).join(", "), images: type.images || [] }
    : blank);
  const set = (k, v) => setF({ ...form, [k]: v });
  const hostel = Boolean(form.is_hostel);
  const rentChanged = Boolean(type) && (hostel
    ? Number(form.semester_price) !== Number(type.semester_price ?? NaN)
    : Number(form.monthly_price) !== Number(type.monthly_price));
  const sameSpot = Boolean(type) && type.kind === form.kind && type.building_id === form.building_id;
  const previewName = sameSpot ? type.name
    : nameFor(form.kind, (allTypes || []).filter((t) => t.building_id === form.building_id && t.id !== type?.id).map((t) => t.name));
  function setHostel(on) {
    setF({ ...form, is_hostel: on, kind: on && !HOSTEL_KINDS.some((k) => k.value === form.kind) ? "single" : form.kind, capacity: on ? form.capacity : 1 });
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.building_id) { setError("Choose a building. Add one first if the list is empty."); return; }
    if (hostel) {
      if (!(Number(form.semester_price) > 0)) { setError("Enter the semester rent."); return; }
      const cap = Number(form.capacity);
      if (!Number.isInteger(cap) || cap < 1 || cap > 20) { setError("People it sleeps must be a number from 1 to 20."); return; }
    } else if (!(Number(form.monthly_price) > 0)) { setError("Enter the monthly rent."); return; }
    if (!type) {
      const problem = rangeProblem(form);
      if (problem) { setError(problem); return; }
    }
    setBusy(true); setError("");
    const amenities = form.amenitiesText.split(",").map((s) => s.trim()).filter(Boolean);
    const { data: saved, error: err } = await saveRoomType(businessId, { ...form, amenities, id: type?.id });
    if (err) { setBusy(false); setError(err); return; }
    if (type) {
      setBusy(false);
      toast.success("Room type updated", saved?.repriced ? `${saved.repriced} resident${saved.repriced === 1 ? "" : "s"} told about the new rent.` : undefined);
      onSaved(); onClose();
      return;
    }
    const { error: roomsErr } = await addRooms(saved.id, { prefix: form.prefix.trim(), from: form.from, to: form.to, pad: form.pad });
    setBusy(false);
    onSaved(); onClose();
    onCreated?.(saved.id); // the page offers to share the new room type
    if (roomsErr) toast.error(`Room type saved, but its rooms were not added: ${roomsErr}`, 'Use "Add rooms" on the type to try again.');
    else toast.success("Room type added", rangePreview(form).replace("Creates", "Created"));
  }
  async function remove() {
    setBusy(true);
    const { error: err } = await deleteRoomType(type.id);
    setBusy(false); setConfirm(false);
    if (err) { setError(err); return; }
    toast.success("Room type removed");
    onSaved(); onClose();
  }

  return (
    <>
      <Modal isOpen={open} onClose={onClose} title={type ? `Edit ${type.name}` : "Add a room type"} size="lg"
        footer={<>
          {type && <Button variant="danger" onClick={() => setConfirm(true)} style={{ marginRight: "auto" }}>Delete</Button>}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="type-form" loading={busy}>{type ? "Save changes" : "Add room type"}</Button>
        </>}>
        <form id="type-form" className="rent-form" onSubmit={submit} noValidate>
          {error && <Alert type="error" message={error} />}
          {type && <Alert type="info" message="Changes here apply to every room of this type. Rooms that are occupied or reserved keep their status." />}
          {rentChanged && occupied > 0 && (
            <Alert type="warning" title="Rent change"
              message={`${occupied} room${occupied === 1 ? " is" : "s are"} occupied. Saving a new rent updates what those residents pay from their next invoice, and each of them is notified. Invoices already created are not changed.`} />
          )}
          <SelectInput label="Building" required value={form.building_id} onChange={(v) => set("building_id", v)}
            options={buildings.map((b) => ({ value: b.id, label: b.name }))} placeholder="Choose a building" />
          <Toggle label="Hostel" checked={hostel} disabled={held > 0} onChange={setHostel} />
          {held > 0 && <p className="rent-muted">A hostel setting cannot change while rooms of this type are occupied or reserved.</p>}
          <SelectInput label="Kind of room" value={form.kind} onChange={(v) => set("kind", v)} options={hostel ? HOSTEL_KINDS : KINDS}
            helper={`Shown to renters as “${previewName}”.`} />
          {hostel ? (
            <div className="rent-form__row">
              <Input label="People it sleeps" required type="number" min="1" max="20" value={form.capacity} onChange={(e) => set("capacity", e.target.value)} />
              <Input label="Semester rent (KSh)" required type="number" min="0" inputMode="numeric" value={form.semester_price} onChange={(e) => set("semester_price", e.target.value)} />
            </div>
          ) : (
            <Input label="Monthly rent (KSh)" required type="number" min="0" inputMode="numeric" value={form.monthly_price} onChange={(e) => set("monthly_price", e.target.value)} />
          )}
          <Input label="What it has" value={form.amenitiesText} onChange={(e) => set("amenitiesText", e.target.value)} helper="Separate with commas: Water, Security, Wi-Fi" />
          <TextArea label="Description" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
          <PhotoUploader businessId={businessId} folder="rooms" value={form.images} onChange={(v) => set("images", v)} label="Photos (up to 4)" />
          <Toggle label="Renters can pick their own room" checked={form.allow_self_pick} onChange={(v) => set("allow_self_pick", v)} />
          <p className="rent-muted">
            {form.allow_self_pick
              ? "When someone asks for this type they can choose one of the free rooms. You still approve every request."
              : "Renters ask for the type only. You (or the system, see Settings) choose the room when you approve."}
          </p>
          {!type && (
            <>
              <h3 style={{ margin: 0 }}>How many rooms?</h3>
              <RangeFields r={form} set={set} />
            </>
          )}
        </form>
      </Modal>
      <ConfirmDialog isOpen={confirm} title="Delete this room type?" message="Its rooms are deleted with it. This cannot be undone, and it is refused if any room has had a resident or a request."
        confirmLabel="Delete room type" loading={busy} onConfirm={remove} onCancel={() => setConfirm(false)} />
    </>
  );
}

function AddRoomsModal({ open, onClose, type, onSaved }) {
  const toast = useToast();
  const [r, setR] = useState({ prefix: "", from: "", to: "", pad: "0" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setR((s) => ({ ...s, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    const problem = rangeProblem(r);
    if (problem) { setError(problem); return; }
    setBusy(true); setError("");
    const { error: err } = await addRooms(type.id, { prefix: r.prefix.trim(), from: r.from, to: r.to, pad: r.pad });
    setBusy(false);
    if (err) { setError(err); return; }
    toast.success("Rooms added", rangePreview(r).replace("Creates", "Created"));
    onSaved(); onClose();
  }

  return (
    <Modal isOpen={open} onClose={onClose} title={`Add rooms to ${type.name}`} size="md"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="add-rooms-form" loading={busy}>Add rooms</Button>
      </>}>
      <form id="add-rooms-form" className="rent-form" onSubmit={submit} noValidate>
        {error && <Alert type="error" message={error} />}
        <p className="rent-muted">New rooms copy the rent, photos and details of this room type.</p>
        <RangeFields r={r} set={set} />
      </form>
    </Modal>
  );
}

export default function PropertiesPage() {
  const { business } = useBusinessContext();
  const bid = business.id;
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(async () => {
    const [b, t, r] = await Promise.all([listBuildings(bid), listRoomTypes(bid), listRooms(bid)]);
    return { data: { buildings: b.data || [], types: t.data || [], rooms: r.data || [] }, error: b.error || t.error || r.error };
  }, [bid]);
  const [buildingId, setBuildingId] = useState("");
  const [bModal, setBModal] = useState(null);   // null | { building? }
  const [tModal, setTModal] = useState(null);   // null | { type? }
  const [addFor, setAddFor] = useState(null);   // room type receiving new rooms
  const [roomsOf, setRoomsOf] = useState("");   // id of the type whose rooms are shown
  const [delRoom, setDelRoom] = useState(null);
  const [busy, setBusy] = useState("");
  const [roomError, setRoomError] = useState("");
  const [shareTypeId, setShareTypeId] = useState(""); // a room type just created: asks "Share it now?"
  const { share } = useShare();

  const buildings = useMemo(() => data?.buildings || [], [data]);
  const types = useMemo(() => data?.types || [], [data]);
  const rooms = useMemo(() => data?.rooms || [], [data]);
  const shownTypes = useMemo(() => types.filter((t) => !buildingId || t.building_id === buildingId), [types, buildingId]);
  const count = (typeId, s) => rooms.filter((r) => r.room_type_id === typeId && (!s || r.status === s)).length;
  const inBuilding = (id, s) => rooms.filter((r) => r.building_id === id && (!s || r.status === s)).length;
  const openType = types.find((t) => t.id === roomsOf) || null;
  const shareType = types.find((t) => t.id === shareTypeId) || null;
  const openRooms = useMemo(() => rooms.filter((r) => r.room_type_id === roomsOf).sort(byNumber), [rooms, roomsOf]);

  async function toggleMaintenance(room) {
    setBusy(room.id); setRoomError("");
    const { error: err } = await setRoomMaintenance(room.id, room.status !== "maintenance");
    setBusy("");
    if (err) { setRoomError(err); return; }
    reload();
  }
  async function removeRoom() {
    setBusy("del");
    const { error: err } = await deleteRoom(delRoom.id);
    setBusy("");
    if (err) { setRoomError(err); setDelRoom(null); return; }
    toast.success(`Room ${delRoom.room_number} removed`);
    setDelRoom(null);
    reload();
  }

  return (
    <div className="rent">
      <PageHead title="Properties" lead="Describe a kind of room once, say how many there are, and renters see one listing with the rooms still free.">
        <Button variant="outline" leftIcon={<Icon name="plus" size={16} />} onClick={() => setBModal({})}>Add building</Button>
        <Button leftIcon={<Icon name="plus" size={16} />} onClick={() => setTModal({})} disabled={!buildings.length} title={buildings.length ? undefined : "Add a building first"}>Add room type</Button>
      </PageHead>
      {error && <Alert type="error" message={error} />}

      {loading ? <Skeleton height={120} /> : !buildings.length ? (
        <Card><EmptyState icon="building" title="Add your first building" description="Room types live inside buildings. Start with a building, then add its room types."
          action={<Button onClick={() => setBModal({})}>Add building</Button>} /></Card>
      ) : (
        <>
          <div className="rent-buildings">
            {buildings.map((b) => (
              <Card key={b.id} className="rent-building">
                <h3>{b.name}</h3>
                <p className="rent-muted">{[b.address, `${b.total_floors} floor${b.total_floors === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</p>
                <p className="rent-muted">
                  {types.filter((t) => t.building_id === b.id).length} room types · {inBuilding(b.id)} rooms · {inBuilding(b.id, "available")} available · {inBuilding(b.id, "occupied")} occupied
                </p>
                <div className="rent-actions">
                  <Button size="sm" variant="outline" onClick={() => setBModal({ building: b })}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => setBuildingId(buildingId === b.id ? "" : b.id)}>{buildingId === b.id ? "Show all" : "Show room types"}</Button>
                </div>
              </Card>
            ))}
          </div>

          {!types.length ? (
            <Card><EmptyState icon="home" title="Add your first room type"
              description="For example “Bedsitter” in Block A at KSh 8,000, with 20 rooms numbered A1 to A20. You fill the form once."
              action={<Button onClick={() => setTModal({})}>Add room type</Button>} /></Card>
          ) : (
            <>
              {buildingId && <p className="rent-muted">Showing room types in {buildings.find((b) => b.id === buildingId)?.name}.</p>}
              <div className="rent-rooms">
                {shownTypes.map((t) => {
                  const img = t.images?.[0];
                  const total = count(t.id);
                  return (
                    <Card key={t.id} className="rtype">
                      <div className="rtype__img" style={img ? { backgroundImage: `url(${img})` } : undefined} role={img ? "img" : undefined} aria-label={img ? `Photo of ${t.name}` : undefined}>
                        {!img && <span aria-hidden="true">{t.name.charAt(0).toUpperCase()}</span>}
                      </div>
                      <h3>{t.name}</h3>
                      <p className="rent-muted">{t.building?.name} · {kindLabel(t.kind)}{t.is_hostel ? ` · sleeps ${t.capacity}` : ""}</p>
                      <p style={{ margin: 0 }}>
                        {t.is_hostel
                          ? <><strong className="rent-money">{money(t.semester_price)}</strong> a semester</>
                          : <><strong className="rent-money">{money(t.monthly_price)}</strong> a month</>}
                      </p>
                      <p className="rtype__stats">
                        <span><strong>{total}</strong> rooms</span>
                        <span><strong>{count(t.id, "available")}</strong> available</span>
                        <span><strong>{count(t.id, "occupied")}</strong> occupied</span>
                        {count(t.id, "reserved") > 0 && <span><strong>{count(t.id, "reserved")}</strong> reserved</span>}
                        {count(t.id, "maintenance") > 0 && <span><strong>{count(t.id, "maintenance")}</strong> maintenance</span>}
                      </p>
                      <div className="rent-chips">
                        {t.is_hostel && <Badge variant="neutral">Hostel</Badge>}
                        {t.allow_self_pick ? <Badge variant="info">Renters pick their room</Badge> : <Badge variant="neutral">You assign the room</Badge>}
                        {total === 0 && <Badge variant="warning">No rooms yet</Badge>}
                      </div>
                      <div className="rent-actions">
                        <Button size="sm" variant="outline" onClick={() => setTModal({ type: t })}>Edit</Button>
                        <Button size="sm" variant="outline" onClick={() => setAddFor(t)}>Add rooms</Button>
                        <ShareButton request={{ type: "room", business, item: t, available: count(t.id, "available"), total }} label={`Share ${t.name}`} />
                        <Button size="sm" variant="ghost" onClick={() => { setRoomError(""); setRoomsOf(roomsOf === t.id ? "" : t.id); }}>
                          {roomsOf === t.id ? "Hide rooms" : "Show rooms"}
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>

              {openType && (
                <Card>
                  <CardBody>
                    <div className="rtype-panel">
                      <h3 style={{ margin: 0 }}>Rooms in {openType.name} · {openType.building?.name}</h3>
                      {roomError && <Alert type="error" message={roomError} />}
                      {!openRooms.length ? <p className="rent-muted">No rooms yet. Use “Add rooms” to create them from a number range.</p> : (
                        <ul className="rtype-rooms" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                          {openRooms.map((r) => {
                            const free = r.status === "available" || r.status === "maintenance";
                            return (
                              <li key={r.id} className="rtype-room">
                                <span><span className="rtype-room__no">{r.room_number}</span> <StatusBadge kind="room" status={r.status} /></span>
                                {free && (
                                  <span className="rtype-room__tools">
                                    <Button size="sm" variant="ghost" loading={busy === r.id} onClick={() => toggleMaintenance(r)}>
                                      {r.status === "maintenance" ? "Reopen" : "Maintenance"}
                                    </Button>
                                    <Button size="sm" variant="ghost" aria-label={`Delete room ${r.room_number}`} onClick={() => setDelRoom(r)}><Icon name="x" size={16} /></Button>
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </CardBody>
                </Card>
              )}
            </>
          )}
        </>
      )}

      {bModal && <BuildingModal open key={bModal.building?.id || "new-b"} businessId={bid} building={bModal.building} onClose={() => setBModal(null)} onSaved={reload} />}
      {tModal && <TypeModal open key={tModal.type?.id || "new-t"} businessId={bid} type={tModal.type} buildings={buildings} defaultBuilding={buildingId}
        occupied={tModal.type ? count(tModal.type.id, "occupied") : 0}
        held={tModal.type ? count(tModal.type.id, "occupied") + count(tModal.type.id, "reserved") : 0} allTypes={types} onClose={() => setTModal(null)} onSaved={reload} onCreated={(id) => setTimeout(() => setShareTypeId(id), 300)} />}
      <ConfirmDialog isOpen={Boolean(shareType)} variant="info" title="Room type added" message={`${shareType?.name || "It"} is listed. Share it now on WhatsApp, Facebook and more?`}
        confirmLabel="Share" cancelLabel="Not now" onConfirm={() => { const t = shareType; setShareTypeId(""); share({ type: "room", business, item: t, available: count(t.id, "available"), total: count(t.id) }); }} onCancel={() => setShareTypeId("")} />
      {addFor && <AddRoomsModal open key={addFor.id} type={addFor} onClose={() => setAddFor(null)} onSaved={reload} />}
      <ConfirmDialog isOpen={Boolean(delRoom)} title={`Delete room ${delRoom?.room_number || ""}?`}
        message="This cannot be undone. A room that has had residents cannot be deleted; put it under maintenance instead."
        confirmLabel="Delete room" loading={busy === "del"} onConfirm={removeRoom} onCancel={() => setDelRoom(null)} />
    </div>
  );
}
