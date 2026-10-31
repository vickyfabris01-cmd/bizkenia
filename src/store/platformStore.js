// src/store/platformStore.js — MODIFIED (Phase 5 step 3: also holds the maintenance switch; maintenance levels: the switch is now a config object read through get_maintenance())
//
// AIM
// Loads the PUBLIC platform settings once (brand: name, tagline, support email, website;
// modules: which business types are open; maintenance: the five levels plus pages, see below) and keeps them for every page. If the database is
// not reachable the built-in values from config/brand.js are used, so no page ever breaks.
// Pages read this through the useBrand() hook, never directly.
//
// MAINTENANCE SHAPE (one object, saved under platform_settings key 'maintenance')
//   { system, allDashboards, types[], pages[], payments, businesses[], message, updated_at }
//   system 1 whole site | allDashboards 2 | types 3 (rental, shop, agriculture) | payments 4 | businesses 5 | pages = page keys from router/routes.js
//   `enabled` is kept as a copy of `system` so older code that reads maintenance.enabled still works.

import { create } from "zustand";
import { supabase } from "../config/supabase.js";

export const DEFAULT_MODULES = { rental: true, agriculture: true, shop: true };
export const DEFAULT_MAINTENANCE = {
  system: false, allDashboards: false, types: [], pages: [], payments: false, businesses: [], message: "", updated_at: null, enabled: false,
};

const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);

/** Any value from the database (new shape, old { enabled, message }, or nothing) as a complete config. */
export function normalizeMaintenance(v) {
  const o = v && typeof v === "object" && !Array.isArray(v) ? v : {};
  const system = typeof o.system === "boolean" ? o.system : o.enabled === true;
  return {
    system,
    allDashboards: o.allDashboards === true,
    types: list(o.types),
    pages: list(o.pages),
    payments: o.payments === true,
    businesses: list(o.businesses).map((x) => x.toLowerCase()),
    message: typeof o.message === "string" ? o.message : "",
    updated_at: typeof o.updated_at === "string" ? o.updated_at : null,
    enabled: system,
  };
}

/** True when any level or page is switched on. */
export function maintenanceActive(m) {
  return Boolean(m && (m.system || m.allDashboards || m.types.length || m.pages.length || m.payments || m.businesses.length));
}

/** The anon-callable RPC; if it is not installed yet (migration not applied) fall back to reading the public row. */
async function fetchMaintenance() {
  const rpc = await supabase.rpc("get_maintenance");
  if (!rpc.error && rpc.data) return normalizeMaintenance(rpc.data);
  const row = await supabase.from("platform_settings").select("value").eq("key", "maintenance").maybeSingle();
  if (row.error) throw row.error;
  return normalizeMaintenance(row.data?.value);
}

export const usePlatformStore = create((set, get) => ({
  brand: null,      // { name, tagline, support_email, website } from the database, or null
  modules: DEFAULT_MODULES,
  maintenance: DEFAULT_MAINTENANCE, // read by router/MaintenanceGate.jsx and components/feedback/MaintenanceBanner.jsx
  loaded: false,

  async load(force = false) {
    if (get().loaded && !force) return;
    if (!supabase) return set({ loaded: true });
    try {
      const [settings, maintenance] = await Promise.all([
        supabase.from("platform_settings").select("key, value").in("key", ["brand", "modules"]),
        fetchMaintenance().catch((e) => { console.warn("[platformStore] maintenance unreadable:", e.message); return null; }),
      ]);
      if (settings.error) throw settings.error;
      const next = {};
      for (const row of settings.data || []) next[row.key] = row.value;
      set({
        brand: next.brand || null,
        modules: { ...DEFAULT_MODULES, ...(next.modules || {}) },
        maintenance: maintenance || get().maintenance,
        loaded: true,
      });
    } catch (e) {
      console.warn("[platformStore] using built-in brand:", e.message);
      set({ loaded: true });
    }
  },

  /** Re-reads only the maintenance settings (small), used by the gate's timer and the "Check again" button. */
  async refreshMaintenance() {
    if (!supabase) return;
    try { set({ maintenance: await fetchMaintenance() }); } catch (e) { console.warn("[platformStore] maintenance refresh failed:", e.message); }
  },

  /** Used by the admin settings page right after saving, so the whole site updates at once. */
  apply(key, value) {
    if (key === "brand") set({ brand: value });
    if (key === "modules") set({ modules: { ...DEFAULT_MODULES, ...value } });
    if (key === "maintenance") set({ maintenance: normalizeMaintenance(value) });
  },
}));
