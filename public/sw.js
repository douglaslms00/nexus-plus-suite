// Service Worker for GestãoPro PWA
const CACHE_NAME = "gestaopro-cache-v1";

const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/favicon.ico",
  "/favicon.svg",
  "/logo192.png",
  "/logo512.png",
  "/apple-touch-icon.png",
  "/maskable-icon-192.png",
  "/maskable-icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("Service worker cache prefetch notice:", err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Network-first strategy for navigation and data, cache fallback for assets
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // For static icons and manifest, try cache first then network
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        return (
          cachedResponse ||
          fetch(event.request).then((response) => {
            if (response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
        );
      })
    );
    return;
  }

  // Network first for other requests
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
