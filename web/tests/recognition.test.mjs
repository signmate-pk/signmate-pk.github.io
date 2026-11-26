// The product rules on top of the PSL model: decision thresholds, the sentence tray, and the engine's
// pure helpers. No camera or model needed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { decide, practiceFeedback, thresholdFor, DEFAULT_POLICY, REASONS, HINTS, confidenceWord } from "../src/recognition/decision.js";
import * as tray from "../src/recognition/sentence_tray.js";
import { islrFrame } from "../src/asl_islr.js";
import { canonicalizeFrame } from "../src/features_v2.js";
import { syntheticRawSequence } from "../src/synthetic_sign.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, "../..");
const manifest = JSON.parse(readFileSync(path.join(project, "models/psl/manifest.json"), "utf8"));
const featureSpec = JSON.parse(readFileSync(path.join(project, "shared_data/feature_spec_v2.json"), "utf8"));
const aslSpec = JSON.parse(readFileSync(path.join(project, "shared_data/asl_islr_spec.json"), "utf8"));
// engine.js imports browser-only modules lazily; its pure helpers load under Node.
globalThis.location ??= { href: "http://localhost/", hostname: "localhost" };
const { pslFrame, scaledSegmentation, nextLevel } = await import("../src/recognition/engine.js");

const entry = (gloss, probability, unknown = false) => ({ gloss, english: gloss, urdu: gloss, probability, unknown });

test("policy thresholds come from the manifest and the measured weak signs", () => {
  assert.equal(DEFAULT_POLICY.accept, manifest.confidence.sure);
  assert.equal(DEFAULT_POLICY.suggest, manifest.confidence.unsure);
  for (const gloss of Object.keys(DEFAULT_POLICY.perSign)) {
    const cls = manifest.classes.find((c) => c.gloss === gloss);
    assert.ok(cls, gloss);
    assert.ok(cls.device_held_out.top1 < 0.9, `${gloss} is one of the weaker signs`);
    assert.ok(thresholdFor(gloss) > DEFAULT_POLICY.accept);
  }
  assert.equal(thresholdFor("water"), DEFAULT_POLICY.accept);
});

test("accept needs the threshold and a clear lead", () => {
  assert.equal(decide({ top: [entry("water", 0.9), entry("you", 0.05)] }).verdict, "accept");
  const close = decide({ top: [entry("water", 0.62), entry("you", 0.5)] });
  assert.equal(close.verdict, "check");
  assert.equal(close.reason, REASONS.close);
  assert.equal(close.choices.length, 2);
});

test("weak signs need more confidence", () => {
  assert.equal(decide({ top: [entry("help", 0.7), entry("you", 0.1)] }).verdict, "check");
  assert.equal(decide({ top: [entry("help", 0.8), entry("you", 0.1)] }).verdict, "accept");
});

test("low confidence, 'not a sign' first, and resting hands are rejected with no words offered", () => {
  const low = decide({ top: [entry("water", 0.2), entry("you", 0.1)] });
  assert.equal(low.verdict, "reject");
  assert.equal(low.choices.length, 0);
  const unknown = decide({ top: [entry("_unknown", 0.7, true), entry("water", 0.2)] });
  assert.equal(unknown.verdict, "reject");
  assert.equal(unknown.reason, REASONS.notASign);
  const resting = decide({ top: [entry("water", 0.99)] }, { hitMaxFrames: true });
  assert.equal(resting.verdict, "reject");
  assert.equal(resting.reason, REASONS.resting);
  assert.equal(decide({ top: [] }).verdict, "reject");
});

test("'Not a sign' is never offered as a choice", () => {
  const out = decide({ top: [entry("water", 0.4), entry("_unknown", 0.3, true), entry("you", 0.2)] });
  assert.equal(out.verdict, "check");
  assert.ok(out.choices.every((c) => !c.unknown));
});

test("every reason has an English and an Urdu hint", () => {
  for (const reason of Object.values(REASONS)) { assert.ok(HINTS[reason].en); assert.ok(HINTS[reason].ur); }
});

test("practice feedback", () => {
  const result = { top: [entry("water", 0.9), entry("you", 0.05)] };
  assert.equal(practiceFeedback(decide(result), result, "water").status, "match");
  assert.equal(practiceFeedback(decide(result), result, "you").status, "close");
  assert.equal(practiceFeedback(decide(result), result, "dog").status, "miss");
  const low = { top: [entry("water", 0.1)] };
  assert.equal(practiceFeedback(decide(low), low, "water").status, "unclear");
  assert.equal(confidenceWord(decide(result)), "sure");
});

test("tray: a word waits for the pause, then joins", () => {
  let s = tray.emptyTray();
  s = tray.offer(s, { gloss: "hello" }, 0);
  assert.equal(s.words.length, 0);
  s = tray.tick(s, 1000);
  assert.equal(s.words.length, 0);
  assert.ok(tray.pendingProgress(s, 600) > 0.4);
  s = tray.tick(s, 1250);
  assert.deepEqual(s.words.map((w) => w.gloss), ["hello"]);
});

test("tray: the same sign cut in two counts once; a different sign commits the pending one", () => {
  let s = tray.emptyTray();
  s = tray.offer(s, { gloss: "water" }, 0);
  s = tray.offer(s, { gloss: "water" }, 700);
  s = tray.tick(s, 1300);
  assert.deepEqual(s.words.map((w) => w.gloss), ["water"]);
  s = tray.offer(s, { gloss: "where" }, 5000);
  s = tray.offer(s, { gloss: "doctor" }, 5400);
  assert.deepEqual(tray.allWords(s).map((w) => w.gloss), ["water", "where", "doctor"]);
  // The same sign later, on purpose, is a new word.
  s = tray.tick(s, 7000);
  s = tray.offer(s, { gloss: "doctor" }, 9000);
  s = tray.tick(s, 10300);
  assert.deepEqual(s.words.map((w) => w.gloss), ["water", "where", "doctor", "doctor"]);
});

test("tray: corrections", () => {
  let s = tray.emptyTray();
  for (const [g, t] of [["you", 0], ["water", 2000], ["where", 4000]]) { s = tray.offer(s, { gloss: g }, t); s = tray.tick(s, t + 1300); }
  s = tray.replace(s, 1, { gloss: "doctor" });
  s = tray.remove(s, 0);
  assert.deepEqual(s.words.map((w) => w.gloss), ["doctor", "where"]);
  s = tray.offer(s, { gloss: "hello" }, 9000);
  s = tray.undo(s);
  assert.equal(s.pending, null, "undo drops the pending word first");
  s = tray.undo(s);
  assert.deepEqual(s.words.map((w) => w.gloss), ["doctor"]);
  assert.deepEqual(tray.clear().words, []);
});

test("pslFrame gives the same hand rows as islrFrame", () => {
  for (const raw of syntheticRawSequence(7, 12, "alternating")) {
    const canonical = canonicalizeFrame(raw, featureSpec);
    const ours = pslFrame(canonical.left_hand, canonical.right_hand);
    const reference = islrFrame(raw, featureSpec, aslSpec);
    assert.equal(ours.length, 543);
    for (const i of [...Array(21).keys()].flatMap((k) => [468 + k, 522 + k])) assert.deepEqual(ours[i], reference[i]);
    assert.ok(ours.slice(0, 468).every((row) => row.every(Number.isNaN)), "face rows are NaN (the PSL model does not read them)");
  }
});

test("halving the frame rate halves the cutter's frame counts", () => {
  const half = scaledSegmentation(aslSpec, 2).segmentation;
  assert.equal(half.end_after_missing_frames, 4);
  assert.equal(half.max_frames, 96);
  assert.equal(scaledSegmentation(aslSpec, 1), aslSpec);
});

test("light mode switches on when slow and off only after a long fast stretch", () => {
  assert.deepEqual(nextLevel(0, 55, 0), { level: 1, fastWindows: 0 });
  assert.deepEqual(nextLevel(1, 55, 0), { level: 2, fastWindows: 0 });
  assert.deepEqual(nextLevel(2, 55, 0), { level: 2, fastWindows: 0 });
  let state = { level: 2, fastWindows: 0 };
  for (let i = 0; i < 2; i += 1) state = nextLevel(state.level, 10, state.fastWindows);
  assert.equal(state.level, 2);
  state = nextLevel(state.level, 10, state.fastWindows);
  assert.equal(state.level, 1);
});
