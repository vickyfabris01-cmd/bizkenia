// src/pages/admin/AdminShare.jsx — MODIFIED FILE (site cards drawn from the system's own data)
//
// AIM
// /admin/share — the super admin shares the main site: the home page, Explore (to bring customers) and
// Pricing (to bring new business owners). Each one is a card made from what the system already holds:
// the brand name and tagline (Settings), the first hero photo, the live number of active businesses
// (in total and by type) and the starting plan prices. Like every other share, it opens a dialog with
// "Share as link" and "Share as poster". Buttons elsewhere (Settings) lead here, with ?open=home,
// ?open=explore or ?open=pricing to open that card straight away.

import "./Admin.css";
import "../../components/share/ShareMenu.css";
import { useSearchParams } from "react-router-dom";
import { Alert, Button, Card, CardBody, CardHeader, Skeleton } from "../../components/ui";
import ShareMenu from "../../components/share/ShareMenu.jsx";
import useAsync from "../../hooks/useAsync.js";
import useBrand from "../../hooks/useBrand.js";
import { getSiteFacts } from "../../lib/api/siteShare.js";
import { siteTarget } from "../../lib/share.js";

const PAGES = [
  { key: "home", title: "Main site", meta: "The home page: what the platform is and who it is for." },
  { key: "explore", title: "Explore businesses", meta: "For customers looking for rooms, products and farm produce." },
  { key: "pricing", title: "Plans and pricing", meta: "For business owners who want to join." },
];

export default function AdminShare() {
  const brand = useBrand();
  const [params, setParams] = useSearchParams();
  const openKey = params.get("open") || "";
  const { data, error, loading } = useAsync(() => getSiteFacts(), []);

  const targets = data ? Object.fromEntries(PAGES.map((p) => [p.key, siteTarget(p.key, { brand, hero: data.hero, counts: data.counts, plans: data.plans })])) : {};
  const active = targets[openKey] || null;

  return (
    <div className="adm">
      <h2 className="adm__title">Share the site</h2>
      {error && <Alert type="error" message={error} />}
      <Card>
        <CardHeader title="Promote the platform" subtitle="Each card is made from your brand settings, the home photo, the live business counts and the plan prices." />
        <CardBody>
          {loading ? <Skeleton height={180} /> : (
            <div className="share-list">
              {PAGES.map((p) => (
                <div className="share-row" key={p.key}>
                  <div className="share-row__text">
                    <div className="share-row__title">{p.title}</div>
                    <div className="share-row__meta">{p.meta}</div>
                  </div>
                  <Button variant={p.key === "home" ? "primary" : "outline"} onClick={() => setParams({ open: p.key })}>Share</Button>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
      {active && <ShareMenu open target={active} onClose={() => setParams({}, { replace: true })} />}
    </div>
  );
}
