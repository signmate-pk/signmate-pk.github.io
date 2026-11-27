// SignBridge service worker (master-v3 Stage 5: works offline after the first visit).
// - Pages: network first, the cached page when offline.
// - Files (scripts, models, runtimes, videos): cache first; anything used once online is kept.
// - "Save for offline use" (a message from the page) downloads every file in precache.json, so the whole
//   app works with no network, including models the visitor has not opened yet.
// Nothing is sent anywhere: this worker only stores this site's own files on this device.
const PREFIX = "signbridge-";
let buildPromise = null;

function scopeUrl(path) {
  return new URL(path, self.registration.scope).href;
}

async function precacheList() {
  const response = await fetch(scopeUrl("precache.json"), { cache: "no-store" });
  if (!response.ok) throw new Error(`precache.json ${response.status}`);
  return response.json();
}

async function cacheName() {
  buildPromise ??= precacheList().then((list) => `${PREFIX}${list.build}`).catch(() => `${PREFIX}offline`);
  return buildPromise;
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const list = await precacheList();
    const cache = await caches.open(`${PREFIX}${list.build}`);
    await cache.addAll(list.files.filter((file) => file.shell).map((file) => scopeUrl(file.path)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = await cacheName();
    for (const name of await caches.keys()) if (name.startsWith(PREFIX) && name !== keep) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.includes("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(await cacheName());
      try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      } catch {
        // Offline: the cached copy of this page, else the app (app.html) or the project page (index.html).
        const fallback = url.pathname.endsWith("/app.html") ? "app.html" : "index.html";
        return (await cache.match(request, { ignoreSearch: true })) || (await cache.match(scopeUrl(fallback))) || Response.error();
      }
    })());
    return;
  }
  if (url.pathname.endsWith("/precache.json") || url.pathname.endsWith("/ci/status.json")) return;
  event.respondWith((async () => {
    const cache = await caches.open(await cacheName());
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    const response = await fetch(request);
    if (response.ok && response.status === 200) cache.put(request, response.clone());
    return response;
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "cache-all") return;
  const reply = (message) => event.source?.postMessage({ source: "signbridge-sw", ...message });
  event.waitUntil((async () => {
    try {
      const list = await precacheList();
      const cache = await caches.open(`${PREFIX}${list.build}`);
      let done = 0;
      let bytes = 0;
      for (const file of list.files) {
        const url = scopeUrl(file.path);
        if (!(await cache.match(url))) {
          const response = await fetch(url);
          if (response.ok) await cache.put(url, response);
        }
        done += 1;
        bytes += file.bytes;
        if (done % 10 === 0 || done === list.files.length) reply({ type: "progress", done, total: list.files.length, bytes, totalBytes: list.total_bytes });
      }
      reply({ type: "cached", total: list.files.length, totalBytes: list.total_bytes });
    } catch (error) {
      reply({ type: "error", message: String(error?.message || error) });
    }
  })());
});
