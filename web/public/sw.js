// Spare Parts ERP service worker — minimal "network-first with offline fallback" strategy.
// We don't aggressively cache assets: the dev team updates the app frequently and a stale
// cached shell would show out-of-date UI. All we want is a graceful offline page when the
// shop Wi-Fi briefly drops.

const CACHE = "sparts-shell-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll([OFFLINE_URL, "/manifest.webmanifest", "/icon.svg", "/icon-maskable.svg"]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Never cache API responses — those must always hit the real server.
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith((async () => {
    try {
      return await fetch(req);
    } catch {
      // Offline. For navigation requests, serve the offline page; otherwise bubble the error.
      if (req.mode === "navigate") {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(OFFLINE_URL);
        if (cached) return cached;
      }
      throw new Error("offline");
    }
  })());
});
