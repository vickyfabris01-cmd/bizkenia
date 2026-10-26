// src/components/share/ShareShelf.jsx — NEW FILE
//
// AIM
// A small card for the business dashboards: what is listed and for sale right now (rooms, products or
// produce), each with a Share button, plus one for the business itself. Every button opens the Share page
// (/app/:slug/share) with that thing already open, so sharing only ever happens in one place.
// Used by the rental, shop and farm dashboards. It shows the five latest things.

import "./ShareMenu.css";
import { Link } from "react-router-dom";
import { Button, Card, CardBody, CardHeader, Skeleton } from "../ui";
import useAsync from "../../hooks/useAsync.js";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import { listRoomTypesPublic } from "../../lib/api/rental.js";
import { listShopProducts } from "../../lib/api/storefront.js";
import { formatKsh } from "../../lib/format.js";

const TITLE = { rental: "Rooms listed", shop: "Products on sale", agriculture: "Produce on sale" };
const ADD = { rental: ["properties", "Add a room type"], shop: ["products", "Add a product"], agriculture: ["produce", "Add produce"] };

export default function ShareShelf() {
  const { business: b } = useBusinessContext();
  const base = `/app/${b.slug}`;
  const { data, loading } = useAsync(
    () => (b.business_type === "rental" ? listRoomTypesPublic(b.id) : listShopProducts(b.id, { limit: 5 })), [b.id, b.business_type]);
  const rows = (data || []).slice(0, 5).map((x) => (b.business_type === "rental"
    ? { id: x.id, name: x.name, image: x.images?.[0], meta: `${formatKsh(x.is_hostel ? x.semester_price : x.monthly_price)} / ${x.is_hostel ? "semester" : "month"}` }
    : { id: x.id, name: x.name, image: x.images?.[0], meta: `${formatKsh(x.price)}${x.unit && x.unit !== "item" ? ` / ${x.unit}` : ""}` }));
  const [addPath, addLabel] = ADD[b.business_type] || ADD.shop;

  return (
    <Card>
      <CardHeader title={TITLE[b.business_type] || "Listed"} subtitle="Share them as a link or a poster."
        action={<Button as={Link} to={`${base}/share?open=business`} size="sm" variant="outline">Share my business</Button>} />
      <CardBody>
        {loading ? <Skeleton height={96} /> : rows.length === 0 ? (
          <p className="share-hint">Nothing is listed yet. <Link to={`${base}/${addPath}`}>{addLabel}</Link> and it can be shared from here.</p>
        ) : (
          <div className="share-list">
            {rows.map((r) => (
              <div className="share-row" key={r.id}>
                <div className="share-row__img" style={r.image ? { backgroundImage: `url(${r.image})` } : undefined} aria-hidden="true">{!r.image && r.name.charAt(0).toUpperCase()}</div>
                <div className="share-row__text"><div className="share-row__title">{r.name}</div><div className="share-row__meta">{r.meta}</div></div>
                <Button as={Link} to={`${base}/share?open=${r.id}`} size="sm" variant="outline">Share</Button>
              </div>
            ))}
            <p className="share-hint" style={{ margin: 0 }}><Link to={`${base}/share`}>See everything you can share</Link></p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
