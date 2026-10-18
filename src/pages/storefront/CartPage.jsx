// src/pages/storefront/CartPage.jsx — NEW FILE (Phase 5 step 2)
//
// AIM
// /b/:slug/cart — the cart for one shop. Refreshes price and stock from the database when it opens
// (a product that sold out or went off sale is taken out, with a notice), lets the shopper change
// quantities, and leads to checkout. Delivery is added at checkout, from the shop's settings.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Alert, Button, Card, EmptyState } from "../../components/ui";
import { getProductsByIds } from "../../lib/api/storefront.js";
import { lineTotal, useCart } from "../../store/cartStore.js";
import { CartLines, StoreGate, money } from "./shared.jsx";

function Cart({ b }) {
  const navigate = useNavigate();
  const all = useCart((s) => s.lines);
  const lines = all.filter((l) => l.businessId === b.id);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const mine = useCart.getState().linesFor(b.id);
    if (!mine.length) return;
    getProductsByIds(mine.map((l) => l.productId)).then((r) => {
      if (!r.data) return;
      const gone = mine.filter((l) => { const row = r.data.find((x) => x.id === l.productId); return row && (row.status !== "active" || row.stock < 1); });
      useCart.getState().refresh(r.data);
      if (gone.length) setNotice(`${gone.map((g) => g.name).join(", ")} ${gone.length > 1 ? "are" : "is"} no longer available and was taken out of your cart.`);
    });
  }, [b.id]);

  if (!lines.length) {
    return <Card><EmptyState icon="search" title="Your cart is empty" description="Add something you like and it will wait for you here." action={<Button as={Link} to={`/b/${b.slug}/browse`}>Browse products</Button>} /></Card>;
  }
  return (
    <>
      <h1 style={{ margin: 0 }}>Your cart</h1>
      {notice && <Alert type="warning" message={notice} />}
      <div className="sf-checkout">
        <Card><CartLines lines={lines} /></Card>
        <Card>
          <div className="sf-sum">
            <div><span>Subtotal</span><span>{money(lineTotal(lines))}</span></div>
            <p className="sf-muted">Delivery is added at checkout.</p>
            <Button fullWidth size="lg" onClick={() => navigate(`/b/${b.slug}/checkout`)}>Checkout</Button>
            <Button fullWidth variant="ghost" as={Link} to={`/b/${b.slug}/browse`}>Keep shopping</Button>
          </div>
        </Card>
      </div>
    </>
  );
}

export default function CartPage() { return <StoreGate>{(b) => <Cart b={b} />}</StoreGate>; }
