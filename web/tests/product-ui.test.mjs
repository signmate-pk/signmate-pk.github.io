// Product UI data and helpers (2026-11-26): language coverage, the live address, the QR encoder, and the
// guided tour's recorded signs. No browser needed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ROMAN_URDU, cameraSigns, label } from "../src/ui/signs.js";
import { t } from "../src/ui/i18n.js";
import { LIVE_URL } from "../src/ui/site.js";
import { qrMatrix } from "../src/ui/qr.js";
import { decide } from "../src/recognition/decision.js";
import { rankPsl } from "../src/psl_client.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, "../..");
const manifest = JSON.parse(readFileSync(path.join(project, "models/psl/manifest.json"), "utf8"));
const site = JSON.parse(readFileSync(path.join(project, "shared_data/site.json"), "utf8"));
const parity = JSON.parse(readFileSync(path.join(project, "tests/golden/psl_parity_cases.json"), "utf8"));
const i18nSource = readFileSync(path.join(project, "web/src/ui/i18n.js"), "utf8");

test("every camera sign has a Roman Urdu label, and 'Not a sign' is never in the gallery", () => {
  const signs = cameraSigns(manifest);
  assert.equal(signs.length, manifest.classes.filter((c) => c.tier).length);
  assert.ok(signs.every((s) => s.gloss !== manifest.unknown_class));
  for (const entry of signs) assert.ok(ROMAN_URDU[entry.gloss], `${entry.gloss} has no Roman Urdu`);
  const water = signs.find((s) => s.gloss === "water");
  assert.equal(label(water, "en"), "Water");
  assert.equal(label(water, "ur"), "پانی");
  assert.equal(label(water, "roman"), "Paani");
});

test("every interface string has an Urdu version", () => {
  const keys = [...i18nSource.matchAll(/^\s{2}(\w+): \{ en:/gm)].map((m) => m[1]);
  assert.ok(keys.length > 40);
  for (const key of keys) assert.notEqual(t(key, "ur"), t(key, "en"), `${key} has no Urdu`);
});

test("the QR code and share links point at the live site", () => {
  assert.equal(LIVE_URL, site.site_url);
  const m = qrMatrix(LIVE_URL);
  assert.equal(m.length, 29, "version 3 for the live address");
  // Finder pattern corners and the always-dark module.
  for (const [x, y] of [[0, 0], [m.length - 7, 0], [0, m.length - 7]]) { assert.equal(m[y][x], true); assert.equal(m[y + 1][x + 1], false); assert.equal(m[y + 3][x + 3], true); }
  assert.equal(m[m.length - 8][8], true);
  assert.throws(() => qrMatrix("x".repeat(200)));
});

test("the tour's saved answers name the recorded sign and pass the accept rule", () => {
  for (const item of parity.cases) {
    const scores = new Array(manifest.classes.length).fill(-30);
    item.top5.forEach((index, i) => { scores[index] = item.top5_scores[i]; });
    const result = { top: rankPsl(scores, manifest) };
    const decision = decide(result);
    assert.equal(decision.best.gloss, item.sign);
    assert.equal(decision.verdict, "accept", item.sign);
  }
  for (const gloss of ["goodbye", "donttouch", "mobile_phone"]) assert.ok(parity.cases.some((c) => c.sign === gloss), `the tour needs ${gloss}`);
});
