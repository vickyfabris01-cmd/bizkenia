// src/pages/public/ShopRentPage.jsx — MODIFIED (search starts fresh; empty result lists what is applied)
//
// AIM
// /shop-rent — shop products, farm produce and rooms to rent in one place. One search box looks
// through all three types. Two filters, type first, then county (only counties that have items of
// the chosen type), and a sort (newest, price low to high, price high to low).
// Search works on its own: every search clears the type, county and sort, so old settings never
// narrow a new search without the person knowing. Filters and sorting are used AFTER a search.
// If nothing matches, the page lists what is applied (search, type, county) and each one can be
// removed on its own.
// With no type chosen the page shows three sections of at most 8 cards each (2 rows); choosing a
// type shows only that type, 24 at a time with "Show more". Everything lives in the address
// (?q=&type=&county=&sort=) so a search can be shared and the back button works.

import "./ShopRentPage.css";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Card, EmptyState, Icon, Input, SelectInput } from "../../components/ui";
import ListingCard, { ListingCardSkeleton } from "../../components/business/ListingCard.jsx";
import useAsync from "../../hooks/useAsync.js";
import { MARKET_KINDS, MARKET_SORTS, listMarket, listMarketCounties } from "../../lib/api/market.js";
import { formatKsh } from "../../lib/format.js";

const PER_SECTION = 8;  // cards per section when no type is chosen
const PAGE = 24;        // cards per step when one type is chosen
const MAX = 120;        // the database never returns more than this at once

const perUnit = (u) => (u && u !== "item" ? ` / ${u}` : "");
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

function toCard(kind) {
  return (x) => ({
    key: x.id,
    to: kind === "shop" ? `/b/${x.business_slug}/p/${x.id}` : `/b/${x.business_slug}`,
    image: x.image,
    title: kind === "rooms" && x.building_name ? `${x.title} · ${x.building_name}` : x.title,
    price: kind === "rooms" ? `${formatKsh(x.price)} / month` : `${formatKsh(x.price)}${perUnit(x.unit)}`,
    place: [x.business_name, x.county].filter(Boolean).join(" · "),
    badge: kind === "rooms" ? cap(x.room_type) : undefined,
  });
}

export default function ShopRentPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const rawType = params.get("type") || "";
  const type = MARKET_KINDS.some((k) => k.value === rawType) ? rawType : "";
  const county = params.get("county") || "";
  const rawSort = params.get("sort") || "new";
  const sort = MARKET_SORTS.some((s) => s.value === rawSort) ? rawSort : "new";
  const [text, setText] = useState(q);
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => setText(q), [q]);

  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) { if (v) next.set(k, v); else next.delete(k); }
    setParams(next, { replace: true });
    setLimit(PAGE);
  }

  // A search always starts fresh: type, county and sort are cleared. Filters and sort come after it.
  function submitSearch(e) {
    e.preventDefault();
    update({ q: text.trim(), type: "", county: "", sort: "" });
  }

  // Step 2 of the filter: counties that have items of the chosen type.
  const { data: countyList } = useAsync(() => listMarketCounties(type), [type]);
  useEffect(() => {
    if (county && countyList && !countyList.includes(county)) update({ county: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countyList]);
  const countyOptions = [
    { value: "", label: "All counties" },
    ...(countyList || []).map((c) => ({ value: c, label: c })),
    ...(county && !(countyList || []).includes(county) ? [{ value: county, label: county }] : []),
  ];

  const kinds = type ? [type] : MARKET_KINDS.map((k) => k.value);
  const perKind = type ? limit : PER_SECTION;
  const { data, error, loading } = useAsync(async () => {
    const res = await Promise.all(kinds.map((kind) => listMarket({ kind, q, county, sort, limit: perKind })));
    if (res.every((r) => r.error)) return { data: null, error: res[0].error };
    return { data: Object.fromEntries(kinds.map((k, i) => [k, res[i].data])), error: null };
  }, [q, type, county, sort, perKind]);

  const sections = kinds
    .map((k) => ({
      ...MARKET_KINDS.find((m) => m.value === k),
      items: (data?.[k]?.items || []).map(toCard(k)),
      total: data?.[k]?.total || 0,
    }))
    .filter((s) => s.items.length > 0);

  // Everything that is narrowing the results, so an empty page can say why.
  const applied = [
    q && { key: "q", label: `Search: “${q}”`, clear: { q: "" } },
    type && { key: "type", label: `Type: ${MARKET_KINDS.find((k) => k.value === type)?.label}`, clear: { type: "" } },
    county && { key: "county", label: `County: ${county}`, clear: { county: "" } },
  ].filter(Boolean);

  function seeAll(kind) {
    const next = new URLSearchParams(params);
    next.set("type", kind);
    return `/shop-rent?${next.toString()}`;
  }

  return (
    <div className="pg">
      <h1 className="pg__title">Shop and rent</h1>
      <p className="pg__lead">Products from shops, fresh produce from farms and rooms to rent, all in one place.</p>

      <form className="shoprent-filters" onSubmit={submitSearch} role="search">
        <Input label="Search" placeholder="Product, produce, room or place" value={text} onChange={(e) => setText(e.target.value)} />
        <SelectInput label="Type" value={type} onChange={(v) => update({ type: v })}
          options={[{ value: "", label: "All types" }, ...MARKET_KINDS]} />
        <SelectInput label="County" value={county} onChange={(v) => update({ county: v })} options={countyOptions} />
        <SelectInput label="Sort by" value={sort} onChange={(v) => update({ sort: v === "new" ? "" : v })} options={MARKET_SORTS} />
        <Button type="submit" className="shoprent-filters__go">Search</Button>
      </form>

      <div aria-live="polite" aria-busy={loading}>
        {loading && !data ? (
          <div className="shoprent__grid shoprent__grid--preview">{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <ListingCardSkeleton key={i} />)}</div>
        ) : error ? (
          <Card><EmptyState icon="info" title="Listings could not be loaded" description={error} /></Card>
        ) : sections.length === 0 ? (
          <Card>
            <EmptyState icon="search"
              title={applied.length ? "Nothing matches these settings" : "Nothing listed yet"}
              description={applied.length ? "This is what is applied right now. Remove one to see more." : "New products, produce and rooms will appear here."}
              action={applied.length ? (
                <div className="shoprent__applied">
                  <ul className="shoprent__chips" aria-label="Applied search and filters">
                    {applied.map((a) => (
                      <li key={a.key}>
                        <button type="button" className="shoprent__chip" onClick={() => update(a.clear)} aria-label={`Remove ${a.label}`}>
                          <span>{a.label}</span><Icon name="x" size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <Button variant="outline" onClick={() => { setParams({}, { replace: true }); setLimit(PAGE); setText(""); }}>Clear everything</Button>
                </div>
              ) : <Button as={Link} to="/explore" variant="outline">Explore businesses</Button>} />
          </Card>
        ) : (
          <div className={`shoprent${loading ? " is-loading" : ""}`}>
            {sections.map((s) => (
              <section key={s.value} className="shoprent__section" aria-labelledby={`shoprent-${s.value}`}>
                <div className="shoprent__head">
                  <h2 id={`shoprent-${s.value}`}>{s.label}</h2>
                  <span className="shoprent__count">{s.total} {s.total === 1 ? "result" : "results"}</span>
                  {!type && s.total > PER_SECTION && <Link className="shoprent__more-link" to={seeAll(s.value)}>See all {s.total}</Link>}
                </div>
                <div className={`shoprent__grid${type ? "" : " shoprent__grid--preview"}`}>
                  {s.items.map((it) => <ListingCard key={it.key} listing={it} />)}
                </div>
                {type && s.items.length < s.total && limit < MAX && (
                  <div className="shoprent__more">
                    <Button variant="outline" loading={loading} onClick={() => setLimit(limit + PAGE)}>Show more</Button>
                  </div>
                )}
                {type && s.items.length < s.total && limit >= MAX && (
                  <p className="shoprent__count">Showing the first {MAX}. Narrow the search or pick a county to see the rest.</p>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}