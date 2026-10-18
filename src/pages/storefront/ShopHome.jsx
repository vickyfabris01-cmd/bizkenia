// src/pages/storefront/ShopHome.jsx — NEW FILE (Phase 5 step 2)
//
// AIM
// /b/:slug for a shop: the shop's front page. Cover photo and description, category chips, the newest
// products, how delivery works, and contact buttons. Anyone can look; nothing needs a sign-in until checkout.
// (BusinessPage hands over to this page when the business is a shop.)

import { Link } from "react-router-dom";
import { Alert, Button, Card, EmptyState, Skeleton } from "../../components/ui";
import useAsync from "../../hooks/useAsync.js";
import { getShopTerms, listShopCategories, listShopProducts } from "../../lib/api/storefront.js";
import { toE164 } from "../../lib/phone.js";
import useSeo from "../../hooks/useSeo.js";
import { siteUrl } from "../../lib/seo.js";
import { ProductCard, StoreGate, money, useWishlist } from "./shared.jsx";

function Front({ b }) {
  const wish = useWishlist();
  const { data: cats } = useAsync(() => listShopCategories(b.id), [b.id]);
  const { data: products, error, loading } = useAsync(() => listShopProducts(b.id, { limit: 8 }), [b.id]);
  const { data: terms } = useAsync(() => getShopTerms(b.id), [b.id]);
  const wa = toE164(b.whatsapp || b.phone);
  useSeo({
    title: `${b.name} (online shop${b.county ? `, ${b.county}` : ""})`,
    description: b.description || `Shop online at ${b.name}. Pay with M-Pesa.`, image: b.cover_url || b.logo_url || "", path: `/b/${b.slug}`,
    jsonLd: { "@context": "https://schema.org", "@type": "Store", name: b.name, description: b.description || undefined, image: b.cover_url || b.logo_url || undefined,
      telephone: b.phone || undefined, url: `${siteUrl()}/b/${b.slug}`, address: { "@type": "PostalAddress", addressRegion: b.county || undefined, addressCountry: "KE" } },
  });

  return (
    <>
      <div className={`sf-hero${b.cover_url ? " sf-hero--img" : ""}`} style={b.cover_url ? { backgroundImage: `url(${b.cover_url})` } : undefined}>
        <h1>{b.name}</h1>
        <p>{b.description || "Welcome to our shop."}</p>
      </div>

      {(cats || []).length > 0 && (
        <div className="sf-chips" aria-label="Categories">
          {cats.map((c) => <Link key={c.id} className="sf-chip" to={`/b/${b.slug}/browse?category=${c.id}`}>{c.name}</Link>)}
        </div>
      )}

      <section aria-labelledby="new-h">
        <div className="sf-bar" style={{ border: 0, paddingBottom: "var(--space-3)" }}>
          <h2 id="new-h" style={{ margin: 0 }}>Latest products</h2>
          <Button as={Link} to={`/b/${b.slug}/browse`} variant="outline" size="sm">See all</Button>
        </div>
        {error ? <Alert type="error" message={error} /> : loading ? <div className="sf-grid">{[1, 2, 3, 4].map((n) => <Skeleton key={n} height={220} />)}</div>
          : (products || []).length === 0 ? <Card><EmptyState icon="search" title="No products yet" description="This shop has not added anything for sale. Check back soon." compact /></Card>
          : <div className="sf-grid">{products.map((p) => <ProductCard key={p.id} product={p} slug={b.slug} wish={wish} />)}</div>}
      </section>

      <div className="sf-row">
        <Card>
          <h2 style={{ marginTop: 0 }}>Delivery and pickup</h2>
          {terms ? (
            <div className="sf-form">
              {terms.delivery_enabled && <p className="sf-muted">Delivery: {Number(terms.delivery_fee) > 0 ? money(terms.delivery_fee) : "free"}{terms.free_delivery_over ? `, free for orders over ${money(terms.free_delivery_over)}` : ""}.</p>}
              {terms.pickup_enabled && <p className="sf-muted">Pickup: {terms.pickup_address || "ask the shop"}.</p>}
              {terms.pay_on_delivery && <p className="sf-muted">You can pay on delivery.</p>}
              {terms.delivery_note && <p className="sf-muted">{terms.delivery_note}</p>}
            </div>
          ) : <Skeleton height={60} />}
        </Card>
        <Card>
          <h2 style={{ marginTop: 0 }}>Contact</h2>
          <div className="sf-form">
            {[b.address, b.county].filter(Boolean).length > 0 && <p className="sf-muted">{[b.address, b.county].filter(Boolean).join(", ")}</p>}
            {b.phone && <Button as="a" href={`tel:${b.phone}`} variant="outline">Call {b.phone}</Button>}
            {wa && <Button as="a" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" variant="outline">WhatsApp</Button>}
          </div>
        </Card>
      </div>
    </>
  );
}

export default function ShopHome() {
  return <StoreGate>{(b) => <Front b={b} />}</StoreGate>;
}
