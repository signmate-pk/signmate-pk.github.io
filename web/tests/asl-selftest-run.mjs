// Runs SignMate's ASL recognition for real in headless Chromium:
//  1. web/asl-selftest.html: loads the ASL model with LiteRT.js and runs made-up sequences (does it run, in the
//     worker or on the page, how fast, is it deterministic);
//  2. the translator (translate/#/words): starts the camera from the welcome card (Chromium's fake camera), and
//     checks that tracking and the ASL model start without an error and the gallery lists the 250 signs;
//  3. the old address app.html forwards to translate/, keeping the part after #.
//
// Run from the web folder after npm run build:
//   node tests/asl-selftest-run.mjs                      the checks above
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

const requireWorker = process.env.SELFTEST_REQUIRE_WORKER === "1"; // GitHub Actions: Chromium must run the model off the page thread
const server = await preview({ root: webDir, logLevel: "silent", preview: { host: "127.0.0.1", port: 4175, strictPort: false } });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
const result = { measuredAt: new Date().toISOString(), base };
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
  if (requireWorker && !verdict.workerRuns) failed = true;
  console.log(`self-test: browser runs ${verdict.browserRuns} (worker ${verdict.workerRuns})`);
  await page.close();
} catch (error) {
  result.selftestError = String(error.message || error).split("\n")[0];
  failed = true;
  console.log(`self-test FAILED: ${result.selftestError}`);
}

// 2. The translator's Words screen (the default): the camera starts from the welcome card, hands, pose and face
//    are tracked, the ASL model loads, and the gallery lists the model's 250 signs.
try {
  const context = await browser.newContext({ permissions: ["camera"] });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}translate/#/words`);
  const welcome = page.locator(".onboarding");
  await welcome.waitFor({ timeout: 15_000 });
  await welcome.getByRole("button", { name: /Turn on camera/ }).click();
  await page.waitForSelector(".stage.is-live", { timeout: 180_000 });
  // The status line says "loading" until both the trackers and the ASL model are ready.
  await page.waitForFunction(() => !/Loading|Starting/i.test(document.querySelector(".stage-status")?.textContent || "Loading"), null, { timeout: 180_000 }).catch(() => null);
  await page.waitForTimeout(3000);
  result.translator = {
    gallery: (await page.locator("#gallery-title").innerText()).trim(),
    live: (await page.locator(".stage.is-live").count()) === 1,
    status: (await page.locator(".stage-status").innerText().catch(() => "")).trim(),
    hands: (await page.locator(".stage .pill[class*=hands-]").innerText().catch(() => "")).trim(),
    cameraProblem: (await page.locator(".stage-error").count()) ? (await page.locator(".stage-error").innerText()).replace(/\s+/g, " ").slice(0, 160) : null,
    errors,
  };
  const t = result.translator;
  if (!t.live || t.cameraProblem || errors.length || !/250 ASL signs/.test(t.gallery) || /Loading/i.test(t.status)) failed = true;
  console.log(`translator: ${t.gallery}; live ${t.live}; status "${t.status}"; ${t.hands}; ${errors.length} page errors`);
  await context.close();
} catch (error) {
  result.translatorError = String(error.message || error).split("\n")[0];
  failed = true;
  console.log(`translator FAILED: ${result.translatorError}`);
}

// 3. The old address forwards to the translator, keeping the route.
try {
  const page = await browser.newPage();
  await page.goto(`${base}app.html#/tour`);
  await page.waitForURL(/translate\/#\/tour$/, { timeout: 15_000 });
  result.oldAddress = { forwardedTo: page.url().replace(base, "") };
  console.log(`app.html forwards to ${result.oldAddress.forwardedTo}`);
  await page.close();
} catch (error) {
  result.oldAddressError = String(error.message || error).split("\n")[0];
  failed = true;
  console.log(`app.html forwarding FAILED: ${result.oldAddressError}`);
}

await browser.close();
server.httpServer.close();
result.passed = !failed;
console.log(JSON.stringify(result, null, 2));
if (process.env.SELFTEST_OUT) writeFileSync(process.env.SELFTEST_OUT, JSON.stringify(result, null, 2));
process.exit(failed ? 1 : 0);
