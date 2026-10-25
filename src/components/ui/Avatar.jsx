// src/components/ui/Avatar.jsx — MODIFIED FILE (now draws a designed avatar when there is no picture)
//
// AIM
// A round profile picture. When the person has no picture (or it fails to load), an avatar is DRAWN
// from their saved recipe (avatar_design), or one worked out from their id, so nobody is left with a
// grey circle. The drawn avatar sits underneath, so a slow picture fades in over it, never an empty box.
//
// FIXES
// The old sizes were in rem and the "sm" avatar came out 128px wide. Sizes are now pixels.
//
// PROPS
//   name       used for the initials and the image alt text
//   src        picture URL (optional)
//   id         the person's id: picks a stable look when no recipe is saved (falls back to the name)
//   design     the saved recipe (profiles.avatar_design), optional
//   size       "xs" 24px | "sm" 32px (default) | "md" 40px | "lg" 56px | "xl" 80px | a number of pixels
//   className
//
// AvatarGroup shows a row of overlapping avatars with a "+N" chip for the rest:
//   <AvatarGroup people={[{ id, name: "Amina W", src: url, design }, ...]} max={4} size="sm" />

import { useState } from "react";
import { avatarUri } from "../../lib/brandStudio/index.js";
import "./Avatar.css";

const SIZES = { xs: 24, sm: 32, md: 40, lg: 56, xl: 80 };

function resolveSize(size) {
  if (typeof size === "number" && size > 0) return size;
  return SIZES[size] || SIZES.sm;
}

export function getInitials(name) {
  if (!name) return "?";
  const parts = String(name).split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function AvatarImage({ src, name, id, design, className, style }) {
  const [status, setStatus] = useState(""); // "loaded" | "failed" for the uploaded picture
  const drawn = avatarUri({ id: id || name, name, design });
  const showPicture = Boolean(src) && status !== "failed";
  const loaded = showPicture && status === "loaded";

  return (
    <span className={`ui-avatar ui-avatar--drawn ${className}`.trim()} style={style} role="img" aria-label={name || "Avatar"}>
      <img className="ui-avatar__img" src={drawn} alt="" aria-hidden="true" decoding="async" style={{ opacity: loaded ? 0 : 1 }} />
      {showPicture && (
        <img
          className="ui-avatar__img ui-avatar__img--picture"
          src={src}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          style={{ opacity: loaded ? 1 : 0 }}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("failed")}
        />
      )}
    </span>
  );
}

export default function Avatar({ name, src, id, design, size = "sm", className = "" }) {
  const px = resolveSize(size);
  const style = {
    width: px,
    height: px,
    // keep initials readable (never under 12px) and in proportion on larger avatars
    fontSize: Math.max(12, Math.round(px * 0.4)),
  };
  // key on src so a new picture gets a fresh "failed to load" state
  return <AvatarImage key={src || "none"} src={src} name={name} id={id} design={design} className={className} style={style} />;
}

export function AvatarGroup({ people = [], max = 4, size = "sm", className = "" }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  const px = resolveSize(size);

  return (
    <div className={`ui-avatar-group ${className}`.trim()}>
      {shown.map((person, index) => (
        <Avatar
          key={person.id ?? `${person.name}-${index}`}
          name={person.name}
          src={person.src}
          id={person.id}
          design={person.design}
          size={size}
          className="ui-avatar-group__item"
        />
      ))}
      {extra > 0 && (
        <span
          className="ui-avatar ui-avatar--initials ui-avatar-group__item"
          style={{ width: px, height: px, fontSize: Math.max(12, Math.round(px * 0.36)) }}
          role="img"
          aria-label={`${extra} more`}
        >
          <span aria-hidden="true">+{extra}</span>
        </span>
      )}
    </div>
  );
}