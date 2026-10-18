// src/lib/pwa.js — NEW FILE (Phase 5, step 4)
// Registers the offline-shell service worker (public/sw.js). Production builds only, so development
// never serves stale files. Failure is silent: the site works the same without it.
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => {}); });
}
