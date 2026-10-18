// src/pages/storefront/ProductPage.jsx — NEW FILE (Phase 5 step 2)
//
// AIM
// /b/:slug/p/:productId — one product: photo gallery, price (with the old price struck through),
// how many are left, quantity, "Add to cart" and "Buy now", the wishlist heart and a few more
// products from the same shop. A product that is hidden or sold out says so plainly.

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Alert, Badge, Button, Card, EmptyState, Skeleton } from "../../components/ui";
import useAsync from "../../hooks/useAsync.js";
import { getShopProduct, listShopProducts } from "../../lib/api/storefront.js";
import { useCart } from "../../store/cartStore.js";
import useSeo from "../../hooks/useSeo.js";
import { siteUrl } from "../../lib/seo.js";
import { Gallery, ProductCard, Qty, StoreGate, WishButton, money, useWishlist } from "./shared.jsx";

function Product({ b }) {
  const { productId } = useParams();
  const navigate = useNavigate();
  const wish = useWishlist();
  const { data: p, error, loading } = useAsync(() => getShopProduct(productId), [productId]);
  const { data: more } = useAsync(() => listShopProducts(b.id, { limit: 5 }), [b.id]);
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState("");
  useSeo(p && p.business_id === b.id ? {
    title: `${p.name} | ${b.name}`, description: p.description || `${p.name} from ${b.name}. KSh ${p.price}.`, image: p.images?.[0] || "", path: `/b/${b.slug}/p/${p.id}`,
    jsonLd: { "@context": "https://schema.org", "@type": "Product", name: p.name, description: p.description || undefined, image: p.images?.length ? p.images : undefined,
      offers: { "@type": "Offer", priceCurrency: "KES", price: String(p.price), availability: p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", url: `${siteUrl()}/b/${b.slug}/p/${p.id}` } },
  } : null);
  const inCart = useCart((s) => s.lines.find((l) => l.productId === productId)?.quantity || 0);

  if (loading) return <Skeleton height={320} />;
  if (error || !p || p.business_id !== b.id) {
    return <Card><EmptyState icon="search" title="Product not found" description={error || "It may have been removed."} action={<Button as={Link} to={`/b/${b.slug}/browse`}>See all products</Button>} /></Card>;
  }
  const out = p.stock < 1;
  const room = Math.max(0, p.stock - inCart);

  function add(then) {
    const r = useCart.getState().add({ product: p, shop: { id: b.id, slug: b.slug, name: b.name } }, qty);
    if (r.error) { setMsg(r.error); return; }
    setMsg("");
    if (then === "buy") navigate(`/b/${b.slug}/checkout`); else useCart.getState().openDrawer();
  }

  return (
    <>
      <nav className="bpage__crumbs" aria-label="Breadcrumb"><Link to={`/b/${b.slug}`}>{b.name}</Link> / <Link to={`/b/${b.slug}/browse`}>Products</Link> / <span>{p.name}</span></nav>
      <div className="sf-product">
        <Gallery images={p.images || []} name={p.name} />
        <div className="sf-buy">
          <div style={{ position: "relative" }}><h1>{p.name}</h1></div>
          {p.category && <Badge variant="neutral">{p.category.name}</Badge>}
          <div><span className="sf-price" style={{ fontSize: "var(--text-2xl)" }}>{money(p.price)}</span>{p.compare_at_price && <span className="sf-was">{money(p.compare_at_price)}</span>}<span className="sf-muted"> / {p.unit}</span></div>
          <p className="sf-muted">{out ? "Sold out" : p.stock <= 5 ? `Only ${p.stock} left` : "In stock"}</p>
          {p.description && <p style={{ whiteSpace: "pre-line", margin: 0 }}>{p.description}</p>}
          {msg && <Alert type="error" message={msg} />}
          {!out && (
            room === 0 ? <Alert type="info" message="You already have all the available stock in your cart." /> : (
              <div className="sf-split">
                <Qty value={Math.min(qty, room)} max={room} onChange={setQty} />
                <Button onClick={() => add("add")}>Add to cart</Button>
                <Button variant="outline" onClick={() => add("buy")}>Buy now</Button>
              </div>
            )
          )}
          <div className="sf-split" style={{ position: "relative", minHeight: 44 }}>
            <WishButton productId={p.id} wish={wish} />
            <span className="sf-muted" style={{ paddingLeft: 52, alignSelf: "center" }}>{wish.ids.has(p.id) ? "Saved to your wishlist" : "Save for later"}</span>
          </div>
        </div>
      </div>
      {(more || []).filter((x) => x.id !== p.id).length > 0 && (
        <section><h2>More from {b.name}</h2>
          <div className="sf-grid">{more.filter((x) => x.id !== p.id).slice(0, 4).map((x) => <ProductCard key={x.id} product={x} slug={b.slug} wish={wish} />)}</div></section>
      )}
    </>
  );
}

export default function ProductPage() { return <StoreGate>{(b) => <Product b={b} />}</StoreGate>; }
