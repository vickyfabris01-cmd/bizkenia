// src/components/business/BusinessLogoCard.jsx — MOVED (shared by every business type)
//
// AIM
// Lets the owner upload, replace or remove the business logo. The logo shows on the top left of
// the business card in the public list, replaces the BizKenia logo in the header of the business
// page, and replaces it in the sidebar and top bar of this business's dashboard. Without a logo,
// the first letter of the business name is shown on green instead.
// Shared: used in the owner's Settings page of rental and agriculture businesses.

import "./BusinessImageCards.css";
import { useState } from "react";
import { Button, Card, CardBody, CardHeader } from "../ui";
import { useToast } from "../../hooks/useNotifications.js";
import { LOGO_MAX_MB, removeBusinessLogo, uploadBusinessLogo } from "../../lib/api/businessMedia.js";
import { useBusinessStore } from "../../store/businessStore.js";
import { useSession } from "../../store/sessionStore.js";

const ACCEPT = "image/jpeg,image/png,image/webp";

export default function BusinessLogoCard({ business }) {
  const toast = useToast();
  const user = useSession((s) => s.user);
  const [busy, setBusy] = useState("");
  const logo = business.logo_url || "";

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
    toast.success("Logo removed.");
    refresh();
  }

  return (
    <Card>
      <CardHeader title="Logo" subtitle="Shown on your listing card, on your business page and across your dashboard" />
      <CardBody>
        <div className="bcov">
          <div className={`bcov__logo${logo ? "" : " bcov__logo--letter"}`}>
            {logo ? <img src={logo} alt="" /> : <span aria-hidden="true">{(business.name || "?").charAt(0).toUpperCase()}</span>}
          </div>
          <div className="bcov__actions">
            <label className="bcov__file">
              <span>{busy === "upload" ? "Uploading..." : logo ? "Replace logo" : "Choose a logo"}</span>
              <input type="file" accept={ACCEPT} disabled={busy !== ""} onChange={onPick} aria-label="Upload a logo" />
            </label>
            {logo && <Button variant="ghost" loading={busy === "remove"} disabled={busy === "upload"} onClick={onRemove}>Remove logo</Button>}
          </div>
          <p className="bcov__hint">JPG, PNG or WebP, up to {LOGO_MAX_MB} MB. A square logo on a plain or transparent background looks best. Without a logo we show the first letter of your business name. A new logo replaces the old one.</p>
        </div>
      </CardBody>
    </Card>
  );
}