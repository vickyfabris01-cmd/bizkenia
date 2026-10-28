// src/components/share/ShareMenu.jsx — MODIFIED FILE (now only the platform picker; the card and poster downloads moved to CardDialog)
//
// AIM
// The share dialog: a short list of the places a link can be sent to (WhatsApp, Facebook, X, Telegram,
// LinkedIn, SMS, email) and Copy link. It opens over whatever screen the person is on (see ShareProvider).
//
// BEHIND THE SCENES
// When it opens, the link card is made ready first (looked up, and drawn and saved only when the data
// changed, see lib/api/shareCards.js), so the pasted link shows the card (photo, details, logo and name).
// The buttons are greyed out for that moment. If the card cannot be saved, the link still works and shows
// the item's own photo. The card and poster as pictures to download live on the Share and promote page.
//
// PROPS
//   request           what to share: { type: "business" | "product" | "room" | "site", ... } (see shareContext.js)
//   open, onClose     the provider controls the dialog

import "./ShareMenu.css";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Spinner } from "../ui";
import { Modal } from "../modals/Modal.jsx";
import useBrand from "../../hooks/useBrand.js";
import { useToast } from "../../hooks/useNotifications.js";
import { CHANNELS, copyText, shareLink } from "../../lib/share.js";
import { ensureShareCard } from "../../lib/api/shareCards.js";
import { resolveShareTarget } from "../../lib/api/shareTargets.js";

const SITE_PAGE = { home: "the site", explore: "Explore", pricing: "plans and pricing" };

function titleOf(req, brand) {
  if (!req) return "Share";
  if (req.type === "site") return `Share ${req.page === "home" ? brand.name : SITE_PAGE[req.page] || "the site"}`;
  if (req.type === "business") return `Share ${req.business?.name || "your business"}`;
  return `Share ${req.item?.name || "this"}`;
}

/** Where the card and poster for this request can be downloaded. */
function cardsPath(req) {
  if (!req) return "";
  if (req.type === "site") return `/admin/share?open=${req.page}`;
  if (!req.business?.slug) return "";
  const base = `/app/${req.business.slug}/share`;
  return req.type === "business" ? `${base}?open=business` : `${base}?open=${req.item?.id || ""}`;
}

export default function ShareMenu({ request, open, onClose }) {
  const toast = useToast();
  const brand = useBrand();
  const [st, setSt] = useState({ phase: "preparing", target: null, v: "" }); // phase: preparing | ready | failed

  // each time the dialog opens: work out what is shared and get its link card ready
  useEffect(() => {
    if (!open || !request) return undefined;
    let dead = false;
    setSt({ phase: "preparing", target: null, v: "" });
    (async () => {
      const { data: target } = await resolveShareTarget(request, brand);
      if (dead) return;
      if (!target) { setSt({ phase: "failed", target: null, v: "" }); return; }
      const { data, error } = await ensureShareCard(target);
      if (dead) return;
      setSt({ phase: "ready", target, v: data?.v || "" });
      if (error && !data?.saved) toast.info("The link will show the main photo.", "The card could not be saved");
    })();
    return () => { dead = true; };
    // redone only when the dialog opens for another request
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, request]);

  const { phase, target, v } = st;
  const ready = phase === "ready" && Boolean(target);
  const cards = cardsPath(request);

  async function copyLink() {
    const ok = await copyText(shareLink(target.path, "copy", v));
    if (ok) toast.success("Link copied");
    else toast.error("Could not copy. Try again.");
  }

  return (
    <Modal isOpen={Boolean(open && request)} onClose={onClose} title={titleOf(request, brand)} size="sm"
      footer={<Button variant="secondary" onClick={onClose}>Done</Button>}>
      <div className="share-pane">
        <div className="share-hint" aria-live="polite">
          {phase === "preparing" && <span className="share-wait"><Spinner label="Getting your link ready" /> Getting your link ready…</span>}
          {phase === "failed" && "This could not be got ready to share just now. Close this and try again."}
          {ready && "Choose where to send it. People who open the link see a card, and tapping it opens the page."}
        </div>
        <div className="share-grid">
          {CHANNELS.map((c) => {
            if (!ready) {
              return <span key={c.id} className="share-ch is-disabled" style={{ "--dot": c.color }} aria-disabled="true"><span className="share-ch__dot" aria-hidden="true" />{c.label}</span>;
            }
            const href = c.href(shareLink(target.path, c.id, v), target.text, target.title);
            const web = href.startsWith("http");
            return (
              <a key={c.id} className="share-ch" href={href} style={{ "--dot": c.color }} {...(web ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                <span className="share-ch__dot" aria-hidden="true" />{c.label}
              </a>
            );
          })}
        </div>
        <div><Button variant="outline" onClick={copyLink} disabled={!ready}>Copy link</Button></div>
        {cards && <p className="share-hint">Want the card or poster as a picture? <Link to={cards} onClick={onClose}>Open Share and promote</Link></p>}
      </div>
    </Modal>
  );
}
