// src/lib/shareCard.js — NEW FILE
//
// AIM
// Draws the picture people share: a 1080 x 1350 PNG made on the person's own device (nothing is uploaded).
//
//   layout "business"
//     [ cover photo, with the business type on it ]
//     [ LOGO ]  Business name
//               type · place
//     description, location, phone
//     footer: "Tap the link to view · site address"
//
//   layout "item"  (a product, a piece of produce, or a room type)
//     [ item photo, with a label such as "For sale" ]
//     Item name
//     [ KSh price / unit ]  old price
//     place
//     note (only 3 left, 2 rooms available...)
//     ----------------------------------------
//     [ LOGO ]  Business name
//               type · county
//     footer: "Tap the link to view · site address"
//
// The logo is the business's uploaded logo, or the logo drawn from its saved design, exactly as the
// rest of the app shows it. A picture that cannot be fetched is replaced by a coloured block with the
// first letter, so the card is always made. Pictures are read with fetch (not <img>) so the canvas
// stays exportable.

import { logoUri, safeFileName, typeCaption } from "./brandStudio/index.js";

export { safeFileName };

const W = 1080;
const H = 1350;
const PAD = 48;
const GREEN = "#16A34A";
const GREEN_DARK = "#166534";
const INK = "#111827";
const MUTED = "#4B5563";
const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

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

async function loadLogo(b) {
  const uploaded = await loadRemote(b.logo_url);
  if (uploaded) return uploaded;
  return decode(logoUri({ id: b.id, name: b.name, type: b.business_type, design: b.logo_design, layout: "icon" }));
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

/** Fills the box with the picture, cropped to fit (like CSS object-fit: cover). */
function drawCover(ctx, img, x, y, w, h, r = 0) {
  ctx.save();
  roundPath(ctx, x, y, w, h, r);
  ctx.clip();
  const scale = Math.max(w / img.width, h / img.height);
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

/** Breaks text into at most maxLines lines that fit maxWidth; the last line ends with "…" when cut. */
function wrap(ctx, text, maxWidth, maxLines) {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
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

function text(ctx, str, x, y, { size, weight = 400, color = INK, align = "left" }) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(str, x, y);
}

function pill(ctx, label, x, y, { size = 30, bg = "#fff", fg = GREEN_DARK }) {
  ctx.font = `700 ${size}px ${FONT}`;
  const w = Math.ceil(ctx.measureText(label).width) + 44;
  const h = size + 28;
  ctx.fillStyle = bg;
  roundPath(ctx, x, y, w, h, h / 2);
  ctx.fill();
  text(ctx, label, x + 22, y + h / 2 + size * 0.35, { size, weight: 700, color: fg });
  return w;
}

function pin(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + 14, y - 22, 13, Math.PI, 0);
  ctx.lineTo(x + 14, y + 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x + 14, y - 22, 5, 0, Math.PI * 2);
  ctx.fill();
}

function logoBox(ctx, logo, b, x, y, size) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.16)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = "#fff";
  roundPath(ctx, x, y, size, size, size * 0.22);
  ctx.fill();
  ctx.restore();
  if (logo) drawCover(ctx, logo, x + 4, y + 4, size - 8, size - 8, size * 0.2);
  else drawPlaceholder(ctx, b.name, x + 4, y + 4, size - 8, size - 8, size * 0.2);
}

function footer(ctx, { host }) {
  ctx.fillStyle = GREEN;
  ctx.fillRect(0, H - 80, W, 80);
  text(ctx, `Tap the link to view  ·  ${host}`, W / 2, H - 28, { size: 30, weight: 600, color: "#fff", align: "center" });
}

const place = (b) => [b.address, b.county].filter(Boolean).join(", ");
const typeLine = (b) => [typeCaption(b.business_type), b.county].filter(Boolean).join(" · ");

// ---- the two layouts ----------------------------------------------------------------------------
function drawBusiness(ctx, c, { cover, logo, host }) {
  const b = c.business;
  if (cover) drawCover(ctx, cover, 0, 0, W, 620); else drawPlaceholder(ctx, b.name, 0, 0, W, 620);
  pill(ctx, typeCaption(b.business_type), PAD, PAD, { size: 30 });

  // logo to the left of the name
  const LOGO = 176;
  const top = 620 + 44;
  logoBox(ctx, logo, b, PAD, top, LOGO);
  const tx = PAD + LOGO + 36;
  ctx.font = `700 60px ${FONT}`;
  const nameLines = wrap(ctx, b.name, W - tx - PAD, 2);
  const block = nameLines.length * 70 + 46;
  let y = top + (LOGO - block) / 2 + 54;
  nameLines.forEach((l) => { text(ctx, l, tx, y, { size: 60, weight: 700 }); y += 70; });
  text(ctx, typeLine(b), tx, y - 14, { size: 34, color: MUTED });

  // details
  ctx.fillStyle = "#E5E7EB";
  ctx.fillRect(PAD, 880, W - PAD * 2, 2);
  ctx.font = `400 38px ${FONT}`;
  const lines = wrap(ctx, c.description || b.description || "", W - PAD * 2, 3);
  let dy = 944;
  lines.forEach((l) => { text(ctx, l, PAD, dy, { size: 38, color: "#374151" }); dy += 56; });

  let ry = 1128;
  const rows = [["LOCATION", place(b) || "Kenya"], ["CALL", b.phone || ""], ["WHATSAPP", b.whatsapp && b.whatsapp !== b.phone ? b.whatsapp : ""]].filter((r) => r[1]);
  rows.slice(0, 3).forEach(([k, v]) => {
    text(ctx, k, PAD, ry, { size: 26, weight: 700, color: GREEN_DARK });
    ctx.font = `600 36px ${FONT}`;
    const [one] = wrap(ctx, v, W - PAD * 2 - 220, 1);
    text(ctx, one, PAD + 220, ry + 2, { size: 36, weight: 600 });
    ry += 52;
  });
  footer(ctx, { host });
}

function drawItem(ctx, c, { photo, logo, host }) {
  const b = c.business;
  if (photo) drawCover(ctx, photo, 0, 0, W, 640); else drawPlaceholder(ctx, c.title, 0, 0, W, 640);
  if (c.badge) pill(ctx, c.badge, PAD, PAD, { size: 30 });

  // details: name, price tag, location, note
  ctx.font = `700 58px ${FONT}`;
  const nameLines = wrap(ctx, c.title, W - PAD * 2, 2);
  let y = 640 + 40 + 54;
  nameLines.forEach((l) => { text(ctx, l, PAD, y, { size: 58, weight: 700 }); y += 68; });

  const tagY = y - 68 + 44;
  const price = c.price;
  ctx.font = `700 52px ${FONT}`;
  const priceW = ctx.measureText(price).width;
  ctx.font = `500 32px ${FONT}`;
  const unitW = c.unit ? ctx.measureText(` / ${c.unit}`).width : 0;
  const tagW = Math.ceil(priceW + unitW) + 56;
  ctx.fillStyle = GREEN;
  roundPath(ctx, PAD, tagY, tagW, 88, 22);
  ctx.fill();
  text(ctx, price, PAD + 28, tagY + 61, { size: 52, weight: 700, color: "#fff" });
  if (c.unit) text(ctx, ` / ${c.unit}`, PAD + 28 + priceW, tagY + 61, { size: 32, weight: 500, color: "rgba(255,255,255,0.92)" });
  if (c.was) {
    ctx.font = `500 36px ${FONT}`;
    const wx = PAD + tagW + 28;
    text(ctx, c.was, wx, tagY + 58, { size: 36, weight: 500, color: "#9CA3AF" });
    const ww = ctx.measureText(c.was).width;
    ctx.fillStyle = "#9CA3AF";
    ctx.fillRect(wx, tagY + 44, ww, 3);
  }

  let ly = tagY + 88 + 62;
  if (c.place) {
    pin(ctx, PAD, ly, GREEN);
    ctx.font = `500 36px ${FONT}`;
    const [one] = wrap(ctx, c.place, W - PAD * 2 - 52, 1);
    text(ctx, one, PAD + 52, ly, { size: 36, weight: 500, color: MUTED });
    ly += 52;
  }
  if (c.note) text(ctx, c.note, PAD, ly, { size: 34, weight: 700, color: GREEN_DARK });

  // the business: logo, then its name
  ctx.fillStyle = "#E5E7EB";
  ctx.fillRect(PAD, 1090, W - PAD * 2, 2);
  const LOGO = 112;
  logoBox(ctx, logo, b, PAD, 1120, LOGO);
  const tx = PAD + LOGO + 28;
  ctx.font = `700 44px ${FONT}`;
  const [name] = wrap(ctx, b.name, W - tx - PAD, 1);
  text(ctx, name, tx, 1170, { size: 44, weight: 700 });
  text(ctx, typeLine(b), tx, 1214, { size: 30, color: MUTED });
  footer(ctx, { host });
}

/**
 * Makes the card. `card` is built by lib/share.js (businessTarget, productTarget, roomTarget).
 * Returns a PNG Blob, or null when this browser cannot draw it.
 */
export async function renderCard(card, { host = "" } = {}) {
  try {
    if (document.fonts?.load) {
      await Promise.race([
        Promise.all([document.fonts.load(`700 40px Inter`), document.fonts.load(`400 40px Inter`)]),
        new Promise((r) => setTimeout(r, 1500)),
      ]).catch(() => {});
    }
    const [image, logo] = await Promise.all([loadRemote(card.image), loadLogo(card.business)]);
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);
    if (card.layout === "business") drawBusiness(ctx, card, { cover: image, logo, host });
    else drawItem(ctx, card, { photo: image, logo, host });
    return await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob || null), "image/png"));
  } catch {
    return null;
  }
}
