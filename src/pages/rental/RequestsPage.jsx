// src/pages/rental/RequestsPage.jsx — MODIFIED FILE (room types)
//
// AIM
// /app/:slug/rental-requests — people who asked for a room type. Staff open a request, then either
// send an offer (the room, agreed rent, billing type, move-in date, how long the offer stays open)
// or decline with a note. Every request is approved here: nobody becomes a resident until an offer
// names a room and the person accepts it.
// Which room: the one the person picked (if the type lets them and it is still free); otherwise,
// when Settings says rooms are assigned automatically, the system gives the free room with the
// lowest number; otherwise the manager chooses one here. An offer reserves the room until the
// person accepts, declines or it runs out.

import "./Rental.css";
import { useMemo, useState } from "react";
import { Alert, Button, Card, EmptyState, Input, SelectInput, Skeleton, TextArea } from "../../components/ui";
import { Modal } from "../../components/modals/Modal.jsx";
import SimpleTable from "../../components/data/SimpleTable.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import { getSettings, listFreeRooms, listRequests, respondRequest } from "../../lib/api/rental.js";
import { formatDate, formatDateTime } from "../../lib/format.js";
import { BILLING, PageHead, StatusBadge, Tabs, money, personName, roomLabel, todayISO } from "./shared.jsx";

const HOURS = [{ value: "24", label: "1 day" }, { value: "48", label: "2 days" }, { value: "72", label: "3 days" }, { value: "168", label: "1 week" }];

/** What was asked for: the room type, and the room once there is one. */
function wanted(req) {
  const type = req.room_type?.name;
  const room = req.room?.room_number;
  if (type && room) return `${type} · room ${room}`;
  if (type) return `${type} · room not chosen yet`;
  return roomLabel(req.room);
}

function RequestModal({ req, assignment, onClose, onDone }) {
  const toast = useToast();
  const base = req.room_type || req.room;            // where the rent comes from
  const [mode, setMode] = useState(null);            // null | "offer" | "reject"
  const [f, setF] = useState({ billing: "monthly", price: String(base?.monthly_price ?? ""), moveIn: req.preferred_move_in || todayISO(), hours: "48", note: "", roomId: req.room_id || "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const open = req.status === "pending";
  const auto = assignment === "auto";

  const { data: free, loading: freeLoading } = useAsync(
    () => (open && req.room_type_id ? listFreeRooms(req.room_type_id) : Promise.resolve({ data: [], error: null })), [req.id]);
  const freeRooms = useMemo(() => [...(free || [])].sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true })), [free]);
  const roomId = freeRooms.some((r) => r.id === f.roomId) ? f.roomId : "";
  const pickWasTaken = Boolean(req.room_id) && !freeLoading && !freeRooms.some((r) => r.id === req.room_id);

  function pickBilling(v) {
    const price = v === "semester" && base?.semester_price ? base.semester_price : base?.monthly_price;
    setF((s) => ({ ...s, billing: v, price: String(price ?? s.price) }));
  }
  async function send() {
    setError("");
    if (mode === "offer" && !(Number(f.price) >= 0 && f.price !== "")) { setError("Enter the agreed rent."); return; }
    if (mode === "offer" && req.room_type_id && !auto && !roomId) { setError("Choose the room to offer."); return; }
    setBusy(true);
    const { error: err } = await respondRequest(req.id, mode === "offer"
      ? { action: "offer", price: Number(f.price), billing: f.billing, moveIn: f.moveIn, note: f.note, hours: Number(f.hours), roomId }
      : { action: "reject", note: f.note });
    setBusy(false);
    if (err) { setError(err); return; }
    toast.success(mode === "offer" ? "Offer sent" : "Request declined");
    onDone(); onClose();
  }

  const title = req.room_type?.name ? `Request for ${req.room_type.name}` : `Request for room ${req.room?.room_number || ""}`;
  return (
    <Modal isOpen onClose={onClose} title={title} size="md"
      footer={open ? (mode ? <>
        <Button variant="secondary" onClick={() => setMode(null)}>Back</Button>
        <Button variant={mode === "reject" ? "danger" : "primary"} loading={busy} onClick={send}>{mode === "offer" ? "Send offer" : "Decline request"}</Button>
      </> : <>
        <Button variant="outline" onClick={() => setMode("reject")}>Decline</Button>
        <Button onClick={() => setMode("offer")}>Make an offer</Button>
      </>) : <Button variant="secondary" onClick={onClose}>Close</Button>}>
      <div className="rent-form">
        {error && <Alert type="error" message={error} />}
        <dl className="rent-dl">
          <div><dt>Who</dt><dd>{personName(req.requester)}</dd></div>
          <div><dt>Contact</dt><dd>{[req.requester?.phone, req.requester?.email].filter(Boolean).join(" · ") || "—"}</dd></div>
          <div><dt>Asked for</dt><dd>{req.room_type?.name ? `${req.room_type.name}${req.room_type.building?.name ? ` · ${req.room_type.building.name}` : ""}` : roomLabel(req.room)} · {money(base?.monthly_price)} a month</dd></div>
          <div><dt>Room</dt><dd>{req.room ? `Room ${req.room.room_number}${open && req.room_type_id ? " (their pick)" : ""}` : "No room picked, you or the system choose"}</dd></div>
          <div><dt>Wants to move in</dt><dd>{req.preferred_move_in ? formatDate(req.preferred_move_in) : "Not said"}</dd></div>
          <div><dt>Asked on</dt><dd>{formatDateTime(req.created_at)}</dd></div>
          <div><dt>Status</dt><dd><StatusBadge kind="request" status={req.status} /></dd></div>
        </dl>
        {req.message && <div><p className="rent-muted">Their message</p><p style={{ margin: 0 }}>{req.message}</p></div>}
        {req.status === "offered" && <Alert type="info" message={`Offer: room ${req.room?.room_number || ""} at ${money(req.offer_price)} (${req.offer_billing_type}) from ${formatDate(req.offer_move_in)}. Open until ${formatDateTime(req.offer_expires_at)}.`} />}
        {req.response_note && <p className="rent-muted">Your note: {req.response_note}</p>}

        {mode === "offer" && (
          <>
            {req.room_type_id && (
              <>
                {pickWasTaken && <Alert type="warning" message={`The room they picked is no longer free. ${auto ? "Leave this on “Let the system choose” or pick another room." : "Choose another room."}`} />}
                <SelectInput label="Room to offer" required={!auto} value={roomId} onChange={(v) => set("roomId", v)}
                  placeholder={auto ? undefined : (freeLoading ? "Loading rooms…" : freeRooms.length ? "Choose a room" : "No free rooms of this type")}
                  options={[...(auto ? [{ value: "", label: "Let the system choose (lowest free number)" }] : []),
                    ...freeRooms.map((r) => ({ value: r.id, label: `Room ${r.room_number}${r.id === req.room_id ? " (their pick)" : ""}` }))]}
                  helper={auto ? "Rooms are assigned automatically. Choose one here only to override." : "Rooms are assigned by you. Change this in Settings."} />
              </>
            )}
            <div className="rent-form__row">
              <SelectInput label="Billing" value={f.billing} onChange={pickBilling} options={BILLING.filter((b) => b.value === "monthly" || base?.semester_price)} />
              <Input label="Agreed rent (KSh)" type="number" min="0" inputMode="numeric" value={f.price} onChange={(e) => set("price", e.target.value)} />
            </div>
            <div className="rent-form__row">
              <Input label="Move-in date" type="date" value={f.moveIn} onChange={(e) => set("moveIn", e.target.value)} />
              <SelectInput label="Offer stays open for" value={f.hours} onChange={(v) => set("hours", v)} options={HOURS} />
            </div>
            <TextArea label="Note to the renter (optional)" rows={2} value={f.note} onChange={(e) => set("note", e.target.value)} />
          </>
        )}
        {mode === "reject" && <TextArea label="Reason (shown to the renter)" rows={3} value={f.note} onChange={(e) => set("note", e.target.value)} />}
      </div>
    </Modal>
  );
}

export default function RequestsPage() {
  const { business } = useBusinessContext();
  const { data, error, loading, reload } = useAsync(async () => {
    const [r, s] = await Promise.all([listRequests(business.id), getSettings(business.id)]);
    return { data: { rows: r.data || [], assignment: s.data?.room_assignment || "manual" }, error: r.error };
  }, [business.id]);
  const [tab, setTab] = useState("pending");
  const [open, setOpen] = useState(null);
  const rows = data?.rows || [];
  const groups = { pending: ["pending"], offered: ["offered"], closed: ["accepted", "rejected", "expired", "cancelled"] };
  const shown = rows.filter((r) => groups[tab].includes(r.status));
  const n = (k) => rows.filter((r) => groups[k].includes(r.status)).length;

  const columns = [
    { key: "who", label: "Who", render: (r) => <span className="rent-strong">{personName(r.requester)}</span> },
    { key: "room", label: "Asked for", render: (r) => wanted(r) },
    { key: "move", label: "Wants to move in", render: (r) => (r.preferred_move_in ? formatDate(r.preferred_move_in) : "—") },
    { key: "created_at", label: "Asked", render: (r) => formatDate(r.created_at) },
    { key: "status", label: "Status", render: (r) => <StatusBadge kind="request" status={r.status} /> },
  ];

  return (
    <div className="rent">
      <PageHead title="Rental requests" lead="People who asked for a room. Answer with an offer that names their room, or a polite no." />
      {error && <Alert type="error" message={error} />}
      <Tabs label="Request status" value={tab} onChange={setTab} tabs={[
        { value: "pending", label: "New", count: n("pending") }, { value: "offered", label: "Offers sent", count: n("offered") }, { value: "closed", label: "Closed", count: n("closed") }]} />
      <SimpleTable loading={loading} columns={columns} rows={shown} onRowClick={setOpen}
        empty={<Card><EmptyState icon="file" compact title={tab === "pending" ? "No new requests" : "Nothing here"}
          description={tab === "pending" ? "When someone asks for a room on your public page, it shows up here." : "Requests will be listed here as they move on."} /></Card>} />
      {loading && <Skeleton height={0} />}
      {open && <RequestModal key={open.id} req={open} assignment={data?.assignment} onClose={() => setOpen(null)} onDone={reload} />}
    </div>
  );
}
