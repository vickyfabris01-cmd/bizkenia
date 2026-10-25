// src/components/brand/LogoPicker.jsx — NEW FILE
//
// AIM
// Lets an owner choose a logo. Once the business name and type are known it shows six designs drawn
// from them. The first is already selected, so an owner who skips ends up with a real logo anyway.
// "Show more designs" draws six new ones. Optionally the owner can upload their own logo instead.
// Nothing is uploaded or saved here: the parent receives a small recipe through onChange and saves it.
//
// PROPS
//   name, type     the business name and type (the designs update as the name is typed)
//   value          the chosen recipe
//   onChange       called with a recipe whenever the choice changes
//   current        a recipe already saved for this business: shown first, marked "Current"
//   autoPick       true (default): choose the first design by itself, so skipping works.
//                  false in settings, where the saved design must stay as it is until changed.
//   file, onFile   an uploaded logo chosen on this form (File or null) and its setter. Leave out to hide upload.
//   title, hint    optional heading and help text

import { useEffect, useMemo, useRef, useState } from "react";
import { logoCandidates, logoUri, newSeed, sameDesign, STYLES } from "../../lib/brandStudio/index.js";
import { LOGO_MAX_MB } from "../../lib/api/businessMedia.js";
import "./BrandPicker.css";

const ACCEPT = "image/jpeg,image/png,image/webp";

export default function LogoPicker({ name, type, value, onChange, current = null, autoPick = true, file = null, onFile = null, title = "Your logo", hint }) {
  const [seed, setSeed] = useState(newSeed);
  const [fileError, setFileError] = useState("");
  const picked = useRef(false);

  const list = useMemo(() => {
    const fresh = logoCandidates(seed, type, current ? 5 : 6);
    return current ? [{ ...current, __current: true }, ...fresh] : fresh;
  }, [seed, type, current]);

  // until the person chooses, the first design stays selected (this is what "skip" saves)
  useEffect(() => {
    // only when it actually differs, so a parent that re-renders can never cause a loop
    if (autoPick && !picked.current && list[0] && !sameDesign(value, list[0])) onChange?.(strip(list[0]));
  }, [list, autoPick, onChange, value]);

  // a preview of the chosen upload
  const [previewUrl, setPreviewUrl] = useState("");
  useEffect(() => {
    if (!file) return setPreviewUrl("");
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (d) => {
    picked.current = true;
    onChange?.(strip(d));
  };
  const more = () => {
    picked.current = false; // a new set starts with its first design selected again (when autoPick)
    setSeed(newSeed());
  };

  function onPickFile(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!ACCEPT.split(",").includes(f.type)) return setFileError("Use a JPG, PNG or WebP picture.");
    if (f.size > LOGO_MAX_MB * 1024 * 1024) return setFileError(`That picture is over ${LOGO_MAX_MB} MB.`);
    setFileError("");
    onFile?.(f);
  }

  const shown = value || (autoPick ? list[0] : null);
  const stageUri = logoUri({ name, type, design: shown, layout: "wordmark" });

  return (
    <div className="bpick">
      <div className="bpick__head">
        <h3 className="bpick__title">{title}</h3>
        <p className="bpick__hint">{hint || "Pick a design below, or upload your own. If you skip, we use the first one."}</p>
      </div>

      <div className="bpick__stage"><img src={stageUri} alt={`Logo preview for ${name || "your business"}`} /></div>

      <ul className="bpick__grid">
        {list.map((d, k) => {
          const on = sameDesign(d, shown);
          return (
            <li key={`${d.s}-${d.i}-${d.p}-${k}`}>
              <button type="button" className="bpick__tile" aria-pressed={on} onClick={() => pick(d)}>
                <img src={logoUri({ name, type, design: d, layout: "wordmark" })} alt="" loading="lazy" />
                <span className="bpick__caption">{d.__current ? "Current" : STYLES[d.s].name}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="bpick__actions">
        <button type="button" className="bpick__file" onClick={more}>Show more designs</button>
        {onFile && (
          <label className="bpick__file">
            <span>{file ? "Choose a different logo" : "Upload my own logo"}</span>
            <input type="file" accept={ACCEPT} onChange={onPickFile} aria-label="Upload your own logo" />
          </label>
        )}
      </div>

      {file && previewUrl && (
        <div className="bpick__chosen">
          <img src={previewUrl} alt="" />
          <span>{file.name}. Your own logo will be used; the design above stays as a backup.</span>
          <button type="button" className="bpick__file" onClick={() => onFile?.(null)}>Remove</button>
        </div>
      )}
      {fileError && <p className="bpick__error" role="alert">{fileError}</p>}
    </div>
  );
}

// only the saved fields, without display-only flags
const strip = ({ v, s, i, p }) => ({ v, s, i, p });
