// src/pages/public/ProduceDetailPage.jsx — MODIFIED (buy with M-Pesa and collect, plus WhatsApp, call and email)
//
// AIM
// /b/:slug/produce/:productId — one item of farm produce: photos, price per unit, how much is left,
// the description, and two ways to buy: add it to the cart and pay by M-Pesa, then collect from the
// farm (farms have no delivery), or ask the farm first by WhatsApp (the item is already in the
// message), call or email. A card at the bottom links to the farm's own page. A hidden item, an
// item past its "available until" date, or an id from another business, says so.

import "../storefront/Storefront.css";
import "./BusinessPage.css";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Alert, Badge, Button, Card, EmptyState, Skeleton } from "../../components/ui";
import VisitBusiness from "../../components/business/VisitBusiness.jsx";
import useAsync from "../../hooks/useAsync.js";
import useBusinessBrand from "../../hooks/useBusinessBrand.js";
import useSeo from "../../hooks/useSeo.js";
import { getBusinessBySlug } from "../../lib/api/directory.js";
import { getShopProduct } from "../../lib/api/storefront.js";
import { formatDate, formatKsh } from "../../lib/format.js";
import { useCart } from "../../store/cartStore.js";
import { toE164 } from "../../lib/phone.js";
import { siteUrl } from "../../lib/seo.js";
import { Gallery, Qty } from "../storefront/shared.jsx";

export default function ProduceDetailPage() {
  const { slug, productId } = useParams();
  const { data, error, loading } = useAsync(async () => {
    const b = await getBusinessBySlug(slug);
    if (!b.data) return { data: null, error: b.error };
    const p = await getShopProduct(productId);
    return { data: { b: b.data, p: p.data }, error: p.error };
  }, [slug, productId]);
  const b = data?.b, p = data?.p;
  const ok = Boolean(b && p && p.business_id === b.id && b.business_type === "agriculture");
  useBusinessBrand(b, loading ? slug : "");
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState("");
  const inCart = useCart((s) => (p ? (s.lines.find((l) => l.productId === p.id)?.quantity || 0) : 0));
  useSeo(ok ? {
    title: `${p.name} | ${b.name}`, description: p.description || `${p.name} from ${b.name}. KSh ${p.price}.`,
    image: p.images?.[0] || "", path: `/b/${b.slug}/produce/${p.id}`,
    jsonLd: { "@context": "https://schema.org", "@type": "Product", name: p.name, description: p.description || undefined, image: p.images?.length ? p.images : undefined,
      offers: { "@type": "Offer", priceCurrency: "KES", price: String(p.price), availability: p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", url: `${siteUrl()}/b/${b.slug}/produce/${p.id}` } },
  } : null);

  if (loading) return <div className="pg"><Skeleton height={320} /></div>;
  if (!ok) {
    return (
      <div className="pg pg--narrow"><Card><EmptyState icon="search" title="Produce not found" description={error || "It may have been removed, or the address is wrong."}
        action={<Button as={Link} to={b ? `/b/${b.slug}` : "/shop-rent?type=farm"}>{b ? `See ${b.name}` : "See all produce"}</Button>} /></Card></div>
    );
  }

  const out = p.stock <= 0;
  const room = Math.max(0, p.stock - inCart);
  function add(then) {
    const r = useCart.getState().add({ product: p, shop: { id: b.id, slug: b.slug, name: b.name } }, qty);
    if (r.error) { setMsg(r.error); return; }
    setMsg("");
    navigate(then === "buy" ? `/b/${b.slug}/checkout` : `/b/${b.slug}/cart`);
  }
  const unit = p.unit && p.unit !== "item" ? p.unit : "";
  const wa = toE164(b.whatsapp || b.phone);
  const ask = encodeURIComponent(`Hello ${b.name}, I would like to buy ${p.name} (${formatKsh(p.price)}${unit ? ` / ${unit}` : ""}) that I saw on the site.`);

  return (
    <div className="pg">
      <nav className="bpage__crumbs" aria-label="Breadcrumb"><Link to="/shop-rent?type=farm">Farm produce</Link> / <Link to={`/b/${b.slug}`}>{b.name}</Link> / <span>{p.name}</span></nav>
      <div className="sf-product">
        <Gallery images={p.images || []} name={p.name} />
        <div className="sf-buy">
          <h1>{p.name}</h1>
          {p.category?.name && <Badge variant="neutral">{p.category.name}</Badge>}
          <div><span className="sf-price" style={{ fontSize: "var(--text-2xl)" }}>{formatKsh(p.price)}</span>{unit && <span className="sf-muted"> / {unit}</span>}</div>
          <p className="sf-muted">{out ? "Out of stock" : p.stock <= 5 ? `Only ${p.stock} left` : "In stock"}</p>
          {p.available_until && <p className="sf-muted">Available until {formatDate(p.available_until)}</p>}
          {p.description && <p style={{ whiteSpace: "pre-line", margin: 0 }}>{p.description}</p>}
          {msg && <Alert type="error" message={msg} />}
          {!out && (
            room === 0 ? <Alert type="info" message="You already have all the available stock in your cart." /> : (
              <>
                <div className="sf-split">
                  <Qty value={Math.min(qty, room)} max={room} onChange={setQty} />
                  <Button onClick={() => add("add")}>Add to cart</Button>
                  <Button variant="outline" onClick={() => add("buy")}>Buy now</Button>
                </div>
                <p className="sf-muted" style={{ margin: 0 }}>Pay by M-Pesa, then collect from the farm.</p>
              </>
            )
          )}
          <Card style={{ padding: "var(--space-4)", display: "grid", gap: "var(--space-2)" }}>
            <strong>Questions? Ask the farm</strong>
            {wa && <Button as="a" href={`https://wa.me/${wa}?text=${ask}`} target="_blank" rel="noopener noreferrer" fullWidth>Message on WhatsApp</Button>}
            {b.phone && <Button as="a" href={`tel:${b.phone}`} variant="outline" fullWidth>Call {b.phone}</Button>}
            {b.email && <Button as="a" href={`mailto:${b.email}?subject=${encodeURIComponent(p.name)}`} variant="ghost" fullWidth>{b.email}</Button>}
            {!wa && !b.phone && !b.email && <span className="sf-muted">This farm has not added contact details yet.</span>}
          </Card>
          <VisitBusiness business={b} label="Grown and sold by" />
        </div>
      </div>
    </div>
  );
}
