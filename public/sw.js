// BizKenia service worker: a light offline shell, nothing more.
// - Built files (/assets/*, icons) are cached the first time they load (their names change per release).
// - Page loads go to the network; if there is no connection, the last cached page shell or offline.html shows.
// - Anything to another origin (Supabase, M-Pesa, fonts) is never touched, so data is never stale or stored.
// - Uploads (/api/files/*) are never cached here: the Worker already caches them, and they have no size limit.
// - A page load that ended on a redirect (every /share/... link does) is never kept as the offline page.
const VERSION = "bizkenia-v2";
const SHELL = ["/offline.html", "/icon-192.png", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// /share/b/my-shop -> /b/my-shop and /share/page/explore -> /explore (the same mapping as worker/share.js)
function realPath(url) {
  const page = url.pathname.match(/^\/share\/page\/(home|explore|pricing)$/);
  if (page) return page[1] === "home" ? "/" : `/${page[1]}`;
  return url.pathname.startsWith("/share/b/") ? url.pathname.slice("/share".length) : null;
}
// With no connection: a share link goes to the page it points at; any page gets the last page shell, else offline.html.
function offline(url) {
  const to = realPath(url);
  if (to) return Response.redirect(`${url.origin}${to}${url.search}`, 302);
  return caches.match("/index.html").then((r) => r || caches.match("/offline.html"));
}
// A redirected response must not be stored as the shell (browsers refuse to show it for a page load), so after a
// redirected load the shell is refreshed from "/" instead.
function keepShell(res) {
  if (res.ok && !res.redirected) caches.open(VERSION).then((c) => c.put("/index.html", res));
}
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.redirected) e.waitUntil(fetch("/").then(keepShell).catch(() => {}));
        else keepShell(res.clone());
        return res;
      }).catch(() => offline(url))
    );
    return;
  }
  if (url.pathname.startsWith("/api/files/")) return;
  if (url.pathname.startsWith("/assets/") || /\.(png|svg|webmanifest)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    })));
  }
});
