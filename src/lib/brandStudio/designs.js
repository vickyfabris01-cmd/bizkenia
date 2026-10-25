// src/lib/brandStudio/designs.js — NEW FILE
//
// AIM
// The "recipe" for a logo or an avatar: a few small numbers that are saved in the database
// (businesses.logo_design and profiles.avatar_design). Nothing is stored as a picture; the picture
// is drawn from the recipe wherever it is needed.
//
//   logo recipe    { v: 1, s: style 0-9, i: symbol 0-7, p: palette 0-11 }
//   avatar recipe  { v: 1, s: style 0-2, p: palette 0-11, b: pattern 0-3 }
//
// This file also works out:
//   * a recipe from a person's or business's id when none is saved (deriveLogoDesign / deriveAvatarDesign)
//     so existing rows get a stable, different-looking design with no database change;
//   * the six choices shown in the picker (logoCandidates / avatarCandidates). The first one is
//     what is saved when the person skips choosing.
//
// The "derive" numbers below are the frozen v1 pool. Adding new styles, symbols or palettes later
// must never change what a given id derives, so these constants do not follow the list lengths.

import { hash, isInt, mod, rng, shuffle } from "./svgKit.js";
import { PALETTES } from "./palettes.js";
import { STYLES, STYLE_COUNT } from "./styles.js";
import { ICON_COUNT, iconSet } from "./icons/index.js";

export const DESIGN_VERSION = 1;
export const AVATAR_STYLE_COUNT = 3;
export const AVATAR_PATTERN_COUNT = 4;

const V1 = { styles: 10, icons: 8, palettes: 12, avatarStyles: 3, avatarPatterns: 4 };

/** A fresh random number for "show me more designs". */
export const newSeed = () => Math.floor(Math.random() * 4294967296);

/** Styles that write a letter on the symbol need a symbol with room for it. */
function fixIcon(type, style, icon) {
  if (!STYLES[style].needsSlot) return icon;
  const set = iconSet(type);
  for (let k = 0; k < ICON_COUNT; k++) {
    const j = (icon + k) % ICON_COUNT;
    if (set[j].slot) return j;
  }
  return icon;
}

// ── Business logos ──────────────────────────────────────────────────────────
/** Clean up a saved recipe (or anything that came from the database). Returns null if unusable. */
export function normalizeLogoDesign(d, type) {
  if (!d || typeof d !== "object") return null;
  if (![d.s, d.i, d.p].every(isInt)) return null;
  const s = mod(d.s, STYLE_COUNT);
  return { v: DESIGN_VERSION, s, i: fixIcon(type, s, mod(d.i, ICON_COUNT)), p: mod(d.p, PALETTES.length) };
}

/** The recipe for a business with none saved: always the same for the same id. */
export function deriveLogoDesign(id, type) {
  const h = hash(`${id || "x"}|logo|v1`);
  const s = h % V1.styles;
  return { v: DESIGN_VERSION, s, i: fixIcon(type, s, (h >>> 8) % V1.icons), p: (h >>> 16) % V1.palettes };
}

/** What to draw: the saved recipe if it is valid, otherwise one worked out from the id. */
export const resolveLogoDesign = ({ id, type, design }) => normalizeLogoDesign(design, type) || deriveLogoDesign(id, type);

/** Six different looks: six styles, six symbols, six palettes, all different from each other. */
export function logoCandidates(seed, type, count = 6) {
  const random = rng(seed);
  const styles = shuffle(Array.from({ length: STYLE_COUNT }, (_, k) => k), random).slice(0, count);
  const icons = shuffle(Array.from({ length: ICON_COUNT }, (_, k) => k), random);
  const palettes = shuffle(Array.from({ length: PALETTES.length }, (_, k) => k), random);
  return styles.map((s, k) => ({ v: DESIGN_VERSION, s, i: fixIcon(type, s, icons[k % ICON_COUNT]), p: palettes[k % PALETTES.length] }));
}

// ── Profile avatars ─────────────────────────────────────────────────────────
export function normalizeAvatarDesign(d) {
  if (!d || typeof d !== "object") return null;
  if (![d.s, d.p].every(isInt)) return null;
  return { v: DESIGN_VERSION, s: mod(d.s, AVATAR_STYLE_COUNT), p: mod(d.p, PALETTES.length), b: isInt(d.b) ? mod(d.b, AVATAR_PATTERN_COUNT) : 0 };
}

export function deriveAvatarDesign(id) {
  const h = hash(`${id || "x"}|avatar|v1`);
  return { v: DESIGN_VERSION, s: h % V1.avatarStyles, p: (h >>> 4) % V1.palettes, b: (h >>> 12) % V1.avatarPatterns };
}

export const resolveAvatarDesign = ({ id, design }) => normalizeAvatarDesign(design) || deriveAvatarDesign(id);

export function avatarCandidates(seed, count = 6) {
  const random = rng(seed);
  const styles = shuffle([0, 1, 2], random).concat(shuffle([0, 1, 2], random));
  const palettes = shuffle(Array.from({ length: PALETTES.length }, (_, k) => k), random);
  return Array.from({ length: count }, (_, k) => ({
    v: DESIGN_VERSION, s: styles[k % styles.length], p: palettes[k % PALETTES.length], b: Math.floor(random() * AVATAR_PATTERN_COUNT),
  }));
}

/** True when two recipes draw the same picture. */
export const sameDesign = (a, b) => Boolean(a && b) && ["s", "i", "p", "b"].every((k) => (a[k] ?? 0) === (b[k] ?? 0));
