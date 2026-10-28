// src/pages/admin/AdminShare.jsx — MODIFIED FILE (the card and the poster of each site page, to see and download)
//
// AIM
// /admin/share — the super admin gets the CARD and the POSTER of the main site's three pages: the home page,
// Explore (to bring customers) and Pricing (to bring new business owners). Each one opens a dialog with the
// poster and the card, with a download button for each. Sending a link to WhatsApp, Facebook and the other apps
// is done from the share icons on the admin dashboard (and the "Share the site" button in Settings), which open
// the platform picker on the spot.
// The cards say what the platform does for people: the brand name and tagline (Settings) and the first hero
// photo. They never show how many businesses are on the platform. The Pricing card shows plan prices only when
// "Show plan prices" is switched on in Settings. ?open=home, ?open=explore or ?open=pricing opens that one straight away.

import "./Admin.css";
import "../../components/share/ShareMenu.css";
import { Link, useSearchParams } from "react-router-dom";
import { Alert, Button, Card, CardBody, CardHeader, Icon, Skeleton } from "../../components/ui";
import CardDialog from "../../components/share/CardDialog.jsx";
import useAsync from "../../hooks/useAsync.js";
import useBrand from "../../hooks/useBrand.js";
import { getShareOptions } from "../../lib/api/shareOptions.js";
import { getSiteFacts } from "../../lib/api/siteShare.js";
import { siteTarget } from "../../lib/share.js";

const PAGES = [
  { key: "home", title: "Main site", meta: "The home page: what the platform does and who it is for." },
  { key: "explore", title: "Explore businesses", meta: "For customers looking for rooms, products and farm produce." },
  { key: "pricing", title: "Plans and pricing", meta: "For business owners who want to join." },
];

export default function AdminShare() {
  const brand = useBrand();
  const [params, setParams] = useSearchParams();
  const openKey = params.get("open") || "";
  const { data, error, loading } = useAsync(async () => {
    const opts = await getShareOptions(null);
    const facts = await getSiteFacts({ plans: opts.data.showPlanPrices });
    return { data: { options: opts.data, hero: facts.data?.hero || "", plans: facts.data?.plans || [] }, error: facts.error };
  }, []);

  const targets = data ? Object.fromEntries(PAGES.map((p) => [p.key, siteTarget(p.key, { brand, hero: data.hero, plans: data.plans, options: data.options })])) : {};
  const active = targets[openKey] || null;

  return (
    <div className="adm">
      <h2 className="adm__title">Share the site: card and poster</h2>
      {error && <Alert type="error" message={error} />}
      <Card>
        <CardHeader title="Card and poster" subtitle="Download the poster to post, or the card people see when the link is pasted. To send a link to WhatsApp, Facebook and more, use the share icons on the dashboard." />
        <CardBody>
          {loading ? <Skeleton height={180} /> : (
            <div className="share-list">
              {PAGES.map((p) => (
                <div className="share-row" key={p.key}>
                  <div className="share-row__text">
                    <div className="share-row__title">{p.title}</div>
                    <div className="share-row__meta">{p.meta}</div>
                  </div>
                  <Button variant={p.key === "home" ? "primary" : "outline"} leftIcon={<Icon name="download" size={16} />} onClick={() => setParams({ open: p.key })}>Card and poster</Button>
                </div>
              ))}
              <p className="share-hint" style={{ margin: 0 }}>What the Pricing card shows is set in <Link to="/admin/settings">Settings</Link>.</p>
            </div>
          )}
        </CardBody>
      </Card>
      {active && <CardDialog open target={active} onClose={() => setParams({}, { replace: true })} />}
    </div>
  );
}
