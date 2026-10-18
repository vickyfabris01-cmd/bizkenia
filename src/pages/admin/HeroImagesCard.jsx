// src/pages/admin/HeroImagesCard.jsx — MODIFIED (landscape 16:9 only, soft notice otherwise)
//
// AIM
// The "Home page hero" card inside Admin Settings. The super admin uploads background photos
// (stored in the "hero/" folder of the site-media bucket), switches each on or off, reorders
// them, deletes them, and chooses how often the home page image changes. With no active image
// the home page keeps its plain green background.

import { useState } from "react";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, SelectInput, Skeleton, Toggle, Input } from "../../components/ui";
import useAsync from "../../hooks/useAsync.js";
import { useToast } from "../../hooks/useNotifications.js";
import {
  HERO_CYCLES, HERO_MAX_MB, adminDeleteHeroImage, adminGetHeroCycle, adminListHeroImages,
  adminReorderHeroImages, adminSaveHeroCycle, adminSetHeroActive, adminUploadHeroImage, getHeroImage,
} from "../../lib/api/hero.js";

const ACCEPT = "image/jpeg,image/png,image/webp";

export default function HeroImagesCard() {
  const toast = useToast();
  const { data: images, loading, error, reload } = useAsync(() => adminListHeroImages(), []);
  const { data: cycle, reload: reloadCycle } = useAsync(() => adminGetHeroCycle(), []);
  const { data: current, reload: reloadCurrent } = useAsync(() => getHeroImage(), []);

  const [hours, setHours] = useState(null);
  const [restart, setRestart] = useState(false);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState("");
  const [confirmId, setConfirmId] = useState("");

  const list = images || [];
  const shownHours = hours ?? String(cycle?.cycle_hours || 24);

  function refresh() { reload(); reloadCurrent(); }

  async function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy("upload");
    const nextOrder = list.length ? Math.max(...list.map((i) => i.sort_order || 0)) + 1 : 0;
    const { error: err, notice } = await adminUploadHeroImage(file, label, nextOrder);
    setBusy("");
    if (notice) return toast.info(notice);
    if (err) return toast.error(err);
    setLabel("");
    toast.success("Image uploaded.");
    refresh();
  }

  async function toggle(img, on) {
    setBusy(img.id);
    const { error: err } = await adminSetHeroActive(img.id, on);
    setBusy("");
    if (err) return toast.error(err);
    refresh();
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
    refresh();
  }

  async function remove(img) {
    setBusy(img.id);
    const { error: err } = await adminDeleteHeroImage(img);
    setBusy("");
    setConfirmId("");
    if (err) return toast.error(err);
    toast.success("Image deleted.");
    refresh();
  }

  async function saveCycle() {
    setBusy("cycle");
    const { error: err } = await adminSaveHeroCycle(shownHours, restart);
    setBusy("");
    if (err) return toast.error(err);
    setHours(null);
    setRestart(false);
    toast.success("Hero timing saved.");
    reloadCycle();
    reloadCurrent();
  }

  return (
    <Card>
      <CardHeader title="Home page hero" subtitle="Background photos for the top of the home page. One shows at a time and changes on the schedule you choose." />
      <CardBody>
        <div className="hero-adm">
          {error && <Alert type="error" message={error} />}

          <div className="adm-form">
            <div className="adm-form__row">
              <SelectInput label="Change the image" value={shownHours} onChange={setHours} options={HERO_CYCLES} />
              <div className="hero-adm__restart">
                <Toggle label="Start again from the first image" checked={restart} onChange={setRestart} />
              </div>
            </div>
            <div><Button loading={busy === "cycle"} onClick={saveCycle}>Save timing</Button></div>
          </div>

          <div className="adm-form">
            <Input label="Description (optional)" value={label} onChange={(e) => setLabel(e.target.value)} helper="Only for you, to tell the photos apart." />
            <label className="hero-adm__file">
              <span>{busy === "upload" ? "Uploading..." : "Choose a photo to upload"}</span>
              <input type="file" accept={ACCEPT} disabled={busy === "upload"} onChange={onPick} aria-label="Upload a hero photo" />
            </label>
            <p className="adm-hint">JPG, PNG or WebP, up to {HERO_MAX_MB} MB. Landscape 16:9 only, for example 1920 x 1080.</p>
          </div>

          {loading ? (
            <Skeleton height={96} />
          ) : list.length === 0 ? (
            <EmptyState icon="info" title="No hero images yet" description="Until you upload one, the home page keeps its plain green background." compact />
          ) : (
            <ul className="hero-adm__list">
              {list.map((img, i) => (
                <li className="hero-adm__item" key={img.id}>
                  <img className="hero-adm__thumb" src={img.url} alt="" loading="lazy" />
                  <div className="hero-adm__meta">
                    <span className="hero-adm__name">{img.alt_text || img.storage_path.replace("hero/", "")}</span>
                    <span className="hero-adm__badges">
                      {current?.path === img.storage_path && <Badge variant="brand">Showing now</Badge>}
                      <Badge variant={img.is_active ? "success" : "neutral"}>{img.is_active ? "On" : "Off"}</Badge>
                    </span>
                  </div>
                  <div className="hero-adm__actions">
                    <Toggle label="Use this image" checked={!!img.is_active} disabled={busy === img.id} onChange={(v) => toggle(img, v)} />
                    <Button size="sm" variant="outline" disabled={i === 0 || busy === "order"} onClick={() => move(i, -1)}>Move up</Button>
                    <Button size="sm" variant="outline" disabled={i === list.length - 1 || busy === "order"} onClick={() => move(i, 1)}>Move down</Button>
                    {confirmId === img.id ? (
                      <>
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