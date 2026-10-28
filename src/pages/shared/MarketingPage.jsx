// src/pages/shared/MarketingPage.jsx — MODIFIED FILE (Share and promote: only the card and the poster, to see and download)
//
// AIM
// /app/:slug/share — "Share and promote". This is where the owner or a manager gets the CARD and the POSTER
// of the business, or of any room type, product or item of produce that is already listed, to download and post
// or print. Each row opens a dialog (components/share/CardDialog.jsx) showing the poster and the card with a
// download button for each. Sending a link to WhatsApp, Facebook and the other apps is not done here: every
// listed thing has a share icon (dashboard, Properties, Products, Produce, Settings) that opens the platform
// picker on the spot. What shows on the cards (rent price, phone, address) is set in Settings > Share and promote.
// Only what shoppers can really see is listed (live business, On sale products), because that is
// all a shared link can open. Until the business is approved there is nothing to share yet.
// An old link with ?open=business or ?open=<item id> opens that thing's card and poster straight away.

import "../shop/Shop.css";
import "../../components/share/ShareMenu.css";
import { Link, useSearchParams } from "react-router-dom";
import { Alert, Button, Card, EmptyState, Icon } from "../../components/ui";
import CardDialog from "../../components/share/CardDialog.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useBusinessContext } from "../../router/BusinessContext.jsx";
import { getBusinessBySlug } from "../../lib/api/directory.js";
import { listRoomTypesPublic } from "../../lib/api/rental.js";
import { getShareOptions } from "../../lib/api/shareOptions.js";
import { listShopProducts } from "../../lib/api/storefront.js";
import { formatKsh } from "../../lib/format.js";
import { businessTarget, productTarget, roomState, roomTarget } from "../../lib/share.js";
import { Loading, LoadError, PageHead } from "../shop/shared.jsx";

const SECTION = {
  rental: { title: "Room types", empty: "No room types are listed yet. Add them under Properties." },
  shop: { title: "Products", empty: "Nothing is on sale yet. Products you set to On sale appear here." },
  agriculture: { title: "Produce", empty: "Nothing is on sale yet. Produce you set to On sale appears here." },
};
const ROOM_WORD = { available: "Available", full: "Fully occupied", none: "Not available yet" };

function toItems(b, type, rows, options) {
  return (rows || []).map((x) => {
    if (type === "rental") {
      const hostel = Boolean(x.is_hostel);
      const state = ROOM_WORD[roomState(Number(x.available), Number(x.total))] || "";
      return {
        id: x.id, name: x.name, image: x.images?.[0],
        meta: `${formatKsh(hostel ? x.semester_price : x.monthly_price)} / ${hostel ? "semester" : "month"}${state ? ` · ${state}` : ""}`,
        target: roomTarget(b, x, { available: x.available, total: x.total, options }),
      };
    }
    const farm = type === "agriculture";
    const unit = x.unit && x.unit !== "item" ? ` / ${x.unit}` : "";
    return {
      id: x.id, name: x.name, image: x.images?.[0],
      meta: `${formatKsh(x.price)}${unit}${Number(x.stock) <= 0 ? " · Out of stock" : ""}`,
      target: productTarget(b, x, { farm, options }),
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
  const opts = useAsync(async () => (b ? getShareOptions(b.id) : { data: null, error: null }), [b?.id]);
  const listing = useAsync(async () => {
    if (!b) return { data: [], error: null };
    return type === "rental" ? listRoomTypesPublic(b.id) : listShopProducts(b.id, { limit: 60 });
  }, [b?.id, type]);

  if (live.loading) return <Loading />;
  if (live.error) return <LoadError error={live.error} onRetry={live.reload} />;

  const section = SECTION[type] || SECTION.shop;
  const options = opts.data;
  const items = b ? toItems(b, type, listing.data, options) : [];
  const own = b ? businessTarget(b, { options }) : null;
  const waiting = listing.loading || opts.loading; // the cards are drawn only once the owner's display options are known
  const active = waiting ? null : openId === "business" ? own : items.find((it) => it.id === openId)?.target || null;
  const openIt = (id) => setParams({ open: id });
  const closeIt = () => setParams({}, { replace: true });
  const base = `/app/${business.slug}`;

  return (
    <div className="shop">
      <PageHead title="Share and promote"
        lead="Get the card and the poster of your business, or of anything you have listed, to download and post. To send a link on WhatsApp, Facebook and other apps, tap the share icon on the item." />

      {!b ? (
        <Alert type="info" title="Not live yet" message="Cards and posters are available as soon as your business is approved, because a shared link only works for a live business." />
      ) : (
        <>
          <p className="share-hint" style={{ marginBottom: "var(--space-3)" }}>
            What appears on the cards (rent price, phone, address) is set in <Link to={`${base}/settings`}>Settings</Link>.
          </p>
          <Card>
            <Row image={b.cover_url || b.logo_url} name={b.name} meta="Your business page">
              <Button leftIcon={<Icon name="download" size={16} />} onClick={() => openIt("business")}>Card and poster</Button>
            </Row>
          </Card>

          <h3 style={{ margin: "var(--space-4) 0 var(--space-2)" }}>{section.title}</h3>
          {listing.error ? <Alert type="error" message={listing.error} />
            : waiting ? <Loading rows={3} />
            : items.length === 0 ? <Card><EmptyState icon="file" title="Nothing to share yet" description={section.empty} compact /></Card>
            : (
              <div className="share-list">
                {items.map((it) => (
                  <Row key={it.id} image={it.image} name={it.name} meta={it.meta}>
                    <Button variant="outline" leftIcon={<Icon name="download" size={16} />} onClick={() => openIt(it.id)}>Card and poster</Button>
                  </Row>
                ))}
              </div>
            )}
        </>
      )}

      {active && <CardDialog open target={active} onClose={closeIt} />}
    </div>
  );
}
