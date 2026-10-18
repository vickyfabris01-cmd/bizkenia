// src/pages/rental/RequestRoomPage.jsx — MODIFIED (header logo becomes the business logo)
//
// AIM
// /b/:slug/request[?room=id] — a signed-in person asks for a room in a rental business. They pick
// an available room (or arrive with one chosen from the business page), add a message and a
// preferred move-in date, and send. The business answers with an offer or a decline; the person
// follows it at /account/requests. Staff of the business cannot request a room in it.

import "./Rental.css";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Alert, Badge, Button, Card, EmptyState, Input, Skeleton, TextArea } from "../../components/ui";
import useAsync from "../../hooks/useAsync.js";
import useBusinessBrand from "../../hooks/useBusinessBrand.js";
import { getBusinessBySlug } from "../../lib/api/directory.js";
import { listAvailableRooms, submitRequest } from "../../lib/api/rental.js";
import { money, todayISO } from "./shared.jsx";

export function RoomCard({ room, picked, onPick }) {
  const img = room.images?.[0];
  return (
    <Card className={`rent-roomcard${picked ? " is-picked" : ""}`}>
      <div className="rent-roomcard__img" style={img ? { backgroundImage: `url(${img})` } : undefined} role={img ? "img" : undefined} aria-label={img ? `Photo of room ${room.room_number}` : undefined}>
        {!img && <span aria-hidden="true">{room.room_number}</span>}
      </div>
      <h3>Room {room.room_number}{room.building?.name ? ` · ${room.building.name}` : ""}</h3>
      <p className="rent-muted">{room.room_type.charAt(0).toUpperCase() + room.room_type.slice(1)} · sleeps {room.capacity}</p>
      <p style={{ margin: 0 }}><strong className="rent-money">{money(room.monthly_price)}</strong> a month</p>
      {(room.amenities || []).length > 0 && <div className="rent-chips">{room.amenities.slice(0, 4).map((a) => <Badge key={a} variant="neutral">{a}</Badge>)}</div>}
      {onPick && <Button variant={picked ? "primary" : "outline"} aria-pressed={picked} onClick={onPick}>{picked ? "Selected" : "Choose this room"}</Button>}
    </Card>
  );
}

export default function RequestRoomPage() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const { data, error, loading } = useAsync(async () => {
    const b = await getBusinessBySlug(slug);
    if (!b.data) return { data: null, error: b.error };
    const r = await listAvailableRooms(b.data.id);
    return { data: { business: b.data, rooms: r.data || [] }, error: r.error };
  }, [slug]);
  useBusinessBrand(data?.business, loading ? slug : "");
  const [roomId, setRoomId] = useState(params.get("room") || "");
  const [message, setMessage] = useState("");
  const [moveIn, setMoveIn] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [sent, setSent] = useState(false);

  if (loading) return <div className="pg pg--narrow"><Skeleton height={180} /></div>;
  if (!data?.business) {
    return <div className="pg pg--narrow"><Card><EmptyState icon="search" title="Business not found" description={error || "It may not be approved yet, or the address is wrong."}
      action={<Button as={Link} to="/explore">Explore businesses</Button>} /></Card></div>;
  }
  const { business, rooms } = data;
  const room = rooms.find((r) => r.id === roomId);

  async function submit(e) {
    e.preventDefault();
    if (!room) { setFormError("Choose a room first."); return; }
    setBusy(true); setFormError("");
    const { error: err } = await submitRequest(business.id, room.id, message, moveIn);
    setBusy(false);
    if (err) { setFormError(err); return; }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="pg pg--narrow">
        <Card><EmptyState icon="success" title="Request sent" description={`${business.name} will review it and reply with an offer. You will get a notification, and you can follow it under My requests.`}
          action={<Button as={Link} to="/account/requests">My requests</Button>} /></Card>
      </div>
    );
  }

  return (
    <div className="pg">
      <nav className="bpage__crumbs" aria-label="Breadcrumb"><Link to="/explore">Explore</Link> / <Link to={`/b/${business.slug}`}>{business.name}</Link> / <span>Request a room</span></nav>
      <h1 className="pg__title">Request a room at {business.name}</h1>
      {!rooms.length ? (
        <Card><EmptyState icon="building" title="No rooms are available right now" description="Contact the business to ask when a room will be free."
          action={<Button as={Link} to={`/b/${business.slug}`}>Back to {business.name}</Button>} /></Card>
      ) : (
        <form className="rent-form" onSubmit={submit} noValidate>
          <div className="rent-rooms">{rooms.map((r) => <RoomCard key={r.id} room={r} picked={r.id === roomId} onPick={() => setRoomId(r.id)} />)}</div>
          <Card className="rent-form">
            {formError && <Alert type="error" message={formError} />}
            <Input label="When would you like to move in?" type="date" min={todayISO()} value={moveIn} onChange={(e) => setMoveIn(e.target.value)} />
            <TextArea label="Message (optional)" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} helper="Tell them a little about yourself or ask a question." />
            <Button type="submit" size="lg" loading={busy}>{room ? `Send request for room ${room.room_number}` : "Send request"}</Button>
          </Card>
        </form>
      )}
    </div>
  );
}