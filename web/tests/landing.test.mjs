// The project page (web/index.html) is complete without JavaScript, honest, and built from the real data:
// every sign comes from the ASL model's labels file and every number from shared_data/asl_results.json.
// No browser needed: the page is rendered with the same generator the build uses (scripts/landing-content.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { librarySigns, loadInputs, renderLanding } from "../scripts/landing-content.mjs";
import { cameraProblem } from "../src/landing/camera.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "..");
const project = path.resolve(web, "..");
const indexMap = JSON.parse(readFileSync(path.join(project, "models/asl/sign_to_prediction_index_map.json"), "utf8"));
const aslSpec = JSON.parse(readFileSync(path.join(project, "shared_data/asl_islr_spec.json"), "utf8"));
const results = JSON.parse(readFileSync(path.join(project, "shared_data/asl_results.json"), "utf8"));
const input = loadInputs({ project });
const html = renderLanding(readFileSync(path.join(web, "index.html"), "utf8"), input);
const app = readFileSync(path.join(web, "translate", "index.html"), "utf8");
const forward = readFileSync(path.join(web, "public", "app.html"), "utf8");
const visible = html.replace(/<!--[\s\S]*?-->/g, "");
const all = (re) => [...visible.matchAll(re)];

test("one h1, and headings never skip a level", () => {
  assert.equal(all(/<h1[\s>]/g).length, 1);
  let last = 1;
  for (const [, level] of all(/<h([1-6])[\s>]/g)) {
    assert.ok(Number(level) <= last + 1, `h${level} after h${last}`);
    last = Number(level);
  }
});

test("every section the judges asked for is in the HTML itself, with the menu pointing at it", () => {
  for (const id of ["home", "how", "demo", "demo-video", "signs", "technology", "results", "validation", "team", "contact"]) {
    assert.match(visible, new RegExp(`id="${id}"`), id);
  }
  for (const id of ["home", "how", "demo", "signs", "technology", "results", "validation", "team"]) {
    assert.match(visible, new RegExp(`<nav[\\s\\S]*href="#${id}"[\\s\\S]*</nav>`), `menu links to #${id}`);
  }
  assert.match(visible, /<main id="main"/);
  assert.match(visible, /class="skip-link" href="#main"/);
  assert.match(visible, /<header[\s>]/);
  assert.match(visible, /<footer[\s>]/);
  assert.doesNotMatch(visible, /SignMate needs JavaScript/);
});

test("the sign library is exactly the model's 250 signs, never invented ones", () => {
  const labels = Object.keys(indexMap);
  const cards = all(/<li class="sign" /g);
  assert.equal(cards.length, labels.length);
  assert.equal(labels.length, 250);
  for (const label of labels) {
    const english = (aslSpec.display_names[label] ?? label).replace(/&/g, "&amp;");
    assert.ok(visible.includes(`<h3 class="sign-en">${english}</h3>`), english);
    assert.ok(visible.includes(`Gloss: </span>${label.toUpperCase()}</p>`), label);
  }
  assert.deepEqual(librarySigns(input).map((s) => s.gloss).sort(), [...labels].sort());
  assert.equal(all(/Dataset sign — not yet validated by our reviewers/g).length, labels.length);
});

test("the results shown are the measured ones, with their labels", () => {
  const pct = (x) => `${(x * 100).toFixed(1)} %`;
  assert.ok(visible.includes(pct(results.headline.native_top1)));
  assert.ok(visible.includes(pct(results.headline.native_top5)));
  assert.ok(visible.includes(pct(results.headline.browser_top1)));
  assert.ok(visible.includes(results.measured_on.slice(0, 10)));
  assert.ok(visible.includes(results.source), "names its source file");
  assert.match(visible, /not yet validated by our Deaf reviewers/);
  assert.match(visible, /could not re-check/);
  if (results.status !== "complete") assert.match(visible, /Per-sign results and the confusion matrix come with the next measurement run/);
});

test("website only, ASL only: no app, offline copy, install or PSL feature on the page", () => {
  assert.doesNotMatch(visible, /manifest\.webmanifest|Save for offline|[Ww]orks offline|offline copy|Install/);
  assert.doesNotMatch(visible, /PSL dictionary|psl_|Roman Urdu|class="clip-link"|<video\b/);
  assert.doesNotMatch(app, /manifest\.webmanifest/);
  assert.match(app, /<meta name="signmate-base" content="\.\.\/" \/>/);
});

test("accessibility basics: alt text, labelled inputs, unique ids, English", () => {
  for (const [img] of all(/<img\b[^>]*>/g)) assert.match(img, /\balt="/, img);
  for (const [video] of all(/<video\b[\s\S]*?<\/video>/g)) assert.match(video, /<track kind="captions" srclang="en"/);
  assert.match(visible, /<html lang="en"/);
  for (const [input] of all(/<input\b[^>]*>/g)) {
    const id = input.match(/id="([^"]+)"/)?.[1];
    assert.ok(id && (visible.includes(`for="${id}"`) || /<label[^>]*>\s*<input/.test(visible)), `label for ${input}`);
  }
  const ids = all(/\bid="([^"]+)"/g).map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, "ids are unique");
});

test("search engines and link previews get a title, description, image and canonical address", () => {
  assert.match(html, /<title>[^<]{20,}<\/title>/);
  assert.match(html, /<meta name="description" content="[^"]{80,}"/);
  assert.match(html, /<meta property="og:image" content="https:\/\/signmate-pk\.github\.io\/og-image\.png"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/signmate-pk\.github\.io\/"/);
  assert.match(html, /<link rel="icon"/);
});

test("missing facts are visible placeholders, not made up", () => {
  for (const placeholder of ["[TODO: 60-second demo video]", "[TODO: name]", "[TODO: photo]", "[TODO: contact email]", "[TODO: feedback form link]"]) {
    assert.ok(visible.includes(placeholder), placeholder);
  }
  assert.doesNotMatch(visible, /lorem ipsum|testimonial|award-winning/i);
});

test("the translator is at translate/, with a real no-JavaScript fallback, and old links forward there", () => {
  assert.match(app, /<script type="module" src="\/src\/main.jsx"><\/script>/);
  assert.match(app, /<noscript>[\s\S]*turn JavaScript on[\s\S]*project page[\s\S]*<\/noscript>/i);
  assert.match(html, /location\.replace\("translate\/" \+ s \+ h\)/);
  assert.match(visible, /href="translate\/#\/words"/);
  assert.match(visible, /href="translate\/#\/tour"/);
  assert.match(forward, /location\.replace\("translate\/" \+ location\.search \+ location\.hash\)/);
  assert.match(forward, /http-equiv="refresh" content="0; url=translate\/"/);
});

test("the demo checks the camera before loading anything", async () => {
  const env = (over) => ({ isSecureContext: true, navigator: { mediaDevices: { getUserMedia() {}, enumerateDevices: async () => [{ kind: "videoinput" }] }, permissions: { query: async () => ({ state: "prompt" }) } }, ...over });
  assert.equal(await cameraProblem(env()), null);
  assert.match(await cameraProblem(env({ isSecureContext: false })), /secure/);
  assert.match(await cameraProblem(env({ navigator: {} })), /cannot use a camera/);
  assert.match(await cameraProblem(env({ navigator: { mediaDevices: { getUserMedia() {}, enumerateDevices: async () => [] }, permissions: { query: async () => ({ state: "denied" }) } } })), /blocked/);
  assert.match(await cameraProblem(env({ navigator: { mediaDevices: { getUserMedia() {}, enumerateDevices: async () => [{ kind: "audioinput" }] } } })), /No camera/);
});
