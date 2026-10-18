// src/pages/shop/ShopDashboard.jsx — NEW FILE (Phase 5)
//
// AIM
// /app/:slug — the shop owner's home: new orders waiting, sales in the last 30 days, products on
// sale, products low or out of stock, the five latest orders, and a short "get started" list
// while the shop has no products yet.

import "./Shop.css";
import { Link } from "react-router-dom";
import { Button, Card, CardBody, CardHeader, EmptyState } from "../../components/ui";
import useAsync from "../../hooks/useAsync.js";
import { getShopOverview } from "../../lib/api/shop.js";
import { formatDateTime } from "../../lib/format.js";
import { Loading, LoadError, OrderBadge, PageHead, Stat, money, useShop } from "./shared.jsx";

export default function ShopDashboard() {
  const { business, bid, base, role } = useShop();
  const { data, error, loading, reload } = useAsync(() => getShopOverview(bid), [bid]);
  if (loading && !data) return <Loading />;
  if (error) return <LoadError error={error} onRetry={reload} />;
  const d = data;

  return (
    <div className="shop">
      <PageHead title={business.name} lead="Your shop at a glance." />

      <div className="shop-stats">
        <Stat label="New orders" value={d.newOrders} note={d.newOrders ? "Waiting for you" : "All caught up"} to={`${base}/orders`} tone={d.newOrders ? "warn" : undefined} />
        <Stat label="Sales, last 30 days" value={money(d.revenue30)} note="Cancelled orders excluded" tone="good" />
        <Stat label="Products on sale" value={d.activeProducts} to={`${base}/products`} />
        <Stat label="Low or out of stock" value={d.lowStock} to={`${base}/inventory`} tone={d.lowStock ? "bad" : undefined} />
      </div>

      {!d.anyProducts && (
        <Card>
          <CardHeader title="Get your shop ready" />
          <CardBody>
            <ol className="shop-hint" style={{ paddingLeft: "var(--space-5)", display: "grid", gap: "var(--space-2)" }}>
              <li>Add your first product with a photo and a price, and set it to On sale.</li>
              <li>Set your delivery fee and pickup in Settings.{role === "owner" ? "" : " (The owner does this.)"}</li>
              <li>Upload your logo and cover photo in Settings so your shop looks right to shoppers.</li>
            </ol>
            <div className="shop-split"><Button as={Link} to={`${base}/products`}>Add a product</Button>{role === "owner" && <Button as={Link} to={`${base}/settings`} variant="outline">Open settings</Button>}</div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Latest orders" action={<Button as={Link} to={`${base}/orders`} size="sm" variant="ghost">All orders</Button>} />
        <CardBody>
          {d.recent.length === 0 ? <EmptyState icon="file" compact title="No orders yet" description="Orders appear here as soon as shoppers place them." /> : (
            <ul className="shop-list">
              {d.recent.map((o) => (
                <li key={o.id}>
                  <div className="shop-list__main"><span className="shop-list__title">{o.order_number}</span><span className="shop-list__sub">{o.customer_name} · {formatDateTime(o.created_at)}</span></div>
                  <div className="shop-list__end"><OrderBadge status={o.status} /><span className="shop-amount">{money(o.total)}</span></div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
