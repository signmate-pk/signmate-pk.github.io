// Prepare web/public/ before the dev server or a build starts (npm run assets).
// - copies the shared specs and data the pages read (feature spec, ASL spec, results, site pages);
// - copies the guided tour's recordings (shared_data/asl_tour_recordings.json, CC0 rerun set) when they exist;
// - copies the committed hand model and the MediaPipe runtime;
// - downloads the pinned model files listed in shared_data/downloads.json once (pose, face, ASL),
//   refusing any file whose size or SHA-256 differs, and copies them into public/models/;
// - copies the LiteRT.js runtime (the ASL model in the browser) into public/litert/.
// Nothing here fails the start: a missing optional file only switches that feature off, with a warning.
import { access, cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "..");
const project = path.resolve(web, "..");
const publicDir = path.join(web, "public");

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function problemWith(file, item) {
  if (!(await exists(file))) return "missing";
  const bytes = await readFile(file);
  if (bytes.length !== item.bytes) return `${bytes.length} bytes, expected ${item.bytes}`;
  const hash = sha256(bytes);
  return hash === item.sha256 ? null : `SHA-256 ${hash}, expected ${item.sha256}`;
}

async function ensureDownload(item) {
  const target = path.join(project, item.path);
  const problem = await problemWith(target, item);
  if (!problem) return true;
  if (problem !== "missing") {
    await rename(target, `${target}.bad`);
    console.warn(`${item.path}: ${problem}; moved it to ${path.basename(target)}.bad`);
  }
  console.log(`Downloading ${item.path} (${(item.bytes / 1e6).toFixed(1)} MB) for ${item.needed_for}...`);
  try {
    const response = await fetch(item.url, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const hash = sha256(bytes);
    if (bytes.length !== item.bytes || hash !== item.sha256) throw new Error(`the download is not the pinned file (${bytes.length} bytes, SHA-256 ${hash})`);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(`${target}.download`, bytes);
    await rename(`${target}.download`, target);
    return true;
  } catch (error) {
    await rm(`${target}.download`, { force: true });
    console.warn(`Could not get ${item.path}: ${error.message}. ${item.needed_for} stays off until it is downloaded (connect to the internet once, or run python tools/fetch_assets.py).`);
    return false;
  }
}

await mkdir(path.join(publicDir, "models", "asl"), { recursive: true });
await mkdir(path.join(publicDir, "wasm"), { recursive: true });
for (const name of ["feature_spec_v2.json", "asl_islr_spec.json", "asl_results.json", "site_pages.json"]) await cp(path.join(project, "shared_data", name), path.join(publicDir, name));

// Guided tour and gallery references: real ASL recordings of Deaf signers from the GISLR rerun set (CC0, ledger
// asl-gislr-rerun-set allows redistribute_data), picked by notebooks/asl_mode_eval.ipynb (web/src/ui/recordings.js).
await rm(path.join(publicDir, "tour"), { recursive: true, force: true });
const tour = path.join(project, "shared_data", "asl_tour_recordings.json");
if (await exists(tour)) {
  await mkdir(path.join(publicDir, "tour"), { recursive: true });
  await cp(tour, path.join(publicDir, "tour", "asl_tour.json"));
} else {
  console.warn("No guided-tour recordings yet (shared_data/asl_tour_recordings.json): the tour says so.");
}

await cp(path.join(project, "models", "hand_landmarker.task"), path.join(publicDir, "models", "hand_landmarker.task"));
await cp(path.join(web, "node_modules", "@mediapipe", "tasks-vision", "wasm"), path.join(publicDir, "wasm"), { recursive: true });

const downloads = JSON.parse(await readFile(path.join(project, "shared_data", "downloads.json"), "utf8")).files;
for (const item of downloads) {
  if (await ensureDownload(item)) {
    const destination = path.join(publicDir, ...item.path.split("/")); // models/... -> public/models/...
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(project, item.path), destination);
  }
}

const litert = path.join(web, "node_modules", "@litertjs", "core", "wasm");
if (await exists(litert)) {
  await cp(litert, path.join(publicDir, "litert"), { recursive: true });
} else {
  console.warn("LiteRT.js is not installed (run npm install in the web folder): the ASL model cannot run.");
}
console.log("Prepared the specs, results, tour recordings, MediaPipe models and runtime, the ASL model and LiteRT.js.");
