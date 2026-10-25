// src/pages/storefront/shared.jsx — MODIFIED (the shop bar shows the business logo: its upload, or the logo drawn from its saved design)
//
// AIM
// The pieces every shopper screen uses:
//   StoreGate     loads the shop from the address (/b/:slug), shows loading / "not found", and wraps the
//                 page in the shop's top bar (name, browse, wishlist, cart) and the cart drawer.
//   ProductCard   one product in a grid, with the wishlist heart.
//   Gallery       the big photo with small photos under it.
//   WishButton    the heart; asks a visitor to sign in first.
//   Qty           the − 1 + control.
//   CartDrawer    the cart in a slide-in panel, with a Checkout button.
//   Cart/heart icons are drawn here because the shared icon set has none.

import "./Storefront.css";
import "../public/BusinessPage.css";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Button, Card, EmptyState, Skeleton } from "../../components/ui";
import { Drawer } from "../../components/modals/Modal.jsx";
import BusinessLogo from "../../components/brand/BusinessLogo.jsx";
import useAsync from "../../hooks/useAsync.js";
import useBusinessBrand from "../../hooks/useBusinessBrand.js";
import { getBusinessBySlug } from "../../lib/api/directory.js";
import { setWished, wishlistIds } from "../../lib/api/storefront.js";
import { formatKsh } from "../../lib/format.js";
import { useSession } from "../../store/sessionStore.js";
import { lineTotal, useCart } from "../../store/cartStore.js";

export const money = formatKsh;

export const CartIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.6 11.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 7H6" /></svg>
);
export const HeartIcon = ({ filled, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" /></svg>
);

export function Qty({ value, max, onChange, label = "Quantity" }) {
  return (
    <div className="sf-qty" role="group" aria-label={label}>
      <button type="button" aria-label="One less" disabled={value <= 1} onClick={() => onChange(value - 1)}>−</button>
      <span aria-live="polite">{value}</span>
      <button type="button" aria-label="One more" disabled={max != null && value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

// the signed-in person's wishlist, loaded once per page that shows hearts
export function useWishlist() {
  const user = useSession((s) => s.user);
  const [ids, setIds] = useState(new Set());
  useEffect(() => {
    let live = true;
    if (!user) { setIds(new Set()); return undefined; }
    wishlistIds().then((r) => { if (live) setIds(new Set(r.data || [])); });
    return () => { live = false; };
  }, [user]);
  async function toggle(productId) {
    const on = !ids.has(productId);
    const next = new Set(ids); if (on) next.add(productId); else next.delete(productId);
    setIds(next);
    const r = await setWished(user.id, productId, on);
    if (r.error) setIds(ids);
    return r;
  }
  return { ids, toggle, signedIn: Boolean(user) };
}

export function WishButton({ productId, wish }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const on = wish.ids.has(productId);
  return (
    <button type="button" className="sf-heart" aria-pressed={on} aria-label={on ? "Remove from wishlist" : "Save to wishlist"}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!wish.signedIn) navigate(`/login?next=${encodeURIComponent(pathname)}`); else wish.toggle(productId); }}>
      <HeartIcon filled={on} />
    </button>
  );
}

export function ProductCard({ product: p, slug, wish }) {
  const out = p.stock < 1;
  return (
    <div className="sf-pcard">
      <Link className="sf-pcard__link" to={`/b/${slug}/p/${p.id}`} aria-label={`${p.name}, ${money(p.price)}${out ? ", sold out" : ""}`}>
        <div className="sf-pcard__img" style={p.images?.[0] ? { backgroundImage: `url(${p.images[0]})` } : undefined}>{!p.images?.[0] && <span aria-hidden="true">{p.name.charAt(0).toUpperCase()}</span>}</div>
        <div className="sf-pcard__body">
          <h3 className="sf-pcard__name">{p.name}</h3>
          <span><span className="sf-price">{money(p.price)}</span>{p.compare_at_price && <span className="sf-was">{money(p.compare_at_price)}</span>}</span>
          {out ? <span className="sf-muted">Sold out</span> : p.stock <= 5 ? <span className="sf-muted">Only {p.stock} left</span> : null}
        </div>
      </Link>
      {wish && <WishButton productId={p.id} wish={wish} />}
    </div>
  );
}

export function Gallery({ images = [], name }) {
  const [i, setI] = useState(0);
  const src = images[i] || images[0];
  return (
    <div>
      <div className="sf-gallery__main" role="img" aria-label={name} style={src ? { backgroundImage: `url(${src})` } : undefined} />
      {images.length > 1 && (
        <div className="sf-gallery__thumbs">
          {images.map((u, n) => <button key={u} type="button" className="sf-thumb" aria-label={`Photo ${n + 1}`} aria-current={n === i} style={{ backgroundImage: `url(${u})` }} onClick={() => setI(n)} />)}
        </div>
      )}
    </div>
  );
}

export function CartLines({ lines, editable = true }) {
  const cart = useCart.getState();
  return (
    <ul className="sf-lines">
      {lines.map((l) => (
        <li className="sf-line" key={l.productId}>
          <div className="sf-line__img" style={l.image ? { backgroundImage: `url(${l.image})` } : undefined} />
          <div>
            <div className="sf-line__name">{l.name}</div>
            <p className="sf-muted">{money(l.price)} / {l.unit}</p>
            {editable
              ? <div className="sf-split" style={{ marginTop: 4 }}><Qty value={l.quantity} max={l.stock || undefined} onChange={(q) => cart.setQuantity(l.productId, q)} label={`Quantity of ${l.name}`} />
                  <Button size="sm" variant="ghost" onClick={() => cart.remove(l.productId)}>Remove</Button></div>
              : <p className="sf-muted">Quantity {l.quantity}</p>}
          </div>
          <div className="sf-price">{money(l.price * l.quantity)}</div>
        </li>
      ))}
    </ul>
  );
}

export function CartDrawer({ shop }) {
  const open = useCart((s) => s.drawer);
  const all = useCart((s) => s.lines);
  const lines = all.filter((l) => l.businessId === shop.id);
  const navigate = useNavigate();
  const close = () => useCart.getState().closeDrawer();
  return (
    <Drawer isOpen={open} onClose={close} title="Your cart" footer={lines.length ? (
      <div className="sf-sum" style={{ width: "100%" }}>
        <div className="sf-sum__total"><span>Subtotal</span><span>{money(lineTotal(lines))}</span></div>
        <Button fullWidth onClick={() => { close(); navigate(`/b/${shop.slug}/checkout`); }}>Checkout</Button>
        <Button fullWidth variant="outline" onClick={() => { close(); navigate(`/b/${shop.slug}/cart`); }}>View full cart</Button>
      </div>) : null}>
      {lines.length ? <CartLines lines={lines} /> : <p className="sf-muted">Your cart is empty.</p>}
    </Drawer>
  );
}

/** Loads the shop and draws its top bar. Children is a function: (business) => page. Not a shop = "not found". */
export function StoreGate({ children }) {
  const { slug } = useParams();
  const { data: b, error, loading } = useAsync(() => getBusinessBySlug(slug), [slug]);
  const count = useCart((s) => s.lines.filter((l) => l.businessId === b?.id).reduce((n, l) => n + l.quantity, 0));
  useBusinessBrand(b, loading ? slug : "");

  if (loading) return <div className="pg"><Skeleton height={60} /><div style={{ marginTop: 16 }}><Skeleton height={220} /></div></div>;
  const farm = b?.business_type === "agriculture";   // a farm uses the same cart and checkout, paid by M-Pesa and collected
  if (error || !b || (b.business_type !== "shop" && !farm)) {
    return (
      <div className="pg pg--narrow"><Card><EmptyState icon="search" title={error ? "This page could not be loaded" : "Shop not found"}
        description={error || "It may not be open yet, or the address is wrong."} action={<Button as={Link} to="/explore">Explore businesses</Button>} /></Card></div>
    );
  }
  return (
    <div className="pg sf">
      <div className="sf-bar">
        <Link to={`/b/${b.slug}`} className="sf-bar__name">
          <span className="sf-bar__logo"><BusinessLogo business={b} size={36} /></span>
          {b.name}
        </Link>
        <nav className="sf-bar__links" aria-label="Shop">
          {farm
            ? <Button as={Link} to={`/b/${b.slug}`} variant="ghost" size="sm">Farm page</Button>
            : <Button as={Link} to={`/b/${b.slug}/browse`} variant="ghost" size="sm">All products</Button>}
          {!farm && <Button as={Link} to="/wishlist" variant="ghost" size="sm">Wishlist</Button>}
          <Button as={Link} to="/orders" variant="ghost" size="sm">My orders</Button>
          <Button variant="outline" size="sm" className="sf-cartbtn" onClick={() => useCart.getState().openDrawer()} aria-label={`Open cart, ${count} items`}>
            <CartIcon /> <span className="sf-cartbtn__n">{count}</span>
          </Button>
        </nav>
      </div>
      {children(b)}
      <CartDrawer shop={b} />
    </div>
  );
}
