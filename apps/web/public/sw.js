/**
 * Minimal service worker for QuickMenu QR (Phase 01).
 * Caches the app shell and the last public menu response (stale-while-revalidate).
 * This is a minimal custom SW; production hardening happens in Phase 10.
 */
const CACHE_NAME = "quickmenu-v1";
const SHELL_CACHE = "quickmenu-shell-v1";

const SHELL_ASSETS = [
  "/",
  "/manifest.json",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
];

self.addEventListener("install", (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(SHELL_ASSETS);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== SHELL_CACHE && key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return undefined;
        })
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event: FetchEvent) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Stale-while-revalidate for the public menu route.
  if (url.pathname.startsWith("/m/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        const fetchPromise = fetch(request).then(async (response) => {
          if (response.status === 200) {
            await cache.put(request, response.clone());
          }
          return response;
        });
        return cached ?? (await fetchPromise);
      })()
    );
    return;
  }

  // Cache-first for app shell.
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.status === 200) {
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
      }
    })()
  );
});

declare const self: ServiceWorkerGlobalScope & typeof globalThis;