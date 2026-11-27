// Where the website finds its own files.
//
// The same build must work at a site root (http://localhost:5173/), under a sub-path
// (https://<user>.github.io/<repo>/) and from the translator's own folder (/translate/), so files are never fetched
// from "/..." directly. vite.config.js builds with base "./" and each page passes its own base (see assetUrl);
// workers get absolute URLs from the page, never relative ones.

// A page that is not at the site root says where the root is: <meta name="signmate-base" content="../"> in
// translate/index.html. Pages at the root need nothing.
export function pageBase(doc = globalThis.document) {
  return doc?.querySelector?.('meta[name="signmate-base"]')?.getAttribute("content") || null;
}

export function assetUrl(path, baseUrl = pageBase() ?? import.meta.env?.BASE_URL ?? "/", pageUrl = globalThis.location?.href ?? "http://localhost/") {
  const relative = String(path).replace(/^\/+/, "");
  return new URL(relative, new URL(baseUrl, pageUrl)).href;
}

