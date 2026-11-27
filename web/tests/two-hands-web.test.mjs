// CLAUDE.md 8.4: every recogniser in every client tracks both hands at once. This scans the web app for
// MediaPipe HandLandmarker settings so a one-hand setting (as in the Phase 0 detector) cannot come back.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const files = readdirSync(src).filter((name) => /\.(js|jsx)$/.test(name));

test("every numHands setting in the web app asks for two hands", () => {
  const settings = [];
  for (const name of files) {
    for (const match of readFileSync(path.join(src, name), "utf8").matchAll(/numHands\s*:\s*([^,\n}]+)/g)) {
      settings.push({ name, value: match[1].trim() });
    }
  }
  assert.ok(settings.length >= 1, `expected capture v2's hand tracker, found ${JSON.stringify(settings)}`);
  for (const { name, value } of settings) {
    assert.ok(value === "2" || value === "models.hand.num", `${name} sets numHands to ${value}`);
  }
});

// Changed on purpose 2026-11-27 (master v4): the camera runs the ASL model, which reads the face (lips, nose, eyes)
// as well as both hands, so the face tracker is back on, at a lower rate (recognition/engine.js trackingPlan).
test("the ASL camera uses capture v2 with both hands, pose and face, not a one-hand detector", async () => {
  const engine = readFileSync(path.join(src, "recognition", "engine.js"), "utf8");
  assert.match(engine, /createCaptureV2\(/);
  assert.match(engine, /parts: \["hands", "pose", "face"\]/);
  for (const file of ["App.jsx", "recognition/engine.js", "ui/CameraStage.jsx"]) assert.doesNotMatch(readFileSync(path.join(src, file), "utf8"), /createHandDetector\(/);
  globalThis.location ??= { href: "http://localhost/", hostname: "localhost" };
  const { trackingPlan } = await import("../src/recognition/engine.js");
  for (const level of [0, 1, 2]) {
    const plans = Array.from({ length: 6 }, (_, i) => trackingPlan(level, i));
    assert.ok(plans.some((plan) => plan.face === true), `level ${level} runs the face tracker`);
    assert.ok(plans.every((plan) => plan.face !== "off"), `level ${level} never switches the face off (the model reads it)`);
  }
  assert.ok(Array.from({ length: 4 }, (_, i) => trackingPlan(0, i)).every((plan) => (plan.pose === true) !== (plan.face === true)), "full mode: pose and face take turns");
  assert.equal(trackingPlan(1, 0).pose, "off");
});
