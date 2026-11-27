// npm run build:shared: the offline "shared copy" of SignMate for Windows, with nothing to install.
//
//   web/dist-shared/SignMate/                       the folder: Start SignMate.bat, serve.ps1, README.txt, site/
//   web/dist-shared/SignMate-shared-copy.zip        the same folder zipped (what people download)
//
// site/ is the website built with no server (VITE_API_BASE=none, like GitHub Pages): everything runs in the
// browser. serve.ps1 is a tiny PowerShell web server for localhost, where browsers allow the camera.
// The launcher files come from web/shared-copy/ (same as the Inference Baseline v1 shared copy).
//
// Options (for tests and CI):
//   --from DIR      package an already built site folder instead of building one (e.g. baseline/v1-site)
//   --out DIR       where to write (default web/dist-shared)
//   --no-zip        write the folder only
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { crc32, deflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const outDir = path.resolve(option("--out") || path.join(web, "dist-shared"));
const from = option("--from") ? path.resolve(option("--from")) : null;
const folder = path.join(outDir, "SignMate");
const siteDir = path.join(folder, "site");

// Files that must be in every shared copy, or it cannot start / recognise anything.
export const REQUIRED = ["index.html", "app.html", "asl_islr_spec.json", "feature_spec_v2.json", "vocabulary.json", "models/hand_landmarker.task", "models/pose_landmarker_lite.task", "models/face_landmarker.task", "models/asl/model.tflite", "models/asl/sign_to_prediction_index_map.json", "psl_hands_spec.json", "models/psl/manifest.json", "models/psl/psl_v3.tflite", "site_pages.json", "sw.js", "precache.json"];
// Never shipped in the shared copy: CI results and source maps.
const EXCLUDE = [/^ci\//, /\.map$/];

async function buildSite(target) {
  process.env.VITE_API_BASE = "none"; // no server in the shared copy
  const { build } = await import("vite");
  await build({ root: web, configFile: path.join(web, "vite.config.js"), logLevel: "warn", build: { outDir: target, emptyOutDir: true } });
}

async function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full, base)));
    else if (entry.isFile()) out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out.sort();
}

// A small, standard zip writer (deflate, UTF-8 names), so packaging needs no extra package.
function dosTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

export function zipFiles(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const { time, day } = dosTime(new Date());
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const compressed = deflateRawSync(data, { level: 9 });
    const useDeflate = compressed.length < data.length;
    const body = useDeflate ? compressed : data;
    const crc = crc32(data) >>> 0;
    if (body.length > 0xffffffff || offset > 0xffffffff) throw new Error("the shared copy is too large for a plain zip");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(useDeflate ? 8 : 0, 8); local.writeUInt16LE(time, 10); local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26); local.writeUInt16LE(0, 28);
    chunks.push(local, nameBytes, body);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(20, 6); header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(useDeflate ? 8 : 0, 10); header.writeUInt16LE(time, 12); header.writeUInt16LE(day, 14);
    header.writeUInt32LE(crc, 16); header.writeUInt32LE(body.length, 20); header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(nameBytes.length, 28); header.writeUInt32LE(offset, 42);
    central.push(header, nameBytes);
    offset += local.length + nameBytes.length + body.length;
  }
  const centralSize = central.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, ...central, end]);
}

async function main() {
  await rm(folder, { recursive: true, force: true });
  await mkdir(folder, { recursive: true });
  if (from) await cp(from, siteDir, { recursive: true });
  else await buildSite(siteDir);
  for (const relative of await listFiles(siteDir)) {
    if (EXCLUDE.some((pattern) => pattern.test(relative))) await rm(path.join(siteDir, relative));
  }
  const missing = [];
  for (const relative of REQUIRED) if (!existsSync(path.join(siteDir, relative))) missing.push(relative);
  if (missing.length) throw new Error(`the site is missing files the shared copy needs: ${missing.join(", ")}. Run npm run assets with internet once (or python tools/fetch_assets.py).`);
  for (const name of ["Start SignMate.bat", "serve.ps1", "README.txt"]) await cp(path.join(web, "shared-copy", name), path.join(folder, name));

  const files = await listFiles(folder);
  let total = 0;
  for (const relative of files) total += (await stat(path.join(folder, relative))).size;
  console.log(`Shared copy folder: ${path.relative(process.cwd(), folder) || folder} (${files.length} files, ${(total / 1e6).toFixed(1)} MB)`);
  if (args.includes("--no-zip")) return;
  const entries = [];
  for (const relative of files) entries.push({ name: `SignMate/${relative}`, data: await readFile(path.join(folder, relative)) });
  const zipPath = path.join(outDir, "SignMate-shared-copy.zip");
  await writeFile(zipPath, zipFiles(entries));
  console.log(`Shared copy zip:    ${path.relative(process.cwd(), zipPath) || zipPath} (${((await stat(zipPath)).size / 1e6).toFixed(1)} MB). Unzip it on Windows and double-click "Start SignMate.bat".`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`build:shared failed: ${error.message}`); process.exit(1); });
}
