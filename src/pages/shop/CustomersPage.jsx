// src/pages/shop/CustomersPage.jsx — NEW FILE (Phase 5)
//
// AIM
// /app/:slug/customers — the people who have ordered from this shop, worked out from its orders
// (cancelled orders are not counted): how many orders, how much they spent, and when they last
// ordered. Search by name or phone, and tap the phone number to call.

import "./Shop.css";
import { useState } from "react";
import { Card, EmptyState, Input } from "../../components/ui";
import useAsync from "../../hooks/useAsync.js";
import { listShopCustomers } from "../../lib/api/shop.js";
import { formatDate } from "../../lib/format.js";
import { Loading, LoadError, PageHead, money, useShop } from "./shared.jsx";

export default function CustomersPage() {
  const { bid } = useShop();
  const { data, error, loading, reload } = useAsync(() => listShopCustomers(bid), [bid]);
  const [q, setQ] = useState("");

  if (loading && !data) return <Loading />;
  if (error) return <LoadError error={error} onRetry={reload} />;
  const term = q.trim().toLowerCase();
  const rows = (data || []).filter((c) => !term || (c.name || "").toLowerCase().includes(term) || (c.phone || "").includes(term));

  return (
    <div className="shop">
      <PageHead title="Customers" lead={data?.length ? `${data.length} customer${data.length === 1 ? "" : "s"}` : "People who order from you appear here."} />
      {data?.length > 0 && <div className="shop-bar"><Input label="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or phone number" /></div>}
      {rows.length === 0 ? (
        <Card><EmptyState icon="users" title={term ? "No customers match" : "No customers yet"} description={term ? "Try a different search." : "Once a shopper places an order they are listed here with what they have spent."} compact /></Card>
      ) : (
        <Card>
          <ul className="shop-list" style={{ padding: "0 var(--space-4)" }}>
            {rows.map((c) => (
              <li key={c.customer_id}>
                <div className="shop-list__main">
                  <span className="shop-list__title">{c.name}</span>
                  <span className="shop-list__sub"><a href={`tel:${c.phone}`}>{c.phone}</a> · last order {formatDate(c.last_order_at)}</span>
                </div>
                <div className="shop-list__end"><span className="shop-hint">{c.orders} order{c.orders === 1 ? "" : "s"}</span><span className="shop-amount">{money(c.spent)}</span></div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
