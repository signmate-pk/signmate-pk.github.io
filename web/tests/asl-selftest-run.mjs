// Runs ASL mode for real in headless Chromium:
//  1. web/asl-selftest.html: loads the ASL model with LiteRT.js, runs made-up sequences, and (when the
//     SignBridge server is reachable through /api) compares the browser with the server on identical input;
//  2. the app itself: switches to ASL, starts the camera (Chromium's fake camera) and checks that ASL
//     mode tracks without an error.
//
// Run from the web folder after npm run build:
//   node tests/asl-selftest-run.mjs                      browser only
//   SELFTEST_API=http://127.0.0.1:8000 node tests/...    also the server (start it first)
//   SELFTEST_OUT=result.json                             also write the summary to a file
//   SELFTEST_REQUIRE_WORKER=1                            fail unless the model ran in the background worker
// Needs Playwright with Chromium: npm install --no-save playwright && npx playwright install chromium
import { createRequire } from "node:module";
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { preview } from "vite";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.log("SKIPPED ASL self-test: Playwright is not installed (npm install --no-save playwright && npx playwright install chromium).");
  process.exit(0);
}
if (!existsSync(path.join(webDir, "dist", "asl-selftest.html"))) {
  console.error("dist/ is missing. Run npm run build first.");
  process.exit(1);
}

const api = process.env.SELFTEST_API;
const requireWorker = process.env.SELFTEST_REQUIRE_WORKER === "1"; // GitHub Actions: Chromium must run the model off the page thread
const proxy = api ? { "/api": { target: api, changeOrigin: true } } : {};
const server = await preview({ root: webDir, logLevel: "silent", preview: { host: "127.0.0.1", port: 4175, strictPort: false, proxy } });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
const result = { measuredAt: new Date().toISOString(), base, serverExpected: Boolean(api) };
let failed = false;

try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}asl-selftest.html`);
  await page.waitForFunction(() => window.__aslSelfTest, null, { timeout: 240_000 });
  result.selftest = await page.evaluate(() => window.__aslSelfTest);
  result.selftestPageErrors = errors;
  const verdict = result.selftest.verdict || {};
  if (!verdict.browserRuns) failed = true;
  if (api && (!verdict.serverRuns || verdict.runtimesAgree === false)) failed = true;
  if (requireWorker && !verdict.workerRuns) failed = true;
  console.log(`self-test: browser runs ${verdict.browserRuns} (worker ${verdict.workerRuns}), server runs ${verdict.serverRuns}, runtimes agree ${verdict.runtimesAgree}`);
  await page.close();
} catch (error) {
  result.selftestError = String(error.message || error).split("\n")[0];
  failed = true;
  console.log(`self-test FAILED: ${result.selftestError}`);
}

try {
  const context = await browser.newContext({ permissions: ["camera"] });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // ASL mode lives under More → ASL mode (app.html#/asl) in the product UI. On a first visit the camera button
  // opens the welcome card with the privacy notice; its "Turn on camera" starts the ASL camera.
  await page.goto(`${base}app.html#/asl`);
  const welcome = page.locator(".onboarding");
  await welcome.waitFor({ timeout: 15_000 }).catch(() => null);
  if (await welcome.count()) await welcome.getByRole("button", { name: /Turn on camera/ }).click();
  await page.getByRole("button", { name: /Start ASL camera/ }).click();
  await page.waitForSelector(".hands-chip", { timeout: 180_000 });
  await page.waitForTimeout(4000);
  result.app = {
    banner: (await page.locator(".asl-banner").innerText()).replace(/\s+/g, " ").slice(0, 120),
    camera: (await page.locator(".asl-mode .camera-indicator").innerText()).trim(),
    hands: (await page.locator(".hands-chip").innerText()).trim(),
    credit: (await page.locator(".asl-credit").innerText()).replace(/\s+/g, " ").slice(0, 160),
    errors,
  };
  if (result.app.camera !== "Camera on" || errors.length) failed = true;
  console.log(`ASL mode in the app: ${result.app.camera}; ${result.app.hands}; ${errors.length} page errors`);
  await context.close();
} catch (error) {
  result.appError = String(error.message || error).split("\n")[0];
  failed = true;
  console.log(`ASL mode in the app FAILED: ${result.appError}`);
}

// 3. The PSL Words screen (the default): the camera starts from the welcome card, both hands are tracked,
//    the PSL bundle loads (the sign gallery counts its signs), and the Phase 0 gesture demo is gone (its hand
//    shapes are not PSL; removed from the product UI on 2026-11-26).
try {
  const context = await browser.newContext({ permissions: ["camera"] });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}app.html#/words`);
  const welcome = page.locator(".onboarding");
  await welcome.waitFor({ timeout: 15_000 });
  await welcome.getByRole("button", { name: /Turn on camera/ }).click();
  await page.waitForSelector(".stage.is-live", { timeout: 180_000 });
  await page.waitForTimeout(4000);
  result.psl = {
    status: (await page.locator("#gallery-title").innerText()).trim(),
    gestureDemoGone: (await page.getByText("Gesture demo").count()) === 0,
    live: (await page.locator(".stage.is-live").count()) === 1,
    hands: (await page.locator(".stage .pill[class*=hands-]").innerText().catch(() => "")).trim(),
    cameraProblem: (await page.locator(".stage-error").count()) ? (await page.locator(".stage-error").innerText()).replace(/\s+/g, " ").slice(0, 160) : null,
    errors,
  };
  if (!result.psl.live || !result.psl.gestureDemoGone || result.psl.cameraProblem || errors.length) failed = true;
  console.log(`PSL screen: ${result.psl.status}; live ${result.psl.live}; ${result.psl.hands}; ${errors.length} page errors`);
  await context.close();
} catch (error) {
  result.pslError = String(error.message || error).split("\n")[0];
  failed = true;
  console.log(`PSL screen FAILED: ${result.pslError}`);
}

await browser.close();
server.httpServer.close();
result.passed = !failed;
console.log(JSON.stringify(result, null, 2));
if (process.env.SELFTEST_OUT) writeFileSync(process.env.SELFTEST_OUT, JSON.stringify(result, null, 2));
process.exit(failed ? 1 : 0);
