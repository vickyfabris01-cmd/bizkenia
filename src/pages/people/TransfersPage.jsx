// src/pages/people/TransfersPage.jsx — NEW FILE
//
// AIM
// /app/:slug/transfers (owner, manager) — residents' room-transfer requests. Approve (choose the room if the
// resident did not, and a move date) or decline with a note. Approving moves the resident immediately.

import { useState } from "react";
import { Alert, Badge, Card, EmptyState, SelectInput, TextArea } from "../../components/ui";
import { Modal } from "../../components/modals/Modal.jsx";
import Button from "../../components/ui/Button.jsx";
import SimpleTable from "../../components/data/SimpleTable.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import { availableRooms, decideTransfer, listTransfers } from "../../lib/api/people.js";
import { formatDate } from "../../lib/format.js";
import { PageHead, Tabs, personName, rentLabel, roomLabel, todayISO } from "../rental/shared.jsx";
import { Input } from "../../components/ui";
import { TRANSFER_BADGE } from "./TransferPage.jsx";

export default function TransfersPage() {
  const { business } = useBusinessContext();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(async () => {
    const [t, r] = await Promise.all([listTransfers(business.id), availableRooms(business.id)]);
    return { data: { transfers: t.data || [], rooms: r.data || [] }, error: t.error };
  }, [business.id]);
  const [tab, setTab] = useState("pending");
  const [open, setOpen] = useState(null);
  const [room, setRoom] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const all = data?.transfers || [];
  const rows = all.filter((t) => (tab === "pending" ? t.status === "pending" : t.status !== "pending"));

  function pick(t) { setOpen(t); setRoom(t.to_room_id || ""); setNote(""); setErr(""); setDate(todayISO()); }
  async function decide(approve) {
    setBusy(true); setErr("");
    const { error: x } = await decideTransfer(open.id, { approve, room, effective: date, note });
    setBusy(false);
    if (x) { setErr(x); return; }
    toast.success(approve ? "Resident moved" : "Request declined");
    setOpen(null); reload();
  }
  const cols = [
    { key: "who", label: "Resident", render: (t) => personName(t.who) },
    { key: "from", label: "Now in", render: (t) => roomLabel(t.from_room) },
    { key: "to", label: "Wants", render: (t) => (t.to_room ? roomLabel(t.to_room) : "Any room") },
    { key: "why", label: "Reason", render: (t) => t.reason },
    { key: "on", label: "Sent", render: (t) => formatDate(t.created_at) },
    { key: "st", label: "Status", render: (t) => <Badge variant={(TRANSFER_BADGE[t.status] || ["neutral"])[0]}>{(TRANSFER_BADGE[t.status] || [0, t.status])[1]}</Badge> },
  ];

  return (
    <div className="rent">
      <PageHead title="Room transfers" lead="Residents who asked to move to another room." />
      {error && <Alert type="error" message={error} />}
      <Tabs label="Transfer status" value={tab} onChange={setTab} tabs={[{ value: "pending", label: "Waiting", count: all.filter((t) => t.status === "pending").length }, { value: "done", label: "Decided" }]} />
      <SimpleTable loading={loading} columns={cols} rows={rows} onRowClick={tab === "pending" ? pick : undefined}
        empty={<Card><EmptyState icon="swap" compact title={tab === "pending" ? "No waiting requests" : "Nothing decided yet"} /></Card>} />
      {open && (
        <Modal isOpen onClose={() => setOpen(null)} title="Decide on this request" size="md"
          footer={<><Button variant="secondary" onClick={() => setOpen(null)}>Cancel</Button>
            <Button variant="danger" loading={busy} onClick={() => decide(false)}>Decline</Button>
            <Button loading={busy} onClick={() => decide(true)}>Approve and move</Button></>}>
          <div className="rent-form">
            {err && <Alert type="error" message={err} />}
            <p style={{ margin: 0 }}><strong>{personName(open.who)}</strong> in {roomLabel(open.from_room)} says: “{open.reason}”</p>
            <SelectInput label="Move to room" value={room} onChange={setRoom} placeholder="Choose an available room"
              options={data.rooms.map((r) => ({ value: r.id, label: `${r.building?.name || ""} · ${r.room_number} · ${rentLabel(r)}` }))} />
            <Input label="Move date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <TextArea label="Note to the resident (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </Modal>
      )}
    </div>
  );
}
