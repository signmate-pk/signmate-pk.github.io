// Plays a recorded sign as moving hand points (no video exists for these recordings, only landmarks).
// Mirrored like a selfie view, so it matches what the person sees of themselves on the camera stage.
import React, { useEffect, useRef } from "react";

const LINKS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];

export default function RecordedSign({ recording, playing = true, loop = true, fps = 15, onDone, className = "" }) {
  const canvasRef = useRef(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !recording) return undefined;
    const context = canvas.getContext("2d");
    let raf = 0;
    let start = performance.now();
    let finished = false;
    const styles = getComputedStyle(canvas);
    const colours = [styles.getPropertyValue("--hand-left").trim() || "#f5b8ff", styles.getPropertyValue("--hand-right").trim() || "#9db4ff"];
    const draw = (now) => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      context.clearRect(0, 0, w, h);
      // Fit the 4:3 recording camera into the canvas.
      const scale = Math.min(w / 4, h / 3);
      const ox = (w - 4 * scale) / 2;
      const oy = (h - 3 * scale) / 2;
      const total = recording.frames.length;
      let index = Math.floor(((now - start) / 1000) * fps);
      if (index >= total) {
        if (loop) { start = now; index = 0; } else { index = total - 1; if (!finished) { finished = true; doneRef.current?.(); } }
      }
      const frame = recording.frames[Math.max(0, index)];
      [frame.left, frame.right].forEach((points, side) => {
        if (!points) return;
        const px = (p) => ox + (1 - p[0]) * 4 * scale;
        const py = (p) => oy + p[1] * 3 * scale;
        context.strokeStyle = colours[side];
        context.lineWidth = 2.6 * dpr;
        context.lineCap = "round";
        context.beginPath();
        for (const [a, b] of LINKS) { context.moveTo(px(points[a]), py(points[a])); context.lineTo(px(points[b]), py(points[b])); }
        context.stroke();
        context.fillStyle = "#fff";
        for (const p of points) { context.beginPath(); context.arc(px(p), py(p), 2.4 * dpr, 0, Math.PI * 2); context.fill(); }
      });
      if (playing && !(finished && !loop)) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [recording, playing, loop, fps]);
  return <canvas ref={canvasRef} className={`recorded-sign ${className}`} aria-label={recording ? `Recorded hand movement for ${recording.gloss}` : undefined} role="img" />;
}
