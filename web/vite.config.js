import { defineConfig, loadEnv } from "vite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { landingContent } from "./scripts/landing-content.mjs";

const webDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(webDir, "..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectDir, "");
  const webPort = Number(env.SIGNBRIDGE_WEB_PORT || 5173);
  const cert = env.SIGNBRIDGE_TLS_CERT;
  const key = env.SIGNBRIDGE_TLS_KEY;
  // Optional local https, so a phone on the same Wi-Fi may use the camera during development.
  const https = cert && key ? { cert: readFileSync(path.resolve(projectDir, cert)), key: readFileSync(path.resolve(projectDir, key)) } : undefined;
  return {
    // "./": relative asset URLs, so one build works at a site root and under a sub-path
    // such as https://<user>.github.io/<repo>/ (see src/paths.js).
    base: "./",
    // landingContent: writes the sign library and results into index.html at build time
    // (scripts/landing-content.mjs), so the project page is complete without JavaScript.
    plugins: [landingContent({ project: projectDir, publicDir: path.join(webDir, "public") })],
    envDir: projectDir,
    server: { host: "0.0.0.0", port: webPort, strictPort: true, https },
    preview: { host: "0.0.0.0", port: 4173, https },
    // index.html is the project page (static content, a small script); translate/index.html is the translator.
    // SignMate is a website only (CLAUDE.md 10.7): no web app manifest, no service worker, no offline copy.
    // bench.html is the capture v2 frame-rate benchmark; asl-selftest.html checks the ASL model in this browser.
    build: { rollupOptions: { input: {
      main: path.resolve(webDir, "index.html"),
      translate: path.resolve(webDir, "translate", "index.html"),
      bench: path.resolve(webDir, "bench.html"),
      aslSelftest: path.resolve(webDir, "asl-selftest.html"),
    } } },
  };
});
