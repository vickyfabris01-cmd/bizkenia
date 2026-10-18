// src/pages/public/HomePage.jsx — MODIFIED (hero photo is ready before the page draws; skeleton until then)
//
// AIM
// The front door, written for someone who just wants to FIND a business: search by name,
// place and type, jump straight to a county, browse the latest businesses and the types.
// Owners get one short, clearly separate section near the bottom ("Own a business?"), not the
// main message. Signed-in visitors see the same page with a greeting, and a signed-in owner
// sees a link to their businesses instead of the sales pitch. Everything shown is real: the
// list comes from the database (skeleton, then cards, or a friendly message).
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
import { BUSINESS_TYPES, COUNTIES } from "../../config/counties.js";
import useAsync from "../../hooks/useAsync.js";
import useBrand from "../../hooks/useBrand.js";
import { listBusinesses } from "../../lib/api/directory.js";
import { useHeroPreload } from "../../lib/heroPreload.js";
import { useSession } from "../../store/sessionStore.js";
import { useBusinessStore } from "../../store/businessStore.js";

const POPULAR_COUNTIES = ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Kiambu", "Uasin Gishu", "Machakos", "Kajiado"];

const OWNER_STEPS = [
  "Create your account and choose your business type.",
  "Add your details and pay the subscription by M-Pesa.",
  "Get approved, go live and start managing.",
];

// Grey wireframe of the whole page, same layout as the real one, shown until the hero is ready.
function HomeSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading">
      <section className="home-hero" aria-hidden="true">
        <div className="home-hero__inner">
          <Skeleton height={44} width="min(520px, 90%)" />
          <Skeleton height={18} width="min(460px, 80%)" />
          <div className="home-search">
            <Skeleton height={44} />
            <Skeleton height={44} />
            <Skeleton height={48} width={120} />
          </div>
          <div className="home-chips">
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={44} width={96} style={{ borderRadius: "var(--radius-full)" }} />)}
          </div>
        </div>
      </section>

      <section className="pg" aria-hidden="true">
        <div className="home-list__head"><Skeleton height={28} width={200} /></div>
        <div className="pg-grid pg-grid--3">{[0, 1, 2].map((i) => <BusinessCardSkeleton key={i} />)}</div>
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
  const [county, setCounty] = useState("");
  const { data, error, loading } = useAsync(() => listBusinesses({ limit: 6 }), []);
  const hero = useHeroPreload(); // { ready, url }; url is "" when the plain green hero is used
  const first = (profile?.full_name || "").split(" ")[0];
  const ownsBusiness = Boolean(user) && memberships.length > 0;

  function search(e) {
    e.preventDefault();
    const q = new URLSearchParams();
    if (term.trim()) q.set("q", term.trim());
    if (county) q.set("county", county);
    const s = q.toString();
    navigate(`/explore${s ? `?${s}` : ""}`);
  }

  // The business list keeps loading in the background while the skeleton shows.
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
            Browse businesses approved on {brand.name}, see where they are and contact them directly.
            You do not need an account to look around.
          </p>

          <form className="home-search" onSubmit={search} role="search">
            <label htmlFor="home-q" className="home-hero__label">Search by name or place</label>
            <input id="home-q" className="ui-control home-search__input" value={term} onChange={(e) => setTerm(e.target.value)}
              placeholder="Name or place, for example Sunrise or Nakuru" />
            <label htmlFor="home-county" className="home-hero__label">County</label>
            <select id="home-county" className="ui-control home-search__select" value={county} onChange={(e) => setCounty(e.target.value)}>
              <option value="">All counties</option>
              {COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <Button type="submit" size="lg" leftIcon={<Icon name="search" size={18} />}>Search</Button>
          </form>

          <ul className="home-chips" aria-label="Popular counties">
            {POPULAR_COUNTIES.map((c) => (
              <li key={c}><Link className="home-chip" to={`/explore?county=${encodeURIComponent(c)}`}>{c}</Link></li>
            ))}
            <li><Link className="home-chip home-chip--all" to="/explore">All businesses</Link></li>
          </ul>
        </div>
      </section>

      <section className="pg">
        <div className="home-list__head">
          <h2 className="pg__title">Latest businesses</h2>
          <Link to="/explore">See all</Link>
        </div>
        {loading ? (
          <div className="pg-grid pg-grid--3">{[0, 1, 2].map((i) => <BusinessCardSkeleton key={i} />)}</div>
        ) : error ? (
          <Card><EmptyState icon="info" title="Businesses could not be loaded" description={error} compact /></Card>
        ) : data.length === 0 ? (
          <Card><EmptyState icon="building" title="No businesses listed yet" description="Approved businesses will appear here. Check back soon." compact /></Card>
        ) : (
          <div className="pg-grid pg-grid--3">{data.map((b) => <BusinessCard key={b.id} business={b} />)}</div>
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