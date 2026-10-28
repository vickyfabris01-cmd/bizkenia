// src/components/share/ShareShelf.jsx — MODIFIED FILE (icon share buttons that open the platform picker in place)
//
// AIM
// A small card for the business dashboards: the business itself and what is listed and for sale right now
// (rooms, products or produce), each with a share icon. Tapping the icon opens the platform picker right
// here (WhatsApp, Facebook, X and the rest); the dashboard does not change. "Card and poster" leads to the
// Share and promote page, where the card and the poster are downloaded.
// Used by the rental, shop and farm dashboards. It shows the five latest things.

import "./ShareMenu.css";
import { Link } from "react-router-dom";
import { Button, Card, CardBody, CardHeader, Skeleton } from "../ui";
import ShareButton from "./ShareButton.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import { listRoomTypesPublic } from "../../lib/api/rental.js";
import { listShopProducts } from "../../lib/api/storefront.js";
import { formatKsh } from "../../lib/format.js";

const TITLE = { rental: "Share your business and rooms", shop: "Share your business and products", agriculture: "Share your business and produce" };
const ADD = { rental: ["properties", "Add a room type"], shop: ["products", "Add a product"], agriculture: ["produce", "Add produce"] };

function Row({ image, name, meta, request }) {
  return (
    <div className="share-row">
      <div className="share-row__img" style={image ? { backgroundImage: `url(${image})` } : undefined} aria-hidden="true">{!image && name.charAt(0).toUpperCase()}</div>
      <div className="share-row__text"><div className="share-row__title">{name}</div><div className="share-row__meta">{meta}</div></div>
      <ShareButton request={request} label={`Share ${name}`} />
    </div>
  );
}

export default function ShareShelf() {
  const { business: b } = useBusinessContext();
  const base = `/app/${b.slug}`;
  const rental = b.business_type === "rental";
  const farm = b.business_type === "agriculture";
  const { data, loading } = useAsync(
    () => (rental ? listRoomTypesPublic(b.id) : listShopProducts(b.id, { limit: 5 })), [b.id, b.business_type]);
  const rows = (data || []).slice(0, 5).map((x) => (rental
    ? { id: x.id, name: x.name, image: x.images?.[0], meta: `${formatKsh(x.is_hostel ? x.semester_price : x.monthly_price)} / ${x.is_hostel ? "semester" : "month"} · ${Number(x.available) > 0 ? "Available" : "Fully occupied"}`,
        request: { type: "room", business: b, item: x, available: x.available, total: x.total } }
    : { id: x.id, name: x.name, image: x.images?.[0], meta: `${formatKsh(x.price)}${x.unit && x.unit !== "item" ? ` / ${x.unit}` : ""} · ${Number(x.stock) > 0 || x.stock == null ? "Available" : "Out of stock"}`,
        request: { type: "product", business: b, item: x, farm } }));
  const [addPath, addLabel] = ADD[b.business_type] || ADD.shop;

  return (
    <Card>
      <CardHeader title={TITLE[b.business_type] || "Share"} subtitle="Tap the share icon to send it to WhatsApp, Facebook and more."
        action={<Button as={Link} to={`${base}/share`} size="sm" variant="outline">Card and poster</Button>} />
      <CardBody>
        <div className="share-list">
          <Row image={b.cover_url || b.logo_url} name={b.name} meta="Your business page" request={{ type: "business", business: b }} />
          {loading ? <Skeleton height={64} /> : rows.length === 0 ? (
            <p className="share-hint">Nothing is listed yet. <Link to={`${base}/${addPath}`}>{addLabel}</Link> and it can be shared from here.</p>
          ) : rows.map((r) => <Row key={r.id} {...r} />)}
        </div>
      </CardBody>
    </Card>
  );
}
