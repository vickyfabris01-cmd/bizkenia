// src/lib/seo.js — NEW FILE (release 1.0)
//
// AIM
// Sets what search engines and link previews read from <head>: title, description, canonical address,
// Open Graph / Twitter card, robots and optional JSON-LD structured data. The site is a single-page
// app, so this runs in the browser after the page opens (Google runs scripts and reads it).
// Site address: VITE_SITE_URL when set (the live domain), otherwise the address in the browser.

const JSON_LD_ID = "seo-jsonld";

export const siteUrl = () => (import.meta.env.VITE_SITE_URL || window.location.origin).replace(/\/$/, "");

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (content == null || content === "") { if (el) el.remove(); return; }
  if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute("content", content);
}

function setLink(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!href) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement("link"); el.setAttribute("rel", rel); document.head.appendChild(el); }
  el.setAttribute("href", href);
}

const clip = (s, n) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/** @param {{title?:string, brand?:string, description?:string, image?:string, path?:string, noindex?:boolean, jsonLd?:object|null}} o */
export function applySeo({ title, brand = "", description = "", image = "", path, noindex = false, jsonLd = null } = {}) {
  const full = title ? `${title} | ${brand}` : brand;
  document.title = full;
  const desc = clip(description, 160);
  const url = `${siteUrl()}${path ?? window.location.pathname}`;
  setMeta("name", "description", desc);
  setMeta("name", "robots", noindex ? "noindex, nofollow" : "index, follow");
  setLink("canonical", noindex ? "" : url);
  setMeta("property", "og:title", title || brand);
  setMeta("property", "og:description", desc);
  setMeta("property", "og:type", "website");
  setMeta("property", "og:url", url);
  setMeta("property", "og:site_name", brand);
  setMeta("property", "og:image", image);
  setMeta("name", "twitter:card", image ? "summary_large_image" : "summary");
  setMeta("name", "twitter:title", title || brand);
  setMeta("name", "twitter:description", desc);
  setMeta("name", "twitter:image", image);
  let ld = document.getElementById(JSON_LD_ID);
  if (!jsonLd) { if (ld) ld.remove(); return; }
  if (!ld) { ld = document.createElement("script"); ld.id = JSON_LD_ID; ld.type = "application/ld+json"; document.head.appendChild(ld); }
  ld.textContent = JSON.stringify(jsonLd);
}
