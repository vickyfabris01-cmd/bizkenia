// src/components/ui/PhotoUploader.jsx — NEW FILE (Part 8: per-file upload percent, cancel and retry)
//
// AIM
// Lets staff add and remove photos (rooms, later farms and shops). Each chosen photo first opens
// the crop window (smart upload: frame it, pick JPEG, PNG or WebP), then the finished file goes to the
// public "business-media" storage bucket under <businessId>/<folder>/, and the form keeps the list
// of public URLs. Only the business owner or a manager may upload (storage rule in migration p2_04).
//
// PROPS
//   businessId  id of the business (first folder of the path; the storage rule checks it)
//   folder      sub folder name, e.g. "rooms"
//   value       array of image URLs        onChange(nextArray)
//   max         most photos allowed (default 4)         maxMb  biggest file in MB (default 5, the bucket's limit)
//   preset      crop shape, see lib/imagePipeline.js (default "room", 16:10)
//   label       text above
//
// UPLOAD PROGRESS (Part 8): every chosen photo gets its own row with a live percent (R2 storage; with Supabase
// storage the row says "Uploading…" and shows no number). Photos upload one after another. A waiting or running
// photo can be cancelled; a failed or cancelled one can be retried, which starts again from 0%. Each photo is added
// to the list (onChange) as soon as it is saved.

import { useEffect, useId, useRef, useState } from "react";
import { supabase } from "../../config/supabase.js";
import Icon from "./Icon.jsx";
import ImageUploadButton, { UploadProgress } from "./ImageUploadButton.jsx";
import { uploadFile, publicUrl } from "../../lib/storage.js";

const TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function PhotoUploader({ businessId, folder = "photos", value = [], onChange, max = 4, maxMb = 5, label = "Photos", preset = "room" }) {
  const id = useId();
  const [items, setItems] = useState([]); // { id, file, name, status, percent, error }
  const [error, setError] = useState("");
  const valueRef = useRef(value);      // the newest list, so a photo saved late is added to the right list
  const queue = useRef([]);            // items waiting their turn
  const pumping = useRef(false);
  const controllers = useRef(new Map()); // item id -> AbortController of the running upload
  const alive = useRef(true);

  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => {
    alive.current = true;
    const running = controllers.current;
    return () => { alive.current = false; queue.current = []; running.forEach((c) => c.abort()); };
  }, []);

  const patch = (itemId, p) => { if (alive.current) setItems((list) => list.map((it) => (it.id === itemId ? { ...it, ...p } : it))); };
  const drop = (itemId) => { if (alive.current) setItems((list) => list.filter((it) => it.id !== itemId)); };
  const waitingCount = () => items.filter((it) => it.status === "queued" || it.status === "uploading").length;

  async function uploadOne(item) {
    const ctrl = new AbortController();
    controllers.current.set(item.id, ctrl);
    patch(item.id, { status: "uploading", percent: null, error: "" }); // a number appears only when the storage reports one
    const f = item.file;
    const ext = f.type === "image/png" ? "png" : f.type === "image/webp" ? "webp" : "jpg";
    const path = `${businessId}/${folder}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await uploadFile("business-media", path, f, { signal: ctrl.signal, onProgress: (percent) => patch(item.id, { percent }) });
    controllers.current.delete(item.id);
    if (upErr) {
      patch(item.id, upErr.cancelled ? { status: "cancelled", percent: 0 } : { status: "error", percent: 0, error: upErr.message });
      return;
    }
    if (!alive.current) return;
    const next = [...valueRef.current, publicUrl("business-media", path)];
    valueRef.current = next;
    onChange(next);
    patch(item.id, { status: "done", percent: 100 });
    window.setTimeout(() => drop(item.id), 1200);
  }

  async function pump() {
    if (pumping.current) return;
    pumping.current = true;
    try {
      while (alive.current && queue.current.length) {
        const next = queue.current.shift();
        await uploadOne(next);
      }
    } finally { pumping.current = false; }
  }

  function onFiles(files) {
    if (!files.length) return;
    setError("");
    if (!supabase) { setError("The app is not connected to the database yet."); return; }
    const room = max - valueRef.current.length - waitingCount();
    if (files.length > room) { setError(`You can add ${Math.max(room, 0)} more photo${room === 1 ? "" : "s"}.`); return; }
    for (const f of files) {
      if (!TYPES.includes(f.type)) { setError("Use JPG, PNG or WebP photos."); return; }
      if (f.size > maxMb * 1024 * 1024) { setError(`Each photo must be under ${maxMb} MB.`); return; }
    }
    const added = files.map((file) => ({ id: crypto.randomUUID(), file, name: file.name || "Photo", status: "queued", percent: 0, error: "" }));
    setItems((list) => [...list, ...added]);
    queue.current.push(...added);
    pump();
  }

  function cancel(item) {
    const running = controllers.current.get(item.id);
    if (running) { running.abort(); return; }                       // the upload reports "cancelled" itself
    if (item.status === "queued") { queue.current = queue.current.filter((q) => q.id !== item.id); drop(item.id); return; }
    drop(item.id);                                                   // failed or cancelled: dismiss the row
  }

  function retry(item) {
    setError("");
    if (valueRef.current.length >= max) { setError("The photo limit is reached. Remove a photo first."); return; }
    patch(item.id, { status: "queued", percent: 0, error: "" });
    queue.current.push(item);
    pump();
  }

  const busy = items.some((it) => it.status === "queued" || it.status === "uploading");
  const full = value.length + items.filter((it) => it.status !== "error" && it.status !== "cancelled" && it.status !== "done").length >= max;

  return (
    <div className="ui-field">
      <span className="ui-field__label" id={`${id}-l`}>{label}</span>
      <div className="rent-photos" role="group" aria-labelledby={`${id}-l`}>
        {value.map((url, i) => (
          <div className="rent-photo" key={url}>
            <img src={url} alt={`Photo ${i + 1}`} loading="lazy" />
            <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => onChange(value.filter((u) => u !== url))}><Icon name="x" size={16} /></button>
          </div>
        ))}
        {!full && (
          <ImageUploadButton className="rent-photo rent-photo--add" preset={preset} multiple maxFiles={Math.max(max - value.length - waitingCount(), 0)} showProgress={false} onFiles={onFiles} ariaLabel="Add photos">
            <span><Icon name="plus" size={18} /><br />{busy ? "Add more" : "Add"}</span>
          </ImageUploadButton>
        )}
      </div>
      {items.length > 0 && (
        <ul className="imgup-list" aria-label="Upload progress">
          {items.map((it) => (
            <li key={it.id}>
              <UploadProgress name={it.name} status={it.status} percent={it.percent} error={it.error} onCancel={() => cancel(it)} onRetry={() => retry(it)} />
            </li>
          ))}
        </ul>
      )}
      {error && <p className="ui-field__error" role="alert">{error}</p>}
    </div>
  );
}
