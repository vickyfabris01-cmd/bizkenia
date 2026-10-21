// src/pages/people/TransferPage.jsx — NEW FILE
//
// AIM
// /app/:slug/transfer (resident) — ask to move to another room (optionally naming an available room) and follow
// the request: waiting, approved or declined, with the manager's note. A waiting request can be withdrawn.

import { useState } from "react";
import { Alert, Button, Card, CardBody, CardHeader, EmptyState, SelectInput, Skeleton, TextArea } from "../../components/ui";
import { Badge } from "../../components/ui";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import { availableRooms, cancelTransfer, listTransfers, requestTransfer } from "../../lib/api/people.js";
import { formatDate } from "../../lib/format.js";
import { PageHead, rentLabel } from "../rental/shared.jsx";

export const TRANSFER_BADGE = { pending: ["warning", "Waiting"], completed: ["success", "Approved and moved"], approved: ["success", "Approved"], rejected: ["error", "Declined"] };

export default function TransferPage() {
  const { business } = useBusinessContext();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(async () => {
    const [t, r] = await Promise.all([listTransfers(business.id), availableRooms(business.id)]);
    return { data: { transfers: t.data || [], rooms: r.data || [] }, error: t.error };
  }, [business.id]);
  const [room, setRoom] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const waiting = (data?.transfers || []).find((t) => t.status === "pending");

  async function submit(e) {
    e.preventDefault();
    if (!reason.trim()) { setErr("Tell the manager why you want to move."); return; }
    setBusy(true); setErr("");
    const { error: x } = await requestTransfer(business.id, room || null, reason);
    setBusy(false);
    if (x) { setErr(x); return; }
    toast.success("Request sent", "The manager will decide and you will get a notification.");
    setReason(""); setRoom(""); reload();
  }
  async function withdraw(t) {
    const { error: x } = await cancelTransfer(t.id);
    if (x) toast.error(x); else { toast.success("Request withdrawn"); reload(); }
  }

  if (loading) return <div className="rent"><Skeleton height={32} width={220} /><Skeleton height={200} /></div>;
  return (
    <div className="rent">
      <PageHead title="Move to another room" lead="Ask your manager to move you. Your rent stays the same unless the manager agrees a new amount with you." />
      {error && <Alert type="error" message={error} />}
      {!waiting && (
        <Card><CardHeader title="New request" /><CardBody>
          <form className="rent-form" onSubmit={submit} noValidate>
            {err && <Alert type="error" message={err} />}
            <SelectInput label="Room you would like (optional)" value={room} onChange={setRoom} placeholder="Let the manager choose"
              options={(data?.rooms || []).map((r) => ({ value: r.id, label: `${r.building?.name || ""} · ${r.room_number} · ${rentLabel(r)}` }))} />
            <TextArea label="Why do you want to move?" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} required />
            <div><Button type="submit" loading={busy}>Send request</Button></div>
          </form>
        </CardBody></Card>
      )}
      <Card><CardHeader title="My requests" /><CardBody>
        {(data?.transfers || []).length === 0 ? <EmptyState icon="swap" compact title="No requests yet" /> : (
          <ul className="rent-list">
            {data.transfers.map((t) => (
              <li key={t.id}>
                <span>{t.from_room?.room_number || "—"}{t.to_room ? ` → ${t.to_room.room_number}` : ""}<small>{formatDate(t.created_at)} · {t.reason}</small>
                  {t.decision_note && <small>Manager: {t.decision_note}</small>}</span>
                <span style={{ textAlign: "right" }}><Badge variant={(TRANSFER_BADGE[t.status] || ["neutral"])[0]}>{(TRANSFER_BADGE[t.status] || [0, t.status])[1]}</Badge>
                  {t.status === "pending" && <small><Button size="sm" variant="ghost" onClick={() => withdraw(t)}>Withdraw</Button></small>}</span>
              </li>
            ))}
          </ul>
        )}
      </CardBody></Card>
    </div>
  );
}
