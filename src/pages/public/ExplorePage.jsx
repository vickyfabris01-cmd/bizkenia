// src/pages/public/ExplorePage.jsx — MODIFIED (a search also lists matching products, produce and rooms)
//
// AIM
// Browse every approved business with filters (search text, type, county). The filters live in
// the URL (?q=&type=&county=) so a search can be shared or bookmarked, and the back button works.
// The search text looks through business name, description, address and county. When there is
// search text, matching products, produce and rooms (name, description, business, county) are
// listed under the businesses, 4 of each, with a link to see all of them on /shop-rent.

import "./ExplorePage.css";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Card, EmptyState, Input, SelectInput } from "../../components/ui";
import BusinessCard, { BusinessCardSkeleton } from "../../components/business/BusinessCard.jsx";
import { BUSINESS_TYPES, COUNTIES } from "../../config/counties.js";
import useAsync from "../../hooks/useAsync.js";
import ListingCard, { ListingCardSkeleton } from "../../components/business/ListingCard.jsx";
import { listBusinesses } from "../../lib/api/directory.js";
import { MARKET_KINDS, listMarket, marketCard } from "../../lib/api/market.js";

// Explore filters by business type; listings are grouped by what is sold.
const KIND_OF_TYPE = { shop: "shop", agriculture: "farm", rental: "rooms" };
const PER_KIND = 4;

export default function ExplorePage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const type = params.get("type") || "";
  const county = params.get("county") || "";
  const [text, setText] = useState(q);

  useEffect(() => setText(q), [q]);

  function update(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  }

  const { data, error, loading } = useAsync(() => listBusinesses({ search: q, type, county }), [q, type, county]);
  const hasFilter = Boolean(q || type || county);

  // Products, produce and rooms that match the search text (only when something was typed).
  const kinds = type ? [KIND_OF_TYPE[type]].filter(Boolean) : MARKET_KINDS.map((k) => k.value);
  const { data: found, loading: foundLoading } = useAsync(async () => {
    if (!q) return { data: {}, error: null };
    const res = await Promise.all(kinds.map((kind) => listMarket({ kind, q, county, limit: PER_KIND })));
    return { data: Object.fromEntries(kinds.map((k, i) => [k, res[i].data])), error: null };
  }, [q, type, county]);
  const listingGroups = kinds
    .map((k) => ({
      ...MARKET_KINDS.find((m) => m.value === k),
      items: (found?.[k]?.items || []).map(marketCard(k)),
      total: found?.[k]?.total || 0,
    }))
    .filter((g) => g.items.length > 0);

  function seeAll(kind) {
    const next = new URLSearchParams({ q, type: kind });
    if (county) next.set("county", county);
    return `/shop-rent?${next.toString()}`;
  }

  return (
    <div className="pg">
      <h1 className="pg__title">Explore businesses</h1>
      <p className="pg__lead">Find rentals and, soon, farms and shops across Kenya.</p>

      <form className="explore-filters" onSubmit={(e) => { e.preventDefault(); update("q", text.trim()); }} role="search">
        <Input label="Search" placeholder="Name or place" value={text} onChange={(e) => setText(e.target.value)} />
        <SelectInput label="Type" value={type} onChange={(v) => update("type", v)} placeholder="All types"
          options={[{ value: "", label: "All types" }, ...BUSINESS_TYPES.filter((t) => t.open).map((t) => ({ value: t.value, label: t.label }))]} />
        <SelectInput label="County" value={county} onChange={(v) => update("county", v)}
          options={[{ value: "", label: "All counties" }, ...COUNTIES]} />
        <Button type="submit" className="explore-filters__go">Search</Button>
      </form>

      <div className="explore-results" aria-live="polite">
        {loading ? (
          <div className="pg-grid pg-grid--3">{[0, 1, 2, 3, 4, 5].map((i) => <BusinessCardSkeleton key={i} />)}</div>
        ) : error ? (
          <Card><EmptyState icon="info" title="Businesses could not be loaded" description={error} /></Card>
        ) : data.length === 0 ? (
          <Card>
            <EmptyState icon="search" title={hasFilter ? "No business matches your search" : "No businesses yet"}
              description={listingGroups.length ? "Some products, produce or rooms do match, see below." : hasFilter ? "Try a different name or place, or clear the filters." : "Approved businesses will appear here."}
              action={hasFilter ? <Button variant="outline" onClick={() => setParams({}, { replace: true })}>Clear filters</Button> : <Button as={Link} to="/start" variant="outline">List your business</Button>} />
          </Card>
        ) : (
          <>
            <p className="explore-count">{data.length} {data.length === 1 ? "business" : "businesses"}</p>
            <div className="pg-grid pg-grid--3">{data.map((b) => <BusinessCard key={b.id} business={b} />)}</div>
          </>
        )}
      </div>

      {q && (foundLoading || listingGroups.length > 0) && (
        <section className="explore-listings" aria-labelledby="explore-listings-h" aria-live="polite">
          <h2 id="explore-listings-h" className="explore-listings__title">Products, produce and rooms</h2>
          {foundLoading ? (
            <div className="explore-listings__row">{[0, 1, 2, 3].map((i) => <ListingCardSkeleton key={i} />)}</div>
          ) : listingGroups.map((g) => (
            <div key={g.value} className="explore-listings__group">
              <div className="explore-listings__head">
                <h3>{g.label}</h3>
                {g.total > g.items.length && <Link to={seeAll(g.value)}>See all {g.total}</Link>}
              </div>
              <div className="explore-listings__row">
                {g.items.map((it) => <ListingCard key={it.key} listing={it} />)}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}