// src/components/share/ShareMenu.jsx — MODIFIED FILE (two ways to share: as a link, or as a poster)
//
// AIM
// The share dialog. It has two tabs and nothing else:
//
//   Share as link     The link card is made ready first (drawn and saved, see lib/api/shareCards.js),
//                     then the app buttons (WhatsApp, Facebook, X, Telegram, LinkedIn, SMS, email) and
//                     Copy link work. Pasted anywhere, the link shows the card (photo, details, logo and
//                     name) and opens the business page or the item page.
//   Share as poster   The poster is drawn from the same data. Download it, post it (WhatsApp, Instagram,
//                     Facebook, TikTok, a status) and paste the link in the caption (Copy link).
//
// There is deliberately no phone share sheet: it would offer apps we have never tested.
//
// PROPS
//   target            from lib/share.js: { ref, path, title, text, card }
//   open, onClose     the page controls the dialog (see MarketingPage and AdminShare)

import "./ShareMenu.css";
import { useEffect, useState } from "react";
import { Button, Spinner } from "../ui";
import { Modal } from "../modals/Modal.jsx";
import useBrand from "../../hooks/useBrand.js";
import { useToast } from "../../hooks/useNotifications.js";
import { CHANNELS, copyText, shareLink, siteHost } from "../../lib/share.js";
import { ensureShareCard } from "../../lib/api/shareCards.js";
import { renderPoster, safeFileName } from "../../lib/shareCard.js";

const IDLE = { state: "idle", url: "", blob: null };

export default function ShareMenu({ target, open, onClose }) {
  const toast = useToast();
  const brand = useBrand();
  const [tab, setTab] = useState("link");
  const [link, setLink] = useState({ ...IDLE, v: "", saved: false }); // state: preparing | ready | failed
  const [poster, setPoster] = useState(IDLE);                         // state: drawing | ready | failed
  const path = target.path;

  // each time the dialog opens: get the link card ready, and draw the poster
  useEffect(() => {
    if (!open) return undefined;
    let dead = false;
    const urls = [];
    setTab("link");
    setLink({ ...IDLE, v: "", saved: false, state: "preparing" });
    setPoster({ ...IDLE, state: "drawing" });

    ensureShareCard(target).then(({ data, error }) => {
      if (dead) return;
      const url = data?.blob ? URL.createObjectURL(data.blob) : "";
      if (url) urls.push(url);
      setLink({ state: error && !data?.blob ? "failed" : "ready", url, blob: data?.blob || null, v: data?.v || "", saved: Boolean(data?.saved) });
      if (error && data?.blob) toast.info("The link will show the main photo.", "The card could not be saved");
    });
    renderPoster(target.card, { host: siteHost() }).then((blob) => {
      if (dead) return;
      if (!blob) { setPoster({ ...IDLE, state: "failed" }); return; }
      const url = URL.createObjectURL(blob);
      urls.push(url);
      setPoster({ state: "ready", url, blob });
    });
    return () => { dead = true; urls.forEach((u) => URL.revokeObjectURL(u)); };
    // redone only when the dialog opens or something else is shared
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, path]);

  const preparing = link.state === "preparing";
  const fileName = `${safeFileName(target.card.title || target.title)}-poster.png`;

  async function copyLink(channel) {
    const ok = await copyText(shareLink(path, channel, link.v));
    if (ok) toast.success("Link copied");
    else toast.error("Could not copy. Try again.");
  }

  function download() {
    if (!poster.url) return;
    const a = document.createElement("a");
    a.href = poster.url;
    a.download = fileName;
    a.click();
  }

  return (
    <Modal isOpen={Boolean(open)} onClose={onClose} title={`Share ${target.card.title}`} size="md"
      footer={<Button variant="secondary" onClick={onClose}>Done</Button>}>
      <div className="share-tabs" role="tablist" aria-label="How to share">
        <button type="button" role="tab" aria-selected={tab === "link"} className={`share-tab${tab === "link" ? " is-on" : ""}`} onClick={() => setTab("link")}>Share as link</button>
        <button type="button" role="tab" aria-selected={tab === "poster"} className={`share-tab${tab === "poster" ? " is-on" : ""}`} onClick={() => setTab("poster")}>Share as poster</button>
      </div>

      {tab === "link" ? (
        <div className="share-pane" role="tabpanel">
          <div className="share-preview share-preview--wide" aria-live="polite">
            {link.url && <img src={link.url} alt={`How the link looks: ${target.card.title}`} />}
            {preparing && <div className="share-preview__wait"><Spinner label="Getting your link ready" /></div>}
            {link.state === "failed" && <p className="share-hint" style={{ padding: "var(--space-4)" }}>The preview could not be drawn on this device. The link still works.</p>}
          </div>
          <p className="share-hint">{preparing ? "Getting your link ready…" : `People who open the link see this card on ${brand.name}, and tapping it opens the page.`}</p>
          <div className="share-grid">
            {CHANNELS.map((c) => {
              const href = c.href(shareLink(path, c.id, link.v), target.text, target.title);
              const web = href.startsWith("http");
              return preparing ? (
                <span key={c.id} className="share-ch is-disabled" style={{ "--dot": c.color }} aria-disabled="true"><span className="share-ch__dot" aria-hidden="true" />{c.label}</span>
              ) : (
                <a key={c.id} className="share-ch" href={href} style={{ "--dot": c.color }} {...(web ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                  <span className="share-ch__dot" aria-hidden="true" />{c.label}
                </a>
              );
            })}
          </div>
          <div><Button variant="outline" onClick={() => copyLink("copy")} disabled={preparing}>Copy link</Button></div>
        </div>
      ) : (
        <div className="share-pane" role="tabpanel">
          <div className="share-preview share-preview--tall" aria-live="polite">
            {poster.url && <img src={poster.url} alt={`Poster: ${target.card.title}`} />}
            {poster.state === "drawing" && <div className="share-preview__wait"><Spinner label="Drawing the poster" /></div>}
            {poster.state === "failed" && <p className="share-hint" style={{ padding: "var(--space-4)" }}>The poster could not be drawn on this device. Try another browser.</p>}
          </div>
          <div className="share-actions">
            <Button onClick={download} disabled={poster.state !== "ready"}>Download poster</Button>
            <Button variant="outline" onClick={() => copyLink("poster")} disabled={preparing}>Copy link</Button>
          </div>
          <p className="share-hint">Post the poster on WhatsApp, Instagram, Facebook or TikTok, and paste the link in the caption so people can tap through.</p>
        </div>
      )}
    </Modal>
  );
}
