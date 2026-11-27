// SignMate is a website only, with no offline cache (CLAUDE.md 10.7). Visitors of the earlier version may still have
// its service worker and cache installed; this removes both so they always get the live site. public/sw.js does the
// same from the worker's side, for browsers that check the old worker before this page runs.
export async function removeOldServiceWorkers(nav = globalThis.navigator, cacheStorage = globalThis.caches) {
  try {
    const registrations = (await nav?.serviceWorker?.getRegistrations?.()) || [];
    await Promise.all(registrations.map((registration) => registration.unregister()));
    const names = (await cacheStorage?.keys?.()) || [];
    await Promise.all(names.filter((name) => name.startsWith("signbridge-")).map((name) => cacheStorage.delete(name)));
    return { workers: registrations.length, caches: names.filter((name) => name.startsWith("signbridge-")).length };
  } catch {
    return { workers: 0, caches: 0 }; // private mode or an old browser: nothing to remove
  }
}
