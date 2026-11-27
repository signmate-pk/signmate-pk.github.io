// SignMate no longer uses a service worker (website only, no offline cache: CLAUDE.md 10.7, 2026-11-27).
// Browsers that installed the earlier one check this file for updates; this version deletes SignMate's caches,
// unregisters itself and reloads open SignMate pages, so every visitor gets the live website again.
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith("signbridge-")) await caches.delete(name);
    await self.registration.unregister();
    const pages = await self.clients.matchAll({ type: "window" });
    for (const page of pages) page.navigate(page.url).catch(() => {});
  })());
});
