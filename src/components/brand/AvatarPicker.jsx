// src/components/brand/AvatarPicker.jsx — NEW FILE
//
// AIM
// Lets a person choose their avatar. Six designs are drawn from their name; the first is already
// selected, so skipping still gives a proper avatar. "Show more" draws six new ones.
// Used on the sign-up form and in Account settings. Nothing is uploaded: the parent receives a small
// recipe through onChange and saves it.
//
// PROPS
//   name        the person's name (the avatars update as it is typed)
//   value       the chosen recipe
//   onChange    called with a recipe whenever the choice changes
//   current     a recipe already saved for this person: shown first, marked "Current"
//   autoPick    true (default): choose the first design by itself, so skipping works.
//               false in settings, where the saved design must stay as it is until changed.
//   compact     true: no large preview, just the six small choices (used on the sign-up form)
//   title, hint optional heading and help text

import { useEffect, useMemo, useRef, useState } from "react";
import { avatarCandidates, avatarUri, newSeed, sameDesign } from "../../lib/brandStudio/index.js";
import "./BrandPicker.css";

const strip = ({ v, s, p, b }) => ({ v, s, p, b });

export default function AvatarPicker({ name, value, onChange, current = null, autoPick = true, compact = false, title = "Your avatar", hint }) {
  const [seed, setSeed] = useState(newSeed);
  const picked = useRef(false);

  const list = useMemo(() => {
    const fresh = avatarCandidates(seed, current ? 5 : 6);
    return current ? [{ ...current, __current: true }, ...fresh] : fresh;
  }, [seed, current]);

  useEffect(() => {
    // only when it actually differs, so a parent that re-renders can never cause a loop
    if (autoPick && !picked.current && list[0] && !sameDesign(value, list[0])) onChange?.(strip(list[0]));
  }, [list, autoPick, onChange, value]);

  const pick = (d) => {
    picked.current = true;
    onChange?.(strip(d));
  };
  const more = () => {
    picked.current = false;
    setSeed(newSeed());
  };

  const shown = value || (autoPick ? list[0] : null);
  return (
    <div className={`bpick bpick--round${compact ? " bpick--compact" : ""}`}>
      <div className="bpick__head">
        <h3 className="bpick__title">{title}</h3>
        <p className="bpick__hint">{hint || "Pick the look you like. If you skip, we use the first one. You can add a photo later."}</p>
      </div>

      <div className="bpick__stage bpick__stage--round"><img src={avatarUri({ name, design: shown })} alt={`Avatar preview for ${name || "you"}`} /></div>

      <ul className="bpick__grid">
        {list.map((d, k) => (
          <li key={`${d.s}-${d.p}-${d.b}-${k}`}>
            <button type="button" className="bpick__tile" aria-pressed={sameDesign(d, shown)} onClick={() => pick(d)}>
              <img src={avatarUri({ name, design: d })} alt="" loading="lazy" />
              <span className="bpick__caption">{d.__current ? "Current" : `Style ${k + 1}`}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="bpick__actions">
        <button type="button" className="bpick__file" onClick={more}>Show more</button>
      </div>
    </div>
  );
}
