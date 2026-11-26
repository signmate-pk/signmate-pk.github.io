// Developer panel (off by default; Settings → Developer panel, or ?debug=1, or the D key on a keyboard).
// Shows what the engine measures live on this device: frame rate, per-frame tracking time, model time,
// end-of-sign-to-result time, speech start time, and which backends run.
import React, { useEffect, useState } from "react";
import { speechStats } from "./speech.js";

const ms = (value) => (value == null ? "—" : `${Math.round(value)} ms`);

export default function DevHud({ engine, onClose }) {
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((n) => n + 1), 500); return () => clearInterval(id); }, []);
  const s = engine?.stats;
  return <aside className="dev-hud" aria-label="Developer panel">
    <header><b>Developer panel</b><button className="btn btn-quiet btn-sm" onClick={onClose}>Hide</button></header>
    {!s ? <p>Turn on the camera to see live numbers.</p> : <dl>
      <dt title="Frames processed per second / camera frames per second">FPS</dt><dd>{s.fps.toFixed(1)} / {s.cameraFps.toFixed(1)}</dd>
      <dt title="MediaPipe time per processed frame">Track</dt><dd>{ms(s.captureMs)} <small>h {ms(s.handsMs)} · p {ms(s.poseMs)}</small></dd>
      <dt title="full: hands + pose every 2nd frame; light: hands only; light-skip: every other frame">Mode</dt><dd>{s.levelName}{s.skipped ? ` · ${s.skipped} skipped` : ""}</dd>
      <dt title="PSL model time for one sign">Model</dt><dd>{ms(s.modelMs)}</dd>
      <dt title="From the last frame with hands to the result on screen (includes the cutter's wait for lowered hands)">Sign→result</dt><dd>{ms(s.latencyMs)}</dd>
      <dt title="From pressing Speak to the voice starting">Speak→voice</dt><dd>{ms(speechStats.lastStartMs)}</dd>
      <dt title="Hand and pose tracker backend">Tracker</dt><dd>{[...new Set(Object.values(s.delegates || {}))].map((v) => (v === "GPU" ? "WebGL" : "WASM CPU")).join(" + ") || "—"}</dd>
      <dt title="PSL model runtime and thread">Runtime</dt><dd>{s.runtime ? `${String(s.runtime.runtime).replace("LiteRT.js ", "LiteRT ")} · ${s.runtime.thread}` : "loading"}</dd>
      <dt>Signs</dt><dd>{s.signs}{s.frameErrors ? ` · ${s.frameErrors} frame errors` : ""}</dd>
    </dl>}
  </aside>;
}
