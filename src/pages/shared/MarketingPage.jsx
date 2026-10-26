// src/pages/shared/MarketingPage.jsx — MODIFIED FILE (one simple list; every Share button in the app opens this page)
//
// AIM
// /app/:slug/share — "Share and promote". The owner or a manager shares the business, or any room type,
// product or item of produce that is already listed. This is the ONE place where sharing happens: the
// Share buttons on the dashboard, the settings page and the product, produce and room screens all lead
// here, with ?open=business or ?open=<item id> to open that thing's dialog straight away.
// The dialog (components/share/ShareMenu.jsx) shares it as a link or as a poster.
// Only what shoppers can really see is listed (live business, On sale products), because that is
// all a shared link can open. Until the business is approved there is nothing to share yet.

import "../shop/Shop.css";
import "../../components/share/ShareMenu.css";
import { useSearchParams } from "react-router-dom";
import { Alert, Button, Card, EmptyState } from "../../components/ui";
import ShareMenu from "../../components/share/ShareMenu.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import { getBusinessBySlug } from "../../lib/api/directory.js";
import { listRoomTypesPublic } from "../../lib/api/rental.js";
import { listShopProducts } from "../../lib/api/storefront.js";
import { formatKsh } from "../../lib/format.js";
import { businessTarget, productTarget, roomTarget } from "../../lib/share.js";
import { Loading, LoadError, PageHead } from "../shop/shared.jsx";

const SECTION = {
  rental: { title: "Room types", empty: "No room types are listed yet. Add them under Properties." },
  shop: { title: "Products", empty: "Nothing is on sale yet. Products you set to On sale appear here." },
  agriculture: { title: "Produce", empty: "Nothing is on sale yet. Produce you set to On sale appears here." },
};

function toItems(b, type, rows) {
  return (rows || []).map((x) => {
    if (type === "rental") {
      const hostel = Boolean(x.is_hostel);
      return {
        id: x.id, name: x.name, image: x.images?.[0],
        meta: `${formatKsh(hostel ? x.semester_price : x.monthly_price)} / ${hostel ? "semester" : "month"} · ${Number(x.available) || 0} available`,
        target: roomTarget(b, x),
      };
    }
    const farm = type === "agriculture";
    const unit = x.unit && x.unit !== "item" ? ` / ${x.unit}` : "";
    return {
      id: x.id, name: x.name, image: x.images?.[0],
      meta: `${formatKsh(x.price)}${unit}${x.stock <= 0 ? " · out of stock" : ""}`,
      target: productTarget(b, x, { farm }),
    };
  });
}

function Row({ image, name, meta, children }) {
  return (
    <div className="share-row">
      <div className="share-row__img" style={image ? { backgroundImage: `url(${image})` } : undefined} aria-hidden="true">
        {!image && name.charAt(0).toUpperCase()}
      </div>
      <div className="share-row__text">
        <div className="share-row__title">{name}</div>
        {meta && <div className="share-row__meta">{meta}</div>}
      </div>
      {children}
    </div>
  );
}

export default function MarketingPage() {
  const { business } = useBusinessContext();
  const [params, setParams] = useSearchParams();
  const openId = params.get("open") || "";
  const live = useAsync(() => getBusinessBySlug(business.slug), [business.slug]);
  const b = live.data;
  const type = b?.business_type || business.business_type;
  const listing = useAsync(async () => {
    if (!b) return { data: [], error: null };
    return type === "rental" ? listRoomTypesPublic(b.id) : listShopProducts(b.id, { limit: 60 });
  }, [b?.id, type]);

  if (live.loading) return <Loading />;
  if (live.error) return <LoadError error={live.error} onRetry={live.reload} />;

  const section = SECTION[type] || SECTION.shop;
  const items = b ? toItems(b, type, listing.data) : [];
  const own = b ? businessTarget(b) : null;
  const active = openId === "business" ? own : items.find((it) => it.id === openId)?.target || null;
  const openIt = (id) => setParams({ open: id });
  const closeIt = () => setParams({}, { replace: true });

  return (
    <div className="shop">
      <PageHead title="Share and promote"
        lead="Share your business, or anything you have listed, as a link or as a poster." />

      {!b ? (
        <Alert type="info" title="Not live yet" message="Sharing opens as soon as your business is approved, because a shared link only works for a live business." />
      ) : (
        <>
          <Card>
            <Row image={b.cover_url || b.logo_url} name={b.name} meta="Your business page">
              <Button onClick={() => openIt("business")}>Share</Button>
            </Row>
          </Card>

          <h3 style={{ margin: "var(--space-4) 0 var(--space-2)" }}>{section.title}</h3>
          {listing.error ? <Alert type="error" message={listing.error} />
            : listing.loading ? <Loading rows={3} />
            : items.length === 0 ? <Card><EmptyState icon="file" title="Nothing to share yet" description={section.empty} compact /></Card>
            : (
              <div className="share-list">
                {items.map((it) => (
                  <Row key={it.id} image={it.image} name={it.name} meta={it.meta}>
                    <Button variant="outline" onClick={() => openIt(it.id)}>Share</Button>
                  </Row>
                ))}
              </div>
            )}
        </>
      )}

      {active && <ShareMenu open target={active} onClose={closeIt} />}
    </div>
  );
}
