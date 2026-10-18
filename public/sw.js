// BizKenia service worker: a light offline shell, nothing more.
// - Built files (/assets/*, icons) are cached the first time they load (their names change per release).
// - Page loads go to the network; if there is no connection, the last cached page shell or offline.html shows.
// - Anything to another origin (Supabase, M-Pesa, fonts) is never touched, so data is never stale or stored.
const VERSION = "bizkenia-v1";
const SHELL = ["/offline.html", "/icon-192.png", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put("/index.html", copy)); return res; })
        .catch(() => caches.match("/index.html").then((r) => r || caches.match("/offline.html")))
    );
    return;
  }
  if (url.pathname.startsWith("/assets/") || /\.(png|svg|webmanifest)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    })));
  }
});
