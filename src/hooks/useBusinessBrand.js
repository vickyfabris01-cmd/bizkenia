// src/hooks/useBusinessBrand.js — MODIFIED (first letter while loading, no flash)
//
// AIM
// Call it in a screen that belongs to one business: useBusinessBrand(business, loadingSlug).
// While the screen is open, the header and sidebar logo become that business's logo, or its first
// letter when it has no logo. It resets when the screen closes.
//   business     the loaded business, or null/undefined while it loads
//   loadingSlug  pass the address slug while loading: the header then shows the first letter of
//                the slug straight away, never the BizKenia logo. Pass "" once loaded or failed
//                (a business that does not exist falls back to the BizKenia logo).
// It runs before the screen is painted, so the BizKenia logo never flashes.

import { useLayoutEffect } from "react";
import useBusinessBrandStore from "../store/businessBrandStore.js";

export default function useBusinessBrand(business, loadingSlug = "") {
  const id = business?.id;
  const name = business?.name;
  const logo = business?.logo_url || null;
  const type = business?.business_type || "";
  // the saved logo recipe, flattened to one text value so the effect only re-runs when it really changes
  const designKey = business?.logo_design ? JSON.stringify(business.logo_design) : "";
  useLayoutEffect(() => {
    const store = useBusinessBrandStore.getState();
    if (id) store.set({ id, name, business_type: type, logo_url: logo, logo_design: designKey ? JSON.parse(designKey) : null });
    else if (loadingSlug) store.set({ id: "", name: loadingSlug.replace(/[-_]+/g, " "), logo_url: null, provisional: true });
    else return undefined;
    return () => useBusinessBrandStore.getState().clear();
  }, [id, name, logo, type, designKey, loadingSlug]);
}
