// src/components/share/ShareMenu.jsx — NEW FILE
//
// AIM
// One "Share" button that opens a dialog: an editable message, a button for each social app, the phone's
// own share sheet ("More apps", which includes Instagram and TikTok on a phone), and copy buttons.
// Used for the site (super admin), a business, and one room, product or item of produce.
//
// USAGE
//   <ShareMenu path={sharePath.business(b)} title={b.name} text={message.business(b)} label="Share my business" />
//
// PROPS
//   path      what to share, from sharePath in lib/share.js (the link goes through the Worker so previews work)
//   title     used as the email subject and the phone share sheet title
//   text      the starting message; the person can change it before sharing
//   label, size, variant, fullWidth   the look of the opening button

import "./ShareMenu.css";
import { useState } from "react";
import { Button, TextArea } from "../ui";
import { Modal } from "../modals/Modal.jsx";
import { useToast } from "../../hooks/useNotifications.js";
import { CHANNELS, canNativeShare, copyText, shareLink } from "../../lib/share.js";

export default function ShareMenu({ path, title = "", text = "", label = "Share", size = "sm", variant = "outline", fullWidth = false }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState(text);

  function show() { setMsg(text); setOpen(true); }

  async function copy(what) {
    const link = shareLink(path, "copy");
    const ok = await copyText(what === "link" ? link : `${msg.trim()} ${link}`);
    if (ok) toast.success(what === "link" ? "Link copied" : "Message and link copied");
    else toast.error("Could not copy. Select the link and copy it by hand.");
  }

  async function nativeShare() {
    try { await navigator.share({ title, text: msg.trim(), url: shareLink(path, "native") }); } catch { /* closed without sharing */ }
  }

  const link = shareLink(path, "copy");

  return (
    <>
      <Button size={size} variant={variant} fullWidth={fullWidth} onClick={show}>{label}</Button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Share" size="md"
        footer={<Button variant="secondary" onClick={() => setOpen(false)}>Done</Button>}>
        <div className="share-body">
          <TextArea label="Message" rows={3} value={msg} maxLength={280} onChange={(e) => setMsg(e.target.value)}
            helper="The link and its picture are added automatically." />

          <div className="share-grid">
            {CHANNELS.map((c) => {
              const href = c.href(shareLink(path, c.id), msg.trim(), title);
              const web = href.startsWith("http");
              return (
                <a key={c.id} className="share-ch" href={href} style={{ "--dot": c.color }}
                  {...(web ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                  <span className="share-ch__dot" aria-hidden="true" />{c.label}
                </a>
              );
            })}
            {canNativeShare() && (
              <button type="button" className="share-ch" style={{ "--dot": "#8B5CF6" }} onClick={nativeShare}>
                <span className="share-ch__dot" aria-hidden="true" />More apps
              </button>
            )}
          </div>

          <div className="share-link">
            <code>{link.replace(/\?.*$/, "")}</code>
            <Button size="sm" variant="outline" onClick={() => copy("link")}>Copy link</Button>
            <Button size="sm" variant="ghost" onClick={() => copy("both")}>Copy message and link</Button>
          </div>
          <p className="share-hint">For Instagram and TikTok, use More apps on your phone, or copy the message and link and paste it into your post, story or bio.</p>
        </div>
      </Modal>
    </>
  );
}
