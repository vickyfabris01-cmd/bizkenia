// src/lib/api/siteShare.js — NEW FILE
//
// AIM
// What the site share cards (Main site, Explore, Pricing) show, read live from the system:
//   brand        name and tagline set in Admin > Settings (useBrand)
//   hero         the first hero photo that is switched on (the home page background)
//   counts       active businesses, in total and by type (anyone may count these)
//   plans        the starting monthly price of each business type's standard plan (the pricing page's numbers)
// Returns { data: { hero, counts, plans }, error } and never throws.

import { supabase } from "../../config/supabase.js";
import { listHeroSlides } from "./hero.js";
import { planCatalog } from "./directory.js";

const TYPES = ["rental", "shop", "agriculture"];

export async function getSiteFacts() {
  if (!supabase) return { data: null, error: "The app is not connected to the database yet." };
  const count = (type) => {
    let q = supabase.from("businesses").select("id", { count: "exact", head: true }).eq("status", "active");
    if (type) q = q.eq("business_type", type);
    return q;
  };
  const [slides, total, ...byType] = await Promise.all([listHeroSlides(), count(), ...TYPES.map(count), planCatalog()]);
  const plansRes = byType.pop();
  const counts = { total: total.count || 0 };
  TYPES.forEach((t, i) => { counts[t] = byType[i].count || 0; });
  const plans = TYPES
    .map((type) => {
      const row = (plansRes.data || []).find((r) => r.business_type === type && r.kind === "standard" && r.duration_code === "monthly" && r.available);
      return row ? { type, price: row.price_kes } : null;
    })
    .filter(Boolean);
  return { data: { hero: slides.data?.[0]?.url || "", counts, plans }, error: total.error?.message || null };
}
