// src/components/ui/Avatar.jsx — MODIFIED FILE (rebuilt on design tokens; old props still work)
//
// AIM
// A round profile picture, or the person's initials when there is no picture (or it fails
// to load).
//
// FIXES
// The old sizes were in rem and the "sm" avatar came out 128px wide. Sizes are now pixels.
//
// PROPS
//   name       used for the initials and the image alt text
//   src        picture URL (optional)
//   size       "xs" 24px | "sm" 32px (default) | "md" 40px | "lg" 56px | "xl" 80px | a number of pixels
//   className
//
// AvatarGroup shows a row of overlapping avatars with a "+N" chip for the rest:
//   <AvatarGroup people={[{ name: "Amina W", src: url }, ...]} max={4} size="sm" />

import { useState } from "react";
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

function AvatarImage({ src, name, className, style }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span
        className={`ui-avatar ui-avatar--initials ${className}`.trim()}
        style={style}
        role="img"
        aria-label={name || "Avatar"}
      >
        <span aria-hidden="true">{getInitials(name)}</span>
      </span>
    );
  }

  return (
    <img
      className={`ui-avatar ${className}`.trim()}
      style={style}
      src={src}
      alt={name || "Avatar"}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export default function Avatar({ name, src, size = "sm", className = "" }) {
  const px = resolveSize(size);
  const style = {
    width: px,
    height: px,
    // keep initials readable (never under 12px) and in proportion on larger avatars
    fontSize: Math.max(12, Math.round(px * 0.4)),
  };
  // key on src so a new picture gets a fresh "failed to load" state
  return <AvatarImage key={src || "none"} src={src} name={name} className={className} style={style} />;
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