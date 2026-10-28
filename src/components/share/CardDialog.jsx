// src/components/share/CardDialog.jsx — NEW FILE
//
// AIM
// Shows the card and the poster of one thing, drawn from its live data, with a download button for each.
// This is the only job of the Share and promote pages now:
//   Poster   1080 x 1350 picture (PNG) to post on WhatsApp, Instagram, Facebook, TikTok or a status.
//   Card     1200 x 630 picture (JPEG): what people see when the shared link is pasted.
// Sending the link to an app happens in the share dialog (ShareMenu), not here. Nothing is saved to storage here.
//
// PROPS
//   target          from lib/share.js: { ref, path, title, text, card }
//   open, onClose   the page controls the dialog

import "./ShareMenu.css";
import { useEffect, useState } from "react";
import { Button, Icon, Spinner } from "../ui";
import { Modal } from "../modals/Modal.jsx";
import { siteHost } from "../../lib/share.js";
import { renderPoster, renderPreview, safeFileName } from "../../lib/shareCard.js";

const IDLE = { state: "idle", url: "", blob: null };

function save(url, name) {
  if (!url) return;
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

export default function CardDialog({ target, open, onClose }) {
  const [tab, setTab] = useState("poster");
  const [poster, setPoster] = useState(IDLE); // state: drawing | ready | failed
  const [card, setCard] = useState(IDLE);
  const path = target?.path;

  // each time the dialog opens: draw both pictures
  useEffect(() => {
    if (!open || !target) return undefined;
    let dead = false;
    const urls = [];
    const draw = (render, set) => render(target.card, { host: siteHost() }).then((blob) => {
      if (dead) return;
      if (!blob) { set({ ...IDLE, state: "failed" }); return; }
      const url = URL.createObjectURL(blob);
      urls.push(url);
      set({ state: "ready", url, blob });
    });
    setTab("poster");
    setPoster({ ...IDLE, state: "drawing" });
    setCard({ ...IDLE, state: "drawing" });
    draw(renderPoster, setPoster);
    draw(renderPreview, setCard);
    return () => { dead = true; urls.forEach((u) => URL.revokeObjectURL(u)); };
    // redone only when the dialog opens or something else is shown
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, path]);

  if (!target) return null;
  const name = safeFileName(target.card.title || target.title);
  const one = tab === "poster" ? poster : card;

  return (
    <Modal isOpen={Boolean(open)} onClose={onClose} title={`Card and poster: ${target.card.title}`} size="md"
      footer={<Button variant="secondary" onClick={onClose}>Done</Button>}>
      <div className="share-tabs" role="tablist" aria-label="Which picture">
        <button type="button" role="tab" aria-selected={tab === "poster"} className={`share-tab${tab === "poster" ? " is-on" : ""}`} onClick={() => setTab("poster")}>Poster</button>
        <button type="button" role="tab" aria-selected={tab === "card"} className={`share-tab${tab === "card" ? " is-on" : ""}`} onClick={() => setTab("card")}>Card</button>
      </div>

      <div className="share-pane" role="tabpanel">
        <div className={`share-preview ${tab === "poster" ? "share-preview--tall" : "share-preview--wide"}`} aria-live="polite">
          {one.url && <img src={one.url} alt={`${tab === "poster" ? "Poster" : "Card"}: ${target.card.title}`} />}
          {one.state === "drawing" && <div className="share-preview__wait"><Spinner label={tab === "poster" ? "Drawing the poster" : "Drawing the card"} /></div>}
          {one.state === "failed" && <p className="share-hint" style={{ padding: "var(--space-4)" }}>This could not be drawn on this device. Try another browser.</p>}
        </div>
        <div className="share-actions">
          {tab === "poster"
            ? <Button leftIcon={<Icon name="download" size={18} />} onClick={() => save(poster.url, `${name}-poster.png`)} disabled={poster.state !== "ready"}>Download poster</Button>
            : <Button leftIcon={<Icon name="download" size={18} />} onClick={() => save(card.url, `${name}-card.jpg`)} disabled={card.state !== "ready"}>Download card</Button>}
        </div>
        <p className="share-hint">
          {tab === "poster"
            ? "Post the poster on WhatsApp, Instagram, Facebook or TikTok, or use it as a status. To send the link itself, use the share icon."
            : "This is the card people see when the link is pasted. It is made again whenever the details change."}
        </p>
      </div>
    </Modal>
  );
}
