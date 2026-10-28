// src/lib/api/shareOptions.js — NEW FILE
//
// AIM
// What a business (or the site) chooses to show on its shared cards, posters and link previews.
// Saved by the database functions set_share_options / get_share_options
// (supabase/migrations/20261027100001_share_options.sql):
//   showRent        rentals: the rent price         showPhone     the phone and WhatsApp number
//   showLocation    the address and county          showPlanPrices  site only: the plan prices on the Pricing card
// getShareOptions(businessId) reads them; getShareOptions(null) reads the site's. Nothing saved yet means
// the defaults (lib/share.js DEFAULT_OPTIONS), and so does any error, so sharing never stops working because
// of this. saveShareOptions(businessId, options): the owner of the business, or the super admin for the site (null).
// Every function returns { data, error } and never throws.

import { supabase } from "../../config/supabase.js";
import { DEFAULT_OPTIONS, normalizeOptions } from "../share.js";

const NOT_CONNECTED = "The app is not connected to the database yet.";

export async function getShareOptions(businessId = null) {
  if (!supabase) return { data: { ...DEFAULT_OPTIONS }, error: null };
  try {
    const { data, error } = await supabase.rpc("get_share_options", { p_business: businessId || null });
    return { data: normalizeOptions(data), error: error?.message || null };
  } catch (e) {
    return { data: { ...DEFAULT_OPTIONS }, error: e?.message || null };
  }
}

export async function saveShareOptions(businessId, options) {
  if (!supabase) return { data: null, error: NOT_CONNECTED };
  const clean = normalizeOptions(options);
  const { error } = await supabase.rpc("set_share_options", { p_business: businessId || null, p_options: clean });
  return { data: error ? null : clean, error: error?.message || null };
}
