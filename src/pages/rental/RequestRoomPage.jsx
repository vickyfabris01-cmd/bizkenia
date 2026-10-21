// src/pages/rental/RequestRoomPage.jsx — MODIFIED FILE (room types)
//
// AIM
// /b/:slug/request[?type=id] — a signed-in person asks for a kind of room (a room type) in a rental
// business. When the business lets renters pick, they may also choose one of the free rooms of that
// type, or leave it to the business. They add a message and a preferred move-in date and send. The
// business approves with an offer that names the room; the person follows it at /account/requests.
// Staff of the business cannot request a room in it. TypeCard is also used on the public business page.

import "./Rental.css";
import "./RoomTypes.css";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Alert, Badge, Button, Card, EmptyState, Input, Skeleton, TextArea } from "../../components/ui";
import useAsync from "../../hooks/useAsync.js";
import useBusinessBrand from "../../hooks/useBusinessBrand.js";
import { getBusinessBySlug } from "../../lib/api/directory.js";
import { listRoomTypesPublic, submitTypeRequest } from "../../lib/api/rental.js";
import { kindLabel, money, todayISO } from "./shared.jsx";

/** One listing for a whole room type: photo, rent, what it has and how many rooms are still free. */
export function TypeCard({ type, picked, onPick, children }) {
  const img = type.images?.[0];
  const available = Number(type.available) || 0;
  const total = Number(type.total) || 0;
  return (
    <Card className={`rtype${picked ? " is-picked" : ""}${available === 0 ? " is-full" : ""}`}>
      <div className="rtype__img" style={img ? { backgroundImage: `url(${img})` } : undefined} role={img ? "img" : undefined} aria-label={img ? `Photo of ${type.name}` : undefined}>
        {!img && <span aria-hidden="true">{type.name.charAt(0).toUpperCase()}</span>}
      </div>
      <h3>{type.name}{type.building_name ? ` · ${type.building_name}` : ""}</h3>
      <p className="rent-muted">
        {kindLabel(type.kind)}{type.is_hostel ? ` · hostel · sleeps ${type.capacity}` : ""}{type.building_address ? ` · ${type.building_address}` : ""}
      </p>
      <p style={{ margin: 0 }}>
        <strong className="rent-money">{money(type.is_hostel ? type.semester_price : type.monthly_price)}</strong> {type.is_hostel ? "a semester" : "a month"}
      </p>
      <p className={`rtype__avail${available === 0 ? " rtype__avail--none" : ""}`}>
        {available === 0 ? `Fully occupied (${total} rooms)` : `${available} of ${total} room${total === 1 ? "" : "s"} available`}
      </p>
      {type.description && <p className="rent-muted" style={{ margin: 0 }}>{type.description}</p>}
      {(type.amenities || []).length > 0 && <div className="rent-chips">{type.amenities.slice(0, 5).map((a) => <Badge key={a} variant="neutral">{a}</Badge>)}</div>}
      {onPick && (
        <Button variant={picked ? "primary" : "outline"} aria-pressed={picked} disabled={available === 0} onClick={onPick}>
          {available === 0 ? "No rooms free" : picked ? "Selected" : "Choose this type"}
        </Button>
      )}
      {children}
    </Card>
  );
}

export default function RequestRoomPage() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const { data, error, loading } = useAsync(async () => {
    const b = await getBusinessBySlug(slug);
    if (!b.data) return { data: null, error: b.error };
    const t = await listRoomTypesPublic(b.data.id);
    return { data: { business: b.data, types: t.data || [] }, error: t.error };
  }, [slug]);
  useBusinessBrand(data?.business, loading ? slug : "");
  const [typeId, setTypeId] = useState(params.get("type") || "");
  const [roomId, setRoomId] = useState("");
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
  const { business, types } = data;
  const type = types.find((t) => t.id === typeId && Number(t.available) > 0) || null;
  const anyFree = types.some((t) => Number(t.available) > 0);
  const freeRooms = type?.allow_self_pick ? (type.free_rooms || []) : [];

  function pickType(id) { setTypeId(id); setRoomId(""); setFormError(""); }

  async function submit(e) {
    e.preventDefault();
    if (!type) { setFormError("Choose a room type first."); return; }
    setBusy(true); setFormError("");
    const { error: err } = await submitTypeRequest(business.id, type.id, roomId, message, moveIn);
    setBusy(false);
    if (err) { setFormError(err); return; }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="pg pg--narrow">
        <Card><EmptyState icon="success" title="Request sent" description={`${business.name} will review it and reply with an offer that names your room. You will get a notification, and you can follow it under My requests.`}
          action={<Button as={Link} to="/account/requests">My requests</Button>} /></Card>
      </div>
    );
  }

  return (
    <div className="pg">
      <nav className="bpage__crumbs" aria-label="Breadcrumb"><Link to="/explore">Explore</Link> / <Link to={`/b/${business.slug}`}>{business.name}</Link> / <span>Request a room</span></nav>
      <h1 className="pg__title">Request a room at {business.name}</h1>
      {!anyFree ? (
        <Card><EmptyState icon="building" title="No rooms are available right now" description="Contact the business to ask when a room will be free."
          action={<Button as={Link} to={`/b/${business.slug}`}>Back to {business.name}</Button>} /></Card>
      ) : (
        <form className="rent-form" onSubmit={submit} noValidate>
          <div className="rent-rooms">{types.map((t) => <TypeCard key={t.id} type={t} picked={t.id === type?.id} onPick={() => pickType(t.id)} />)}</div>
          {type && (
            <Card className="rent-form">
              <h2 className="rent-head__title" style={{ fontSize: "var(--text-lg)" }}>{type.name}: which room?</h2>
              {freeRooms.length > 0 ? (
                <>
                  <p className="rent-muted">You can pick a free room, or leave it to {business.name}. They approve every request, so your choice is final only once they approve it.</p>
                  <div className="rtype-picker" role="group" aria-label="Free rooms">
                    <button type="button" className="rent-chip" aria-pressed={roomId === ""} onClick={() => setRoomId("")}>No preference</button>
                    {freeRooms.map((r) => (
                      <button key={r.id} type="button" className="rent-chip" aria-pressed={roomId === r.id} onClick={() => setRoomId(r.id)}>{r.room_number}</button>
                    ))}
                  </div>
                </>
              ) : <p className="rent-muted">{business.name} will choose your room when they approve your request.</p>}
            </Card>
          )}
          <Card className="rent-form">
            {formError && <Alert type="error" message={formError} />}
            <Input label="When would you like to move in?" type="date" min={todayISO()} value={moveIn} onChange={(e) => setMoveIn(e.target.value)} />
            <TextArea label="Message (optional)" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} helper="Tell them a little about yourself or ask a question." />
            <Button type="submit" size="lg" loading={busy}>
              {type ? `Send request for ${type.name}${roomId ? ` (room ${freeRooms.find((r) => r.id === roomId)?.room_number || ""})` : ""}` : "Send request"}
            </Button>
          </Card>
        </form>
      )}
    </div>
  );
}
