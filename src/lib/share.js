// src/lib/share.js — MODIFIED FILE (share targets: a business, a product, a piece of produce or a room type)
//
// AIM
// Everything the "Share" feature needs that is not a screen: the link people actually share, the
// ready-made message, the list of social channels, and the "target" of a share. A target says WHAT is
// shared: its page, its message, and the card picture drawn from it (see lib/shareCard.js).
//
//   businessTarget(b)              the business: cover, logo beside the name, details
//   productTarget(b, p, {farm})    a shop product or farm produce: photo, name, price, place, then logo and business
//   roomTarget(b, t, {...})        a room type: photo, name, rent, place, then logo and business
//
// WHY /share/... LINKS
// The site is a single-page app, so WhatsApp, Facebook, X and Telegram only ever see the generic
// <head> of index.html when they fetch a link. A link to /share/... goes through the Worker
// (worker/share.js), which gives those apps the right title, text and picture, and sends people on
// to the real page: the business page, or the product, produce or room page.

import { siteUrl } from "./seo.js";
import { formatKsh } from "./format.js";
import { typeLabel } from "../config/counties.js";

const enc = encodeURIComponent;

export const sharePath = {
  page: (key) => `/page/${key}`, // home | explore | pricing
  business: (b) => `/b/${b.slug}`,
  product: (b, p) => `/b/${b.slug}/p/${p.id}`,
  produce: (b, p) => `/b/${b.slug}/produce/${p.id}`,
  room: (b, t) => `/b/${b.slug}/room/${t.id}`,
};

/** The address to share. `channel` is added as utm_source so owners can see where visitors came from. */
export function shareLink(path, channel) {
  const q = channel ? `?utm_source=${enc(channel)}&utm_medium=social` : "";
  return `${siteUrl()}/share${path}${q}`;
}

export const siteHost = () => siteUrl().replace(/^https?:\/\//, "");

// ---- ready-made messages (the person can edit them before sharing) -------------------------
const place = (b) => b.county || "Kenya";
const KIND = { rental: "rentals", shop: "online shop", agriculture: "farm" };

export const message = {
  home: ({ name, tagline }) => `${name}: ${tagline || "manage and grow your business"}. Rentals, shops and farms across Kenya.`,
  explore: ({ name }) => `Find rentals, shops and farms near you on ${name}.`,
  pricing: ({ name }) => `Run your rental, shop or farm in one place with ${name}. See the plans:`,
  business: (b) => `${b.name} (${KIND[b.business_type] || typeLabel(b.business_type).toLowerCase()}, ${place(b)}). See what we offer:`,
  room: (b, t) => {
    const hostel = Boolean(t.is_hostel);
    const free = Number(t.available) || 0;
    return `${t.name} to rent at ${b.name}, ${place(b)}: ${formatKsh(hostel ? t.semester_price : t.monthly_price)} a ${hostel ? "semester" : "month"}${free > 0 ? `, ${free} available` : ""}.`;
  },
  product: (b, p, farm = false) => {
    const unit = p.unit && p.unit !== "item" ? ` / ${p.unit}` : "";
    return `${p.name} from ${b.name}: ${formatKsh(p.price)}${unit}. ${farm ? "Pay by M-Pesa and collect from the farm." : "Pay with M-Pesa."}`;
  },
};

// ---- targets -----------------------------------------------------------------------------------
const placeOf = (b) => [b.address, b.county].filter(Boolean).join(", ");

/** The business itself. `b` needs: id, slug, name, business_type, description, county, address, phone, whatsapp, logo_url, logo_design, cover_url. */
export function businessTarget(b) {
  return {
    path: sharePath.business(b),
    title: b.name,
    text: message.business(b),
    card: { layout: "business", business: b, image: b.cover_url || "", title: b.name, description: b.description || "" },
  };
}

/** A shop product or a piece of farm produce (`farm: true`). `p` needs: id, name, price, compare_at_price, unit, stock, images. */
export function productTarget(b, p, { farm = false } = {}) {
  const unit = p.unit && p.unit !== "item" ? p.unit : "";
  const stock = Number(p.stock);
  return {
    path: farm ? sharePath.produce(b, p) : sharePath.product(b, p),
    title: `${p.name} | ${b.name}`,
    text: message.product(b, p, farm),
    card: {
      layout: "item", business: b, image: p.images?.[0] || "", title: p.name,
      badge: farm ? "Fresh produce" : "For sale",
      price: formatKsh(p.price), unit, was: p.compare_at_price ? formatKsh(p.compare_at_price) : "",
      place: placeOf(b),
      note: Number.isFinite(stock) ? (stock <= 0 ? "Out of stock" : stock <= 5 ? `Only ${stock} left` : "In stock") : "",
    },
  };
}

/**
 * A room type. `t` needs: id, name, images, is_hostel, monthly_price, semester_price.
 * `building` (name, address) and `available` (rooms free now) are optional extras for the card.
 */
export function roomTarget(b, t, { building, available } = {}) {
  const hostel = Boolean(t.is_hostel);
  const free = Number.isFinite(Number(available)) ? Number(available) : Number(t.available);
  const where = [building?.name || t.building?.name || t.building_name, building?.address || t.building_address, b.county].filter(Boolean).join(", ");
  return {
    path: sharePath.room(b, t),
    title: `${t.name} | ${b.name}`,
    text: message.room(b, { ...t, available: free }),
    card: {
      layout: "item", business: b, image: t.images?.[0] || "", title: t.name,
      badge: hostel ? "Hostel room" : "Room to rent",
      price: formatKsh(hostel ? t.semester_price : t.monthly_price), unit: hostel ? "semester" : "month", was: "",
      place: where,
      note: Number.isFinite(free) ? (free > 0 ? `${free} room${free === 1 ? "" : "s"} available` : "Fully occupied") : "",
    },
  };
}

// ---- channels --------------------------------------------------------------------------------
// href(url, text, title) returns the address that opens that app's share box.
// Instagram and TikTok have no web share address; on a phone they appear in the "Share picture" sheet,
// and "Copy message and link" covers captions and bios.
export const CHANNELS = [
  { id: "whatsapp", label: "WhatsApp", color: "#25D366", href: (u, t) => `https://wa.me/?text=${enc(`${t} ${u}`)}` },
  { id: "facebook", label: "Facebook", color: "#1877F2", href: (u) => `https://www.facebook.com/sharer/sharer.php?u=${enc(u)}` },
  { id: "x", label: "X", color: "#111111", href: (u, t) => `https://twitter.com/intent/tweet?text=${enc(t)}&url=${enc(u)}` },
  { id: "telegram", label: "Telegram", color: "#26A5E4", href: (u, t) => `https://t.me/share/url?url=${enc(u)}&text=${enc(t)}` },
  { id: "linkedin", label: "LinkedIn", color: "#0A66C2", href: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${enc(u)}` },
  { id: "sms", label: "SMS", color: "#16A34A", href: (u, t) => `sms:?&body=${enc(`${t} ${u}`)}` },
  { id: "email", label: "Email", color: "#6B7280", href: (u, t, title) => `mailto:?subject=${enc(title || "")}&body=${enc(`${t}\n\n${u}`)}` },
];

export const canNativeShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.cssText = "position:fixed;opacity:0;top:0;left:0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      el.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
