// Wiring test for src/capture_v2.js with a stand-in MediaPipe (tests/fakes/tasks-vision.mjs), so it
// runs under plain Node with no npm packages, camera or GPU. It checks that the browser capture passes
// MediaPipe's output to canonicalizeFrame correctly; it does not measure real landmark quality or speed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const fakeUrl = pathToFileURL(path.join(here, "fakes", "tasks-vision.mjs")).href;
register(`data:text/javascript,export async function resolve(specifier, context, next) {
  if (specifier === "@mediapipe/tasks-vision") return { url: ${JSON.stringify(fakeUrl)}, shortCircuit: true };
  return next(specifier, context);
}`);
const fake = await import(fakeUrl);
const { createCaptureV2, FpsMeter } = await import("../src/capture_v2.js");
const { canonicalizeFrame } = await import("../src/features_v2.js");

const project = path.resolve(here, "../..");
const spec = JSON.parse(readFileSync(path.join(project, "shared_data/feature_spec_v2.json"), "utf8"));
const fixture = JSON.parse(gunzipSync(readFileSync(path.join(project, "tests/golden/v2_holistic.json.gz"))).toString("utf8"));
const asObjects = (rows) => rows.map(([x, y, z, visibility]) => (visibility === undefined ? { x, y, z } : { x, y, z, visibility }));

for (const name of ["MediaRecorder", "OffscreenCanvas"]) {
  globalThis[name] = class { constructor() { throw new Error(`capture_v2 must not use ${name}`); } };
}

test("browser capture gives the same canonical frame as canonicalizeFrame on the raw landmarks", async () => {
  const cases = fixture.canonicalize_cases.filter((item) => !item.raw.input_mirrored && item.raw.pose && item.raw.face && item.raw.hands.length === 2);
  assert.ok(cases.length > 0);
  for (const item of cases) {
    fake.settings.hands = item.raw.hands.map((hand) => ({ points: asObjects(hand.landmarks), label: hand.handedness }));
    fake.settings.pose = asObjects(item.raw.pose);
    fake.settings.face = asObjects(item.raw.face);
    const capture = await createCaptureV2({ spec });
    const video = { videoWidth: item.raw.image_width, videoHeight: item.raw.image_height };
    const { frame, timings } = capture.processVideoFrame(video, item.raw.timestamp_ms);
    assert.deepEqual(frame, canonicalizeFrame(item.raw, spec), item.id);
    assert.deepEqual(Object.keys(timings).sort(), ["face", "hands", "pose"]);
    capture.close();
  }
});

test("models, options and GPU-to-CPU fallback", async () => {
  fake.calls.created.length = 0;
  fake.settings.failGpu = true;
  const capture = await createCaptureV2({ spec, modelBase: "/models/" });
  fake.settings.failGpu = false;
  assert.deepEqual(capture.delegates, { hands: "CPU", pose: "CPU", face: "CPU" });
  const models = Object.fromEntries(fake.calls.created.map((call) => [call.kind, call]));
  assert.equal(models.hands.model, "/models/hand_landmarker.task");
  assert.equal(models.pose.model, "/models/pose_landmarker_lite.task");
  assert.equal(models.face.model, "/models/face_landmarker.task");
  assert.equal(models.hands.options.numHands, 2);
  assert.equal(models.hands.options.runningMode, "VIDEO");
  assert.equal(models.face.options.outputFaceBlendshapes, false);
  assert.equal(models.pose.options.outputSegmentationMasks, false);
  fake.calls.closed.length = 0;
  capture.close();
  assert.deepEqual(fake.calls.closed.sort(), ["face", "hands", "pose"]);
});

test("timestamps sent to MediaPipe always increase, and an empty video is skipped", async () => {
  fake.settings.hands = [];
  fake.settings.pose = null;
  fake.settings.face = null;
  const capture = await createCaptureV2({ spec, parts: ["hands"] });
  fake.calls.detect.length = 0;
  assert.equal(capture.processVideoFrame({ videoWidth: 0, videoHeight: 0 }, 5), null);
  const stamps = [10, 10, 9.6, 11, 50].map((t) => capture.processVideoFrame({ videoWidth: 640, videoHeight: 480 }, t).frame.timestamp_ms);
  assert.deepEqual(stamps, [10, 11, 12, 13, 50]);
  assert.deepEqual(fake.calls.detect.map((call) => call.timestamp), stamps);
  assert.deepEqual(capture.parts, ["hands"]);
  capture.close();
});

test("fps meter", () => {
  const meter = new FpsMeter(10);
  for (let i = 0; i < 10; i += 1) meter.tick(i * 40);
  assert.equal(Math.round(meter.fps), 25);
});

// Per-part cadence (restored from the 19 Nov baseline build): a frame may reuse the last pose, or skip
// pose and face entirely ("off", light mode). The hands always run.
test("run option: reuse the last pose, or switch pose and face off", async () => {
  const item = fixture.canonicalize_cases.find((c) => !c.raw.input_mirrored && c.raw.pose && c.raw.face && c.raw.hands.length === 2);
  fake.settings.hands = item.raw.hands.map((hand) => ({ points: asObjects(hand.landmarks), label: hand.handedness }));
  fake.settings.pose = asObjects(item.raw.pose);
  fake.settings.face = asObjects(item.raw.face);
  const capture = await createCaptureV2({ spec });
  const video = { videoWidth: item.raw.image_width, videoHeight: item.raw.image_height };
  fake.calls.detect.length = 0;
  const first = capture.processVideoFrame(video, 100, { run: { pose: false, face: false } });
  assert.deepEqual(first.fresh, { pose: true, face: true }, "nothing to reuse yet, so both run");
  const second = capture.processVideoFrame(video, 133, { run: { pose: false, face: false } });
  assert.deepEqual(second.fresh, { pose: false, face: false });
  assert.deepEqual(second.raw.pose, first.raw.pose);
  assert.deepEqual(fake.calls.detect.map((c) => c.kind), ["hands", "pose", "face", "hands"]);
  const off = capture.processVideoFrame(video, 166, { run: { pose: "off", face: "off" } });
  assert.equal(off.raw.pose, null);
  assert.equal(off.raw.face, null);
  assert.ok(off.frame.left_hand || off.frame.right_hand, "hands still tracked without pose");
  capture.forget();
  const after = capture.processVideoFrame(video, 200, { run: { pose: false } });
  assert.equal(after.fresh.pose, true, "after forget() the pose runs again");
  capture.close();
});
