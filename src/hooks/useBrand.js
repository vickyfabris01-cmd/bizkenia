// src/hooks/useBrand.js — NEW FILE
//
// AIM
// The product name, tagline, support email and website, as set by the super admin in the
// dashboard, with config/brand.js as the fallback. Every header, footer, 404 page and avatar
// menu reads the brand from here, so one change in Admin > Settings updates all of them.
//
// USAGE
//   const brand = useBrand();      // { name, tagline, supportEmail, website, modules, mailto }

import { useEffect } from "react";
import { BRAND } from "../config/brand.js";
import { usePlatformStore } from "../store/platformStore.js";

export default function useBrand() {
  const stored = usePlatformStore((s) => s.brand);
  const modules = usePlatformStore((s) => s.modules);
  const loaded = usePlatformStore((s) => s.loaded);
  const load = usePlatformStore((s) => s.load);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  const supportEmail = stored?.support_email || BRAND.supportEmail;
  return {
    name: stored?.name || BRAND.name,
    tagline: stored?.tagline || BRAND.tagline,
    supportEmail,
    website: stored?.website || BRAND.website,
    mailto: `mailto:${supportEmail}`,
    modules,
    loaded,
  };
}
