// src/lib/brandStudio/styles.js — NEW FILE
//
// AIM
// The ten logo mark styles. Each draws one mark inside a 100 x 100 box centred on 0,0 (-50 to 50).
// A style gets { p, icon, letter, initials }: the colour set, the business-type symbol, the first
// letter of the business and its one or two initials.
//   needsSlot  true when the style writes the letter ON the symbol, so only symbols that have a
//              letter slot can be used with it.
// Order is part of the v1 pool: never reorder or remove, only add at the end.

import { esc } from "./svgKit.js";

export const FONT_SANS = 'ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';
export const FONT_SERIF = 'Georgia,"Times New Roman",serif';

/** The symbol, scaled and moved. `plain` leaves out its detail lines (used under letters). */
const glyph = (icon, colors, { scale = 1, x = 0, y = 0, plain = false } = {}) =>
  `<g transform="translate(${x} ${y}) scale(${scale})">${icon.draw(colors, plain)}</g>`;

/** Centred text; y is the middle of the letters (the baseline is worked out from the size). */
const label = (text, x, y, size, fill, weight = 900, extra = "") =>
  `<text x="${x}" y="${(y + size * 0.36).toFixed(1)}" text-anchor="middle" font-family='${FONT_SANS}' font-size="${size}" font-weight="${weight}" fill="${fill}"${extra}>${esc(text)}</text>`;

/** A letter written on a symbol at its slot. */
const slotLetter = (icon, scale, letter, fill) => {
  const s = icon.slot;
  return label(letter, +(s.x * scale).toFixed(1), +(s.y * scale).toFixed(1), +(s.s * scale).toFixed(1), fill);
};

export const STYLES = [
  {
    name: "Signature", desc: "A balanced symbol in a soft badge.", needsSlot: false,
    draw: ({ p, icon }) =>
      `<circle r="48" fill="${p.c}"/><circle r="41" fill="none" stroke="${p.a}" stroke-width="3"/>` +
      glyph(icon, { fill: p.a, cut: p.c, acc: p.b }, { scale: 0.95 }) +
      `<circle cx="31" cy="-31" r="6.5" fill="${p.b}"/>`,
  },
  {
    name: "Monogram", desc: "Bold initials in a rounded block.", needsSlot: false,
    draw: ({ p, initials }) =>
      `<rect x="-46" y="-46" width="92" height="92" rx="24" fill="${p.a}"/>` +
      label(initials, 0, -3, initials.length > 1 ? 40 : 54, "#fff", 900, ' letter-spacing="-2"') +
      `<path d="M-14 28H14" stroke="${p.b}" stroke-width="5" stroke-linecap="round"/>`,
  },
  {
    name: "Heritage seal", desc: "A double-ring emblem with a settled feel.", needsSlot: false,
    draw: ({ p, icon }) =>
      `<circle r="47" fill="${p.c}" stroke="${p.a}" stroke-width="4"/><circle r="38" fill="none" stroke="${p.b}" stroke-width="2"/>` +
      glyph(icon, { fill: p.a, cut: p.c, acc: p.b }, { scale: 0.82 }),
  },
  {
    name: "Modern geometry", desc: "A crisp hexagon frame.", needsSlot: false,
    draw: ({ p, icon }) =>
      `<path d="M0-48L42-24V24L0 48L-42 24V-24Z" fill="${p.c}" stroke="${p.a}" stroke-width="4" stroke-linejoin="round"/>` +
      glyph(icon, { fill: p.a, cut: p.c, acc: p.b }, { scale: 0.88 }),
  },
  {
    name: "Growth mark", desc: "A rising block that points up.", needsSlot: false,
    draw: ({ p, icon }) =>
      `<path d="M-42 36V-14L0-45L42-14V36Z" fill="${p.a}" stroke="${p.a}" stroke-width="6" stroke-linejoin="round"/>` +
      glyph(icon, { fill: "#fff", cut: p.a, acc: p.b }, { scale: 0.78, y: 5 }) +
      `<path d="M-24 47H24" stroke="${p.b}" stroke-width="5" stroke-linecap="round"/>`,
  },
  {
    name: "Minimal stamp", desc: "A simple square that stays clear when small.", needsSlot: false,
    draw: ({ p, icon }) =>
      `<rect x="-44" y="-44" width="88" height="88" rx="8" fill="${p.a}"/>` +
      `<rect x="-37" y="-37" width="74" height="74" rx="4" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="2"/>` +
      glyph(icon, { fill: "#fff", cut: p.a, acc: p.b }, { scale: 0.85 }),
  },
  {
    name: "Inscribed", desc: "Your initial written on the symbol.", needsSlot: true,
    draw: ({ p, icon, letter }) =>
      glyph(icon, { fill: p.a, cut: p.a, acc: p.b }, { scale: 1.55, plain: true }) + slotLetter(icon, 1.55, letter, "#fff"),
  },
  {
    name: "Knock-out", desc: "Your initial cut out of the symbol.", needsSlot: true,
    draw: ({ p, icon, letter }) => {
      const s = icon.slot, k = 1.55;
      const cutLetter = label(letter, +(s.x * k).toFixed(1), +(s.y * k).toFixed(1), +(s.s * k).toFixed(1), "#000");
      return (
        `<defs><mask id="k" maskUnits="userSpaceOnUse" x="-60" y="-60" width="120" height="120"><rect x="-60" y="-60" width="120" height="120" fill="#fff"/>${cutLetter}</mask></defs>` +
        `<g mask="url(#k)">${glyph(icon, { fill: p.a, cut: p.a, acc: p.b }, { scale: k, plain: true })}</g>`
      );
    },
  },
  {
    name: "Watermark", desc: "A big initial over a faded symbol.", needsSlot: false,
    draw: ({ p, icon, letter }) =>
      `<rect x="-46" y="-46" width="92" height="92" rx="22" fill="${p.c}" stroke="${p.a}" stroke-width="3"/>` +
      `<g opacity=".16">${glyph(icon, { fill: p.a, cut: p.c, acc: p.b }, { scale: 1.4, plain: true })}</g>` +
      label(letter, 0, -3, 68, p.a) +
      `<path d="M-14 33H14" stroke="${p.b}" stroke-width="5" stroke-linecap="round"/>`,
  },
  {
    name: "Two-tone", desc: "A split disc with the symbol in both colours.", needsSlot: false,
    draw: ({ p, icon }) =>
      `<defs><clipPath id="l"><rect x="-50" y="-50" width="50.6" height="100"/></clipPath><clipPath id="r"><rect x="0" y="-50" width="50" height="100"/></clipPath></defs>` +
      `<g clip-path="url(#l)"><circle r="47" fill="${p.a}"/>${glyph(icon, { fill: "#fff", cut: p.a, acc: p.b }, { scale: 0.98, plain: true })}</g>` +
      `<g clip-path="url(#r)"><circle r="47" fill="${p.b}"/>${glyph(icon, { fill: p.a, cut: p.b, acc: p.a }, { scale: 0.98, plain: true })}</g>`,
  },
];

export const STYLE_COUNT = STYLES.length;
