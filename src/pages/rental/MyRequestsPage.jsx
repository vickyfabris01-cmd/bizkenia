// src/pages/rental/MyRequestsPage.jsx — MODIFIED FILE (room types)
//
// AIM
// /account/requests — the signed-in person's own room requests, from any business. A request names
// the room type; the room appears once the business has chosen one in its offer. An offer shows
// the room, rent and move-in date with Accept and Decline; accepting creates the tenancy and the
// person becomes a resident of that business. Requests can be cancelled until answered.

import "./Rental.css";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Alert, Button, Card, EmptyState, Skeleton } from "../../components/ui";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { cancelRequest, myRequests, respondOffer } from "../../lib/api/rental.js";
import { formatDate, formatDateTime } from "../../lib/format.js";
import { useBusinessStore } from "../../store/businessStore.js";
import { useSession } from "../../store/sessionStore.js";
import { StatusBadge, money } from "./shared.jsx";

export default function MyRequestsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  const { data, error, loading, reload } = useAsync(() => myRequests(), []);
  const [busy, setBusy] = useState("");
  const rows = data || [];

  async function answer(r, accept) {
    setBusy(r.id + accept);
    const { data: tenancy, error: err } = await respondOffer(r.id, accept);
    setBusy("");
    if (err) { toast.error(err); return; }
    if (accept && tenancy) {
      toast.success("Welcome home", `You are now a resident of ${r.business_name}.`);
      await useBusinessStore.getState().load(user.id, true);
      navigate(`/app/${r.business_slug}`);
      return;
    }
    toast.info(accept ? "This offer has expired" : "Offer declined");
    reload();
  }
  async function cancel(r) {
    setBusy(r.id + "c");
    const { error: err } = await cancelRequest(r.id);
    setBusy("");
    if (err) toast.error(err); else { toast.success("Request cancelled"); reload(); }
  }

  return (
    <div className="pg">
      <h1 className="pg__title">My requests</h1>
      <p className="pg__lead">Rooms you asked for, and the answers.</p>
      {error && <Alert type="error" message={error} />}
      {loading ? <Skeleton height={140} /> : !rows.length ? (
        <Card><EmptyState icon="file" title="No requests yet" description="Find a room you like and send a request from the business page."
          action={<Button as={Link} to="/explore">Explore businesses</Button>} /></Card>
      ) : (
        <div className="rent-form">
          {rows.map((r) => (
            <Card key={r.id} className="rent-form">
              <div className="rent-head">
                <div><h2 className="rent-head__title" style={{ fontSize: "var(--text-lg)" }}>
                    {r.type_name ? r.type_name : `Room ${r.room_number}`}{r.building_name ? ` · ${r.building_name}` : ""}</h2>
                  <p className="rent-head__lead"><Link to={`/b/${r.business_slug}`}>{r.business_name}</Link> · asked on {formatDate(r.created_at)}</p>
                  <p className="rent-muted" style={{ margin: 0 }}>
                    {r.room_number ? `Room ${r.room_number}` : "Room not chosen yet. The business picks it when it approves your request."}
                  </p></div>
                <StatusBadge kind="request" status={r.status} />
              </div>
              {r.status === "offered" && (
                <Alert type="info" title={`Offer: room ${r.room_number || ""} at ${money(r.offer_price)} ${r.offer_billing_type === "semester" ? "per semester" : "a month"}`}
                  message={`Move in on ${formatDate(r.offer_move_in)}. Open until ${formatDateTime(r.offer_expires_at)}.${r.response_note ? ` “${r.response_note}”` : ""}`} />
              )}
              {r.status === "rejected" && r.response_note && <p className="rent-muted">Their reply: {r.response_note}</p>}
              <div className="rent-actions">
                {r.status === "offered" && <>
                  <Button loading={busy === r.id + true} onClick={() => answer(r, true)}>Accept offer</Button>
                  <Button variant="outline" loading={busy === r.id + false} onClick={() => answer(r, false)}>Decline</Button>
                </>}
                {r.status === "pending" && <Button variant="ghost" loading={busy === r.id + "c"} onClick={() => cancel(r)}>Cancel request</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
