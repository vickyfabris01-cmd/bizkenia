// src/lib/api/directory.js — MODIFIED (cards also carry logo_design so each business logo is drawn the way its owner chose)
//
// AIM
// Public reads: the list of active businesses, one business by slug, subscription plans and
// the home-page numbers. Row-level security already limits anonymous visitors to ACTIVE
// businesses, so these functions never need to filter by status themselves.
// Every function returns { data, error } and never throws; with no database connection
// they return an error message so pages can show a friendly notice.
// listBusinesses also returns `count`: how many businesses match in all, not just in this page of
// results, so a page can say "See all 23". `offset` lets a caller read further down the same list.

import { supabase } from "../../config/supabase.js";

const CARD_FIELDS = "id, name, slug, business_type, description, county, address, logo_url, logo_design, cover_url, phone, email, whatsapp, created_at";
const NOT_CONNECTED = { data: null, error: "The app is not connected to the database yet. See .env.example." };

export async function listBusinesses({ search = "", type = "", county = "", limit = 60, offset = 0 } = {}) {
  if (!supabase) return NOT_CONNECTED;
  // newest first; id breaks ties so reading page after page never repeats or skips a business
  let q = supabase.from("businesses").select(CARD_FIELDS, { count: "exact" }).eq("status", "active")
    .order("approved_at", { ascending: false }).order("id").range(offset, offset + limit - 1);
  if (type) q = q.eq("business_type", type);
  if (county) q = q.eq("county", county);
  const term = search.trim().replace(/[%,()]/g, " ");
  if (term) q = q.or(`name.ilike.%${term}%,description.ilike.%${term}%,address.ilike.%${term}%,county.ilike.%${term}%`);
  const { data, error, count } = await q;
  return { data: data || [], count: count ?? (data || []).length, error: error?.message || null };
}

/** Latest shop products, farm produce and available rooms for the home page: { shop, farm, rooms }. */
export async function listHomeListings(perType = 4) {
  if (!supabase) return NOT_CONNECTED;
  const { data, error } = await supabase.rpc("home_listings", { p_per_type: perType });
  const d = data || {};
  return { data: { shop: d.shop || [], farm: d.farm || [], rooms: d.rooms || [] }, error: error?.message || null };
}

export async function getBusinessBySlug(slug) {
  if (!supabase) return NOT_CONNECTED;
  const { data, error } = await supabase.from("businesses").select(CARD_FIELDS).eq("slug", slug).eq("status", "active").maybeSingle();
  return { data, error: error?.message || null };
}

// The plan grid for the public pages: every slot (3 business types x 4 durations) plus any open offer.
// Slots that are not on sale come back with available = false and no price. Savings come from the database.
export async function planCatalog() {
  if (!supabase) return NOT_CONNECTED;
  const { data, error } = await supabase.rpc("plan_catalog");
  return { data: data || [], error: error?.message || null };
}

export async function publicStats() {
  if (!supabase) return NOT_CONNECTED;
  const { data, error } = await supabase.rpc("public_stats");
  return { data, error: error?.message || null };
}