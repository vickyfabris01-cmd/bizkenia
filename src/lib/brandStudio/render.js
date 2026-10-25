// src/lib/brandStudio/render.js — NEW FILE
//
// AIM
// Turns a recipe into a picture. Everything here returns an SVG string (or a data address that an
// <img> can show), drawn in the browser from code that is already loaded: no file is fetched, so a
// logo or avatar appears instantly, even on a slow connection or offline.
//
//   logoSvg({ name, type, design, layout })   layout "wordmark" = 512 x 256 (symbol + name)
//                                              layout "icon"     = 512 x 512 (symbol only)
//   avatarSvg({ name, design })               512 x 512
//   logoUri / avatarUri                       the same, as a data address for <img src>, remembered so a
//                                              long list does not redraw the same logo again and again
//
// Names are escaped before they go into the drawing, and the picture is shown through <img>, where
// scripts never run, so an odd business name cannot cause harm.

import { esc } from "./svgKit.js";
import { PALETTES } from "./palettes.js";
import { FONT_SANS, FONT_SERIF, STYLES } from "./styles.js";
import { iconSet } from "./icons/index.js";
import { resolveAvatarDesign, resolveLogoDesign } from "./designs.js";

export const TYPE_LABEL = { rental: "Rentals", agriculture: "Agriculture", shop: "Shop" };
export const typeCaption = (type) => TYPE_LABEL[type] || "Business";

const NOISE = new Set(["and", "the", "of", "for", "a", "an", "by", "limited", "ltd", "company", "co", "enterprises", "enterprise", "services", "service", "kenya", "kenyan"]);
const wordsOf = (s) => (String(s || "").trim().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?/gu) || []);
const first = (w) => Array.from(w)[0] || "";

/** One or two capital letters for a business: "Lakeview Rentals" gives LR. */
export function businessInitials(name) {
  const ws = wordsOf(name).filter((w) => !NOISE.has(w.toLowerCase()));
  if (!ws.length) return "B";
  if (ws.length === 1) return Array.from(ws[0]).slice(0, 2).join("").toUpperCase();
  return (first(ws[0]) + first(ws[1])).toUpperCase();
}

/** Initials for a person: first and last name, so "Victor Kamau Onyango" gives VO. */
export function personInitials(name) {
  const ws = wordsOf(name);
  if (!ws.length) return "?";
  if (ws.length === 1) return first(ws[0]).toUpperCase();
  return (first(ws[0]) + first(ws[ws.length - 1])).toUpperCase();
}

// ── text fitting ───────────────────────────────────────────────────────────
// Width of a letter is about k x the font size. If the name is too long it drops to two lines, and
// as a last resort textLength squeezes it so it can never run outside the picture.
function fit(text, maxW, k, max, min) {
  const one = Math.min(max, maxW / (Math.max(text.length, 1) * k));
  if (one >= min) return { lines: [text], size: one, k };
  const ws = text.split(" ");
  if (ws.length > 1) {
    let best = null;
    for (let cut = 1; cut < ws.length; cut++) {
      const a = ws.slice(0, cut).join(" "), b = ws.slice(cut).join(" ");
      const worst = Math.max(a.length, b.length);
      if (!best || worst < best.worst) best = { a, b, worst };
    }
    const size = Math.max(16, Math.min(max, maxW / (best.worst * k)));
    return { lines: [best.a, best.b], size, k };
  }
  return { lines: [text], size: Math.max(16, one), k };
}

const textEl = (line, x, y, size, k, maxW, attrs) => {
  const squeeze = line.length * size * k > maxW ? ` textLength="${maxW}" lengthAdjust="spacingAndGlyphs"` : "";
  return `<text x="${x}" y="${y.toFixed(1)}" ${attrs} font-size="${size.toFixed(1)}"${squeeze}>${esc(line)}</text>`;
};

// ── business logo ──────────────────────────────────────────────────────────
export function logoSvg({ id, name, type, design, layout = "wordmark" }) {
  const d = resolveLogoDesign({ id, type, design });
  const p = PALETTES[d.p];
  const icon = iconSet(type)[d.i];
  const display = String(name || "").trim() || "Your Business";
  const initials = businessInitials(display);
  const mark = STYLES[d.s].draw({ p, icon, letter: initials.charAt(0), initials });
  const title = `${esc(display)} logo`;

  if (layout === "icon") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="${title}"><title>${title}</title><g transform="translate(256 256) scale(4.6)">${mark}</g></svg>`;
  }

  const X = 190, MAXW = 306, caption = typeCaption(type).toUpperCase();
  const flavour = d.s % 3; // 0 bold, 1 serif, 2 spaced capitals
  let body;
  if (flavour === 1) {
    const f = fit(display, MAXW, 0.64, 46, 26);
    const lh = f.size * 1.12, H = f.lines.length * lh + 12 + 14 + 14;
    const top = 128 - H / 2;
    const attrs = `font-family='${FONT_SERIF}' font-weight="700" fill="${p.ink}"`;
    body = f.lines.map((l, n) => textEl(l, X, top + f.size * 0.82 + n * lh, f.size, f.k, MAXW, attrs)).join("");
    const yL = top + f.lines.length * lh + 22;
    body += `<text x="${X}" y="${yL.toFixed(1)}" font-family='${FONT_SANS}' font-size="14" font-weight="700" letter-spacing="4" fill="${p.a}">${esc(caption)}</text>`;
    body += `<path d="M${X} ${(yL + 12).toFixed(1)}H${X + 230}M${X} ${(yL + 19).toFixed(1)}H${X + 140}" stroke="${p.b}" stroke-width="2"/>`;
  } else if (flavour === 2) {
    const up = display.toUpperCase();
    const f = fit(up, MAXW, 0.8, 38, 22);
    const lh = f.size * 1.2, H = f.lines.length * lh + 14 + 16;
    const top = 128 - H / 2;
    const attrs = `font-family='${FONT_SANS}' font-weight="700" letter-spacing="1.5" fill="${p.ink}"`;
    body = f.lines.map((l, n) => textEl(l, X, top + f.size * 0.85 + n * lh, f.size, f.k, MAXW, attrs)).join("");
    const yL = top + f.lines.length * lh + 26;
    body += `<path d="M${X} ${(yL - 5).toFixed(1)}h22" stroke="${p.b}" stroke-width="4" stroke-linecap="round"/>`;
    body += `<text x="${X + 32}" y="${yL.toFixed(1)}" font-family='${FONT_SANS}' font-size="14" font-weight="700" letter-spacing="3" fill="${p.a}">${esc(caption)}</text>`;
  } else {
    const f = fit(display, MAXW, 0.62, 48, 26);
    const lh = f.size * 1.1, H = f.lines.length * lh + 16 + 5 + 10 + 15;
    const top = 128 - H / 2;
    const attrs = `font-family='${FONT_SANS}' font-weight="800" letter-spacing="-1" fill="${p.ink}"`;
    body = f.lines.map((l, n) => textEl(l, X, top + f.size * 0.82 + n * lh, f.size, f.k, MAXW, attrs)).join("");
    const yB = top + f.lines.length * lh + 6;
    body += `<rect x="${X}" y="${yB.toFixed(1)}" width="56" height="5" rx="2.5" fill="${p.b}"/>`;
    body += `<text x="${X}" y="${(yB + 28).toFixed(1)}" font-family='${FONT_SANS}' font-size="15" font-weight="700" letter-spacing="3" fill="${p.a}">${esc(caption)}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="256" viewBox="0 0 512 256" role="img" aria-label="${title}"><title>${title}</title><g transform="translate(96 128) scale(1.46)">${mark}</g>${body}</svg>`;
}

// ── profile avatar ─────────────────────────────────────────────────────────
export function avatarSvg({ id, name, design }) {
  const d = resolveAvatarDesign({ id, design });
  const p = PALETTES[d.p];
  const ini = personInitials(String(name || "").trim());
  const fs = ini.length > 1 ? 168 : 216;
  const y = 256 + fs * 0.36;
  const text = (fill) =>
    `<text x="256" y="${y.toFixed(1)}" text-anchor="middle" font-family='${FONT_SANS}' font-size="${fs}" font-weight="850" letter-spacing="-5" fill="${fill}">${esc(ini)}</text>`;

  const light = d.s === 1; // the seal style is a light background
  const tone = light ? p.a : "#fff";
  const op = light ? ".1" : ".16";
  let pattern = "";
  if (d.b === 1) {
    for (let x = 48; x <= 480; x += 64) for (let yy = 48; yy <= 480; yy += 64) pattern += `<circle cx="${x}" cy="${yy}" r="5" fill="${tone}" opacity="${op}"/>`;
  } else if (d.b === 2) {
    let ln = "";
    for (let k = 0; k <= 16; k++) ln += `M${k * 64 - 512} 512L${k * 64} 0`;
    pattern = `<path d="${ln}" stroke="${tone}" stroke-width="16" opacity="${op}" fill="none"/>`;
  } else if (d.b === 3) {
    pattern = [90, 165, 240, 315].map((r) => `<circle cx="256" cy="256" r="${r}" fill="none" stroke="${tone}" stroke-width="7" opacity="${op}"/>`).join("");
  }

  let inner;
  if (d.s === 1) {
    inner =
      `<rect width="512" height="512" fill="${p.c}"/>` + pattern +
      `<circle cx="256" cy="256" r="222" fill="none" stroke="${p.a}" stroke-width="9"/><circle cx="256" cy="256" r="190" fill="none" stroke="${p.b}" stroke-width="4"/>` +
      (d.b === 0 ? `<path d="M150 130Q256 76 362 130" fill="none" stroke="${p.b}" stroke-width="10" stroke-linecap="round"/><circle cx="256" cy="388" r="8" fill="${p.b}"/>` : "") +
      text(p.a);
  } else if (d.s === 2) {
    inner =
      `<rect width="512" height="512" fill="${p.a}"/>` + pattern +
      `<path d="M0 372Q128 282 256 360T512 330V512H0Z" fill="${p.b}" opacity=".92"/>` +
      (d.b === 0 ? `<circle cx="404" cy="112" r="52" fill="${p.c}" opacity=".18"/>` : "") +
      text("#fff");
  } else {
    inner =
      `<rect width="512" height="512" fill="${p.a}"/>` + pattern +
      (d.b === 0
        ? `<circle cx="256" cy="256" r="196" fill="none" stroke="${p.b}" stroke-width="4" stroke-dasharray="2 15" stroke-linecap="round"/>` +
          `<path d="M70 340Q125 100 290 78T440 230" fill="none" stroke="${p.c}" stroke-width="30" stroke-linecap="round" opacity=".16"/>` +
          `<circle cx="394" cy="120" r="38" fill="${p.b}"/><circle cx="394" cy="120" r="13" fill="${p.c}"/>`
        : "") +
      text("#fff");
  }
  const label = esc(String(name || "").trim() || "Profile");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="${label} avatar"><title>${label} avatar</title>${inner}</svg>`;
}

// ── data addresses (what an <img> shows) ───────────────────────────────────
export const svgToUri = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const cache = new Map();
function remember(key, make) {
  if (cache.has(key)) return cache.get(key);
  const uri = svgToUri(make());
  if (cache.size >= 400) cache.delete(cache.keys().next().value); // forget the oldest
  cache.set(key, uri);
  return uri;
}

export function logoUri({ id, name, type, design, layout = "wordmark" }) {
  const d = resolveLogoDesign({ id, type, design });
  return remember(`L|${layout}|${type}|${d.s}.${d.i}.${d.p}|${name}`, () => logoSvg({ id, name, type, design: d, layout }));
}

export function avatarUri({ id, name, design }) {
  const d = resolveAvatarDesign({ id, design });
  return remember(`A|${d.s}.${d.p}.${d.b}|${name}`, () => avatarSvg({ id, name, design: d }));
}
