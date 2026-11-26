// Draws the tracked hands over the mirrored camera preview. Unlike vision.js drawLandmarks (kept for the
// ASL screen), it never reads layout during the camera loop: the canvas size comes from a ResizeObserver.
// Points are [x, y, z] rows in unmirrored image coordinates (capture v2); the drawing is mirrored to match
// the preview and follows the video's object-fit: cover crop.

const LINKS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
const TIPS = new Set([4, 8, 12, 16, 20]);

export function createOverlay(canvas, video) {
  let width = 1;
  let height = 1;
  let dpr = 1;
  const context = canvas.getContext("2d");
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    width = Math.max(1, Math.round(rect.width * dpr));
    height = Math.max(1, Math.round(rect.height * dpr));
    canvas.width = width;
    canvas.height = height;
  };
  resize();
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  observer?.observe(canvas);

  function clear() {
    context.clearRect(0, 0, width, height);
  }

  // hands: [{ points, colour }]; state: "idle" | "signing"
  function draw(hands, state = "idle") {
    context.clearRect(0, 0, width, height);
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh || !hands.length) return;
    const scale = Math.max(width / vw, height / vh);
    const offsetX = (width - vw * scale) / 2;
    const offsetY = (height - vh * scale) / 2;
    // Mirrored: x on screen = width - (offset + x * vw * scale)
    const px = (p) => width - (offsetX + p[0] * vw * scale);
    const py = (p) => offsetY + p[1] * vh * scale;
    const line = Math.max(2, 2.2 * dpr);
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const { points, colour } of hands) {
      if (!points?.length) continue;
      context.strokeStyle = colour;
      context.globalAlpha = state === "signing" ? 0.95 : 0.75;
      context.lineWidth = line;
      context.beginPath();
      for (const [a, b] of LINKS) {
        context.moveTo(px(points[a]), py(points[a]));
        context.lineTo(px(points[b]), py(points[b]));
      }
      context.stroke();
      context.globalAlpha = 1;
      context.fillStyle = "#ffffff";
      for (let i = 0; i < points.length; i += 1) {
        const r = (TIPS.has(i) ? 3.4 : 2.2) * dpr;
        context.beginPath();
        context.arc(px(points[i]), py(points[i]), r, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  return { draw, clear, resize, close: () => observer?.disconnect() };
}
