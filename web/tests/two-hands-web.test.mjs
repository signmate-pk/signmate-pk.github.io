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
  assert.ok(settings.length >= 2, `expected the Phase 0 detector and capture v2, found ${JSON.stringify(settings)}`);
  for (const { name, value } of settings) {
    assert.ok(value === "2" || value === "models.hand.num", `${name} sets numHands to ${value}`);
  }
});

// Changed on purpose 2026-11-26 (product UI): the PSL camera loop moved from App.jsx to recognition/engine.js.
// It still tracks both hands with capture v2 (and the pose, to tell left from right), but no longer runs the
// face tracker: the PSL v3 model reads only the two hands (models/psl/manifest.json input.parts_read), and the
// face cost 28 of 129 ms per frame in the audit run (reports/perf_audit_2026-11-26.md). ASL mode keeps all three.
test("the PSL camera uses capture v2 with both hands (and pose), not the one-hand Phase 0 detector", () => {
  const engine = readFileSync(path.join(src, "recognition", "engine.js"), "utf8");
  assert.match(engine, /createCaptureV2\(/);
  assert.match(engine, /parts: \["hands", "pose"\]/);
  for (const file of ["App.jsx", "recognition/engine.js", "ui/CameraStage.jsx"]) assert.doesNotMatch(readFileSync(path.join(src, file), "utf8"), /createHandDetector\(/);
  const manifest = JSON.parse(readFileSync(path.join(src, "..", "..", "models", "psl", "manifest.json"), "utf8"));
  assert.deepEqual(manifest.input.parts_read, ["left_hand", "right_hand"], "if a PSL model reads face points again, turn the face tracker back on");
});
