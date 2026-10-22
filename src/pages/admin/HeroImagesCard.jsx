// src/pages/admin/HeroImagesCard.jsx — MODIFIED (up to 5 photos, Replace and Delete on each, no timing setting)
//
// AIM
// The "Home page hero" card inside Admin Settings. The super admin keeps up to 5 background photos
// (stored in the "hero/" folder of the site-media bucket). The home page loops through the ones that
// are switched on, changing the photo every 4 minutes, so there is nothing to schedule here.
// Uploading opens the smart upload: frame the photo in 16:9 (drag and pinch) and pick JPEG, PNG or WebP.
// Once 5 photos are in, Upload is switched off and only Replace and Delete on each photo remain.
//   Replace   frame a new photo; it takes the old one's place and the old file is deleted from storage.
//   Delete    asks to confirm, then removes the photo and its file for good.
// With no photo on, the home page shows the picture in src/assets/hero/ (or plain green).

import { useState } from "react";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, Skeleton, Toggle, Input } from "../../components/ui";
import ImageUploadButton from "../../components/ui/ImageUploadButton.jsx";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import {
  HERO_MAX_IMAGES, adminDeleteHeroImage, adminListHeroImages, adminReorderHeroImages,
  adminReplaceHeroImage, adminSetHeroActive, adminUploadHeroImage,
} from "../../lib/api/hero.js";

export default function HeroImagesCard() {
  const toast = useToast();
  const { data: images, loading, error, reload } = useAsync(() => adminListHeroImages(), []);

  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState("");
  const [confirmId, setConfirmId] = useState("");

  const list = images || [];
  const full = list.length >= HERO_MAX_IMAGES;

  async function onUpload(files) {
    const file = files[0];
    if (!file) return;
    setBusy("upload");
    const nextOrder = list.length ? Math.max(...list.map((i) => i.sort_order || 0)) + 1 : 0;
    const { error: err, notice } = await adminUploadHeroImage(file, label, nextOrder);
    setBusy("");
    if (err) return toast.error(err);
    if (notice) toast.info(notice);
    setLabel("");
    toast.success("Photo uploaded.");
    reload();
  }

  async function onReplace(img, files) {
    const file = files[0];
    if (!file) return;
    setBusy(img.id);
    const { error: err, notice } = await adminReplaceHeroImage(img, file);
    setBusy("");
    if (err) return toast.error(err);
    if (notice) toast.info(notice);
    toast.success("Photo replaced.");
    reload();
  }

  async function toggle(img, on) {
    setBusy(img.id);
    const { error: err } = await adminSetHeroActive(img.id, on);
    setBusy("");
    if (err) return toast.error(err);
    reload();
  }

  async function move(index, dir) {
    const to = index + dir;
    if (to < 0 || to >= list.length) return;
    const ids = list.map((i) => i.id);
    [ids[index], ids[to]] = [ids[to], ids[index]];
    setBusy("order");
    const { error: err } = await adminReorderHeroImages(ids);
    setBusy("");
    if (err) return toast.error(err);
    reload();
  }

  async function remove(img) {
    setBusy(img.id);
    const { error: err, notice } = await adminDeleteHeroImage(img);
    setBusy("");
    setConfirmId("");
    if (err) return toast.error(err);
    if (notice) toast.info(notice);
    toast.success("Photo deleted.");
    reload();
  }

  return (
    <Card>
      <CardHeader title="Home page hero" subtitle="Background photos for the top of the home page. The ones switched on take turns, changing every 4 minutes." />
      <CardBody>
        <div className="hero-adm">
          {error && <Alert type="error" message={error} />}

          <div className="adm-form">
            <Input label="Description (optional)" value={label} onChange={(e) => setLabel(e.target.value)} helper="Only for you, to tell the photos apart." disabled={full} />
            <div>
              <ImageUploadButton className={`hero-adm__file${full || busy === "upload" ? " is-disabled" : ""}`} preset="hero"
                disabled={full || busy === "upload"} onFiles={onUpload} ariaLabel="Upload a hero photo">
                <span>{busy === "upload" ? "Uploading..." : "Choose a photo to upload"}</span>
              </ImageUploadButton>
            </div>
            <p className="adm-hint" aria-live="polite">
              {list.length} of {HERO_MAX_IMAGES} photos used.{" "}
              {full
                ? "Upload is off until you delete one. You can still replace any photo."
                : "Choose any photo, then frame it in 16:9 by dragging and pinching, and pick JPEG, PNG or WebP (up to 5 MB). A large photo, at least 1600 px wide, looks best."}
            </p>
          </div>

          {loading && !images ? (
            <Skeleton height={96} />
          ) : list.length === 0 ? (
            <EmptyState icon="info" title="No hero photos yet" description="Until you upload one, the home page shows the picture kept in the code (src/assets/hero), or plain green if there is none." compact />
          ) : (
            <ul className="hero-adm__list">
              {list.map((img, i) => (
                <li className="hero-adm__item" key={img.id}>
                  <img className="hero-adm__thumb" src={img.url} alt="" loading="lazy" />
                  <div className="hero-adm__meta">
                    <span className="hero-adm__name">{img.alt_text || img.storage_path.replace("hero/", "")}</span>
                    <span className="hero-adm__badges">
                      <Badge variant="neutral">Photo {i + 1}</Badge>
                      <Badge variant={img.is_active ? "success" : "neutral"}>{img.is_active ? "On" : "Off"}</Badge>
                    </span>
                  </div>
                  <div className="hero-adm__actions">
                    <Toggle label="Use this photo" checked={!!img.is_active} disabled={busy === img.id} onChange={(v) => toggle(img, v)} />
                    <Button size="sm" variant="outline" disabled={i === 0 || busy === "order"} onClick={() => move(i, -1)}>Move up</Button>
                    <Button size="sm" variant="outline" disabled={i === list.length - 1 || busy === "order"} onClick={() => move(i, 1)}>Move down</Button>
                    <ImageUploadButton className={`hero-adm__replace${busy === img.id ? " is-disabled" : ""}`} preset="hero"
                      disabled={busy === img.id} onFiles={(files) => onReplace(img, files)} ariaLabel={`Replace photo ${i + 1}`}>
                      <span>{busy === img.id ? "Working..." : "Replace image"}</span>
                    </ImageUploadButton>
                    {confirmId === img.id ? (
                      <>
                        <span className="adm-hint">This deletes the photo for good.</span>
                        <Button size="sm" variant="danger" loading={busy === img.id} onClick={() => remove(img)}>Confirm delete</Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmId("")}>Cancel</Button>
                      </>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setConfirmId(img.id)}>Delete</Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
