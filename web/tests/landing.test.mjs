// The project page (web/index.html) is complete without JavaScript, honest, and built from the real data:
// every sign comes from the model's labels file and every number from shared_data/psl_results.json.
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
const manifest = JSON.parse(readFileSync(path.join(project, "models/psl/manifest.json"), "utf8"));
const results = JSON.parse(readFileSync(path.join(project, "shared_data/psl_results.json"), "utf8"));
const input = loadInputs({ project, publicDir: path.join(web, "public") });
const html = renderLanding(readFileSync(path.join(web, "index.html"), "utf8"), input);
const app = readFileSync(path.join(web, "app.html"), "utf8");
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

test("the sign library is exactly the model's signs, never invented ones", () => {
  const signs = manifest.classes.filter((c) => c.tier && c.gloss !== manifest.unknown_class);
  const cards = all(/<li class="sign" /g);
  assert.equal(cards.length, signs.length);
  for (const sign of signs) assert.ok(visible.includes(`<h3 class="sign-en">${sign.english.replace(/&/g, "&amp;").replace(/'/g, "'")}</h3>`), sign.english);
  assert.deepEqual(librarySigns(input).map((s) => s.gloss).sort(), signs.map((s) => s.gloss).sort());
  assert.ok(!visible.includes('class="sign-en">Not a sign<'), "'Not a sign' is not offered as a sign");
});

test("the results shown are the measured ones, with their labels", () => {
  const pct = (x) => `${(x * 100).toFixed(1)} %`;
  assert.ok(visible.includes(pct(results.fair_test.top1)));
  assert.ok(visible.includes(pct(results.independent_signer.top1)));
  assert.match(visible, /Weaker test/);
  assert.match(visible, /not yet validated by Deaf signers/);
  assert.ok(visible.includes(`training run ${results.source.run}`));
  // The confusion matrix has one green square per tested sign that was ever right, and one diamond per error kind.
  const errorKinds = results.confusion_matrix.errors.length;
  assert.equal(all(/<path d="M[^"]+Z" fill="#ffb547"/g).length, errorKinds);
  assert.equal(all(/<rect [^>]*fill="#3ddc97" fill-opacity/g).length, results.confusion_matrix.counts.filter((row, i) => row[i] > 0).length);
});

test("accessibility basics: alt text, captions in English and Urdu, Urdu marked right to left", () => {
  for (const [img] of all(/<img\b[^>]*>/g)) assert.match(img, /\balt="/, img);
  const videos = all(/<video\b[\s\S]*?<\/video>/g);
  assert.ok(videos.length >= 1);
  for (const [video] of videos) {
    assert.match(video, /<track kind="captions" srclang="en"/);
    assert.match(video, /<track kind="captions" srclang="ur"/);
  }
  for (const [tag] of all(/<[a-z0-9]+\b[^>]*\blang="ur"[^>]*>/g)) {
    if (/^<(track|meta)/.test(tag)) continue;
    assert.match(tag, /dir="rtl"/, tag);
  }
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

test("the app keeps working at app.html, with a real no-JavaScript fallback, and old links forward there", () => {
  assert.match(app, /<script type="module" src="\/src\/main.jsx"><\/script>/);
  assert.match(app, /<noscript>[\s\S]*turn JavaScript on[\s\S]*project page[\s\S]*<\/noscript>/i);
  assert.match(html, /location\.replace\("app\.html" \+ s \+ h\)/);
  assert.match(visible, /href="app\.html#\/words"/);
  assert.match(visible, /href="app\.html#\/tour"/);
});

test("the demo checks the camera before loading anything", async () => {
  const env = (over) => ({ isSecureContext: true, navigator: { mediaDevices: { getUserMedia() {}, enumerateDevices: async () => [{ kind: "videoinput" }] }, permissions: { query: async () => ({ state: "prompt" }) } }, ...over });
  assert.equal(await cameraProblem(env()), null);
  assert.match(await cameraProblem(env({ isSecureContext: false })), /secure/);
  assert.match(await cameraProblem(env({ navigator: {} })), /cannot use a camera/);
  assert.match(await cameraProblem(env({ navigator: { mediaDevices: { getUserMedia() {}, enumerateDevices: async () => [] }, permissions: { query: async () => ({ state: "denied" }) } } })), /blocked/);
  assert.match(await cameraProblem(env({ navigator: { mediaDevices: { getUserMedia() {}, enumerateDevices: async () => [{ kind: "audioinput" }] } } })), /No camera/);
});
