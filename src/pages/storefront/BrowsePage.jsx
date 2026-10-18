// src/pages/storefront/BrowsePage.jsx — NEW FILE (Phase 5 step 2)
//
// AIM
// /b/:slug/browse — every product of one shop: search by name, filter by category, sort by newest or
// price, and "Show more" to load the next page. The filters live in the address, so a link keeps them.

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Button, Card, EmptyState, Input, SelectInput, Skeleton } from "../../components/ui";
import useAsync from "../../hooks/useAsync.js";
import { SORTS, listShopCategories, listShopProducts } from "../../lib/api/storefront.js";
import { ProductCard, StoreGate, useWishlist } from "./shared.jsx";
import useSeo from "../../hooks/useSeo.js";

function Browse({ b }) {
  const [params, setParams] = useSearchParams();
  const category = params.get("category") || "";
  const sort = params.get("sort") || "new";
  const [search, setSearch] = useState(params.get("q") || "");
  const [term, setTerm] = useState(search);
  const [limit, setLimit] = useState(12);
  const wish = useWishlist();
  useSeo({ title: `Products | ${b.name}`, description: `Everything for sale at ${b.name}.`, path: `/b/${b.slug}/browse`, noindex: Boolean(params.get("q") || category || sort !== "new") });
  const { data: cats } = useAsync(() => listShopCategories(b.id), [b.id]);
  const { data: rows, error, loading } = useAsync(() => listShopProducts(b.id, { search: term, categoryId: category, sort, limit: limit + 1 }), [b.id, term, category, sort, limit]);

  useEffect(() => { const t = setTimeout(() => { setTerm(search); setLimit(12); }, 300); return () => clearTimeout(t); }, [search]);
  const set = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); setLimit(12); };
  const items = (rows || []).slice(0, limit);

  return (
    <>
      <h1 style={{ margin: 0 }}>All products</h1>
      <div className="sf-row">
        <Input label="Search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="What are you looking for?" />
        <div className="sf-row">
          <SelectInput label="Category" value={category} onChange={(v) => set("category", v)} options={[{ value: "", label: "All categories" }, ...(cats || []).map((c) => ({ value: c.id, label: c.name }))]} />
          <SelectInput label="Sort by" value={sort} onChange={(v) => set("sort", v === "new" ? "" : v)} options={Object.entries(SORTS).map(([value, s]) => ({ value, label: s.label }))} />
        </div>
      </div>
      {error ? <Alert type="error" message={error} /> : loading && !rows ? <div className="sf-grid">{[1, 2, 3, 4].map((n) => <Skeleton key={n} height={220} />)}</div>
        : items.length === 0 ? <Card><EmptyState icon="search" title="No products found" description="Try another word or category." compact /></Card>
        : <div className="sf-grid">{items.map((p) => <ProductCard key={p.id} product={p} slug={b.slug} wish={wish} />)}</div>}
      {(rows || []).length > limit && <div className="sf-more"><Button variant="outline" onClick={() => setLimit(limit + 12)}>Show more</Button></div>}
    </>
  );
}

export default function BrowsePage() { return <StoreGate>{(b) => <Browse b={b} />}</StoreGate>; }
