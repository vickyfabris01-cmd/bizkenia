// src/lib/brandStudio/palettes.js — NEW FILE
//
// AIM
// The colour sets used by logos and avatars. Every palette keeps white text readable on `a`.
//   a    main colour (blocks, frames)         b    accent
//   c    soft background tint                 ink  dark text colour
//
// IMPORTANT: this is the "v1" pool. A business or person with no saved design gets one worked out
// from their id using this exact list, so NEVER reorder or remove entries. Add new palettes only
// at the end, and only offer them through the picker (see designs.js, DERIVE_POOL).

export const PALETTES = [
  { name: "Forest & brass", a: "#15583D", b: "#D1A34A", c: "#EAF2E8", ink: "#173C2D" },
  { name: "Deep ocean", a: "#174B63", b: "#5CC4B1", c: "#E5F3F3", ink: "#173B4A" },
  { name: "Plum & sand", a: "#603B65", b: "#D9B68B", c: "#F4EDE7", ink: "#392A3E" },
  { name: "Cobalt & sky", a: "#244CA2", b: "#76B9E8", c: "#EAF1FB", ink: "#1D3260" },
  { name: "Terracotta", a: "#A4472F", b: "#E6B66D", c: "#F8EEE5", ink: "#542D25" },
  { name: "Charcoal & lime", a: "#29362F", b: "#B5CE59", c: "#EFF3E5", ink: "#222D27" },
  { name: "Burgundy & rose", a: "#7A2336", b: "#E8A5A0", c: "#F8ECEA", ink: "#4A1521" },
  { name: "Teal & coral", a: "#0F6B6B", b: "#F28B66", c: "#E6F4F2", ink: "#0F3F3F" },
  { name: "Indigo & gold", a: "#2F3A8C", b: "#F2C14E", c: "#ECEEFA", ink: "#1E2559" },
  { name: "Olive & cream", a: "#55612B", b: "#E3D08A", c: "#F3F1E3", ink: "#333B19" },
  { name: "Slate & orange", a: "#364B5F", b: "#F2994A", c: "#ECF0F4", ink: "#222F3C" },
  { name: "Emerald & mint", a: "#0B6E4F", b: "#7FD8B0", c: "#E4F5EC", ink: "#08432F" },
];
