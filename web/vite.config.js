import { defineConfig, loadEnv } from "vite";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { landingContent } from "./scripts/landing-content.mjs";

const webDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(webDir, "..");

// Writes dist/precache.json for public/sw.js: every built file with its size; "shell" marks what the page
// needs before the camera starts (cached on the first visit). The rest is cached when used, or all at once
// when the visitor presses "Save for offline use".
function precacheList() {
  let outDir = "dist";
  return {
    name: "signbridge-precache-list",
    apply: "build",
    configResolved(config) { outDir = path.resolve(config.root, config.build.outDir); },
    closeBundle() {
      const files = [];
      const walk = (folder) => {
        for (const name of readdirSync(folder)) {
          const full = path.join(folder, name);
          if (statSync(full).isDirectory()) walk(full);
          else files.push(path.relative(outDir, full).split(path.sep).join("/"));
        }
      };
      walk(outDir);
      const hash = createHash("sha256");
      const list = files.filter((file) => !["precache.json", "sw.js"].includes(file) && !file.startsWith("ci/")).sort().map((file) => {
        const bytes = statSync(path.join(outDir, file)).size;
        hash.update(file).update(readFileSync(path.join(outDir, file)));
        // index.html is the project page, app.html the app (2026-11-27); the page's own screenshots, clip and
        // captions are small and come too, so the project page also reads properly offline.
        const shell = ["index.html", "app.html", "icon.svg", "favicon-32.png", "models/psl/manifest.json"].includes(file) || (file.startsWith("assets/") && /\.(js|css)$/.test(file)) || /^[^/]+\.json$/.test(file) || /^media\/[^/]+\.(webp|vtt|mp4)$/.test(file);
        return { path: file, bytes, shell };
      });
      writeFileSync(path.join(outDir, "precache.json"), JSON.stringify({ build: hash.digest("hex").slice(0, 16), total_bytes: list.reduce((a, f) => a + f.bytes, 0), files: list }));
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectDir, "");
  const apiPort = Number(env.SIGNBRIDGE_API_PORT || 8000);
  const webPort = Number(env.SIGNBRIDGE_WEB_PORT || 5173);
  const cert = env.SIGNBRIDGE_TLS_CERT;
  const key = env.SIGNBRIDGE_TLS_KEY;
  const https = cert && key ? { cert: readFileSync(path.resolve(projectDir, cert)), key: readFileSync(path.resolve(projectDir, key)) } : undefined;
  const proxy = { "/api": { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true } };
  return {
    // "./": relative asset URLs, so one build works at a site root and under a sub-path
    // such as https://<user>.github.io/SignBridge/ (see src/paths.js).
    base: "./",
    // landingContent: writes the sign library, results and confusion matrix into index.html at build time
    // (scripts/landing-content.mjs), so the project page is complete without JavaScript.
    plugins: [landingContent({ project: projectDir, publicDir: path.join(webDir, "public") }), precacheList()],
    envDir: projectDir,
    server: { host: "0.0.0.0", port: webPort, strictPort: true, https, proxy },
    preview: { host: "0.0.0.0", port: 4173, https, proxy },
    // index.html is the project page (static content, a small script); app.html is the app itself.
    // bench.html is the capture v2 frame-rate benchmark (Phase 1); asl-selftest.html checks ASL mode (Stage 2).
    build: { rollupOptions: { input: { main: path.resolve(webDir, "index.html"), app: path.resolve(webDir, "app.html"), bench: path.resolve(webDir, "bench.html"), aslSelftest: path.resolve(webDir, "asl-selftest.html") } } },
  };
});
