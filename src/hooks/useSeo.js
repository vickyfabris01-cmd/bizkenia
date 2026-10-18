// src/hooks/useSeo.js — NEW FILE (release 1.0)
//
// AIM
// A page that knows its own text (a business, a product) calls this once the data has loaded:
//   useSeo(b ? { title: b.name, description: b.description, image: b.cover_url, jsonLd: {...} } : null);
// Passing null leaves whatever AppRouter already set for the address.

import { useEffect } from "react";
import useBrand from "./useBrand.js";
import { applySeo } from "../lib/seo.js";

export default function useSeo(options) {
  const { name } = useBrand();
  const key = options ? JSON.stringify(options) : "";
  useEffect(() => {
    if (!options) return;
    applySeo({ ...options, brand: name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, name]);
}
