// src/lib/api/siteShare.js — MODIFIED FILE (no business counts: the site cards say what the platform solves)
//
// AIM
// What the site share cards (Main site, Explore, Pricing) need from the system:
//   hero         the first hero photo that is switched on (the home page background)
//   plans        the starting monthly price of each business type's standard plan (the pricing page's numbers);
//                only read when asked for ({ plans: true }), because the Pricing card shows them only when the
//                super admin switched "Show plan prices" on
// The cards never show how many businesses, rentals, shops or farms are on the platform.
// Returns { data: { hero, plans }, error } and never throws.

import { listHeroSlides } from "./hero.js";
import { planCatalog } from "./directory.js";

const TYPES = ["rental", "shop", "agriculture"];

export async function getSiteFacts({ plans: withPlans = false } = {}) {
  try {
    const [slides, catalog] = await Promise.all([listHeroSlides(), withPlans ? planCatalog() : Promise.resolve({ data: [], error: null })]);
    const plans = TYPES
      .map((type) => {
        const row = (catalog?.data || []).find((r) => r.business_type === type && r.kind === "standard" && r.duration_code === "monthly" && r.available);
        return row ? { type, price: row.price_kes } : null;
      })
      .filter(Boolean);
    return { data: { hero: slides?.data?.[0]?.url || "", plans }, error: slides?.error || catalog?.error || null };
  } catch (e) {
    return { data: { hero: "", plans: [] }, error: e?.message || "Could not read the site details." };
  }
}
