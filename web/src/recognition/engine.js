// The live PSL recogniser: camera -> MediaPipe landmarks -> sign cutter -> PSL model -> decision.
// Framework-free; the React screens talk to it through createEngine() and its events.
//
// Speed rules (audit 2026-11-26, measured in reports/perf_audit_2026-11-26.md):
//  - One pass per *camera* frame (requestVideoFrameCallback). The old loop ran on requestAnimationFrame,
//    so a 60 or 120 Hz screen processed the same 30 fps camera frame two to four times.
//  - The PSL model reads the two hands only (models/psl/manifest.json input.parts_read), so the face
//    tracker does not run here (it cost 28 ms of 129 ms per frame in the audit run). Pose runs every
//    second frame; it is used only to tell the left hand from the right (features v2, F12 rules).
//  - Light mode, automatic: when the median frame takes over 40 ms, pose stops (hands only, handedness
//    labels decide left/right). If frames still take over 40 ms, every other camera frame is skipped and
//    the sign cutter's frame counts are halved so its timing in seconds stays the same.
//  - MediaPipe and the model are created once per page and kept (warmUp), so the camera restarts fast.
// Privacy: only landmark numbers are used, in memory. No frame or image is stored or sent.
import { SignSegmenter } from "../asl_islr.js";
import { createPslRecognizer } from "../psl_client.js";
import { cameraAdvice, createCameraCheck, videoBrightness } from "../camera_check.js";
import { createOverlay } from "./overlay.js";
import { decide, DEFAULT_POLICY } from "./decision.js";

export const HAND_COLOURS = { left: "#f5b8ff", right: "#9db4ff" };
const NAN_ROW = Object.freeze([NaN, NaN, NaN]);
const ROWS = 543;
const LEFT = 468;
const RIGHT = 522;
export const LEVELS = ["full", "light", "light-skip"];
const SLOW_MS = 40;
const FAST_MS = 22;
const WINDOW = 30;

// The model's 543-row frame from capture v2's canonical hands. Face and pose rows stay NaN: the PSL model
// does not read them. The hand rows are exactly what asl_islr.islrFrame puts there (tested).
export function pslFrame(left, right) {
  const frame = new Array(ROWS).fill(NAN_ROW);
  if (left) for (let i = 0; i < 21; i += 1) frame[LEFT + i] = [Number(left[i][0]), Number(left[i][1]), Number(left[i][2])];
  if (right) for (let i = 0; i < 21; i += 1) frame[RIGHT + i] = [Number(right[i][0]), Number(right[i][1]), Number(right[i][2])];
  return frame;
}

// The sign cutter's rules with frame counts divided by `factor` (used when every other frame is skipped).
export function scaledSegmentation(aslSpec, factor) {
  if (factor === 1) return aslSpec;
  const rules = aslSpec.segmentation;
  return {
    ...aslSpec,
    segmentation: {
      ...rules,
      min_hand_frames: Math.max(2, Math.ceil(rules.min_hand_frames / factor)),
      end_after_missing_frames: Math.max(2, Math.ceil(rules.end_after_missing_frames / factor)),
      margin_frames: Math.ceil(rules.margin_frames / factor),
      max_frames: Math.ceil(rules.max_frames / factor),
    },
  };
}

// Next level from the recent per-frame costs: up when slow, down only after a long fast stretch.
export function nextLevel(level, medianMs, fastWindows) {
  if (medianMs > SLOW_MS && level < LEVELS.length - 1) return { level: level + 1, fastWindows: 0 };
  if (medianMs < FAST_MS && level > 0) {
    if (fastWindows + 1 >= 3) return { level: level - 1, fastWindows: 0 };
    return { level, fastWindows: fastWindows + 1 };
  }
  return { level, fastWindows: 0 };
}

const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

// ------------------------------------------------------------------ shared, created once per page

const shared = { featureSpec: null, capture: null, recognizer: null };

function makeCapture(delegate) {
  return (async () => {
    const { createCaptureV2, loadFeatureSpecV2 } = await import("../capture_v2.js");
    shared.featureSpec ??= await loadFeatureSpecV2();
    return createCaptureV2({ spec: shared.featureSpec, parts: ["hands", "pose"], delegate });
  })();
}

// Some devices report a GPU that is slower than their CPU (software or weak GPU drivers; the audit VM ran
// the hand tracker at 613 ms per frame on its emulated GPU and 65 ms on CPU). The engine calls this once
// when GPU tracking is that slow; the next frames run on CPU.
export function switchCaptureToCpu() {
  const old = shared.capture;
  shared.capture = makeCapture("CPU").catch((error) => { shared.capture = old; throw error; });
  // The GPU tasks are left open on purpose: closing them while the CPU tasks share MediaPipe's WASM
  // runtime aborted it in the audit run ("Aborted()"), the same hazard noted in vision.js. Happens once.
  return shared.capture;
}

export function warmUp({ manifest, spec }) {
  shared.capture ??= makeCapture("GPU").catch((error) => { shared.capture = null; throw error; });
  if (manifest && spec) {
    shared.recognizer ??= createPslRecognizer({ manifest, spec })
      .catch(() => createPslRecognizer({ manifest, spec, useWorker: false }))
      .catch((error) => { shared.recognizer = null; throw error; });
  }
  return { capture: shared.capture, recognizer: shared.recognizer };
}

export function sharedRecognizer() {
  return shared.recognizer;
}

// ------------------------------------------------------------------ the engine

// emitHandsEvery: also send the raw hand points every N processed frames ({ type: "hand-points" }), for the
// optional "Teach a sign" tools on the local server. 0 (default) sends none.
export function createEngine({ manifest, spec, aslSpec, policy = DEFAULT_POLICY, onEvent = () => {}, emitHandsEvery = 0 }) {
  let video = null;
  let overlay = null;
  let stream = null;
  let running = false;
  let handle = 0;
  let rafHandle = 0;
  let lastMediaTime = -1;
  let generation = 0;
  let adjust = (scores) => scores;

  const stats = {
    level: 0, levelName: LEVELS[0], fps: 0, cameraFps: 0, captureMs: 0, handsMs: 0, poseMs: 0,
    modelMs: null, latencyMs: null, delegates: {}, runtime: null, frames: 0, skipped: 0, signs: 0, frameErrors: 0,
  };
  const emit = (event) => { try { onEvent(event); } catch { /* a screen's handler must not stop the camera */ } };

  function cancelFrame() {
    if (handle && video?.cancelVideoFrameCallback) video.cancelVideoFrameCallback(handle);
    if (rafHandle) cancelAnimationFrame(rafHandle);
    handle = 0;
    rafHandle = 0;
  }

  async function start({ videoElement, canvasElement, facing = "user" }) {
    stop();
    const myGeneration = ++generation;
    video = videoElement;
    if (!globalThis.isSecureContext && !["localhost", "127.0.0.1", "::1"].includes(location.hostname)) {
      emit({ type: "error", code: "insecure", message: "Camera access needs a secure (https) address." });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      emit({ type: "error", code: "unsupported", message: "This browser does not offer camera access." });
      return;
    }
    emit({ type: "status", phase: "starting" });
    // Ask for the camera and load the trackers at the same time: the picture appears as soon as the
    // camera answers, tracking joins when MediaPipe is ready (cached after the first start).
    const warm = warmUp({ manifest, spec });
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 30, max: 30 } }, audio: false });
    } catch (error) {
      if (myGeneration !== generation) return;
      emit({ type: "error", code: error?.name === "NotAllowedError" ? "permission" : "camera", message: String(error?.message || error) });
      return;
    }
    if (myGeneration !== generation) { stream.getTracks().forEach((track) => track.stop()); return; }
    video.srcObject = stream;
    try { await video.play(); } catch { /* autoplay rules: muted + playsInline make this rare */ }
    emit({ type: "status", phase: "camera" });

    let capture;
    try {
      capture = await warm.capture;
    } catch (error) {
      if (myGeneration === generation) emit({ type: "error", code: "capture", message: `Hand tracking could not start: ${error?.message || error}` });
      return;
    }
    if (myGeneration !== generation) return;
    capture.forget?.();
    stats.delegates = capture.delegates;
    overlay?.close();
    overlay = createOverlay(canvasElement, video);
    let recognizer = null;
    if (warm.recognizer) {
      warm.recognizer.then((value) => {
        if (myGeneration !== generation) return;
        recognizer = value;
        stats.runtime = value.info;
        emit({ type: "status", phase: "ready" });
      }).catch((error) => { if (myGeneration === generation) emit({ type: "error", code: "model", message: `The PSL model could not start: ${error?.message || error}` }); });
      emit({ type: "status", phase: "loading-model" });
    }
    running = true;
    loop(capture, () => recognizer, myGeneration);
  }

  function loop(initialCapture, getRecognizer, myGeneration) {
    let capture = initialCapture;
    let handCosts = [];
    let triedCpu = !Object.values(capture.delegates || {}).includes("GPU");
    let failures = 0;
    const factorFor = (level) => (level >= 2 ? 2 : 1);
    let segmenter = new SignSegmenter(scaledSegmentation(aslSpec, 1));
    let segmenterFactor = 1;
    let frameIndex = 0;
    let lastSeen = "";
    let signing = false;
    let lastHandAt = 0;
    let restingNoticeShown = false;
    let costs = [];
    let fastWindows = 0;
    let busy = false;
    let queued = null;
    const check = createCameraCheck();
    const sample = document.createElement("canvas");
    const cameraTimes = [];
    const processedTimes = [];
    const rate = (times) => (times.length > 1 ? (1000 * (times.length - 1)) / (times.at(-1) - times[0]) : 0);
    const push = (list, now) => { list.push(now); if (list.length > 31) list.shift(); };

    const classify = (sign, quality, endedAt) => {
      const recognizer = getRecognizer();
      if (!recognizer) return;
      if (busy) { queued = [sign, quality, endedAt]; return; }
      busy = true;
      const aspect = (video.videoWidth || 4) / (video.videoHeight || 3);
      recognizer.predict(sign, aspect, (scores) => adjust(scores))
        .then((result) => {
          if (myGeneration !== generation) return;
          const decision = decide(result, quality, policy);
          stats.modelMs = result.ms;
          stats.latencyMs = performance.now() - endedAt;
          stats.signs += 1;
          emit({ type: "result", result, decision, quality, latencyMs: stats.latencyMs, at: performance.now() });
        })
        .catch((error) => emit({ type: "error", code: "model", message: `The PSL model stopped: ${error?.message || error}` }))
        .finally(() => {
          busy = false;
          if (queued && myGeneration === generation) { const next = queued; queued = null; classify(...next); }
        });
    };

    const onFrame = (now) => {
      if (!running || myGeneration !== generation) return;
      push(cameraTimes, now);
      frameIndex += 1;
      const level = stats.level;
      if (level >= 2 && frameIndex % 2 === 1) { stats.skipped += 1; schedule(); return; }
      // The cutter's timing follows the frame rate; change it only between signs.
      if (!segmenter.active && segmenterFactor !== factorFor(level)) {
        segmenterFactor = factorFor(level);
        segmenter = new SignSegmenter(scaledSegmentation(aslSpec, segmenterFactor));
      }
      const started = performance.now();
      let out;
      try {
        out = capture.processVideoFrame(video, now, { inputMirrored: false, run: { face: "off", pose: level >= 1 ? "off" : frameIndex % 2 === 0 ? true : false } });
        failures = 0;
      } catch (error) {
        // One bad frame is not a broken camera: only a run of failures stops the stage.
        failures += 1;
        stats.frameErrors += 1;
        if (failures === 15) emit({ type: "error", code: "capture", message: `Hand tracking paused: ${error?.message || error}` });
        if (failures < 15) schedule();
        return;
      }
      if (!out) { schedule(); return; }
      const cost = performance.now() - started;
      stats.frames += 1;
      stats.captureMs = cost;
      if (out.timings.hands != null) {
        stats.handsMs = out.timings.hands;
        if (!triedCpu) {
          handCosts.push(out.timings.hands);
          // Skip the first frames (shader compilation), then judge the GPU on 15 frames.
          if (handCosts.length >= 25 && median(handCosts.slice(10)) > 120) {
            triedCpu = true;
            emit({ type: "level", level: stats.level, name: "switching to CPU" });
            switchCaptureToCpu().then((next) => {
              if (myGeneration !== generation) return;
              capture = next;
              stats.delegates = next.delegates;
              // The slowness was the GPU's: start the CPU tracker in full mode and judge it afresh.
              stats.level = 0; stats.levelName = LEVELS[0]; costs = []; fastWindows = 0;
              emit({ type: "level", level: 0, name: LEVELS[0] });
            }).catch(() => {});
          } else if (handCosts.length >= 25) triedCpu = true;
        }
      }
      if (out.timings.pose != null) stats.poseMs = out.timings.pose;
      push(processedTimes, now);
      stats.fps = rate(processedTimes);
      stats.cameraFps = rate(cameraTimes);

      const { left_hand: left, right_hand: right } = out.frame;
      overlay.draw([left && { points: left, colour: HAND_COLOURS.left }, right && { points: right, colour: HAND_COLOURS.right }].filter(Boolean), signing ? "signing" : "idle");
      const present = Boolean(left || right);
      const seen = left && right ? "both" : present ? "one" : "none";
      if (seen !== lastSeen) { lastSeen = seen; emit({ type: "hands", seen }); }
      if (present) lastHandAt = now;
      if (emitHandsEvery && present && frameIndex % emitHandsEvery === 0) emit({ type: "hand-points", hands: out.raw.hands });
      else restingNoticeShown = false;

      if (!check.done) {
        // Without the face tracker, "face in view" is read from the pose (nose and shoulders).
        // In light mode there is no pose to judge framing by, so framing is not counted against the person.
        check.add({ ...out.frame, face: out.frame.face ?? (out.raw.pose || stats.level >= 1 ? true : null) }, frameIndex % 15 === 1 ? videoBrightness(video, sample) : null);
        if (check.done) emit({ type: "advice", advice: cameraAdvice(check.stats) });
      }

      const sign = segmenter.push(pslFrame(left, right), present);
      if (segmenter.active !== signing) { signing = segmenter.active; emit({ type: "signing", active: signing }); }
      if (sign) {
        const hitMaxFrames = sign.length >= segmenter.maxFrames;
        if (hitMaxFrames) {
          if (!restingNoticeShown) {
            restingNoticeShown = true;
            emit({ type: "result", result: { top: [] }, decision: decide({ top: [] }, { hitMaxFrames: true }, policy), quality: { hitMaxFrames }, latencyMs: null, at: performance.now() });
          }
        } else {
          classify(sign, { hitMaxFrames, frames: sign.length }, lastHandAt);
        }
      }

      costs.push(cost);
      if (costs.length >= WINDOW) {
        const next = nextLevel(stats.level, median(costs), fastWindows);
        fastWindows = next.fastWindows;
        if (next.level !== stats.level) {
          stats.level = next.level;
          stats.levelName = LEVELS[next.level];
          if (next.level >= 1) capture.forget?.();
          emit({ type: "level", level: next.level, name: LEVELS[next.level] });
        }
        costs = [];
      }
      schedule();
    };

    const schedule = () => {
      if (!running || myGeneration !== generation) return;
      if (video.requestVideoFrameCallback) handle = video.requestVideoFrameCallback((now) => onFrame(now));
      else {
        rafHandle = requestAnimationFrame((now) => {
          // Fallback: only work when the video shows a new frame.
          if (video.currentTime !== lastMediaTime) { lastMediaTime = video.currentTime; onFrame(now); } else schedule();
        });
      }
    };
    schedule();
  }

  function stop() {
    generation += 1;
    running = false;
    cancelFrame();
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    if (video) video.srcObject = null;
    overlay?.clear();
  }

  return {
    start,
    stop,
    stats,
    setAdjust(fn) { adjust = typeof fn === "function" ? fn : (scores) => scores; },
    get running() { return running; },
  };
}
