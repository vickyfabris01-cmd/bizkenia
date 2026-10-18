// src/store/businessBrandStore.js — MODIFIED (provisional business while it loads)
//
// AIM
// "Which business is this screen about?" for the logo. A business page, the room request page
// and every screen inside /app/:slug tell this store which business they show. BrandLogo with the
// `contextual` prop then draws that business's logo (or its first letter) in place of the
// BizKenia mark. Footers and sign-in pages do not use `contextual`, so they keep the platform logo.
//
// business: { id, name, logo_url, provisional? }  provisional = true while the business is still
// loading: only its first letter (taken from the address) is shown, never the BizKenia logo.

import { create } from "zustand";

export const useBusinessBrandStore = create((set) => ({
  business: null,
  set: (business) => set({ business }),
  clear: () => set({ business: null }),
}));

export default useBusinessBrandStore;
