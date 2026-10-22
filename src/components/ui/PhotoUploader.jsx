// src/components/ui/PhotoUploader.jsx — NEW FILE
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

import { useId, useState } from "react";
import { supabase } from "../../config/supabase.js";
import Icon from "./Icon.jsx";
import ImageUploadButton from "./ImageUploadButton.jsx";

const TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function PhotoUploader({ businessId, folder = "photos", value = [], onChange, max = 4, maxMb = 5, label = "Photos", preset = "room" }) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onFiles(files) {
    if (!files.length) return;
    setError("");
    if (!supabase) { setError("The app is not connected to the database yet."); return; }
    const room = max - value.length;
    if (files.length > room) { setError(`You can add ${room} more photo${room === 1 ? "" : "s"}.`); return; }
    for (const f of files) {
      if (!TYPES.includes(f.type)) { setError("Use JPG, PNG or WebP photos."); return; }
      if (f.size > maxMb * 1024 * 1024) { setError(`Each photo must be under ${maxMb} MB.`); return; }
    }
    setBusy(true);
    const urls = [];
    for (const f of files) {
      const ext = f.type === "image/png" ? "png" : f.type === "image/webp" ? "webp" : "jpg";
      const path = `${businessId}/${folder}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("business-media").upload(path, f, { contentType: f.type, upsert: false });
      if (upErr) { setError(upErr.message); break; }
      urls.push(supabase.storage.from("business-media").getPublicUrl(path).data.publicUrl);
    }
    setBusy(false);
    if (urls.length) onChange([...value, ...urls]);
  }

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
        {value.length < max && (
          <ImageUploadButton className="rent-photo rent-photo--add" preset={preset} multiple maxFiles={max - value.length} disabled={busy} onFiles={onFiles} ariaLabel="Add photos">
            <span><Icon name="plus" size={18} /><br />{busy ? "Uploading…" : "Add"}</span>
          </ImageUploadButton>
        )}
      </div>
      {error && <p className="ui-field__error" role="alert">{error}</p>}
    </div>
  );
}
