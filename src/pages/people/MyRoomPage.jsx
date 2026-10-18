// src/pages/people/MyRoomPage.jsx — NEW FILE
//
// AIM
// /app/:slug/my-room (resident) — my room: photos, building, floor, amenities, rent and move-in date,
// and a link to ask for a room transfer.

import { Link } from "react-router-dom";
import { Alert, Button, Card, CardBody, CardHeader, EmptyState, Skeleton } from "../../components/ui";
import useAsync from "../../hooks/useAsync.js";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import { myTenancy } from "../../lib/api/people.js";
import { formatDate } from "../../lib/format.js";
import { PageHead, money } from "../rental/shared.jsx";

export default function MyRoomPage() {
  const { business } = useBusinessContext();
  const { data: t, error, loading } = useAsync(() => myTenancy(business.id), [business.id]);
  if (loading) return <div className="rent"><Skeleton height={32} width={200} /><Skeleton height={220} /></div>;
  const room = t?.room;
  const images = Array.isArray(room?.images) ? room.images : [];
  const amenities = Array.isArray(room?.amenities) ? room.amenities : [];
  return (
    <div className="rent">
      <PageHead title="My room" lead={room ? `Room ${room.room_number}` : ""}>
        {room && <Button as={Link} to={`/app/${business.slug}/transfer`} variant="outline">Ask to move rooms</Button>}
      </PageHead>
      {error && <Alert type="error" message={error} />}
      {!room ? <Card><EmptyState icon="home" title="No active tenancy" description="You do not have a room in this business right now." /></Card> : (
        <Card>
          <CardHeader title={`${room.building?.name || "Building"} · ${room.room_number}`} subtitle={room.building?.address} />
          <CardBody>
            {images.length > 0 && <div className="rent-photos" style={{ marginBottom: "var(--space-4)" }}>{images.map((u, i) => <div className="rent-photo" key={u}><img src={u} alt={`Room photo ${i + 1}`} loading="lazy" /></div>)}</div>}
            <dl className="rent-dl">
              <div><dt>Type</dt><dd style={{ textTransform: "capitalize" }}>{room.room_type}</dd></div>
              {room.floor?.floor_name && <div><dt>Floor</dt><dd>{room.floor.floor_name}</dd></div>}
              <div><dt>Rent</dt><dd className="rent-money">{money(t.agreed_price)} {t.billing_type === "semester" ? "per semester" : "per month"}</dd></div>
              <div><dt>Moved in</dt><dd>{formatDate(t.move_in_date)}</dd></div>
              {room.description && <div><dt>About the room</dt><dd>{room.description}</dd></div>}
              {amenities.length > 0 && <div><dt>Includes</dt><dd>{amenities.join(", ")}</dd></div>}
            </dl>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
