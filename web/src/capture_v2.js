// Capture v2 for the browser: both hands, upper-body pose and a face subset per video frame,
// returned as canonical frames (see shared_data/feature_spec_v2.json and src/features_v2.js).
// Uses MediaPipe's Pose, Hand and Face Landmarkers, the same three models as ml_engine/capture_v2.py.
//
// Privacy: only landmark numbers are kept, in memory. Nothing here records, encodes or stores
// video or images (tests/test_capture_v2.py scans this file for recorders and encoders).
// Browser <video> frames are already upright and are not mirrored (mirroring is CSS only), so
// inputMirrored defaults to false and no rotation is needed.
import { FaceLandmarker, FilesetResolver, HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
import { assetUrl } from "./paths.js";
import { canonicalizeFrame, createLayout, FEATURE_VERSION } from "./features_v2.js";

export const PARTS = ["hands", "pose", "face"];

export async function loadFeatureSpecV2(url = assetUrl("feature_spec_v2.json")) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Feature spec could not be loaded (${response.status}). Run npm run assets.`);
  const spec = await response.json();
  createLayout(spec); // throws on an unsupported feature version
  return spec;
}

export class FpsMeter {
  constructor(window = 60) {
    this.window = window;
    this.times = [];
  }

  tick(now = performance.now()) {
    this.times.push(now);
    if (this.times.length > this.window) this.times.shift();
  }

  get fps() {
    if (this.times.length < 2) return 0;
    const span = (this.times[this.times.length - 1] - this.times[0]) / 1000;
    return span > 0 ? (this.times.length - 1) / span : 0;
  }
}

async function createTask(Task, files, options, preferred) {
  const delegates = preferred === "GPU" ? ["GPU", "CPU"] : ["CPU"];
  let lastError;
  for (const delegate of delegates) {
    try {
      const task = await Task.createFromOptions(files, { ...options, baseOptions: { ...options.baseOptions, delegate } });
      return { task, delegate };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function points(list) {
  return list.map((point) => [point.x, point.y, point.z ?? 0]);
}

// Returns { spec, parts, delegates, forget(), processVideoFrame(video, timestampMs, options) -> { frame, raw, timings, fresh }, fps, close() }.
export async function createCaptureV2({ spec, wasmPath = assetUrl("wasm"), modelBase = assetUrl("models/"), parts = PARTS, delegate = "GPU" } = {}) {
  const featureSpec = spec ?? (await loadFeatureSpecV2());
  if (featureSpec.feature_version !== FEATURE_VERSION) throw new Error(`Unsupported feature version ${featureSpec.feature_version}`);
  const models = featureSpec.capture_models;
  const files = await FilesetResolver.forVisionTasks(wasmPath);
  const runningMode = "VIDEO";
  const tasks = {};
  const delegates = {};
  try {
    if (parts.includes("hands")) {
      const made = await createTask(HandLandmarker, files, {
        baseOptions: { modelAssetPath: `${modelBase}${models.hand.file}` }, runningMode, numHands: models.hand.num,
        minHandDetectionConfidence: 0.55, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      }, delegate);
      tasks.hands = made.task;
      delegates.hands = made.delegate;
    }
    if (parts.includes("pose")) {
      const made = await createTask(PoseLandmarker, files, {
        baseOptions: { modelAssetPath: `${modelBase}${models.pose.file}` }, runningMode, numPoses: 1,
        minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5, outputSegmentationMasks: false,
      }, delegate);
      tasks.pose = made.task;
      delegates.pose = made.delegate;
    }
    if (parts.includes("face")) {
      const made = await createTask(FaceLandmarker, files, {
        baseOptions: { modelAssetPath: `${modelBase}${models.face.file}` }, runningMode, numFaces: 1,
        minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
        outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false,
      }, delegate);
      tasks.face = made.task;
      delegates.face = made.delegate;
    }
  } catch (error) {
    for (const task of Object.values(tasks)) task.close();
    throw error;
  }

  const meter = new FpsMeter();
  let lastTimestamp = -1;

  // The last pose and face, kept so a frame may skip them (options.run) and reuse the previous result.
  // Restores the per-frame cadence of the 19 Nov baseline build (baseline/v1-site, capture_v2 chunk).
  const last = { pose: null, face: null, ran: { pose: false, face: false } };

  // options.run: null (run every part); per part, false = reuse the last result (runs if there is none yet),
  // "off" = neither run nor reuse (light mode); or a function (hands) -> that object, called after the hands.
  function processVideoFrame(video, timestampMs = performance.now(), { inputMirrored = false, run = null } = {}) {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return null;
    const timestamp = Math.max(Math.round(timestampMs), lastTimestamp + 1);
    lastTimestamp = timestamp;
    const timings = {};
    const raw = { timestamp_ms: timestamp, image_width: width, image_height: height, input_mirrored: inputMirrored, hands: [], pose: null, face: null };
    if (tasks.hands) {
      const started = performance.now();
      const result = tasks.hands.detectForVideo(video, timestamp);
      const labels = result.handedness ?? result.handednesses ?? [];
      (result.landmarks ?? []).forEach((landmarks, index) => {
        raw.hands.push({ landmarks: points(landmarks), handedness: labels[index]?.[0]?.categoryName ?? null });
      });
      timings.hands = performance.now() - started;
    }
    const plan = typeof run === "function" ? run(raw.hands) : run;
    const fresh = { pose: false, face: false };
    if (tasks.pose) {
      if (plan?.pose === "off") { /* light mode: no pose this frame and none reused */ }
      else if (plan?.pose === false && last.ran.pose) raw.pose = last.pose;
      else {
        const started = performance.now();
        const result = tasks.pose.detectForVideo(video, timestamp);
        const first = result.landmarks?.[0];
        if (first) raw.pose = first.map((point) => [point.x, point.y, point.z ?? 0, point.visibility ?? 1]);
        last.pose = raw.pose;
        last.ran.pose = true;
        fresh.pose = true;
        timings.pose = performance.now() - started;
      }
    }
    if (tasks.face) {
      if (plan?.face === "off") { /* not run and not reused */ }
      else if (plan?.face === false && last.ran.face) raw.face = last.face;
      else {
        const started = performance.now();
        const result = tasks.face.detectForVideo(video, timestamp);
        const first = result.faceLandmarks?.[0];
        if (first) raw.face = points(first);
        last.face = raw.face;
        last.ran.face = true;
        fresh.face = true;
        timings.face = performance.now() - started;
      }
    }
    const frame = canonicalizeFrame(raw, featureSpec);
    meter.tick();
    // raw keeps the full pose (33) and face mesh (478) in memory for ASL mode; nothing is stored.
    return { frame, raw, timings, fresh };
  }

  return {
    spec: featureSpec,
    parts: Object.keys(tasks),
    delegates,
    // Drop the remembered pose and face (call it when the camera restarts or the person leaves the frame).
    forget() { last.pose = null; last.face = null; last.ran.pose = false; last.ran.face = false; },
    processVideoFrame,
    get fps() { return meter.fps; },
    close() {
      for (const task of Object.values(tasks)) task.close();
    },
  };
}
