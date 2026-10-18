// src/pages/storefront/WishlistPage.jsx — NEW FILE (Phase 5 step 2)
//
// AIM
// /wishlist — the products I saved, from every shop. Each one can be removed, added to the cart, or opened.
// Products that went off sale show as "No longer available".

import "./Storefront.css";
import { Link } from "react-router-dom";
import { Alert, Button, Card, EmptyState, Skeleton } from "../../components/ui";
import useAsync from "../../hooks/useAsync.js";
import { listWishlist, setWished } from "../../lib/api/storefront.js";
import { useSession } from "../../store/sessionStore.js";
import { useCart } from "../../store/cartStore.js";
import { money } from "./shared.jsx";

export default function WishlistPage() {
  const me = useSession((s) => s.user?.id);
  const { data, error, loading, reload } = useAsync(() => listWishlist(), []);
  const rows = (data || []).filter((r) => r.product);

  async function remove(id) { await setWished(me, id, false); reload(); }
  function add(p) {
    useCart.getState().add({ product: p, shop: { id: p.business_id, slug: p.business?.slug, name: p.business?.name } }, 1);
    useCart.getState().openDrawer();
  }

  return (
    <div className="pg sf">
      <h1 className="pg__title">My wishlist</h1>
      {error && <Alert type="error" message={error} />}
      {loading && !data ? <Skeleton height={120} /> : rows.length === 0 ? (
        <Card><EmptyState icon="search" title="Nothing saved yet" description="Tap the heart on a product to keep it here." action={<Button as={Link} to="/explore?type=shop">Find a shop</Button>} /></Card>
      ) : (
        <div className="sf-lines">
          {rows.map(({ product: p }) => {
            const ok = p.status === "active" && p.stock > 0;
            return (
              <Card key={p.id}><div className="sf-line">
                <div className="sf-line__img" style={p.images?.[0] ? { backgroundImage: `url(${p.images[0]})` } : undefined} />
                <div>
                  <div className="sf-line__name">{p.status === "active" ? <Link to={`/b/${p.business?.slug}/p/${p.id}`}>{p.name}</Link> : p.name}</div>
                  <p className="sf-muted">{p.business?.name} · {ok ? money(p.price) : p.status === "active" ? "Sold out" : "No longer available"}</p>
                </div>
                <div className="sf-split">
                  {ok && <Button size="sm" onClick={() => add(p)}>Add to cart</Button>}
                  <Button size="sm" variant="ghost" onClick={() => remove(p.id)}>Remove</Button>
                </div>
              </div></Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
