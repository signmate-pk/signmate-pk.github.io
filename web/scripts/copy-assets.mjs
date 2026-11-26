// Prepare web/public/ before the dev server or a build starts (npm run assets).
// - copies the shared vocabulary and specs, the committed hand model and the MediaPipe runtime;
// - downloads the pinned model files listed in shared_data/downloads.json once (pose, face, ASL),
//   refusing any file whose size or SHA-256 differs, and copies them into public/models/;
// - copies the LiteRT.js runtime (ASL mode in the browser) into public/litert/.
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
  let problem = await problemWith(target, item);
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
for (const name of ["vocabulary.json"]) await cp(path.join(project, name), path.join(publicDir, name));
for (const name of ["feature_spec_v2.json", "asl_islr_spec.json", "psl_hands_spec.json", "site_pages.json"]) await cp(path.join(project, "shared_data", name), path.join(publicDir, name));
// Guided tour and practice references: six real SignSpeak hand-landmark recordings (Apache-2.0, ledger
// psl-signspeak-words allows redistribute_data) with the shipped model's saved answers (web/src/ui/recordings.js).
await cp(path.join(project, "tests", "golden", "psl_parity_cases.json"), path.join(publicDir, "demo_signs.json"));
await cp(path.join(project, "models", "hand_landmarker.task"), path.join(publicDir, "models", "hand_landmarker.task"));
// The PSL bundle (manifest + model, committed under models/psl by the Stage 2 training run).
if (await exists(path.join(project, "models", "psl", "manifest.json"))) {
  const pslManifest = JSON.parse(await readFile(path.join(project, "models", "psl", "manifest.json"), "utf8"));
  await mkdir(path.join(publicDir, "models", "psl"), { recursive: true });
  for (const name of ["manifest.json", pslManifest.model.file]) await cp(path.join(project, "models", "psl", name), path.join(publicDir, "models", "psl", name));
} else {
  console.warn("No PSL bundle in models/psl: PSL recognition stays off.");
}
await cp(path.join(web, "node_modules", "@mediapipe", "tasks-vision", "wasm"), path.join(publicDir, "wasm"), { recursive: true });

const downloads = JSON.parse(await readFile(path.join(project, "shared_data", "downloads.json"), "utf8")).files;
for (const item of downloads) {
  if (await ensureDownload(item)) {
    const destination = path.join(publicDir, ...item.path.split("/")); // models/... -> public/models/...
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(project, item.path), destination);
  }
}

// The SLT PSL dictionary's GitHub releases (ledger id psl-slt-dictionary, CC BY 4.0): asset name -> URL.
// Read once per build; uses GITHUB_TOKEN when the build has one (GitHub's limit is 60 calls an hour without).
let releaseAssets = null;
async function sltReleaseAssets(repository) {
  if (releaseAssets) return releaseAssets;
  const headers = { Accept: "application/vnd.github+json", ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
  const map = new Map();
  const response = await fetch(`https://api.github.com/repos/${repository}/releases?per_page=100`, { headers, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`GitHub releases: HTTP ${response.status}`);
  for (const release of await response.json()) for (const asset of release.assets || []) map.set(asset.name, { url: asset.browser_download_url, bytes: asset.size });
  releaseAssets = map;
  return map;
}

// PSL dictionary videos ("how it is signed", shared_data/psl_clips.json): from the restored baseline when it
// has them, otherwise from the dataset's GitHub releases; each one must match its pinned size and SHA-256.
async function ensureClips() {
  const clips = JSON.parse(await readFile(path.join(project, "shared_data", "psl_clips.json"), "utf8"));
  const kept = [];
  for (const clip of clips.clips) {
    const target = path.join(publicDir, ...clip.file.split("/"));
    const fromBaseline = path.join(project, "baseline", "v1-site", ...clip.file.split("/"));
    let bytes = null;
    for (const candidate of [target, fromBaseline]) {
      if (await exists(candidate)) {
        const data = await readFile(candidate);
        if (data.length === clip.bytes && sha256(data) === clip.sha256) { bytes = data; break; }
      }
    }
    if (!bytes) {
      try {
        const asset = (await sltReleaseAssets(clips.release_repository)).get(path.basename(clip.file));
        if (!asset) throw new Error("not in the dataset's releases");
        const response = await fetch(asset.url, { signal: AbortSignal.timeout(120_000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = Buffer.from(await response.arrayBuffer());
        if (data.length !== clip.bytes || sha256(data) !== clip.sha256) throw new Error("the download is not the pinned file");
        bytes = data;
      } catch (error) {
        console.warn(`PSL video ${clip.file} not available (${error.message}); that word shows no video.`);
        continue;
      }
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
    kept.push({ word: clip.word, label: clip.label, file: clip.file });
  }
  await writeFile(path.join(publicDir, "psl_clips.json"), JSON.stringify({ attribution: clips.attribution, ledger_id: clips.ledger_id, clips: kept }, null, 1));
  console.log(`PSL dictionary videos: ${kept.length} of ${clips.clips.length}.`);
  return clips;
}
const clipList = await ensureClips();

// The full dictionary page: every SLT PSL dictionary sign (Stage 1 learned 785 of them as Tier B). Videos are
// not copied: the page plays them from the dataset's own GitHub release when the visitor presses play.
async function writeDictionary() {
  const prefix = "pk-hfad-1_";
  let entries = [];
  let note = "";
  try {
    for (const [name, asset] of await sltReleaseAssets(clipList.release_repository)) {
      if (name.startsWith(prefix) && name.endsWith(".mp4")) entries.push({ label: name.slice(prefix.length, -4), url: asset.url, bytes: asset.bytes });
    }
    entries.sort((a, b) => a.label.localeCompare(b.label));
  } catch (error) {
    note = `The dictionary list could not be read at build time (${error.message}).`;
    console.warn(note);
  }
  const offline = Object.fromEntries(clipList.clips.map((clip) => [clip.label, clip.file]));
  for (const entry of entries) if (offline[entry.label]) entry.file = offline[entry.label];
  await writeFile(path.join(publicDir, "psl_dictionary.json"), JSON.stringify({ ledger_id: clipList.ledger_id, attribution: clipList.attribution, release_repository: clipList.release_repository, built: new Date().toISOString().slice(0, 10), note, entries }));
  console.log(`PSL dictionary page: ${entries.length} signs.`);
}
await writeDictionary();

const litert = path.join(web, "node_modules", "@litertjs", "core", "wasm");
if (await exists(litert)) {
  await cp(litert, path.join(publicDir, "litert"), { recursive: true });
} else {
  console.warn("LiteRT.js is not installed (run npm install in the web folder): ASL mode can only use the local server.");
}
console.log("Prepared the vocabulary, specs, MediaPipe models and runtime, the ASL model and the LiteRT.js runtime.");
