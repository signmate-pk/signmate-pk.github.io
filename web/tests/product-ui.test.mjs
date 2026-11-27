// The translator's product rules (master v4): the gallery is the ASL model's 250 signs, no PSL functionality
// ships, the share links point at the live site, and the guided tour's recordings decode exactly as the Python
// side (tools/asl_eval_core.py) stored them.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { cameraSigns, label, NOT_VALIDATED, secondary } from "../src/ui/signs.js";
import { t } from "../src/ui/i18n.js";
import { LIVE_URL } from "../src/ui/site.js";
import { qrMatrix } from "../src/ui/qr.js";
import { decide } from "../src/recognition/decision.js";
import { aslSigns } from "../src/recognition/asl_model.js";
import { labelsFromIndexMap } from "../src/asl_islr.js";
import { decodeRecording, savedResult } from "../src/ui/recordings.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "..");
const project = path.resolve(web, "..");
const aslSpec = JSON.parse(readFileSync(path.join(project, "shared_data/asl_islr_spec.json"), "utf8"));
const labels = labelsFromIndexMap(JSON.parse(readFileSync(path.join(project, "models/asl/sign_to_prediction_index_map.json"), "utf8")), 250);
const site = JSON.parse(readFileSync(path.join(project, "shared_data/site.json"), "utf8"));
const signs = aslSigns(labels, aslSpec);

function sourceFiles(folder) {
  return readdirSync(folder).flatMap((name) => {
    const full = path.join(folder, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : /\.(js|jsx|html)$/.test(name) ? [full] : [];
  });
}

test("the gallery is the ASL model's 250 signs, English first with the gloss underneath", () => {
  const gallery = cameraSigns(signs);
  assert.equal(gallery.length, 250);
  assert.deepEqual(gallery.map((s) => s.english), [...gallery.map((s) => s.english)].sort((a, b) => a.localeCompare(b, "en")));
  const thankYou = gallery.find((s) => s.gloss === "thankyou");
  assert.equal(label(thankYou), "thank you");
  assert.equal(secondary(thankYou), "THANKYOU");
  assert.equal(signs[thankYou.index].gloss, "thankyou", "index is the model's output position");
  assert.match(NOT_VALIDATED, /not yet validated by our reviewers/);
  assert.match(t("validation"), /not yet validated by our reviewers/);
});

test("no PSL functionality ships in the translator", () => {
  const offenders = [];
  for (const file of [...sourceFiles(path.join(web, "src")), path.join(web, "translate", "index.html")]) {
    const text = readFileSync(file, "utf8");
    for (const pattern of [/psl_client|psl_hands|models\/psl|demo_signs|psl_clips|psl_dictionary|manifest\.webmanifest|serviceWorker\.register/]) {
      if (pattern.test(text)) offenders.push(`${path.relative(web, file)}: ${text.match(pattern)[0]}`);
    }
  }
  assert.deepEqual(offenders, []);
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

test("tour recordings decode to the values the Python side stored", () => {
  const fixture = JSON.parse(readFileSync(path.join(project, "tests/golden/asl_tour_format.json"), "utf8"));
  const item = fixture.file.recordings[0];
  const recording = decodeRecording(item, fixture.file);
  assert.equal(recording.gloss, "hello");
  assert.equal(recording.sequence.length, 4);
  assert.equal(recording.sequence[0].length, 543);
  fixture.check.rows.forEach((row, r) => {
    for (let f = 0; f < 4; f += 1) {
      const expected = fixture.check.values[f][r];
      const got = recording.sequence[f][row];
      if (expected[0] === null || !item.rows.includes(row)) assert.ok(got.every(Number.isNaN), `frame ${f} row ${row} is missing`);
      else got.forEach((v, c) => assert.ok(Math.abs(v - expected[c]) <= 0.5 / fixture.file.quant + 1e-6, `frame ${f} row ${row}: ${v} vs ${expected[c]}`));
    }
  });
  assert.equal(recording.frames[1].left, null, "the left hand is missing in frame 1");
  assert.equal(recording.frames[0].right, null, "the right hand is never seen");
  assert.equal(recording.frames[0].left.length, 21);
  assert.equal(recording.frames[0].arms.length, 6);
  assert.throws(() => decodeRecording({ ...item, frames: 5 }, fixture.file), /bytes/);
});

test("the tour's saved answers name the recorded sign and pass the accept rule", () => {
  const fixture = JSON.parse(readFileSync(path.join(project, "tests/golden/asl_tour_format.json"), "utf8"));
  const recording = decodeRecording(fixture.file.recordings[0], fixture.file);
  const result = savedResult(recording, signs);
  assert.equal(result.saved, true);
  assert.deepEqual(result.top.map((e) => e.gloss), ["hello", "bye"], "labels the model does not have are left out");
  const decision = decide(result);
  assert.equal(decision.verdict, "accept");
  assert.equal(decision.best.english, "hello");
});
