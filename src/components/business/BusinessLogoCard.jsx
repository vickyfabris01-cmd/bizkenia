// src/components/business/BusinessLogoCard.jsx — MODIFIED (a designed logo is drawn when nothing is uploaded)
//
// AIM
// Where the owner manages the business logo. The logo shows on the top left of the business card in
// the public list, in the header of the business page, and in the sidebar and top bar of this
// business's dashboard.
//
// HOW THE LOGO WORKS
//   * By default the logo is DRAWN from the business name, type and a small saved recipe. Nothing is
//     stored as a picture, so it appears instantly even on a slow connection.
//   * The owner can change the design here at any time ("Change design").
//   * The owner can also upload their own logo. An uploaded logo always shows first; remove it and the
//     drawn design shows again.
//   * "Download PNG" saves the drawn logo to the owner's device (symbol only, or symbol + name).
// Shared: used in the owner's Settings page of every business type.

import "./BusinessImageCards.css";
import { useState } from "react";
import { Button, Card, CardBody, CardHeader } from "../ui";
import BusinessLogo from "../brand/BusinessLogo.jsx";
import LogoPicker from "../brand/LogoPicker.jsx";
import { useToast } from "../../hooks/useNotifications.js";
import { updateBusiness } from "../../lib/api/businesses.js";
import { LOGO_MAX_MB, removeBusinessLogo, uploadBusinessLogo } from "../../lib/api/businessMedia.js";
import { downloadSvgAsPng, logoSvg, resolveLogoDesign, safeFileName } from "../../lib/brandStudio/index.js";
import { useBusinessStore } from "../../store/businessStore.js";
import { useSession } from "../../store/sessionStore.js";

const ACCEPT = "image/jpeg,image/png,image/webp";

export default function BusinessLogoCard({ business }) {
  const toast = useToast();
  const user = useSession((s) => s.user);
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const logo = business.logo_url || "";
  const saved = resolveLogoDesign({ id: business.id, type: business.business_type, design: business.logo_design });

  // reload the person's businesses so the new logo shows everywhere
  const refresh = () => useBusinessStore.getState().load(user?.id, true);

  async function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy("upload");
    const { error, notice } = await uploadBusinessLogo(business.id, file, logo);
    setBusy("");
    if (notice) return toast.info(notice);
    if (error) return toast.error(error);
    toast.success("Logo saved.");
    refresh();
  }

  async function onRemove() {
    setBusy("remove");
    const { error } = await removeBusinessLogo(business.id, logo);
    setBusy("");
    if (error) return toast.error(error);
    toast.success("Uploaded logo removed. Your design is showing again.");
    refresh();
  }

  async function onSaveDesign() {
    if (!draft) return;
    setBusy("design");
    const { error } = await updateBusiness(business.id, { logo_design: draft, business_type: business.business_type });
    setBusy("");
    if (error) return toast.error(error);
    toast.success("Logo design saved.");
    setEditing(false);
    refresh();
  }

  async function onDownload(layout) {
    setBusy(`png-${layout}`);
    const svg = logoSvg({ id: business.id, name: business.name, type: business.business_type, design: saved, layout });
    const { error } = await downloadSvgAsPng(svg, `${safeFileName(business.name)}-logo-${layout}.png`, 512, layout === "icon" ? 512 : 256);
    setBusy("");
    if (error) toast.error(error);
  }

  return (
    <Card>
      <CardHeader title="Logo" subtitle="Shown on your listing card, on your business page and across your dashboard" />
      <CardBody>
        <div className="bcov">
          <div className="bcov__logo"><BusinessLogo business={business} /></div>
          <div className="bcov__actions">
            <label className="bcov__file">
              <span>{busy === "upload" ? "Uploading..." : logo ? "Replace logo" : "Upload my own logo"}</span>
              <input type="file" accept={ACCEPT} disabled={busy !== ""} onChange={onPick} aria-label="Upload a logo" />
            </label>
            {logo && <Button variant="ghost" loading={busy === "remove"} disabled={busy === "upload"} onClick={onRemove}>Remove uploaded logo</Button>}
            <Button variant="outline" onClick={() => { setEditing((v) => !v); setDraft(null); }}>{editing ? "Close" : "Change design"}</Button>
          </div>
          <p className="bcov__hint">
            {logo
              ? "Your uploaded logo is showing. If you remove it, the design below shows instead."
              : "Your logo is drawn from your business name and type, so it always looks sharp and loads fast."}
            {" "}Uploads: JPG, PNG or WebP, up to {LOGO_MAX_MB} MB, square on a plain or transparent background works best.
          </p>

          {editing && (
            <>
              <LogoPicker
                name={business.name}
                type={business.business_type}
                current={saved}
                value={draft || saved}
                onChange={setDraft}
                autoPick={false}
                title="Pick a design"
                hint="Choose one you like, then save. Your design is only changed when you save."
              />
              <div className="bcov__actions">
                <Button loading={busy === "design"} disabled={!draft} onClick={onSaveDesign}>Save design</Button>
              </div>
            </>
          )}

          <div className="bcov__actions">
            <Button variant="ghost" size="sm" loading={busy === "png-icon"} onClick={() => onDownload("icon")}>Download symbol (PNG)</Button>
            <Button variant="ghost" size="sm" loading={busy === "png-wordmark"} onClick={() => onDownload("wordmark")}>Download with name (PNG)</Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
