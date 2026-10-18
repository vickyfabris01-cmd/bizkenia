// src/pages/rental/RequestsPage.jsx — NEW FILE
//
// AIM
// /app/:slug/rental-requests — people who asked for a room. Staff open a request, then either
// send an offer (agreed rent, billing type, move-in date, how long the offer stays open) or
// decline with a note. An offer reserves the room until the person accepts, declines or it runs out.

import "./Rental.css";
import { useState } from "react";
import { Alert, Button, Card, EmptyState, Input, SelectInput, Skeleton, TextArea } from "../../components/ui";
import { Modal } from "../../components/modals/Modal.jsx";
import SimpleTable from "../../components/data/SimpleTable.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import { listRequests, respondRequest } from "../../lib/api/rental.js";
import { formatDate, formatDateTime } from "../../lib/format.js";
import { BILLING, PageHead, StatusBadge, Tabs, money, personName, roomLabel, todayISO } from "./shared.jsx";

const HOURS = [{ value: "24", label: "1 day" }, { value: "48", label: "2 days" }, { value: "72", label: "3 days" }, { value: "168", label: "1 week" }];

function RequestModal({ req, onClose, onDone }) {
  const toast = useToast();
  const [mode, setMode] = useState(null);       // null | "offer" | "reject"
  const [f, setF] = useState({ billing: "monthly", price: String(req.room?.monthly_price ?? ""), moveIn: req.preferred_move_in || todayISO(), hours: "48", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const open = req.status === "pending";

  function pickBilling(v) {
    const price = v === "semester" && req.room?.semester_price ? req.room.semester_price : req.room?.monthly_price;
    setF((s) => ({ ...s, billing: v, price: String(price ?? s.price) }));
  }
  async function send() {
    setError("");
    if (mode === "offer" && !(Number(f.price) >= 0 && f.price !== "")) { setError("Enter the agreed rent."); return; }
    setBusy(true);
    const { error: err } = await respondRequest(req.id, mode === "offer"
      ? { action: "offer", price: Number(f.price), billing: f.billing, moveIn: f.moveIn, note: f.note, hours: Number(f.hours) }
      : { action: "reject", note: f.note });
    setBusy(false);
    if (err) { setError(err); return; }
    toast.success(mode === "offer" ? "Offer sent" : "Request declined");
    onDone(); onClose();
  }

  return (
    <Modal isOpen onClose={onClose} title={`Request for room ${req.room?.room_number || ""}`} size="md"
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
          <div><dt>Room</dt><dd>{roomLabel(req.room)} · {money(req.room?.monthly_price)} a month</dd></div>
          <div><dt>Wants to move in</dt><dd>{req.preferred_move_in ? formatDate(req.preferred_move_in) : "Not said"}</dd></div>
          <div><dt>Asked on</dt><dd>{formatDateTime(req.created_at)}</dd></div>
          <div><dt>Status</dt><dd><StatusBadge kind="request" status={req.status} /></dd></div>
        </dl>
        {req.message && <div><p className="rent-muted">Their message</p><p style={{ margin: 0 }}>{req.message}</p></div>}
        {req.status === "offered" && <Alert type="info" message={`Offer: ${money(req.offer_price)} (${req.offer_billing_type}) from ${formatDate(req.offer_move_in)}. Open until ${formatDateTime(req.offer_expires_at)}.`} />}
        {req.response_note && <p className="rent-muted">Your note: {req.response_note}</p>}

        {mode === "offer" && (
          <>
            <div className="rent-form__row">
              <SelectInput label="Billing" value={f.billing} onChange={pickBilling} options={BILLING.filter((b) => b.value === "monthly" || req.room?.semester_price)} />
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
  const { data, error, loading, reload } = useAsync(() => listRequests(business.id), [business.id]);
  const [tab, setTab] = useState("pending");
  const [open, setOpen] = useState(null);
  const rows = data || [];
  const groups = { pending: ["pending"], offered: ["offered"], closed: ["accepted", "rejected", "expired", "cancelled"] };
  const shown = rows.filter((r) => groups[tab].includes(r.status));
  const n = (k) => rows.filter((r) => groups[k].includes(r.status)).length;

  const columns = [
    { key: "who", label: "Who", render: (r) => <span className="rent-strong">{personName(r.requester)}</span> },
    { key: "room", label: "Room", render: (r) => roomLabel(r.room) },
    { key: "move", label: "Wants to move in", render: (r) => (r.preferred_move_in ? formatDate(r.preferred_move_in) : "—") },
    { key: "created_at", label: "Asked", render: (r) => formatDate(r.created_at) },
    { key: "status", label: "Status", render: (r) => <StatusBadge kind="request" status={r.status} /> },
  ];

  return (
    <div className="rent">
      <PageHead title="Rental requests" lead="People who asked for a room. Answer with an offer or a polite no." />
      {error && <Alert type="error" message={error} />}
      <Tabs label="Request status" value={tab} onChange={setTab} tabs={[
        { value: "pending", label: "New", count: n("pending") }, { value: "offered", label: "Offers sent", count: n("offered") }, { value: "closed", label: "Closed", count: n("closed") }]} />
      <SimpleTable loading={loading} columns={columns} rows={shown} onRowClick={setOpen}
        empty={<Card><EmptyState icon="file" compact title={tab === "pending" ? "No new requests" : "Nothing here"}
          description={tab === "pending" ? "When someone asks for a room on your public page, it shows up here." : "Requests will be listed here as they move on."} /></Card>} />
      {loading && <Skeleton height={0} />}
      {open && <RequestModal key={open.id} req={open} onClose={() => setOpen(null)} onDone={reload} />}
    </div>
  );
}
