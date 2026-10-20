// src/lib/api/market.js — MODIFIED (adds marketCard, used by Explore's listing results)
//
// AIM
// What the "Shop and rent" page asks of the database: shop products, farm produce and available
// rooms, searched, filtered by county and sorted, plus the counties that have items of a type.
// Both calls are database functions (market_listings, market_counties) that run as the visitor,
// so row-level security decides what is visible. Every function returns { data, error } and never throws.

import { supabase } from "../../config/supabase.js";
import { formatKsh } from "../format.js";

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

/** One type at a time. Returns { data: { items, total } }. */
export async function listMarket({ kind, q = "", county = "", sort = "new", limit = 8, offset = 0 }) {
  if (!supabase) return NOT_CONNECTED;
  const { data, error } = await supabase.rpc("market_listings", {
    p_kind: kind, p_q: q || null, p_county: county || null, p_sort: sort, p_limit: limit, p_offset: offset,
  });
  return { data: { items: data?.items || [], total: Number(data?.total || 0) }, error: error?.message || null };
}

/** Counties that have items of the type ("" = any type). Returns { data: ["Kisumu", "Nairobi", ...] }. */
export async function listMarketCounties(kind = "") {
  if (!supabase) return NOT_CONNECTED;
  const { data, error } = await supabase.rpc("market_counties", { p_kind: kind || null });
  return { data: data || [], error: error?.message || null };
}

const perUnit = (u) => (u && u !== "item" ? ` / ${u}` : "");

/** Turns one market_listings row into the details a ListingCard needs. kind: "shop" | "farm" | "rooms". */
export function marketCard(kind) {
  return (x) => ({
    key: x.id,
    to: kind === "shop" ? `/b/${x.business_slug}/p/${x.id}` : `/b/${x.business_slug}`,
    image: x.image,
    title: kind === "rooms" && x.building_name ? `${x.title} · ${x.building_name}` : x.title,   // rooms: x.title is the room type name
    price: kind === "rooms" ? `${formatKsh(x.price)} / month` : `${formatKsh(x.price)}${perUnit(x.unit)}`,
    place: [x.business_name, x.county].filter(Boolean).join(" · "),
    badge: kind === "rooms" ? `${x.available} available` : undefined,   // one card per room type
  });
}
