// src/lib/shareCard.js — MODIFIED FILE (one design, two shapes: the poster and the link preview; site cards added)
//
// AIM
// Draws the picture for a share. It is made on the person's own device from the live data.
//
//   renderPoster(card)    1080 x 1350 PNG (portrait). For "Share as poster": download it, post it.
//   renderPreview(card)   1200 x 630 JPEG, a few hundred KB at most (landscape). It is saved by
//                         lib/api/shareCards.js and is what WhatsApp, Facebook, Telegram and X show
//                         when the shared LINK is pasted.
//   cardFingerprint(card) a short code of everything the picture shows. When the data changes the code
//                         changes, so a saved preview is never out of date.
//
// THE DESIGN (the same in both shapes; portrait stacks it, landscape puts the photo on the left)
//   business   cover photo on top | LOGO beside the NAME, type | location, phone, description
//   item       item photo on top | name, price tag, place, note | LOGO beside the business NAME
//   site       hero photo  | LOGO beside the brand NAME | tagline | three facts (from the system)
//
// `card` is built by lib/share.js. The logo is the business's uploaded logo or the logo drawn from its
// saved design; for the site it is the BizKenia mark. A picture that cannot be fetched is replaced by a
// coloured block with the first letter, so a card is always made. Pictures are read with fetch (not
// <img>) so the canvas stays exportable.

import { logoUri, safeFileName, typeCaption } from "./brandStudio/index.js";
import markUrl from "../assets/bizkenia-mark.png";

export { safeFileName };

const DESIGN_VERSION = "c3"; // change this to redraw every saved preview
const PW = 1080, PH = 1350, PAD = 48;      // poster
const LW = 1200, LH = 630, LFOOT = 52;      // link preview
const CONTENT_H = LH - LFOOT;
const GREEN = "#16A34A";
const GREEN_DARK = "#166534";
const INK = "#111827";
const MUTED = "#4B5563";
const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

// ---- fingerprint --------------------------------------------------------------------------------
export function cardFingerprint(card) {
  const b = card.business || {};
  const seen = JSON.stringify([
    DESIGN_VERSION, card.layout, card.title, card.image, card.badge, card.price, card.unit, card.was, card.place, card.note,
    card.description, card.brandName, card.tagline, card.facts,
    b.id, b.name, b.business_type, b.logo_url, b.logo_design, b.county, b.address, b.phone, b.whatsapp, b.description, b.cover_url,
  ]);
  let h = 0x811c9dc5; // FNV-1a
  for (let i = 0; i < seen.length; i++) { h ^= seen.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

// ---- loading pictures ---------------------------------------------------------------------------
function decode(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadRemote(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: "cors", cache: "reload" }); // "reload": an <img> may have cached it without CORS headers
    if (!res.ok) return null;
    const objectUrl = URL.createObjectURL(await res.blob());
    const img = await decode(objectUrl);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
    return img;
  } catch {
    return null;
  }
}

async function loadLogo(card) {
  if (card.layout === "site") return loadRemote(markUrl);
  const b = card.business;
  const uploaded = await loadRemote(b.logo_url);
  if (uploaded) return uploaded;
  return decode(logoUri({ id: b.id, name: b.name, type: b.business_type, design: b.logo_design, layout: "icon" }));
}

async function prepare(card) {
  if (document.fonts?.load) {
    await Promise.race([
      Promise.all([document.fonts.load("700 40px Inter"), document.fonts.load("400 40px Inter")]),
      new Promise((r) => setTimeout(r, 1500)),
    ]).catch(() => {});
  }
  const [image, logo] = await Promise.all([loadRemote(card.image), loadLogo(card)]);
  return { image, logo };
}

// ---- drawing helpers ----------------------------------------------------------------------------
function roundPath(ctx, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

function drawFit(ctx, img, x, y, w, h, r, mode) {
  ctx.save();
  roundPath(ctx, x, y, w, h, r);
  ctx.clip();
  const scale = mode === "contain" ? Math.min(w / img.width, h / img.height) : Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

function drawPlaceholder(ctx, letter, x, y, w, h, r = 0) {
  ctx.save();
  roundPath(ctx, x, y, w, h, r);
  ctx.clip();
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, GREEN);
  g.addColorStop(1, GREEN_DARK);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = `700 ${Math.round(Math.min(w, h) * 0.45)}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(letter || "?").charAt(0).toUpperCase(), x + w / 2, y + h / 2);
  ctx.restore();
}

/** The big picture: the photo cropped to fit, or a coloured block with a letter. */
function photo(ctx, img, letter, x, y, w, h) {
  if (img) drawFit(ctx, img, x, y, w, h, 0, "cover"); else drawPlaceholder(ctx, letter, x, y, w, h);
}

/** Breaks text into at most maxLines lines that fit maxWidth; the last line ends with "…" when cut. */
function wrap(ctx, str, maxWidth, maxLines) {
  const words = String(str || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width <= maxWidth || !line) { line = test; continue; }
    lines.push(line);
    line = words[i];
    if (lines.length === maxLines) { line = ""; break; }
  }
  if (line) lines.push(line);
  const cut = lines.length > maxLines || (lines.length === maxLines && words.join(" ").length > lines.join(" ").length + 1);
  const out = lines.slice(0, maxLines);
  if (cut && out.length) {
    let last = out[out.length - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    out[out.length - 1] = `${last.replace(/[ ,.;:-]+$/, "")}…`;
  }
  while (out.length && ctx.measureText(out[out.length - 1]).width > maxWidth) {
    out[out.length - 1] = `${out[out.length - 1].slice(0, -2)}…`; // one very long word
  }
  return out;
}

/** wrap() with the font set first. */
function lines(ctx, str, { size, weight = 400, width, max }) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  return wrap(ctx, str, width, max);
}

function text(ctx, str, x, y, { size, weight = 400, color = INK, align = "left" }) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(str, x, y);
}

function pill(ctx, label, x, y, size = 30) {
  ctx.font = `700 ${size}px ${FONT}`;
  const w = Math.ceil(ctx.measureText(label).width) + size * 1.5;
  const h = size + size * 0.9;
  ctx.fillStyle = "#fff";
  roundPath(ctx, x, y, w, h, h / 2);
  ctx.fill();
  text(ctx, label, x + size * 0.75, y + h / 2 + size * 0.35, { size, weight: 700, color: GREEN_DARK });
}

function pin(ctx, x, y, color, s = 1) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + 14 * s, y - 22 * s, 13 * s, Math.PI, 0);
  ctx.lineTo(x + 14 * s, y + 6 * s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x + 14 * s, y - 22 * s, 5 * s, 0, Math.PI * 2);
  ctx.fill();
}

function logoBox(ctx, logo, letter, x, y, size, fit = "cover") {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.16)";
  ctx.shadowBlur = size * 0.1;
  ctx.shadowOffsetY = size * 0.035;
  ctx.fillStyle = "#fff";
  roundPath(ctx, x, y, size, size, size * 0.22);
  ctx.fill();
  ctx.restore();
  const inset = size * 0.03;
  const pad = fit === "contain" ? size * 0.1 : inset;
  if (logo) drawFit(ctx, logo, x + pad, y + pad, size - pad * 2, size - pad * 2, size * 0.2, fit);
  else drawPlaceholder(ctx, letter, x + inset, y + inset, size - inset * 2, size - inset * 2, size * 0.2);
}

const place = (b) => [b.address, b.county].filter(Boolean).join(", ");
const typeLine = (b) => [typeCaption(b.business_type), b.county].filter(Boolean).join(" · ");
const nameOf = (card) => (card.layout === "site" ? card.brandName : card.business.name);
const subOf = (card) => (card.layout === "site" ? "" : typeLine(card.business));

/** One "LABEL  value" row of facts, used by the business details and the site facts. */
function factRow(ctx, label, value, x, y, { labelSize, valueSize, labelW, maxW }) {
  text(ctx, label, x, y, { size: labelSize, weight: 700, color: GREEN_DARK });
  const [one] = lines(ctx, value, { size: valueSize, weight: 600, width: maxW - labelW, max: 1 });
  text(ctx, one || "", x + labelW, y + 2, { size: valueSize, weight: 600 });
}

// ---- the poster (portrait) -----------------------------------------------------------------------
function posterFooter(ctx, host) {
  ctx.fillStyle = GREEN;
  ctx.fillRect(0, PH - 80, PW, 80);
  text(ctx, host, PW / 2, PH - 28, { size: 30, weight: 600, color: "#fff", align: "center" });
}

function posterBusiness(ctx, c, { image, logo, host }) {
  const b = c.business;
  photo(ctx, image, b.name, 0, 0, PW, 620);
  pill(ctx, typeCaption(b.business_type), PAD, PAD);

  const LOGO = 176, top = 664;
  logoBox(ctx, logo, b.name, PAD, top, LOGO);
  const tx = PAD + LOGO + 36;
  const nameLines = lines(ctx, b.name, { size: 60, weight: 700, width: PW - tx - PAD, max: 2 });
  const block = nameLines.length * 70 + 46;
  let y = top + (LOGO - block) / 2 + 54;
  nameLines.forEach((l) => { text(ctx, l, tx, y, { size: 60, weight: 700 }); y += 70; });
  text(ctx, typeLine(b), tx, y - 14, { size: 34, color: MUTED });

  ctx.fillStyle = "#E5E7EB";
  ctx.fillRect(PAD, 880, PW - PAD * 2, 2);
  let dy = 944;
  lines(ctx, c.description || b.description || "", { size: 38, width: PW - PAD * 2, max: 3 }).forEach((l) => { text(ctx, l, PAD, dy, { size: 38, color: "#374151" }); dy += 56; });

  let ry = 1128;
  [["LOCATION", place(b) || "Kenya"], ["CALL", b.phone || ""], ["WHATSAPP", b.whatsapp && b.whatsapp !== b.phone ? b.whatsapp : ""]]
    .filter((r) => r[1]).slice(0, 3)
    .forEach(([k, v]) => { factRow(ctx, k, v, PAD, ry, { labelSize: 26, valueSize: 36, labelW: 220, maxW: PW - PAD * 2 }); ry += 52; });
  posterFooter(ctx, host);
}

function posterItem(ctx, c, { image, logo, host }) {
  const b = c.business;
  photo(ctx, image, c.title, 0, 0, PW, 640);
  if (c.badge) pill(ctx, c.badge, PAD, PAD);

  const nameLines = lines(ctx, c.title, { size: 58, weight: 700, width: PW - PAD * 2, max: 2 });
  let y = 640 + 40 + 54;
  nameLines.forEach((l) => { text(ctx, l, PAD, y, { size: 58, weight: 700 }); y += 68; });

  const tagY = y - 68 + 44;
  ctx.font = `700 52px ${FONT}`;
  const priceW = ctx.measureText(c.price).width;
  ctx.font = `500 32px ${FONT}`;
  const unitW = c.unit ? ctx.measureText(` / ${c.unit}`).width : 0;
  const tagW = Math.ceil(priceW + unitW) + 56;
  ctx.fillStyle = GREEN;
  roundPath(ctx, PAD, tagY, tagW, 88, 22);
  ctx.fill();
  text(ctx, c.price, PAD + 28, tagY + 61, { size: 52, weight: 700, color: "#fff" });
  if (c.unit) text(ctx, ` / ${c.unit}`, PAD + 28 + priceW, tagY + 61, { size: 32, weight: 500, color: "rgba(255,255,255,0.92)" });
  if (c.was) {
    const wx = PAD + tagW + 28;
    text(ctx, c.was, wx, tagY + 58, { size: 36, weight: 500, color: "#9CA3AF" });
    ctx.font = `500 36px ${FONT}`;
    ctx.fillStyle = "#9CA3AF";
    ctx.fillRect(wx, tagY + 44, ctx.measureText(c.was).width, 3);
  }

  let ly = tagY + 88 + 62;
  if (c.place) {
    pin(ctx, PAD, ly, GREEN);
    const [one] = lines(ctx, c.place, { size: 36, weight: 500, width: PW - PAD * 2 - 52, max: 1 });
    text(ctx, one, PAD + 52, ly, { size: 36, weight: 500, color: MUTED });
    ly += 52;
  }
  if (c.note) text(ctx, c.note, PAD, ly, { size: 34, weight: 700, color: GREEN_DARK });

  ctx.fillStyle = "#E5E7EB";
  ctx.fillRect(PAD, 1090, PW - PAD * 2, 2);
  logoBox(ctx, logo, b.name, PAD, 1120, 112);
  const tx = PAD + 112 + 28;
  const [name] = lines(ctx, b.name, { size: 44, weight: 700, width: PW - tx - PAD, max: 1 });
  text(ctx, name, tx, 1170, { size: 44, weight: 700 });
  text(ctx, typeLine(b), tx, 1214, { size: 30, color: MUTED });
  posterFooter(ctx, host);
}

function posterSite(ctx, c, { image, logo, host }) {
  photo(ctx, image, c.brandName, 0, 0, PW, 640);
  if (c.badge) pill(ctx, c.badge, PAD, PAD);

  const LOGO = 128, top = 640 + 40;
  logoBox(ctx, logo, c.brandName, PAD, top, LOGO, "contain");
  const tx = PAD + LOGO + 32;
  const nameLines = lines(ctx, c.brandName, { size: 62, weight: 700, width: PW - tx - PAD, max: 2 });
  let y = top + (LOGO - nameLines.length * 70) / 2 + 54;
  nameLines.forEach((l) => { text(ctx, l, tx, y, { size: 62, weight: 700 }); y += 70; });

  let ty = top + LOGO + 64;
  lines(ctx, c.tagline || "", { size: 38, width: PW - PAD * 2, max: 2 }).forEach((l) => { text(ctx, l, PAD, ty, { size: 38, color: "#374151" }); ty += 54; });

  ctx.fillStyle = "#E5E7EB";
  ctx.fillRect(PAD, 980, PW - PAD * 2, 2);
  (c.facts || []).slice(0, 3).forEach(([k, v], i) => {
    const ly = 1036 + i * 78;
    text(ctx, k, PAD, ly, { size: 24, weight: 700, color: GREEN_DARK });
    const [one] = lines(ctx, v, { size: 40, weight: 600, width: PW - PAD * 2, max: 1 });
    text(ctx, one || "", PAD, ly + 42, { size: 40, weight: 600 });
  });
  posterFooter(ctx, host);
}

// ---- the link preview (landscape): the photo on top, the details below it --------------------------
const PHOTO_H = 300;                        // height of the photo band at the top of the preview
const LPAD = 40;

function previewFooter(ctx, host) {
  ctx.fillStyle = GREEN;
  ctx.fillRect(0, LH - LFOOT, LW, LFOOT);
  text(ctx, host, LW / 2, LH - 16, { size: 26, weight: 600, color: "#fff", align: "center" });
}

function previewBusiness(ctx, c, { image, logo, host }) {
  const b = c.business;
  photo(ctx, image, b.name, 0, 0, LW, PHOTO_H);
  pill(ctx, typeCaption(b.business_type), 28, 28, 24);
  const top = PHOTO_H + 24, colW = 640;
  logoBox(ctx, logo, b.name, LPAD, top, 96, "cover");
  const tx = LPAD + 96 + 22;
  const nameLines = lines(ctx, b.name, { size: 38, weight: 700, width: colW - 96 - 22, max: 2 });
  const sub = typeLine(b);
  let ty = top + (96 - (nameLines.length * 44 + (sub ? 30 : 0))) / 2 + 34;
  nameLines.forEach((l) => { text(ctx, l, tx, ty, { size: 38, weight: 700 }); ty += 44; });
  if (sub) text(ctx, sub, tx, ty - 8, { size: 24, color: MUTED });

  const rx = LPAD + colW + 40, rw = LW - rx - LPAD;
  let ry = top + 22;
  [["LOCATION", place(b) || "Kenya"], ["CALL", b.phone || ""]].filter((r) => r[1]).forEach(([k, v]) => {
    text(ctx, k, rx, ry, { size: 20, weight: 700, color: GREEN_DARK });
    lines(ctx, v, { size: 28, weight: 600, width: rw, max: k === "LOCATION" ? 2 : 1 }).forEach((l) => { ry += 34; text(ctx, l, rx, ry, { size: 28, weight: 600 }); });
    ry += 34;
  });

  let dy = top + 96 + 70;
  lines(ctx, c.description || b.description || "", { size: 24, width: LW - LPAD * 2, max: 2 }).forEach((l) => { text(ctx, l, LPAD, dy, { size: 24, color: "#374151" }); dy += 32; });
  previewFooter(ctx, host);
}

function previewItem(ctx, c, { image, logo, host }) {
  const b = c.business;
  photo(ctx, image, c.title, 0, 0, LW, PHOTO_H);
  if (c.badge) pill(ctx, c.badge, 28, 28, 24);
  const top = PHOTO_H + 22;

  // price tag on the right
  ctx.font = `700 38px ${FONT}`;
  const priceW = ctx.measureText(c.price).width;
  ctx.font = `500 24px ${FONT}`;
  const unitW = c.unit ? ctx.measureText(` / ${c.unit}`).width : 0;
  const tagW = Math.ceil(priceW + unitW) + 40;
  const tagX = LW - LPAD - tagW;
  ctx.fillStyle = GREEN;
  roundPath(ctx, tagX, top, tagW, 62, 16);
  ctx.fill();
  text(ctx, c.price, tagX + 20, top + 43, { size: 38, weight: 700, color: "#fff" });
  if (c.unit) text(ctx, ` / ${c.unit}`, tagX + 20 + priceW, top + 43, { size: 24, weight: 500, color: "rgba(255,255,255,0.92)" });

  // name on the left
  const [name] = lines(ctx, c.title, { size: 40, weight: 700, width: tagX - LPAD - 24, max: 1 });
  text(ctx, name, LPAD, top + 44, { size: 40, weight: 700 });

  // place and note
  const ly = top + 62 + 40;
  let lx = LPAD;
  if (c.place) {
    pin(ctx, lx, ly, GREEN, 0.8);
    const [one] = lines(ctx, c.place, { size: 26, weight: 500, width: c.note ? 640 : LW - LPAD * 2 - 40, max: 1 });
    text(ctx, one, lx + 38, ly, { size: 26, weight: 500, color: MUTED });
    ctx.font = `500 26px ${FONT}`;
    lx += 38 + ctx.measureText(one).width + 36;
  }
  if (c.note) text(ctx, c.note, lx, ly, { size: 26, weight: 700, color: GREEN_DARK });

  // the business: logo, then name
  const dyv = ly + 24;
  ctx.fillStyle = "#E5E7EB";
  ctx.fillRect(LPAD, dyv, LW - LPAD * 2, 2);
  const by = dyv + 18;
  logoBox(ctx, logo, b.name, LPAD, by, 72);
  const tx = LPAD + 72 + 20;
  const [bn] = lines(ctx, b.name, { size: 32, weight: 700, width: LW - tx - LPAD, max: 1 });
  text(ctx, bn, tx, by + 32, { size: 32, weight: 700 });
  text(ctx, typeLine(b), tx, by + 62, { size: 22, color: MUTED });
  previewFooter(ctx, host);
}

function previewSite(ctx, c, { image, logo, host }) {
  photo(ctx, image, c.brandName, 0, 0, LW, PHOTO_H);
  if (c.badge) pill(ctx, c.badge, 28, 28, 24);
  const top = PHOTO_H + 22;
  logoBox(ctx, logo, c.brandName, LPAD, top, 88, "contain");
  const tx = LPAD + 88 + 22;
  text(ctx, c.brandName, tx, top + 40, { size: 40, weight: 700 });
  const [tag] = lines(ctx, c.tagline || "", { size: 26, width: LW - tx - LPAD, max: 1 });
  text(ctx, tag || "", tx, top + 78, { size: 26, color: "#374151" });
  ctx.fillStyle = "#E5E7EB";
  ctx.fillRect(LPAD, top + 108, LW - LPAD * 2, 2);
  const facts = (c.facts || []).slice(0, 3), cw = (LW - LPAD * 2) / Math.max(facts.length, 1);
  facts.forEach(([k, v], i) => {
    const fx = LPAD + i * cw;
    text(ctx, k, fx, top + 150, { size: 20, weight: 700, color: GREEN_DARK });
    const [one] = lines(ctx, v, { size: 32, weight: 600, width: cw - 20, max: 1 });
    text(ctx, one || "", fx, top + 188, { size: 32, weight: 600 });
  });
  previewFooter(ctx, host);
}

// ---- public ----------------------------------------------------------------------------------------
async function draw(card, shape, { host, type, quality }) {
  try {
    const parts = await prepare(card);
    const canvas = document.createElement("canvas");
    const [w, h] = shape === "poster" ? [PW, PH] : [LW, LH];
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    const fns = { business: [posterBusiness, previewBusiness], item: [posterItem, previewItem], site: [posterSite, previewSite] }[card.layout];
    fns[shape === "poster" ? 0 : 1](ctx, card, { ...parts, host });
    const toBlob = (q) => new Promise((resolve) => canvas.toBlob((blob) => resolve(blob || null), type, q));
    let blob = await toBlob(quality);
    // a link preview must stay small: WhatsApp drops heavy pictures
    for (const q of shape === "preview" ? [0.7, 0.58] : []) { if (blob && blob.size > 280 * 1024) blob = await toBlob(q); }
    return blob;
  } catch {
    return null;
  }
}

/** The poster: PNG, 1080 x 1350. Returns a Blob, or null when this browser cannot draw it. */
export const renderPoster = (card, { host = "" } = {}) => draw(card, "poster", { host, type: "image/png" });

/** The link preview: JPEG, 1200 x 630, under about 280 KB. Returns a Blob, or null. */
export const renderPreview = (card, { host = "" } = {}) => draw(card, "preview", { host, type: "image/jpeg", quality: 0.82 });
