// src/store/businessStore.js — MODIFIED (also loads logo_design, the saved recipe the business logo is drawn from)
//
// AIM
// The businesses the signed-in person belongs to (as owner or manager) and the role in each.
// The URL (/app/:slug) is the source of truth for which business is open; this store only
// holds the list so menus ("Switch business") and guards do not refetch constantly.
//
//   const { memberships, load, switchBusiness } = useBusinessStore();
//   memberships: [{ role, business: { id, name, slug, status, business_type, ... } }]

import { create } from "zustand";
import { supabase } from "../config/supabase.js";

const BUSINESS_FIELDS =
  "id, name, slug, status, business_type, description, county, address, phone, email, whatsapp, logo_url, logo_design, cover_url, rejection_reason, submitted_at, approved_at, created_at, closed_at, closed_from, closed_by_admin";

export const useBusinessStore = create((set, get) => ({
  memberships: [],
  loading: false,
  loadedFor: null,

  async load(userId, force = false) {
    if (!supabase || !userId) return set({ memberships: [], loadedFor: null });
    if (!force && get().loadedFor === userId) return;
    set({ loading: true });
    // a worker added by email before they had an account gets linked now (cheap, does nothing otherwise)
    await supabase.rpc("claim_worker_links");
    const { data, error } = await supabase
      .from("business_members")
      .select(`role, status, business:businesses(${BUSINESS_FIELDS})`)
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false });
    if (error) console.warn("[businessStore]", error.message);
    set({
      memberships: (data || []).filter((m) => m.business),
      loading: false,
      loadedFor: userId,
    });
  },

  reset() {
    set({ memberships: [], loadedFor: null });
  },

  bySlug(slug) {
    return get().memberships.find((m) => m.business.slug === slug) || null;
  },

  /** Where "Switch business" leads. The URL decides the active business. */
  switchBusiness(navigate) {
    navigate("/businesses");
  },
}));

export default useBusinessStore;
