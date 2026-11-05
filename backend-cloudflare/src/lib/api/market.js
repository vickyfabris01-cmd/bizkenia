// src/lib/api/market.js — MODIFIED (remembers public lists in the browser; can read them through the Worker cache)
//
// AIM
// What the "Shop and rent" page asks of the database: shop products, farm produce and available
// rooms, searched, filtered by county and sorted, plus the counties that have items of a type.
// Both calls are database functions (market_listings, market_counties) that run as the visitor,
// so row-level security decides what is visible. Every function returns { data, error } and never throws.

import { supabase } from "../../config/supabase.js";
import { formatKsh } from "../format.js";
import { cached } from "../cache.js";
import { publicRead } from "../backend.js";

const NOT_CONNECTED = { data: null, error: "The app is not connected to the database yet. See .env.example." };

export const MARKET_KINDS = [
  { value: "shop", label: "Shop products" },
  { value: "farm", label: "Farm produce" },
  { value: "rooms", label: "Rooms to rent" },
];

export const MARKET_SORTS = [
  { value: "new", label: "Newest" },
  { value: "low", label: "Price: low to high" },
  { value: "high", label: "Price: high to low" },
];

// Both reads are remembered in the browser (lib/cache.js): the same answer for every visitor, so going back is instant.

/** One type at a time. Returns { data: { items, total } }. */
export function listMarket(opts) {
  return cached(`market:${JSON.stringify(opts)}`, () => fetchMarket(opts));
}

async function fetchMarket({ kind, q = "", county = "", sort = "new", limit = 8, offset = 0 }) {
  const viaWorker = await publicRead("market", { kind, q, county, sort, limit, offset }); // Worker cache (VITE_BACKEND_PUBLIC=on); null = ask Supabase as before
  if (viaWorker) return { data: viaWorker.data, error: null };
  if (!supabase) return NOT_CONNECTED;
  const { data, error } = await supabase.rpc("market_listings", {
    p_kind: kind, p_q: q || null, p_county: county || null, p_sort: sort, p_limit: limit, p_offset: offset,
  });
  return { data: { items: data?.items || [], total: Number(data?.total || 0) }, error: error?.message || null };
}

/** Counties that have items of the type ("" = any type). Returns { data: ["Kisumu", "Nairobi", ...] }. */
export function listMarketCounties(kind = "") {
  return cached(`counties:${kind}`, () => fetchMarketCounties(kind));
}

async function fetchMarketCounties(kind) {
  const viaWorker = await publicRead("counties", { kind });
  if (viaWorker) return { data: viaWorker.data || [], error: null };
  if (!supabase) return NOT_CONNECTED;
  const { data, error } = await supabase.rpc("market_counties", { p_kind: kind || null });
  return { data: data || [], error: error?.message || null };
}

const perUnit = (u) => (u && u !== "item" ? ` / ${u}` : "");

/** Turns one market_listings row into the details a ListingCard needs. kind: "shop" | "farm" | "rooms". */
export function marketCard(kind) {
  return (x) => ({
    key: x.id,
    to: `/b/${x.business_slug}/${kind === "shop" ? "p" : kind === "farm" ? "produce" : "room"}/${x.id}`,
    image: x.image,
    title: kind === "rooms" && x.building_name ? `${x.title} · ${x.building_name}` : x.title,   // rooms: x.title is the room type name
    price: kind === "rooms" ? `${formatKsh(x.price)} / ${x.is_hostel ? "semester" : "month"}` : `${formatKsh(x.price)}${perUnit(x.unit)}`,
    place: [x.business_name, x.county].filter(Boolean).join(" · "),
    badge: kind === "rooms" ? `${x.available} available` : undefined,   // one card per room type
  });
}
