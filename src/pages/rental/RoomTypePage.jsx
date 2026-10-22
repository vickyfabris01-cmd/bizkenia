// src/pages/rental/RoomTypePage.jsx — NEW FILE
//
// AIM
// /b/:slug/room/:typeId — one room type (a kind of room in a building): photos, rent (monthly, or
// per semester for a hostel), how many people it sleeps (hostels), what it has, how many rooms are
// still free, and a "Request this room" button that leads to /b/:slug/request?type=. A card at the
// bottom links to the rental business's own page. Anyone can look; the request asks for sign-in.

import "../storefront/Storefront.css";
import "../public/BusinessPage.css";
import "./Rental.css";
import { Link, useParams } from "react-router-dom";
import { Badge, Button, Card, EmptyState, Skeleton } from "../../components/ui";
import VisitBusiness from "../../components/business/VisitBusiness.jsx";
import useAsync from "../../hooks/useAsync.js";
import useBusinessBrand from "../../hooks/useBusinessBrand.js";
import useSeo from "../../hooks/useSeo.js";
import { getBusinessBySlug } from "../../lib/api/directory.js";
import { listRoomTypesPublic } from "../../lib/api/rental.js";
import { formatKsh } from "../../lib/format.js";
import { Gallery } from "../storefront/shared.jsx";
import { kindLabel } from "./shared.jsx";

export default function RoomTypePage() {
  const { slug, typeId } = useParams();
  const { data, error, loading } = useAsync(async () => {
    const b = await getBusinessBySlug(slug);
    if (!b.data) return { data: null, error: b.error };
    const t = await listRoomTypesPublic(b.data.id);
    return { data: { b: b.data, t: (t.data || []).find((x) => x.id === typeId) || null }, error: t.error };
  }, [slug, typeId]);
  const b = data?.b, t = data?.t;
  const ok = Boolean(b && t && b.business_type === "rental");
  useBusinessBrand(b, loading ? slug : "");
  useSeo(ok ? {
    title: `${t.name} | ${b.name}`, description: t.description || `${t.name} to rent at ${b.name}${b.county ? `, ${b.county}` : ""}.`,
    image: t.images?.[0] || "", path: `/b/${b.slug}/room/${t.id}`,
  } : null);

  if (loading) return <div className="pg"><Skeleton height={320} /></div>;
  if (!ok) {
    return (
      <div className="pg pg--narrow"><Card><EmptyState icon="search" title="Room not found" description={error || "It may have been removed, or the address is wrong."}
        action={<Button as={Link} to={b ? `/b/${b.slug}` : "/shop-rent?type=rooms"}>{b ? `See ${b.name}` : "See all rooms"}</Button>} /></Card></div>
    );
  }

  const available = Number(t.available) || 0;
  const total = Number(t.total) || 0;
  const hostel = Boolean(t.is_hostel);
  const place = [t.building_name, t.building_address].filter(Boolean).join(" · ");

  return (
    <div className="pg">
      <nav className="bpage__crumbs" aria-label="Breadcrumb"><Link to="/shop-rent?type=rooms">Rooms to rent</Link> / <Link to={`/b/${b.slug}`}>{b.name}</Link> / <span>{t.name}</span></nav>
      <div className="sf-product">
        <Gallery images={t.images || []} name={t.name} />
        <div className="sf-buy">
          <h1>{t.name}{t.building_name ? ` · ${t.building_name}` : ""}</h1>
          <div className="rent-chips">
            <Badge variant="neutral">{kindLabel(t.kind)}</Badge>
            {hostel && <Badge variant="neutral">Hostel · sleeps {t.capacity}</Badge>}
          </div>
          <div>
            <span className="sf-price" style={{ fontSize: "var(--text-2xl)" }}>{formatKsh(hostel ? t.semester_price : t.monthly_price)}</span>
            <span className="sf-muted"> / {hostel ? "semester" : "month"}</span>
          </div>
          <p className="sf-muted">{available === 0 ? `Fully occupied (${total} rooms)` : `${available} of ${total} room${total === 1 ? "" : "s"} available`}</p>
          {place && <p className="sf-muted" style={{ margin: 0 }}>{place}</p>}
          {t.description && <p style={{ whiteSpace: "pre-line", margin: 0 }}>{t.description}</p>}
          {(t.amenities || []).length > 0 && <div className="rent-chips">{t.amenities.map((a) => <Badge key={a} variant="neutral">{a}</Badge>)}</div>}
          {available > 0
            ? <Button as={Link} to={`/b/${b.slug}/request?type=${t.id}`} size="lg">Request this room</Button>
            : <p className="sf-muted" style={{ margin: 0 }}>No room is free right now. Call or message {b.name} to ask when one will be.</p>}
          <p className="sf-muted" style={{ margin: 0 }}>{b.name} approves every request. You will be told by notification.</p>
          <VisitBusiness business={b} label="Listed by" />
        </div>
      </div>
    </div>
  );
}
