// src/pages/public/HomePage.jsx — MODIFIED (square cards in one-row .crow rows: 5 products and 4 businesses per type)
//
// AIM
// The front door, written for someone who just wants to FIND a business: search by name
// or place, see the latest products and rooms, browse the latest businesses and the types.
// Owners get one short, clearly separate section near the bottom ("Own a business?"), not the
// main message. Signed-in visitors see the same page with a greeting, and a signed-in owner
// sees a link to their businesses instead of the sales pitch. Everything shown is real: the
// lists come from the database (skeleton, then cards, or a friendly message).
//
// Hero: kept to about a quarter of a phone screen. The paragraph has three lengths (phone, tablet,
// desktop) chosen by CSS, and the search box and button share one row on every screen. The search
// opens /explore?q=, which looks through businesses (name, description, address, county) and
// through products, produce and rooms (name, description, business, building, county).
//
// Latest products & rentals: up to 5 shop products, 5 farm produce items and 5 available rooms
// (one database call, home_listings). Each type is its own one-row .crow (see CardRows.css). The
// page always receives 5 of each; from 640px CSS shows one full row (3, 4 or 5 cards) and under
// 640px every card is in a sideways-scrolling row (about 2.3 cards in view).
//
// Latest businesses: the 4 newest shops, 4 newest farms and 4 newest rentals, one one-row .crow per
// type (three database calls). The page always receives 4 of each; from 640px CSS shows one full
// row (2, 3 or 4 cards) and under 640px every card is in a scrolling row (one card in view).
//
// Hero background: the super admin uploads photos in Settings. The photo showing now comes from
// current_hero_image(). It is fetched and downloaded by lib/heroPreload.js, which main.jsx starts
// before React renders and which remembers the result for the whole session. Until it is ready the
// page shows a grey skeleton of itself, then the real page draws in one go. If there is no photo,
// or it cannot load, or it takes too long, the original plain green hero is used.

import "./HomePage.css";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, Button, Card, EmptyState, Icon, Skeleton } from "../../components/ui";
import BusinessCard, { BusinessCardSkeleton } from "../../components/business/BusinessCard.jsx";
import ListingCard, { ListingCardSkeleton } from "../../components/business/ListingCard.jsx";
import { BUSINESS_TYPES } from "../../config/counties.js";
import useAsync from "../../hooks/useAsync.js";
import useBrand from "../../hooks/useBrand.js";
import { listBusinesses, listHomeListings } from "../../lib/api/directory.js";
import { formatKsh } from "../../lib/format.js";
import { useHeroPreload } from "../../lib/heroPreload.js";
import { useSession } from "../../store/sessionStore.js";
import { useBusinessStore } from "../../store/businessStore.js";

const OWNER_STEPS = [
  "Create your account and choose your business type.",
  "Add your details and pay the subscription by M-Pesa.",
  "Get approved, go live and start managing.",
];

// Latest businesses: one row per type, in this order, 4 of each.
const BIZ_ROWS = [
  { type: "shop", label: "Shops" },
  { type: "agriculture", label: "Farms" },
  { type: "rental", label: "Rentals" },
];

// Three calls, one per type, newest first. Only an error if every call failed.
async function loadLatestBusinesses() {
  const results = await Promise.all(BIZ_ROWS.map((r) => listBusinesses({ type: r.type, limit: 4 })));
  if (results.every((r) => r.error)) return { data: null, error: results[0].error };
  return { data: Object.fromEntries(BIZ_ROWS.map((r, i) => [r.type, results[i].data || []])), error: null };
}

// ---- turn database rows into card details ----------------------------------------------
const perUnit = (u) => (u && u !== "item" ? ` / ${u}` : "");
const where = (x) => [x.business_name, x.county].filter(Boolean).join(" · ");

const shopCard = (p) => ({ key: p.id, to: `/b/${p.business_slug}/p/${p.id}`, image: p.images?.[0], title: p.name, price: `${formatKsh(p.price)}${perUnit(p.unit)}`, place: where(p) });
const farmCard = (p) => ({ key: p.id, to: `/b/${p.business_slug}`, image: p.images?.[0], title: p.name, price: `${formatKsh(p.price)}${perUnit(p.unit)}`, place: where(p) });
// one card per room type (a block of identical rooms is one card), with how many are still free
const roomCard = (r) => ({
  key: r.id, to: `/b/${r.business_slug}`, image: r.images?.[0],
  title: `${r.name}${r.building_name ? ` · ${r.building_name}` : ""}`,
  price: `${formatKsh(r.monthly_price)} / month`, place: where(r), badge: `${r.available} available`,
});

// Grey wireframe of the whole page, same layout as the real one, shown until the hero is ready.
function HomeSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading">
      <section className="home-hero" aria-hidden="true">
        <div className="home-hero__inner">
          <Skeleton height={44} width="min(520px, 90%)" />
          <Skeleton height={18} width="min(460px, 80%)" />
          <div className="home-search">
            <Skeleton height={44} style={{ flex: 1 }} />
            <Skeleton height={44} width={48} />
          </div>
        </div>
      </section>

      <section className="pg" aria-hidden="true">
        <div className="home-list__head"><Skeleton height={28} width={240} /></div>
        <div className="crow crow--listing" data-rows="1">{[0, 1, 2, 3, 4].map((i) => <ListingCardSkeleton key={i} />)}</div>
      </section>

      <section className="pg" aria-hidden="true">
        <div className="home-list__head"><Skeleton height={28} width={200} /></div>
        <div className="crow crow--biz" data-rows="1">{[0, 1, 2, 3].map((i) => <BusinessCardSkeleton key={i} />)}</div>
      </section>

      <section className="pg" aria-hidden="true">
        <Skeleton height={28} width={180} style={{ marginBottom: "var(--space-3)" }} />
        <div className="pg-grid pg-grid--3">
          {[0, 1, 2].map((i) => <Skeleton key={i} height={110} style={{ borderRadius: "var(--radius-lg)" }} />)}
        </div>
      </section>
    </div>
  );
}

export default function HomePage() {
  const brand = useBrand();
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  const profile = useSession((s) => s.profile);
  const memberships = useBusinessStore((s) => s.memberships);
  const [term, setTerm] = useState("");
  const { data, error, loading } = useAsync(loadLatestBusinesses, []);
  const { data: listings, error: listError, loading: listLoading } = useAsync(() => listHomeListings(5), []);
  const hero = useHeroPreload(); // { ready, url }; url is "" when the plain green hero is used
  const first = (profile?.full_name || "").split(" ")[0];
  const ownsBusiness = Boolean(user) && memberships.length > 0;

  // One row per type; a type with nothing to show is left out.
  const groups = [
    { key: "shop", label: "Shop products", more: "/explore?type=shop", items: (listings?.shop || []).map(shopCard) },
    { key: "farm", label: "Farm produce", more: "/explore?type=agriculture", items: (listings?.farm || []).map(farmCard) },
    { key: "rooms", label: "Rooms to rent", more: "/explore?type=rental", items: (listings?.rooms || []).map(roomCard) },
  ].filter((g) => g.items.length > 0);

  const bizGroups = BIZ_ROWS.map((r) => ({ ...r, items: data?.[r.type] || [] })).filter((g) => g.items.length > 0);

  function search(e) {
    e.preventDefault();
    const q = new URLSearchParams();
    if (term.trim()) q.set("q", term.trim());
    const s = q.toString();
    navigate(`/explore${s ? `?${s}` : ""}`);
  }

  // The lists keep loading in the background while the skeleton shows.
  if (!hero.ready) return <HomeSkeleton />;

  return (
    <>
      <section
        className={`home-hero${hero.url ? " home-hero--image" : ""}`}
        style={hero.url ? { backgroundImage: `url("${hero.url}")` } : undefined}
      >
        <div className="home-hero__inner">
          <h1 className="home-hero__title">
            {first ? `Hello, ${first}. What are you looking for?` : "Find rentals and local businesses across Kenya"}
          </h1>
          <p className="home-hero__lead">
            <span className="home-hero__lead--s">Shop products, farm produce, rooms to rent and local businesses across Kenya, all in one place. Search by name, item or county.</span>
            <span className="home-hero__lead--m">Search shop products, fresh farm produce, rooms to rent and local businesses across Kenya. See where they are and contact them directly, no account needed.</span>
            <span className="home-hero__lead--l">
              Browse shop products, fresh farm produce, rooms to rent and businesses approved on {brand.name}.
              See where they are, contact them directly and look around without an account.
            </span>
          </p>

          <form className="home-search" onSubmit={search} role="search">
            <label htmlFor="home-q" className="home-hero__label">Search products, produce, rooms, businesses or counties</label>
            <input id="home-q" className="ui-control home-search__input" value={term} onChange={(e) => setTerm(e.target.value)}
              placeholder="Product, room, business or county" enterKeyHint="search" />
            <Button type="submit" aria-label="Search" leftIcon={<Icon name="search" size={18} />}>Search</Button>
          </form>
        </div>
      </section>

      <section className="pg" aria-labelledby="home-listings-h">
        <div className="home-list__head">
          <h2 id="home-listings-h" className="pg__title">Latest products &amp; rentals</h2>
        </div>
        {listLoading ? (
          <div className="crow crow--listing" data-rows="1">{[0, 1, 2, 3, 4].map((i) => <ListingCardSkeleton key={i} />)}</div>
        ) : listError ? (
          <Card><EmptyState icon="info" title="Products and rentals could not be loaded" description={listError} compact /></Card>
        ) : groups.length === 0 ? (
          <Card><EmptyState icon="building" title="Nothing listed yet" description="New products, produce and rooms will appear here. Check back soon." compact /></Card>
        ) : (
          <div className="home-listings">
            {groups.map((g) => (
              <div key={g.key} className="home-listings__group">
                <div className="home-listings__label">
                  <h3>{g.label}</h3>
                  <Link to={g.more}>See all</Link>
                </div>
                <div className="crow crow--listing" data-rows="1">
                  {g.items.map((it) => <ListingCard key={it.key} listing={it} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="pg" aria-labelledby="home-biz-h">
        <div className="home-list__head">
          <h2 id="home-biz-h" className="pg__title">Latest businesses</h2>
          <Link to="/explore">See all</Link>
        </div>
        {loading ? (
          <div className="crow crow--biz" data-rows="1">{[0, 1, 2, 3].map((i) => <BusinessCardSkeleton key={i} />)}</div>
        ) : error ? (
          <Card><EmptyState icon="info" title="Businesses could not be loaded" description={error} compact /></Card>
        ) : bizGroups.length === 0 ? (
          <Card><EmptyState icon="building" title="No businesses listed yet" description="Approved businesses will appear here. Check back soon." compact /></Card>
        ) : (
          <div className="home-listings">
            {bizGroups.map((g) => (
              <div key={g.type} className="home-listings__group">
                <div className="home-listings__label">
                  <h3>{g.label}</h3>
                  <Link to={`/explore?type=${g.type}`}>See all</Link>
                </div>
                <div className="crow crow--biz" data-rows="1">
                  {g.items.map((b) => <BusinessCard key={b.id} business={b} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="pg">
        <h2 className="pg__title">Browse by type</h2>
        <div className="pg-grid pg-grid--3">
          {BUSINESS_TYPES.map((t) => (
            <Card key={t.value} className="home-type">
              <div className="home-type__head">
                <h3>{t.label}</h3>
                {t.open ? <Badge variant="success">Open</Badge> : <Badge variant="neutral">Coming soon</Badge>}
              </div>
              <p>{t.blurb}</p>
              {t.open && <Link to={`/explore?type=${t.value}`} className="home-type__link">Browse {t.label.toLowerCase()} businesses</Link>}
            </Card>
          ))}
        </div>
      </section>

      <section className="pg">
        <Card className="home-owner">
          {ownsBusiness ? (
            <>
              <div>
                <h2>Your businesses</h2>
                <p>Open a business to manage it, or start another one.</p>
              </div>
              <div className="home-owner__actions">
                <Button as={Link} to="/businesses">My businesses</Button>
                <Button as={Link} to="/start" variant="outline">Start another</Button>
              </div>
            </>
          ) : (
            <>
              <div>
                <h2>Own a business?</h2>
                <p>List it on {brand.name} so customers can find you, and run your day to day work in one place.</p>
                <ol className="home-owner__steps">{OWNER_STEPS.map((s) => <li key={s}>{s}</li>)}</ol>
              </div>
              <div className="home-owner__actions">
                <Button as={Link} to="/start">List your business</Button>
                <Button as={Link} to="/pricing" variant="outline">See pricing</Button>
              </div>
            </>
          )}
        </Card>
      </section>
    </>
  );
}