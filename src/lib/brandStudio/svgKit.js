// src/lib/brandStudio/svgKit.js — NEW FILE
//
// AIM
// Tiny helpers shared by the logo and avatar drawing code: text escaping, a stable hash, a seeded
// random-number generator (so "show more designs" is repeatable), and path builders.
// Nothing here touches the browser, so the same code can run in tests or on a server.

/** Escape text so a business name can never break out of an SVG attribute or element. */
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));

/** Stable 32-bit hash (FNV-1a). The same text always gives the same number. */
export function hash(str) {
  let h = 2166136261;
  for (const ch of String(str)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Seeded random numbers (mulberry32): rng(seed)() returns 0 <= n < 1. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A new shuffled copy of the list, using the given random function. */
export function shuffle(list, random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const mod = (n, m) => ((Math.trunc(n) % m) + m) % m;
export const isInt = (n) => typeof n === "number" && Number.isFinite(n);

/** Path data for a full circle. */
export const circle = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

/** A filled shape. */
export const solid = (color, d, extra = "") => `<path d="${d}" fill="${color}"${extra}/>`;

/** A line (not filled). */
export const stroke = (color, d, w = 3, extra = "") =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;

/** Round dots at the given points. */
export const dots = (color, points, w = 4.5) =>
  stroke(color, points.map(([x, y]) => `M${x} ${y}h.01`).join(""), w);
