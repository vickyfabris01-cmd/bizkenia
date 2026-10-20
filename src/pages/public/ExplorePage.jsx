// src/pages/public/ExplorePage.jsx — MODIFIED (compact search bar; filters tucked behind a button on phones)
//
// AIM
// Browse every approved business with filters (search text, type, county). The filters live in
// the URL (?q=&type=&county=) so a search can be shared or bookmarked, and the back button works.
// The controls are kept small: on a phone a single row holds the search box, its button and a
// "Filters" button (with a count of what is active) that opens type and county; from 768px
// everything sits on one row.
// Search works on its own: every search clears the type and county, so old settings never narrow
// a new search without the person knowing. Filters are used AFTER a search.
// If nothing matches, the page lists what is applied and each one can be removed on its own.

import "./ExplorePage.css";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Card, EmptyState, Icon, Input, SelectInput } from "../../components/ui";
import BusinessCard, { BusinessCardSkeleton } from "../../components/business/BusinessCard.jsx";
import { BUSINESS_TYPES, COUNTIES, typeLabel } from "../../config/counties.js";
import useAsync from "../../hooks/useAsync.js";
import { listBusinesses } from "../../lib/api/directory.js";

export default function ExplorePage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const type = params.get("type") || "";
  const county = params.get("county") || "";
  const [text, setText] = useState(q);
  const [open, setOpen] = useState(false); // filters panel (phones only; always shown from 768px)

  useEffect(() => setText(q), [q]);

  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) { if (v) next.set(k, v); else next.delete(k); }
    setParams(next, { replace: true });
  }

  // A search always starts fresh: type and county are cleared. Filters come after it.
  function submitSearch(e) {
    e.preventDefault();
    update({ q: text.trim(), type: "", county: "" });
  }

  const { data, error, loading } = useAsync(() => listBusinesses({ search: q, type, county }), [q, type, county]);

  // Everything that is narrowing the results, so an empty page can say why.
  const applied = [
    q && { key: "q", label: `Search: “${q}”`, clear: { q: "" } },
    type && { key: "type", label: `Type: ${typeLabel(type)}`, clear: { type: "" } },
    county && { key: "county", label: `County: ${county}`, clear: { county: "" } },
  ].filter(Boolean);

  // How many of the filters behind the button are on (shown as a number on it).
  const activeCount = [type, county].filter(Boolean).length;

  return (
    <div className="pg">
      <h1 className="pg__title">Explore businesses</h1>
      <p className="pg__lead explore__lead">Find rentals, shops and farms across Kenya.</p>

      <div className="explore-bar">
        <form className="explore-search" onSubmit={submitSearch} role="search">
          <Input className="explore-search__input" aria-label="Search businesses by name or place"
            placeholder="Search by name or place" value={text} onChange={(e) => setText(e.target.value)} />
          <Button type="submit" aria-label="Search" className="explore-search__go"><Icon name="search" size={20} /></Button>
        </form>

        <button type="button" className="explore-toggle" aria-expanded={open} aria-controls="explore-panel" onClick={() => setOpen(!open)}>
          <span>Filters</span>
          {activeCount > 0 && <span className="explore-toggle__n" aria-label={`${activeCount} active`}>{activeCount}</span>}
          <Icon name="chevron-down" size={16} />
        </button>

        <div id="explore-panel" className={`explore-panel${open ? " is-open" : ""}`}>
          <SelectInput aria-label="Type" value={type} onChange={(v) => update({ type: v })}
            options={[{ value: "", label: "All types" }, ...BUSINESS_TYPES.filter((t) => t.open).map((t) => ({ value: t.value, label: t.label }))]} />
          <SelectInput aria-label="County" value={county} onChange={(v) => update({ county: v })}
            options={[{ value: "", label: "All counties" }, ...COUNTIES]} />
        </div>
      </div>

      <div className="explore-results" aria-live="polite">
        {loading ? (
          <div className="pg-grid pg-grid--3">{[0, 1, 2, 3, 4, 5].map((i) => <BusinessCardSkeleton key={i} />)}</div>
        ) : error ? (
          <Card><EmptyState icon="info" title="Businesses could not be loaded" description={error} /></Card>
        ) : data.length === 0 ? (
          <Card>
            <EmptyState icon="search"
              title={applied.length ? "No business matches these settings" : "No businesses yet"}
              description={applied.length ? "This is what is applied right now. Remove one to see more." : "Approved businesses will appear here."}
              action={applied.length ? (
                <div className="explore__applied">
                  <ul className="explore__chips" aria-label="Applied search and filters">
                    {applied.map((a) => (
                      <li key={a.key}>
                        <button type="button" className="explore__chip" onClick={() => update(a.clear)} aria-label={`Remove ${a.label}`}>
                          <span>{a.label}</span><Icon name="x" size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <Button variant="outline" onClick={() => { setParams({}, { replace: true }); setText(""); }}>Clear everything</Button>
                </div>
              ) : <Button as={Link} to="/start" variant="outline">List your business</Button>} />
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