// src/pages/public/ExplorePage.jsx — MODIFIED (businesses in sections like Shop and rent; product results on a search)
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
//
// With no type chosen the page shows three sections (Shops, Farms, Rentals) of at most 8 businesses
// each, as a two-row .crow (CardRows.css): from 640px the row shows only full rows, on phones every
// card is in a sideways-scrolling row. "See all N" opens the same search for that one type, and
// shows whenever some cards could be hidden. Choosing a type shows just that type as a .cgrid,
// 12 at a time with "Show more".
// With search text the page also looks through products, produce and rooms (10 of each kind, as
// two-row .crow rows) under "Products, produce and rooms". A chosen type narrows that to the kind
// that goes with it, a chosen county applies to it too, and "See all N" opens Shop and rent.

import "./ExplorePage.css";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Card, EmptyState, Icon, Input, SelectInput } from "../../components/ui";
import BusinessCard, { BusinessCardSkeleton } from "../../components/business/BusinessCard.jsx";
import ListingCard, { ListingCardSkeleton } from "../../components/business/ListingCard.jsx";
import { BUSINESS_TYPES, COUNTIES, typeLabel } from "../../config/counties.js";
import useAsync from "../../hooks/useAsync.js";
import { listBusinesses } from "../../lib/api/directory.js";
import { MARKET_KINDS, listMarket, marketCard } from "../../lib/api/market.js";

const PER_SECTION = 10; // businesses per section when no type is chosen (two rows of 5 on a wide screen)
const PREVIEW_MIN = 6;  // fewest businesses a preview shows from 640px (3 columns x 2 rows): more than this needs "See all"
const PAGE = 20;        // businesses per step when one type is chosen (fills whole rows at 2, 4 and 5 columns)
const MAX = 120;        // the most the page loads for one type
const LISTINGS = 10;    // products, produce or rooms per kind in the search results (two rows of 5)
const LISTING_MIN = 6;  // fewest of them a preview shows from 640px (3 columns x 2 rows)

// The sections shown when no type is chosen, in this order.
const SECTIONS = [
  { type: "shop", label: "Shops" },
  { type: "agriculture", label: "Farms" },
  { type: "rental", label: "Rentals" },
];
// Which kind of listing belongs to which business type.
const KIND_OF = { shop: "shop", agriculture: "farm", rental: "rooms" };

export default function ExplorePage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const type = params.get("type") || "";
  const county = params.get("county") || "";
  const [text, setText] = useState(q);
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState(false); // filters panel (phones only; always shown from 768px)

  useEffect(() => setText(q), [q]);

  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) { if (v) next.set(k, v); else next.delete(k); }
    setParams(next, { replace: true });
    setLimit(PAGE);
  }

  // A search always starts fresh: type and county are cleared. Filters come after it.
  function submitSearch(e) {
    e.preventDefault();
    update({ q: text.trim(), type: "", county: "" });
  }

  // Businesses: one call per section (or one call for the chosen type).
  const types = type ? [type] : SECTIONS.map((s) => s.type);
  const perType = type ? limit : PER_SECTION;
  const { data, error, loading } = useAsync(async () => {
    const res = await Promise.all(types.map((t) => listBusinesses({ search: q, type: t, county, limit: perType })));
    if (res.every((r) => r.error)) return { data: null, error: res[0].error };
    return { data: Object.fromEntries(types.map((t, i) => [t, { items: res[i].data || [], total: res[i].count ?? 0 }])), error: null };
  }, [q, type, county, perType]);

  // Products, produce and rooms: only when there is search text.
  const kinds = type ? [KIND_OF[type]].filter(Boolean) : MARKET_KINDS.map((k) => k.value);
  const { data: found, loading: foundLoading } = useAsync(async () => {
    if (!q || kinds.length === 0) return { data: {}, error: null };
    const res = await Promise.all(kinds.map((kind) => listMarket({ kind, q, county, limit: LISTINGS })));
    return { data: Object.fromEntries(kinds.map((k, i) => [k, res[i].data])), error: null };
  }, [q, type, county]);

  const bizSections = types
    .map((t) => ({
      type: t,
      label: SECTIONS.find((s) => s.type === t)?.label || typeLabel(t),
      items: data?.[t]?.items || [],
      total: data?.[t]?.total || 0,
    }))
    .filter((s) => s.items.length > 0);

  const listSections = MARKET_KINDS
    .filter((k) => kinds.includes(k.value))
    .map((k) => ({ ...k, items: (found?.[k.value]?.items || []).map(marketCard(k.value)), total: found?.[k.value]?.total || 0 }))
    .filter((s) => s.items.length > 0);

  const foundPending = Boolean(q) && foundLoading && !found; // the listings are still on their way
  const nothing = bizSections.length === 0 && listSections.length === 0 && !foundPending;

  // Everything that is narrowing the results, so an empty page can say why.
  const applied = [
    q && { key: "q", label: `Search: “${q}”`, clear: { q: "" } },
    type && { key: "type", label: `Type: ${typeLabel(type)}`, clear: { type: "" } },
    county && { key: "county", label: `County: ${county}`, clear: { county: "" } },
  ].filter(Boolean);

  // How many of the filters behind the button are on (shown as a number on it).
  const activeCount = [type, county].filter(Boolean).length;

  // The same search, for one business type.
  function seeAll(t) {
    const next = new URLSearchParams(params);
    next.set("type", t);
    return `/explore?${next.toString()}`;
  }
  // The same search on Shop and rent, for one kind of listing.
  function seeAllListings(kind) {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (county) next.set("county", county);
    next.set("type", kind);
    return `/shop-rent?${next.toString()}`;
  }

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

      <div className="explore-results" aria-live="polite" aria-busy={loading}>
        {loading && !data ? (
          <div className="crow crow--biz" data-rows="2">{[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => <BusinessCardSkeleton key={i} />)}</div>
        ) : error ? (
          <Card><EmptyState icon="info" title="Businesses could not be loaded" description={error} /></Card>
        ) : nothing ? (
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
                  <Button variant="outline" onClick={() => { setParams({}, { replace: true }); setLimit(PAGE); setText(""); }}>Clear everything</Button>
                </div>
              ) : <Button as={Link} to="/start" variant="outline">List your business</Button>} />
          </Card>
        ) : (
          <div className={`explore${loading ? " is-loading" : ""}`}>
            {bizSections.map((s) => (
              <section key={s.type} className="explore__section" aria-labelledby={`explore-${s.type}`}>
                <div className="explore__head">
                  <h2 id={`explore-${s.type}`}>{s.label}</h2>
                  <span className="explore__count">{s.total} {s.total === 1 ? "business" : "businesses"}</span>
                  {!type && s.total > PREVIEW_MIN && <Link className="explore__more-link" to={seeAll(s.type)}>See all {s.total}</Link>}
                </div>
                <div className={type ? "cgrid cgrid--biz" : "crow crow--biz"} data-rows={type ? undefined : "2"}>
                  {s.items.map((b) => <BusinessCard key={b.id} business={b} />)}
                </div>
                {type && s.items.length < s.total && limit < MAX && (
                  <div className="explore__more">
                    <Button variant="outline" loading={loading} onClick={() => setLimit(limit + PAGE)}>Show more</Button>
                  </div>
                )}
                {type && s.items.length < s.total && limit >= MAX && (
                  <p className="explore__count">Showing the first {MAX}. Narrow the search or pick a county to see the rest.</p>
                )}
              </section>
            ))}

            {q && (listSections.length > 0 || foundPending) && (
              <section className="explore__section" aria-labelledby="explore-found">
                <h2 id="explore-found" className="explore__sub">Products, produce and rooms</h2>
                {foundPending ? (
                  <div className="crow crow--listing" data-rows="1">{[0, 1, 2, 3, 4].map((i) => <ListingCardSkeleton key={i} />)}</div>
                ) : listSections.map((s) => (
                  <div key={s.value} className="explore__group">
                    <div className="explore__head">
                      <h3>{s.label}</h3>
                      <span className="explore__count">{s.total} {s.total === 1 ? "result" : "results"}</span>
                      {s.total > LISTING_MIN && <Link className="explore__more-link" to={seeAllListings(s.value)}>See all {s.total}</Link>}
                    </div>
                    <div className="crow crow--listing" data-rows="2">
                      {s.items.map((it) => <ListingCard key={it.key} listing={it} />)}
                    </div>
                  </div>
                ))}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
