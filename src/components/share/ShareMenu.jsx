// src/components/share/ShareMenu.jsx — MODIFIED FILE (shows and shares a designed card)
//
// AIM
// The share dialog. It draws the card for what is being shared (a business, or one product, piece of
// produce or room type; see lib/shareCard.js), shows it, and lets the person:
//   - "Share picture"   send the card itself plus the message and link through the phone's share sheet
//                       (WhatsApp, Instagram, Facebook, TikTok, Telegram and every other app on the phone);
//   - "Download"        save the card to post by hand (computers, Instagram and TikTok posts);
//   - the app buttons   WhatsApp, Facebook, X, Telegram, LinkedIn, SMS and email, which send the message and
//                       link (the link shows a preview of the photo);
//   - copy the link, or the message and link.
// Whoever opens the link or taps the card's link lands on the business page or the item page.
//
// USAGE
//   <ShareMenu target={businessTarget(b)} label="Share my business" />        its own button
//   <ShareMenu target={productTarget(b, p)} open={open} onClose={close} />      opened by the page (for example
//                                                                              straight after saving an item)
//
// PROPS
//   target            from lib/share.js: { path, title, text, card? }. Without `card` (the site itself), no picture is drawn.
//   open, onClose     optional. When `open` is given the page controls the dialog and no button is drawn.
//   label, size, variant, fullWidth   the look of the opening button

import "./ShareMenu.css";
import { useEffect, useMemo, useState } from "react";
import { Button, Spinner, TextArea } from "../ui";
import { Modal } from "../modals/Modal.jsx";
import useBrand from "../../hooks/useBrand.js";
import { useToast } from "../../hooks/useNotifications.js";
import { CHANNELS, canNativeShare, copyText, shareLink, siteHost } from "../../lib/share.js";
import { renderCard, safeFileName } from "../../lib/shareCard.js";

export default function ShareMenu({ target, open, onClose, label = "Share", size = "sm", variant = "outline", fullWidth = false }) {
  const toast = useToast();
  const brand = useBrand();
  const controlled = open !== undefined;
  const [inner, setInner] = useState(false);
  const isOpen = controlled ? Boolean(open) : inner;
  const close = () => (controlled ? onClose?.() : setInner(false));

  const [msg, setMsg] = useState(target.text);
  const [pic, setPic] = useState({ blob: null, url: "", state: "idle" }); // state: idle | drawing | ready | failed
  const path = target.path;
  const hasCard = Boolean(target.card);

  // reset the message each time the dialog opens
  useEffect(() => { if (isOpen) setMsg(target.text); }, [isOpen, target.text]);

  // draw the card when the dialog opens
  useEffect(() => {
    if (!isOpen || !hasCard) return undefined;
    let dead = false;
    let made = "";
    setPic({ blob: null, url: "", state: "drawing" });
    renderCard(target.card, { host: siteHost() }).then((blob) => {
      if (dead) return;
      if (!blob) { setPic({ blob: null, url: "", state: "failed" }); return; }
      made = URL.createObjectURL(blob);
      setPic({ blob, url: made, state: "ready" });
    });
    return () => { dead = true; if (made) URL.revokeObjectURL(made); };
    // the card is rebuilt only when the dialog opens or a different thing is shared
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, path]);

  const fileName = `${safeFileName(target.card?.title || target.title)}.png`;
  const file = useMemo(() => (pic.blob ? new File([pic.blob], fileName, { type: "image/png" }) : null), [pic.blob, fileName]);
  const canShareFile = Boolean(file && typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] }));

  async function copy(what) {
    const link = shareLink(path, "copy");
    const ok = await copyText(what === "link" ? link : `${msg.trim()} ${link}`);
    if (ok) toast.success(what === "link" ? "Link copied" : "Message and link copied");
    else toast.error("Could not copy. Select the link and copy it by hand.");
  }

  async function sharePicture() {
    const link = shareLink(path, "native");
    try {
      if (canShareFile) await navigator.share({ files: [file], title: target.title, text: `${msg.trim()} ${link}` });
      else await navigator.share({ title: target.title, text: msg.trim(), url: link });
    } catch { /* closed without sharing */ }
  }

  function download() {
    if (!pic.url) return;
    const a = document.createElement("a");
    a.href = pic.url;
    a.download = fileName;
    a.click();
    toast.success("Picture saved", "Post it with the link, so people can tap through to the page.");
  }

  const link = shareLink(path, "copy");

  return (
    <>
      {!controlled && <Button size={size} variant={variant} fullWidth={fullWidth} onClick={() => setInner(true)}>{label}</Button>}
      <Modal isOpen={isOpen} onClose={close} title="Share" size="lg"
        footer={<Button variant="secondary" onClick={close}>Done</Button>}>
        <div className={`share-body${hasCard ? " share-body--card" : ""}`}>
          {hasCard && (
            <div className="share-preview" aria-live="polite">
              {pic.state === "ready" && <img src={pic.url} alt={`Share picture: ${target.card.title}`} />}
              {pic.state === "drawing" && <div className="share-preview__wait"><Spinner label="Drawing the picture" /></div>}
              {pic.state === "failed" && <p className="share-hint" style={{ padding: "var(--space-4)" }}>The picture could not be drawn on this device. You can still share the link below.</p>}
            </div>
          )}

          <div className="share-side">
            <TextArea label="Message" rows={3} value={msg} maxLength={280} onChange={(e) => setMsg(e.target.value)}
              helper="The link is added for you. It opens the page for this business or item." />

            {hasCard && (
              <div className="share-actions">
                {(canShareFile || canNativeShare()) && <Button onClick={sharePicture} disabled={pic.state === "drawing"}>{canShareFile ? "Share picture" : "Share"}</Button>}
                <Button variant="outline" onClick={download} disabled={pic.state !== "ready"}>Download picture</Button>
              </div>
            )}

            <div className="share-grid">
              {CHANNELS.map((c) => {
                const href = c.href(shareLink(path, c.id), msg.trim(), target.title);
                const web = href.startsWith("http");
                return (
                  <a key={c.id} className="share-ch" href={href} style={{ "--dot": c.color }}
                    {...(web ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                    <span className="share-ch__dot" aria-hidden="true" />{c.label}
                  </a>
                );
              })}
            </div>

            <div className="share-link">
              <code>{link.replace(/\?.*$/, "")}</code>
              <Button size="sm" variant="outline" onClick={() => copy("link")}>Copy link</Button>
              <Button size="sm" variant="ghost" onClick={() => copy("both")}>Copy message and link</Button>
            </div>
            <p className="share-hint">
              {hasCard
                ? `${brand.name} links show the main photo when pasted. To post the full card, use Share picture on your phone, or download it and post it on Instagram or TikTok with the link in your caption or bio.`
                : "Instagram and TikTok have no web share box. Copy the message and link and paste them into your post, story or bio."}
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}
