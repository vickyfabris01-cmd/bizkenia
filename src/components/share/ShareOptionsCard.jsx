// src/components/share/ShareOptionsCard.jsx — NEW FILE
//
// AIM
// The "Share and promote" card on the Settings pages: what appears on shared cards, posters and link previews.
//   business   (a business is passed)   rentals: Show rent price; every type: Show phone and WhatsApp, Show address and county.
//                                       Prices of products and produce always show, so a shop or farm has no price switch.
//   site       (no business)            the super admin's: Show plan prices on the Pricing card (off unless turned on).
// Saved through lib/api/shareOptions.js. A change redraws the cards the next time they are shared or opened.
//
// PROPS
//   business   the business whose options these are; leave out for the site's

import "./ShareMenu.css";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Card, CardBody, CardHeader, Skeleton, Toggle } from "../ui";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import { DEFAULT_OPTIONS } from "../../lib/share.js";
import { getShareOptions, saveShareOptions } from "../../lib/api/shareOptions.js";

export default function ShareOptionsCard({ business = null }) {
  const toast = useToast();
  const site = !business;
  const rental = business?.business_type === "rental";
  const { data, loading } = useAsync(() => getShareOptions(site ? null : business.id), [site, business?.id]);
  const [o, setO] = useState({ ...DEFAULT_OPTIONS });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { if (data) setO(data); }, [data]);
  const set = (k) => (v) => setO((s) => ({ ...s, [k]: v }));

  async function save() {
    setBusy(true); setErr("");
    const { error } = await saveShareOptions(site ? null : business.id, o);
    setBusy(false);
    if (error) { setErr(error); return; }
    toast.success("Share settings saved");
  }

  return (
    <Card>
      <CardHeader title="Share and promote"
        subtitle={site ? "What the shared site cards show." : "What shows on your shared cards, posters and link previews."} />
      <CardBody>
        {loading ? <Skeleton height={120} /> : (
          <div className="share-switches">
            {err && <Alert type="error" message={err} />}
            {site ? (
              <>
                <Toggle label="Show plan prices on the Pricing card" checked={o.showPlanPrices} onChange={set("showPlanPrices")} />
                <p className="share-hint">Off: the Pricing card talks about what the platform does for a business, with no prices. The cards never show how many businesses are on the platform.</p>
              </>
            ) : (
              <>
                {rental
                  ? <Toggle label="Show rent price" checked={o.showRent} onChange={set("showRent")} />
                  : <p className="share-hint">Price tags always show on your products and produce.</p>}
                <Toggle label="Show phone and WhatsApp number" checked={o.showPhone} onChange={set("showPhone")} />
                <Toggle label="Show address and county" checked={o.showLocation} onChange={set("showLocation")} />
                <p className="share-hint">Cards say an item is available, never how many. When you turn something off, it is left out of the card, the poster and the link preview.</p>
              </>
            )}
            <div className="share-actions">
              <Button onClick={save} loading={busy}>Save share settings</Button>
              {!site && <Button as={Link} to={`/app/${business.slug}/share`} variant="outline">Open Share and promote</Button>}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
