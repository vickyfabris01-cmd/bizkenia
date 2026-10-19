// src/pages/public/BusinessPage.jsx — MODIFIED FILE (farms list their produce)
//
// AIM
// The public page of one approved business at /b/:slug: name, type, description, location,
// contact buttons (call, WhatsApp, email). Reviews and stars are left out on purpose.
// Phase 2: for rentals it also lists the rooms available now (anyone can look, no sign-in), and
// "Request a room" leads to /b/:slug/request, which asks the person to sign in first.
// Farms list the produce they have for sale; buying is by calling or messaging the farm.
// A business that is not active shows "not found".

import "./BusinessPage.css";
import "../rental/Rental.css";
import { Link, useParams } from "react-router-dom";
import { Badge, Button, Card, EmptyState, Icon, Skeleton, SkeletonText } from "../../components/ui";
import ListingCard from "../../components/business/ListingCard.jsx";
import { typeLabel } from "../../config/counties.js";
import useAsync from "../../hooks/useAsync.js";
import useBusinessBrand from "../../hooks/useBusinessBrand.js";
import { getBusinessBySlug } from "../../lib/api/directory.js";
import { listAvailableRooms } from "../../lib/api/rental.js";
import { listShopProducts } from "../../lib/api/storefront.js";
import { formatKsh } from "../../lib/format.js";
import { RoomCard } from "../rental/RequestRoomPage.jsx";
import { toE164 } from "../../lib/phone.js";
import useSeo from "../../hooks/useSeo.js";
import { siteUrl } from "../../lib/seo.js";
import ShopHome from "../storefront/ShopHome.jsx";

export default function BusinessPage() {
  const { slug } = useParams();
  const { data: b, error, loading } = useAsync(() => getBusinessBySlug(slug), [slug]);
  const { data: rooms, loading: roomsLoading } = useAsync(
    () => (b?.business_type === "rental" ? listAvailableRooms(b.id) : Promise.resolve({ data: [], error: null })), [b?.id]);
  const { data: produce, loading: produceLoading } = useAsync(
    () => (b?.business_type === "agriculture" ? listShopProducts(b.id, { limit: 24 }) : Promise.resolve({ data: [], error: null })), [b?.id]);
  useBusinessBrand(b, loading ? slug : ""); // header: this business logo, or its first letter
  // shops draw their own text (ShopHome); rentals and farms use this one
  useSeo(b && b.business_type !== "shop" ? {
    title: `${b.name} (${typeLabel(b.business_type)}${b.county ? `, ${b.county}` : ""})`,
    description: b.description || `${b.name}, ${typeLabel(b.business_type).toLowerCase()} in ${b.county || "Kenya"}.`,
    image: b.cover_url || b.logo_url || "", path: `/b/${b.slug}`,
    jsonLd: { "@context": "https://schema.org", "@type": "LocalBusiness", name: b.name, description: b.description || undefined,
      image: b.cover_url || b.logo_url || undefined, telephone: b.phone || undefined, url: `${siteUrl()}/b/${b.slug}`,
      address: { "@type": "PostalAddress", streetAddress: b.address || undefined, addressRegion: b.county || undefined, addressCountry: "KE" } },
  } : null);

  if (loading) {
    return (
      <div className="pg">
        <Skeleton height={220} style={{ borderRadius: "var(--radius-lg)" }} />
        <div style={{ marginTop: 24 }}><Skeleton width="40%" height={28} /><SkeletonText lines={3} /></div>
      </div>
    );
  }
  if (error || !b) {
    return (
      <div className="pg pg--narrow">
        <Card>
          <EmptyState icon="search" title={error ? "This page could not be loaded" : "Business not found"}
            description={error || "It may not be approved yet, or the address is wrong."}
            action={<Button as={Link} to="/explore">Explore businesses</Button>} />
        </Card>
      </div>
    );
  }

  if (b.business_type === "shop") return <ShopHome />; // the storefront draws its own page

  const wa = toE164(b.whatsapp || b.phone);
  const place = [b.address, b.county].filter(Boolean).join(", ");

  return (
    <div className="pg">
      <nav className="bpage__crumbs" aria-label="Breadcrumb"><Link to="/explore">Explore</Link> / <span>{b.name}</span></nav>
      <div className="bpage__cover" style={b.cover_url ? { backgroundImage: `url(${b.cover_url})` } : undefined}>
        {!b.cover_url && <span aria-hidden="true">{b.name.charAt(0).toUpperCase()}</span>}
      </div>

      <div className="bpage__grid">
        <div>
          <div className="bpage__title-row">
            <h1 className="pg__title">{b.name}</h1>
            <Badge variant="brand">{typeLabel(b.business_type)}</Badge>
          </div>
          {place && <p className="bpage__place"><Icon name="home" size={16} /> {place}</p>}
          <h2>About</h2>
          <p>{b.description || "This business has not added a description yet."}</p>

          {b.business_type === "rental" && (
            <section aria-labelledby="rooms-h" style={{ marginTop: "var(--space-6)" }}>
              <h2 id="rooms-h">Rooms available now</h2>
              {roomsLoading ? <Skeleton height={180} /> : (rooms || []).length ? (
                <div className="rent-rooms">
                  {rooms.map((r) => (
                    <div key={r.id} style={{ display: "grid", gap: "var(--space-2)" }}>
                      <RoomCard room={r} />
                      <Button as={Link} to={`/b/${b.slug}/request?room=${r.id}`} variant="outline">Request room {r.room_number}</Button>
                    </div>
                  ))}
                </div>
              ) : <p className="rent-muted">No rooms are free right now. Call or message the business to ask when one will be.</p>}
            </section>
          )}

          {b.business_type === "agriculture" && (
            <section aria-labelledby="produce-h" style={{ marginTop: "var(--space-6)" }}>
              <h2 id="produce-h">Produce for sale</h2>
              {produceLoading ? <Skeleton height={180} /> : (produce || []).length ? (
                <>
                  <div className="listing-grid">
                    {produce.map((p) => (
                      <ListingCard key={p.id} listing={{
                        key: p.id, image: p.images?.[0], title: p.name,
                        price: `${formatKsh(p.price)}${p.unit && p.unit !== "item" ? ` / ${p.unit}` : ""}`,
                        badge: p.stock <= 0 ? "Out of stock" : undefined,
                      }} />
                    ))}
                  </div>
                  <p className="rent-muted" style={{ marginTop: "var(--space-3)" }}>To buy, call or message the farm using the contact buttons.</p>
                </>
              ) : <p className="rent-muted">This farm has not listed any produce yet. Call or message to ask what is available.</p>}
            </section>
          )}
        </div>

        <Card className="bpage__side">
          <h2 className="bpage__side-title">Contact</h2>
          {b.business_type === "rental" && (
            <Button as={Link} to={`/b/${b.slug}/request`} size="lg" fullWidth>Request a room</Button>
          )}
          {b.phone && <Button as="a" href={`tel:${b.phone}`} variant="outline" fullWidth>Call {b.phone}</Button>}
          {wa && <Button as="a" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" variant="outline" fullWidth>WhatsApp</Button>}
          {b.email && <Button as="a" href={`mailto:${b.email}`} variant="ghost" fullWidth>{b.email}</Button>}
        </Card>
      </div>
    </div>
  );
}