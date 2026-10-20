// src/store/platformStore.js — MODIFIED (Phase 5 step 3: also holds the maintenance switch)
//
// AIM
// Loads the PUBLIC platform settings once (brand: name, tagline, support email, website;
// modules: which business types are open; maintenance: { enabled, message }) and keeps them for every page. If the database is
// not reachable the built-in values from config/brand.js are used, so no page ever breaks.
// Pages read this through the useBrand() hook, never directly.

import { create } from "zustand";
import { supabase } from "../config/supabase.js";

export const DEFAULT_MODULES = { rental: true, agriculture: true, shop: true };
export const DEFAULT_MAINTENANCE = { enabled: false, message: "" };

export const usePlatformStore = create((set, get) => ({
  brand: null,      // { name, tagline, support_email, website } from the database, or null
  modules: DEFAULT_MODULES,
  maintenance: DEFAULT_MAINTENANCE, // { enabled, message } — read by router/MaintenanceGate.jsx
  loaded: false,

  async load(force = false) {
    if (get().loaded && !force) return;
    if (!supabase) return set({ loaded: true });
    try {
      const { data, error } = await supabase.from("platform_settings").select("key, value").in("key", ["brand", "modules", "maintenance"]);
      if (error) throw error;
      const next = {};
      for (const row of data || []) next[row.key] = row.value;
      set({
        brand: next.brand || null,
        modules: { ...DEFAULT_MODULES, ...(next.modules || {}) },
        maintenance: { ...DEFAULT_MAINTENANCE, ...(next.maintenance || {}) },
        loaded: true,
      });
    } catch (e) {
      console.warn("[platformStore] using built-in brand:", e.message);
      set({ loaded: true });
    }
  },

  /** Used by the admin settings page right after saving, so the whole site updates at once. */
  apply(key, value) {
    if (key === "brand") set({ brand: value });
    if (key === "modules") set({ modules: { ...DEFAULT_MODULES, ...value } });
    if (key === "maintenance") set({ maintenance: { ...DEFAULT_MAINTENANCE, ...value } });
  },
}));
