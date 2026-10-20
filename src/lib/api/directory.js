// src/lib/api/directory.js — MODIFIED (business search also matches the county)
//
// AIM
// Public reads: the list of active businesses, one business by slug, subscription plans and
// the home-page numbers. Row-level security already limits anonymous visitors to ACTIVE
// businesses, so these functions never need to filter by status themselves.
// Every function returns { data, error } and never throws; with no database connection
// they return an error message so pages can show a friendly notice.

import { supabase } from "../../config/supabase.js";

const CARD_FIELDS = "id, name, slug, business_type, description, county, address, logo_url, cover_url, phone, email, whatsapp, created_at";
const NOT_CONNECTED = { data: null, error: "The app is not connected to the database yet. See .env.example." };

export async function listBusinesses({ search = "", type = "", county = "", limit = 60 } = {}) {
  if (!supabase) return NOT_CONNECTED;
  let q = supabase.from("businesses").select(CARD_FIELDS).eq("status", "active").order("approved_at", { ascending: false }).limit(limit);
  if (type) q = q.eq("business_type", type);
  if (county) q = q.eq("county", county);
  const term = search.trim().replace(/[%,()]/g, " ");
  if (term) q = q.or(`name.ilike.%${term}%,description.ilike.%${term}%,address.ilike.%${term}%,county.ilike.%${term}%`);
  const { data, error } = await q;
  return { data: data || [], error: error?.message || null };
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

export async function listPlans() {
  if (!supabase) return NOT_CONNECTED;
  const { data, error } = await supabase.from("subscription_plans").select("*").eq("is_active", true).order("sort");
  return { data: data || [], error: error?.message || null };
}

export async function publicStats() {
  if (!supabase) return NOT_CONNECTED;
  const { data, error } = await supabase.rpc("public_stats");
  return { data, error: error?.message || null };
}