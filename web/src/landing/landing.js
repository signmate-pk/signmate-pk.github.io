// SignMate project page: progressive enhancement only. Without this file every section is still there, every
// link still works (the demo buttons are plain links to app.html), and the hero clip has its own controls.
// What it adds: the mobile menu, search and filters in the sign library, a video player for sign clips with
// English and Urdu captions, and the live demo (camera checks first, then the real app, inline or full screen).
// The recogniser itself is never loaded by this page: it loads inside app.html, only when the demo starts.

import { cameraProblem } from "./camera.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function setupNav() {
  const toggle = $(".nav-toggle");
  const nav = $("#site-nav");
  if (!toggle || !nav) return;
  const wide = window.matchMedia("(min-width: 1100px)");
  const label = $(".nav-toggle-label", toggle);
  const set = (open) => {
    nav.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
    label.textContent = open ? "Close menu" : "Menu";
  };
  toggle.hidden = false;
  toggle.addEventListener("click", () => set(toggle.getAttribute("aria-expanded") !== "true"));
  nav.addEventListener("click", (event) => { if (event.target.closest("a") && !wide.matches) set(false); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") { set(false); toggle.focus(); }
  });
  wide.addEventListener?.("change", () => set(false));

  // Mark the section being read in the menu.
  const links = new Map($$("a", nav).map((a) => [decodeURIComponent(a.hash.slice(1)), a]));
  if (!("IntersectionObserver" in window)) return;
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      for (const a of links.values()) a.removeAttribute("aria-current");
      links.get(entry.target.id)?.setAttribute("aria-current", "true");
    }
  }, { rootMargin: "-40% 0px -55% 0px" });
  for (const id of links.keys()) { const section = document.getElementById(id); if (section) observer.observe(section); }
}

// The hero clip: muted, captioned, with the browser's own controls (pause, captions in English or Urdu).
// It plays by itself only when the visitor has not asked for reduced motion, and only once it is on screen.
function setupHero() {
  const video = $(".hero-video");
  if (!video || reduceMotion.matches || !("IntersectionObserver" in window)) return;
  let started = false;
  const observer = new IntersectionObserver((entries) => {
    if (started || !entries.some((e) => e.isIntersecting)) return;
    started = true;
    observer.disconnect();
    video.preload = "auto";
    video.play().catch(() => { /* autoplay refused: the controls are there */ });
  }, { threshold: 0.4 });
  observer.observe(video);
}

function setupLibrary() {
  const list = $("#sign-list");
  const input = $("#sign-search");
  const count = $("#sign-count");
  if (!list || !input || !count) return;
  const items = $$(".sign", list);
  const buttons = $$(".filters button");
  let filter = "all";
  let timer = 0;
  // A long list on a phone: the first signs, then "Show all". Searching or filtering always shows every match.
  const FIRST = 12;
  let expanded = items.length <= FIRST;
  const more = document.createElement("button");
  more.type = "button";
  more.className = "btn btn-ghost show-all";
  more.setAttribute("aria-controls", "sign-list");
  more.setAttribute("aria-expanded", "false");
  more.textContent = `Show all ${items.length} signs`;
  more.addEventListener("click", () => {
    expanded = true;
    apply();
    items[FIRST]?.querySelector("h3")?.setAttribute("tabindex", "-1");
    items[FIRST]?.querySelector("h3")?.focus();
  });
  list.after(more);
  const matches = (item) => {
    if (filter === "all") return true;
    if (filter === "two") return item.dataset.hands === "two";
    if (filter === "video") return item.dataset.video === "1";
    return item.dataset.group === filter;
  };
  const apply = () => {
    const query = input.value.trim().toLowerCase();
    const browsing = !query && filter === "all";
    let shown = 0;
    let matched = 0;
    for (const item of items) {
      const match = matches(item) && (!query || item.dataset.search.includes(query));
      if (match) matched += 1;
      const visible = match && (expanded || !browsing || matched <= FIRST);
      item.hidden = !visible;
      if (visible) shown += 1;
    }
    const collapsed = browsing && !expanded;
    more.hidden = !collapsed;
    more.setAttribute("aria-expanded", String(!collapsed));
    if (!matched) count.textContent = `No sign matches. SignMate knows ${items.length} signs so far; try another word or filter.`;
    else if (shown === items.length) count.textContent = `Showing all ${items.length} signs.`;
    else if (collapsed) count.textContent = `Showing the first ${shown} of ${items.length} signs.`;
    else count.textContent = `${matched} of ${items.length} signs match.`;
  };
  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(apply, 120); });
  for (const button of buttons) {
    button.addEventListener("click", () => {
      filter = button.dataset.filter;
      for (const b of buttons) b.setAttribute("aria-pressed", String(b === button));
      apply();
    });
  }
  apply();
}

// Sign clips open in a dialog with caption tracks in English and Urdu (the clips are silent; the captions name
// the sign). Without <dialog> support, the links simply open the video file.
function setupClips() {
  const dialog = $("#clip-dialog");
  if (!dialog || typeof dialog.showModal !== "function") return;
  const box = $(".clip-video", dialog);
  const title = $(".clip-title", dialog);
  let opener = null;
  let trackUrls = [];
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a.clip-link");
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    opener = link;
    const urdu = document.createElement("span");
    urdu.lang = "ur";
    urdu.dir = "rtl";
    urdu.textContent = link.dataset.ur || "";
    title.replaceChildren(`${link.dataset.en} `, urdu);
    const video = document.createElement("video");
    Object.assign(video, { controls: true, loop: true, muted: true, playsInline: true, preload: "metadata", src: link.dataset.clip });
    video.setAttribute("aria-label", `PSL video: ${link.dataset.en}`);
    trackUrls.forEach((url) => URL.revokeObjectURL(url));
    trackUrls = [];
    const captions = [
      ["en", "English", `PSL sign: ${link.dataset.en} (no sound)`],
      ["ur", "اردو", `پی ایس ایل اشارہ: ${link.dataset.ur || link.dataset.en} (آواز نہیں)`],
    ];
    for (const [lang, label, text] of captions) {
      const url = URL.createObjectURL(new Blob([`WEBVTT\n\n00:00.000 --> 59:59.000\n${text}\n`], { type: "text/vtt" }));
      trackUrls.push(url);
      const track = document.createElement("track");
      Object.assign(track, { kind: "captions", srclang: lang, label, src: url, default: lang === "en" });
      video.append(track);
    }
    box.replaceChildren(video);
    dialog.showModal();
    if (!reduceMotion.matches) video.play().catch(() => {});
  });
  dialog.addEventListener("close", () => { box.replaceChildren(); opener?.focus(); });
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
}

function setupDemo() {
  const start = $("#demo-start");
  const large = $("#demo-large");
  const status = $("#demo-status");
  const fallback = $("#demo-fallback");
  const reason = $("#demo-fallback-reason");
  const frame = $("#demo-frame");
  if (!start || !status || !fallback || !frame) return;
  const appUrl = (route) => `app.html${large?.checked ? "?large=1" : ""}#/${route}`;
  const tourLinks = $$('a[href="app.html#/tour"]');
  const syncLinks = () => { start.href = appUrl("words"); for (const a of tourLinks) a.href = appUrl("tour"); };
  large?.addEventListener("change", () => {
    syncLinks();
    const iframe = $("iframe", frame);
    if (iframe) iframe.src = appUrl("words");
  });

  const showFallback = (message) => {
    reason.textContent = message;
    fallback.hidden = false;
    status.textContent = "";
    fallback.focus();
  };
  const closeDemo = () => {
    frame.replaceChildren(); // unloading the app also turns the camera off
    frame.hidden = true;
    status.textContent = "Demo closed. The camera is off.";
    start.focus();
  };
  const embed = () => {
    fallback.hidden = true;
    const iframe = document.createElement("iframe");
    Object.assign(iframe, { src: appUrl("words"), title: "SignMate live demo" });
    iframe.setAttribute("allow", "camera; fullscreen; autoplay");
    const bar = document.createElement("div");
    bar.className = "demo-frame-bar";
    const full = document.createElement("a");
    Object.assign(full, { className: "btn btn-ghost", href: appUrl("words"), textContent: "Open full screen" });
    const close = document.createElement("button");
    Object.assign(close, { type: "button", className: "btn btn-ghost", textContent: "Close the demo" });
    close.addEventListener("click", closeDemo);
    bar.append(full, close);
    frame.replaceChildren(iframe, bar);
    frame.hidden = false;
    status.textContent = "The live demo is open below. Your browser will ask to use the camera.";
    frame.scrollIntoView({ block: "nearest", behavior: reduceMotion.matches ? "auto" : "smooth" });
    navigator.permissions?.query({ name: "camera" }).then((permission) => {
      permission.onchange = () => { if (permission.state === "denied") showFallback("You chose not to allow the camera."); };
    }).catch(() => {});
  };

  start.addEventListener("click", async (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; // new tab: let the link work
    event.preventDefault();
    status.textContent = "Checking the camera…";
    const problem = await cameraProblem();
    if (problem) { showFallback(problem); return; }
    if (window.matchMedia("(min-width: 960px)").matches) embed();
    else window.location.href = appUrl("words");
  });
}

// Offline: the same service worker as the app, registered once the page has loaded and the browser is idle,
// and never in data-saver mode. It stores this site's own files on this device; it sends nothing anywhere.
function registerOffline() {
  if (!import.meta.env?.PROD || !("serviceWorker" in navigator) || !window.isSecureContext || navigator.connection?.saveData) return;
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 2000));
  window.addEventListener("load", () => idle(() => navigator.serviceWorker.register(new URL("sw.js", document.baseURI), { scope: "./" }).catch(() => {})));
}

setupNav();
setupHero();
setupLibrary();
setupClips();
setupDemo();
registerOffline();
