// src/lib/share.js — MODIFIED FILE (no quantities anywhere; per-business display options; site cards sell the platform)
//
// AIM
// Everything the "Share" feature needs that is not a screen: the link people actually share, the
// ready-made message, the list of social channels, and the "target" of a share. A target says WHAT is
// shared: its page, its message, and the card picture drawn from it (see lib/shareCard.js).
//
//   siteTarget(page, data)         the main site, Explore or Pricing: the brand, a hero photo and what the platform solves
//   businessTarget(b)              the business: cover, logo beside the name, details
//   productTarget(b, p, {farm})    a shop product or farm produce: photo, name, price, place, then logo and business
//   roomTarget(b, t, {...})        a room type: photo, name, rent, place, then logo and business
//
// NO QUANTITIES
// A shared card or message never says how many: no "5 rooms available", "only 3 left", "12 businesses on
// the platform". An item is simply "Available" (or "Out of stock", "Fully occupied", "Not available yet").
// The site cards say what the platform does for people, not how big it is.
//
// DISPLAY OPTIONS (Settings > Share and promote, saved by lib/api/shareOptions.js)
//   showRent        rentals only: the rent price on room cards, posters and link previews
//   showPhone       the phone and WhatsApp number on the business card
//   showLocation    the address and county on cards and in messages
//   showPlanPrices  site only: "from KSh X a month" on the Pricing card (off unless the super admin turns it on)
// Prices of products and produce are always shown.
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

/**
 * The address to share. `v` is the version of the saved link card: a new card gives a new address, so
 * WhatsApp and Facebook (which remember a link's preview) show the new card. `channel` is added as
 * utm_source so owners can see where visitors came from.
 */
export function shareLink(path, channel, v) {
  const q = new URLSearchParams();
  if (v) q.set("v", v);
  if (channel) { q.set("utm_source", channel); q.set("utm_medium", "social"); }
  const s = q.toString();
  return `${siteUrl()}/share${path}${s ? `?${s}` : ""}`;
}

export const siteHost = () => siteUrl().replace(/^https?:\/\//, "");

// ---- display options -----------------------------------------------------------------------------
export const DEFAULT_OPTIONS = Object.freeze({ showRent: true, showPhone: true, showLocation: true, showPlanPrices: false });

/** Any saved options (or nothing) -> a complete set: unknown keys dropped, missing ones default. */
export function normalizeOptions(o) {
  const out = { ...DEFAULT_OPTIONS };
  if (o && typeof o === "object") {
    for (const k of Object.keys(DEFAULT_OPTIONS)) if (typeof o[k] === "boolean") out[k] = o[k];
  }
  return out;
}

// ---- small helpers -------------------------------------------------------------------------------
/** Number(v), but nothing (null, undefined, "") is NaN and not 0. */
const num = (v) => (v === null || v === undefined || v === "" ? NaN : Number(v));

/** What is known about a room type: "available" | "full" | "none" (no rooms added yet) | "" (not known). */
export function roomState(free, total) {
  if (Number.isFinite(total) && total === 0) return "none";
  if (!Number.isFinite(free)) return "";
  return free > 0 ? "available" : "full";
}
const ROOM_NOTE = { available: "Available", full: "Fully occupied", none: "Not available yet" };
const roomFree = (t, available) => (Number.isFinite(num(available)) ? num(available) : num(t?.available));

/**
 * When a share request is about something that cannot be had right now (a product out of stock, a room
 * type with no free room), returns { title, message } for the "Share anyway?" question; otherwise null.
 */
export function unavailability(req) {
  if (!req || !req.item) return null;
  const name = req.item.name || "This";
  if (req.type === "product") {
    const s = num(req.item.stock);
    if (Number.isFinite(s) && s <= 0) {
      return { title: "This is out of stock", message: `${name} is out of stock. Share it anyway? The card and the link will say it is out of stock.` };
    }
  }
  if (req.type === "room") {
    const st = roomState(roomFree(req.item, req.available), num(req.total));
    if (st === "full") return { title: "No free rooms", message: `${name} has no free rooms right now. Share it anyway? The card will say it is fully occupied.` };
    if (st === "none") return { title: "No rooms added yet", message: `${name} has no rooms yet. Share it anyway? The card will say it is not available yet.` };
  }
  return null;
}

// ---- ready-made messages (no numbers of anything) ------------------------------------------------
const place = (b) => b.county || "Kenya";
const KIND = { rental: "rentals", shop: "online shop", agriculture: "farm" };
const trimEnd = (s) => String(s || "").replace(/[.\s]+$/, "");

export const message = {
  home: ({ name, tagline }) => `${name}${tagline ? `: ${trimEnd(tagline)}` : ""}. Collect rent, sell online and keep your farm records in one place.`,
  explore: ({ name }) => `Looking for a room, a good deal or fresh produce? Find rentals, shops and farms on ${name}.`,
  pricing: ({ name }) => `Run your rental, shop or farm from one place with ${name}. See how it works and get started:`,
  business: (b, o = DEFAULT_OPTIONS) => `${b.name} (${KIND[b.business_type] || typeLabel(b.business_type).toLowerCase()}${o.showLocation ? `, ${place(b)}` : ""}). See what we offer:`,
  room: (b, t, o = DEFAULT_OPTIONS) => {
    const hostel = Boolean(t.is_hostel);
    const st = roomState(num(t.available), NaN);
    const rent = o.showRent ? `: ${formatKsh(hostel ? t.semester_price : t.monthly_price)} a ${hostel ? "semester" : "month"}` : "";
    const status = st === "available" ? " Available now." : st === "full" ? " Currently fully occupied." : "";
    return `${t.name} to rent at ${b.name}${o.showLocation ? `, ${place(b)}` : ""}${rent}.${status}`;
  },
  product: (b, p, farm = false) => {
    const unit = p.unit && p.unit !== "item" ? ` / ${p.unit}` : "";
    const stock = num(p.stock);
    const status = Number.isFinite(stock) ? (stock > 0 ? " Available now." : " Currently out of stock.") : "";
    return `${p.name} from ${b.name}: ${formatKsh(p.price)}${unit}.${status} ${farm ? "Pay by M-Pesa and collect from the farm." : "Pay with M-Pesa."}`;
  },
};

// ---- targets -----------------------------------------------------------------------------------
const placeOf = (b) => [b.address, b.county].filter(Boolean).join(", ");

/** The business as the card draws it: the phone and the place are left out when the owner switched them off. */
function cardBusiness(b, o) {
  return {
    ...b,
    phone: o.showPhone ? b.phone : "",
    whatsapp: o.showPhone ? b.whatsapp : "",
    address: o.showLocation ? b.address : "",
    county: o.showLocation ? b.county : "",
  };
}

/** The business itself. `b` needs: id, slug, name, business_type, description, county, address, phone, whatsapp, logo_url, logo_design, cover_url. */
export function businessTarget(b, { options } = {}) {
  const o = normalizeOptions(options);
  return {
    ref: { kind: "business", id: b.id, businessId: b.id },
    path: sharePath.business(b),
    title: b.name,
    text: message.business(b, o),
    card: { layout: "business", business: cardBusiness(b, o), image: b.cover_url || "", title: b.name, description: b.description || "", hideLocation: !o.showLocation },
  };
}

/** A shop product or a piece of farm produce (`farm: true`). `p` needs: id, name, price, compare_at_price, unit, stock, images. The price is always shown. */
export function productTarget(b, p, { farm = false, options } = {}) {
  const o = normalizeOptions(options);
  const unit = p.unit && p.unit !== "item" ? p.unit : "";
  const stock = num(p.stock);
  return {
    ref: { kind: "product", id: p.id, businessId: b.id },
    path: farm ? sharePath.produce(b, p) : sharePath.product(b, p),
    title: `${p.name} | ${b.name}`,
    text: message.product(b, p, farm),
    card: {
      layout: "item", business: cardBusiness(b, o), image: p.images?.[0] || "", title: p.name,
      badge: farm ? "Fresh produce" : "For sale",
      price: formatKsh(p.price), unit, was: p.compare_at_price ? formatKsh(p.compare_at_price) : "",
      place: o.showLocation ? placeOf(b) : "",
      note: Number.isFinite(stock) ? (stock <= 0 ? "Out of stock" : "Available") : "",
    },
  };
}

/**
 * A room type. `t` needs: id, name, images, is_hostel, monthly_price, semester_price.
 * Optional extras: `building` (name, address), `available` (rooms free now) and `total` (rooms in the type),
 * which only decide the wording ("Available", "Fully occupied", "Not available yet"); no number is ever shown.
 * The rent is left out when the owner switched "Show rent price" off.
 */
export function roomTarget(b, t, { building, available, total, options } = {}) {
  const o = normalizeOptions(options);
  const hostel = Boolean(t.is_hostel);
  const free = roomFree(t, available);
  const where = o.showLocation ? [building?.name || t.building?.name || t.building_name, building?.address || t.building_address, b.county].filter(Boolean).join(", ") : "";
  return {
    ref: { kind: "room", id: t.id, businessId: b.id },
    path: sharePath.room(b, t),
    title: `${t.name} | ${b.name}`,
    text: message.room(b, { ...t, available: free }, o),
    card: {
      layout: "item", business: cardBusiness(b, o), image: t.images?.[0] || "", title: t.name,
      badge: hostel ? "Hostel room" : "Room to rent",
      price: o.showRent ? formatKsh(hostel ? t.semester_price : t.monthly_price) : "", unit: o.showRent ? (hostel ? "semester" : "month") : "", was: "",
      place: where,
      note: ROOM_NOTE[roomState(free, num(total))] || "",
    },
  };
}

// What each site page says about the platform: the problem it solves, never how big it is.
// [label, line]; keep every line short (about 40 characters) so it fits on the card and the poster.
const BENEFITS = {
  home: [
    ["RENTALS", "Collect rent and track every payment"],
    ["SHOPS", "Sell online and get paid by M-Pesa"],
    ["FARMS", "Keep farm records and sales in one place"],
  ],
  explore: [
    ["RENTALS", "Find a room or hostel near you"],
    ["SHOPS", "Buy from local online shops"],
    ["FARMS", "Order fresh produce from farms"],
  ],
  pricing: [
    ["ONE PLACE", "Billing, orders and records together"],
    ["GET PAID", "Customers pay you by M-Pesa"],
    ["FOR EVERY BUSINESS", "Rentals, shops and farms"],
  ],
};

/**
 * One of the three site pages. `data` is what the system knows (see lib/api/siteShare.js):
 * { brand: { name, tagline }, hero: photo address, plans: [{ type, price }], options }.
 * Plan prices appear on the Pricing card only when options.showPlanPrices is on.
 */
export function siteTarget(page, { brand, hero = "", plans = [], options } = {}) {
  const o = normalizeOptions(options);
  const TYPE = { rental: "Rentals", shop: "Shops", agriculture: "Farms" };
  const priced = page === "pricing" && o.showPlanPrices && plans.length;
  const facts = priced
    ? plans.slice(0, 3).map((p) => [`${(TYPE[p.type] || p.type).toUpperCase()} PLAN`, `from ${formatKsh(p.price)} a month`])
    : BENEFITS[page] || BENEFITS.home;
  const badge = { home: "Main site", explore: "Explore", pricing: "Plans and pricing" }[page];
  return {
    ref: { kind: "site", key: page },
    path: sharePath.page(page),
    title: page === "home" ? brand.name : `${badge} | ${brand.name}`,
    text: message[page](brand),
    card: { layout: "site", brandName: brand.name, tagline: brand.tagline || "", image: hero, badge, title: brand.name, facts },
  };
}

// ---- channels --------------------------------------------------------------------------------
// href(url, text, title) returns the address that opens that app's share box.
// Instagram and TikTok have no web share address: use the poster (Share and promote page) for them.
export const CHANNELS = [
  { id: "whatsapp", label: "WhatsApp", color: "#25D366", href: (u, t) => `https://wa.me/?text=${enc(`${t} ${u}`)}` },
  { id: "facebook", label: "Facebook", color: "#1877F2", href: (u) => `https://www.facebook.com/sharer/sharer.php?u=${enc(u)}` },
  { id: "x", label: "X", color: "#111111", href: (u, t) => `https://twitter.com/intent/tweet?text=${enc(t)}&url=${enc(u)}` },
  { id: "telegram", label: "Telegram", color: "#26A5E4", href: (u, t) => `https://t.me/share/url?url=${enc(u)}&text=${enc(t)}` },
  { id: "linkedin", label: "LinkedIn", color: "#0A66C2", href: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${enc(u)}` },
  { id: "sms", label: "SMS", color: "#16A34A", href: (u, t) => `sms:?&body=${enc(`${t} ${u}`)}` },
  { id: "email", label: "Email", color: "#6B7280", href: (u, t, title) => `mailto:?subject=${enc(title || "")}&body=${enc(`${t}\n\n${u}`)}` },
];

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
