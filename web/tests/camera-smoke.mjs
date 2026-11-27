// Browser smoke test with a fake camera: start the camera, then switch screens, flip the camera,
// and stop/start again. Each must leave hand tracking running without crashing the page.
// Updated for the product UI (2026-11-26): "Turn on camera", first-visit privacy card, Words/Sentences tabs.
//
// Run from the web folder:  npm run test:smoke   (builds first, then serves dist/ locally)
// Needs Playwright with Chromium. One-time setup, kept out of package.json so the exhibition
// install stays small:  npm install --no-save playwright && npx playwright install chromium
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.log("SKIPPED camera smoke test: Playwright is not installed.");
  console.log("Install once with: npm install --no-save playwright && npx playwright install chromium");
  process.exit(0);
}
// SMOKE_URL tests a server that is already running instead, e.g. the dev server that
// start_web.bat starts:  set SMOKE_URL=http://127.0.0.1:5173/ && node tests/camera-smoke.mjs  (app.html is added)
const externalUrl = process.env.SMOKE_URL;
if (!externalUrl && !existsSync(path.join(webDir, "dist", "index.html"))) {
  console.error("dist/ is missing. Run npm run build first (npm run test:smoke does this for you).");
  process.exit(1);
}

const WAIT_MS = Number(process.env.SMOKE_WAIT_MS || 6000);
const server = externalUrl ? null : await (await import("vite")).preview({ root: webDir, logLevel: "silent", preview: { host: "127.0.0.1", port: 4174, strictPort: false, proxy: {} } });
// The app lives at app.html (the site root is the project page, 2026-11-27).
const url = new URL("app.html", externalUrl || server.resolvedUrls.local[0]).href;
console.log(`Camera smoke test against ${url}`);

async function scenario(name, action, expectedCameraStarts) {
  const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  const context = await browser.newContext({ permissions: ["camera"] });
  await context.addInitScript(() => {
    window.__cameraStarts = 0;
    const original = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    if (original) navigator.mediaDevices.getUserMedia = (...args) => { window.__cameraStarts += 1; return original(...args); };
  });
  const page = await context.newPage();
  const errors = [];
  let crashed = false;
  page.on("crash", () => { crashed = true; });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (/Aborted\(\)|recognition paused|tracking paused/i.test(message.text())) errors.push(message.text()); });
  const problems = [];
  try {
    await page.goto(url);
    // First visit: the welcome card (with the privacy notice) is open; its "Turn on camera" starts the camera.
    await page.waitForSelector(".onboarding", { timeout: 10000 }).catch(() => null);
    if (!(await page.locator(".onboarding").count())) await page.getByRole("button", { name: /Turn on camera/ }).first().click();
    await page.locator(".onboarding").getByRole("button", { name: /Turn on camera/ }).click();
    await page.waitForTimeout(WAIT_MS);
    if (action) {
      await action(page);
      await page.waitForTimeout(WAIT_MS);
    }
    if (!crashed) {
      const errorPanel = await page.locator(".stage-error").count();
      if (errorPanel) problems.push(`camera stage shows: ${(await page.locator(".stage-error").innerText()).replace(/\s+/g, " ").slice(0, 140)}`);
      if (!(await page.locator(".stage.is-live").count())) problems.push("the camera stage is not live");
      const starts = await page.evaluate(() => window.__cameraStarts);
      if (expectedCameraStarts !== undefined && starts !== expectedCameraStarts) problems.push(`camera was started ${starts} times, expected ${expectedCameraStarts}`);
    }
  } catch (error) {
    if (!crashed) problems.push(`script error: ${error.message.split("\n")[0]}`);
  }
  if (crashed) problems.push("page crashed");
  if (errors.length) problems.push(`errors: ${[...new Set(errors)].slice(0, 3).join(" | ")}`);
  await browser.close().catch(() => {});
  console.log(`${problems.length ? "FAIL" : "PASS"}  ${name}${problems.length ? ` -> ${problems.join("; ")}` : ""}`);
  return problems.length === 0;
}

const results = [];
try {
  results.push(await scenario("camera starts and keeps running", null, 1));
  results.push(await scenario("moving from Words to Sentences keeps the camera on", (page) => page.getByRole("link", { name: /Sentences/ }).click(), 2));
  results.push(await scenario("switching front/rear camera keeps tracking alive", (page) => page.getByRole("button", { name: /Switch front or rear camera/ }).click(), 2));
  results.push(await scenario("stop then start the camera again", async (page) => {
    await page.getByRole("button", { name: /Stop camera/ }).click();
    await page.waitForTimeout(1000);
    await page.getByRole("button", { name: /Turn on camera/ }).first().click();
  }, 2));
} finally {
  await server?.close();
}
const failed = results.filter((ok) => !ok).length;
console.log(failed ? `${failed} of ${results.length} camera smoke scenarios failed` : `All ${results.length} camera smoke scenarios passed`);
process.exit(failed ? 1 : 0);
