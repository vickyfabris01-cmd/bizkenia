// src/components/business/BusinessCoverCard.jsx — MOVED (shared by every business type)
//
// AIM
// Lets the owner upload, replace or remove the business cover photo. The photo shows at the top
// of the business card in the public list and on the public business page. Without one, those
// places show the first letter of the business name on a green background.
// Any photo can be chosen: the smart upload opens a crop window (16:9, drag and pinch to frame it,
// JPEG, PNG or WebP) and only the framed result is uploaded.
// Shared: used in the owner's Settings page of rental and agriculture businesses.

import "./BusinessImageCards.css";
import { useState } from "react";
import { Button, Card, CardBody, CardHeader } from "../ui";
import ImageUploadButton from "../ui/ImageUploadButton.jsx";
import { useToast } from "../../hooks/useNotifications.js";
import { COVER_MAX_MB, removeBusinessCover, uploadBusinessCover } from "../../lib/api/businessMedia.js";
import { useBusinessStore } from "../../store/businessStore.js";
import { useSession } from "../../store/sessionStore.js";


export default function BusinessCoverCard({ business }) {
  const toast = useToast();
  const user = useSession((s) => s.user);
  const [busy, setBusy] = useState("");
  const cover = business.cover_url || "";

  // reload the person's businesses so the new cover shows everywhere
  const refresh = () => useBusinessStore.getState().load(user?.id, true);

  async function onFiles(files) {
    const file = files[0];
    if (!file) return;
    setBusy("upload");
    const { error, notice } = await uploadBusinessCover(business.id, file, cover);
    setBusy("");
    if (notice) return toast.info(notice);
    if (error) return toast.error(error);
    toast.success("Cover photo saved.");
    refresh();
  }

  async function onRemove() {
    setBusy("remove");
    const { error } = await removeBusinessCover(business.id, cover);
    setBusy("");
    if (error) return toast.error(error);
    toast.success("Cover photo removed.");
    refresh();
  }

  return (
    <Card>
      <CardHeader title="Cover photo" subtitle="Shown on your listing card and your public business page" />
      <CardBody>
        <div className="bcov">
          <div className="bcov__preview" style={cover ? { backgroundImage: `url("${cover}")` } : undefined}>
            {!cover && <span aria-hidden="true">{(business.name || "?").charAt(0).toUpperCase()}</span>}
          </div>
          <div className="bcov__actions">
            <ImageUploadButton className="bcov__file" preset="cover" disabled={busy !== ""} onFiles={onFiles} ariaLabel="Upload a cover photo">
              <span>{busy === "upload" ? "Uploading..." : cover ? "Replace photo" : "Choose a photo"}</span>
            </ImageUploadButton>
            {cover && <Button variant="ghost" loading={busy === "remove"} disabled={busy === "upload"} onClick={onRemove}>Remove photo</Button>}
          </div>
          <p className="bcov__hint">Choose any photo, then frame it in 16:9 by dragging and pinching, and pick JPEG, PNG or WebP (up to {COVER_MAX_MB} MB). Keep the main subject in the middle, because the edges are cropped on small screens. A new photo replaces the old one.</p>
        </div>
      </CardBody>
    </Card>
  );
}