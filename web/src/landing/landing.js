// SignMate project page: progressive enhancement only. Without this file every section is still there and every
// link still works (the demo buttons are plain links to translate/). What it adds: the mobile menu, search and
// filters in the sign library, and the live demo (camera checks first, then the real translator, inline or full
// screen). The recogniser itself is never loaded by this page: it loads inside translate/, only when the demo starts.

import { cameraProblem } from "./camera.js";
import { removeOldServiceWorkers } from "../no_service_worker.js";

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

function setupDemo() {
  const start = $("#demo-start");
  const large = $("#demo-large");
  const status = $("#demo-status");
  const fallback = $("#demo-fallback");
  const reason = $("#demo-fallback-reason");
  const frame = $("#demo-frame");
  if (!start || !status || !fallback || !frame) return;
  const appUrl = (route) => `translate/${large?.checked ? "?large=1" : ""}#/${route}`;
  const tourLinks = $$('a[href="translate/#/tour"]');
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

setupNav();
setupLibrary();
setupDemo();
removeOldServiceWorkers(); // SignMate is a website only: no offline cache (CLAUDE.md 10.7)
