// src/pages/public/ExplorePage.jsx — NEW FILE
//
// AIM
// Browse every approved business with filters (search text, type, county). The filters live in
// the URL (?q=&type=&county=) so a search can be shared or bookmarked, and the back button works.

import "./ExplorePage.css";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Card, EmptyState, Input, SelectInput } from "../../components/ui";
import BusinessCard, { BusinessCardSkeleton } from "../../components/business/BusinessCard.jsx";
import { BUSINESS_TYPES, COUNTIES } from "../../config/counties.js";
import useAsync from "../../hooks/useAsync.js";
import { listBusinesses } from "../../lib/api/directory.js";

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
              description={hasFilter ? "Try a different name or clear the filters." : "Approved businesses will appear here."}
              action={hasFilter ? <Button variant="outline" onClick={() => setParams({}, { replace: true })}>Clear filters</Button> : <Button as={Link} to="/start" variant="outline">List your business</Button>} />
          </Card>
        ) : (
          <>
            <p className="explore-count">{data.length} {data.length === 1 ? "business" : "businesses"}</p>
            <div className="pg-grid pg-grid--3">{data.map((b) => <BusinessCard key={b.id} business={b} />)}</div>
          </>
        )}
      </div>
    </div>
  );
}