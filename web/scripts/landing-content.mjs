// Fills the project page (web/index.html) with content generated from committed files, at build time, so every
// section is plain HTML in the shipped page (readable with JavaScript off, by crawlers, reviewers and slow phones).
// Nothing here is typed by hand:
//   - the sign library comes from the ASL model's labels file (models/asl/sign_to_prediction_index_map.json) and the
//     display names in shared_data/asl_islr_spec.json, so it is exactly what the camera can recognise;
//   - results come from shared_data/asl_results.json (tools/asl_results.py, which builds it from the committed Kaggle
//     results and refuses numbers that do not add up). While that file holds totals only, the page says so;
//   - which signs have a recorded example comes from shared_data/asl_tour_recordings.json (CC0 rerun set), if present;
//   - speed rows come from reports/performance_v3.json (ASL rows); credits from shared_data/site_pages.json.
//
// Use as a Vite plugin (vite.config.js) or from the command line to look at the result without Vite:
//   node scripts/landing-content.mjs [--out file.html]
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectDir = path.resolve(webDir, "..");

const esc = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const readJson = (file, fallback = null) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback);
const pct = (rate, digits = 1) => (rate == null ? "—" : `${(rate * 100).toFixed(digits)} %`);
const int = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
const mb = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;
const NOT_VALIDATED = "Dataset sign — not yet validated by our reviewers";

export function loadInputs({ project = projectDir } = {}) {
  const spec = readJson(path.join(project, "shared_data", "asl_islr_spec.json"));
  const indexMap = readJson(path.join(project, "models", "asl", "sign_to_prediction_index_map.json"));
  const results = readJson(path.join(project, "shared_data", "asl_results.json"));
  if (!spec || !indexMap || !results) throw new Error("landing page: shared_data/asl_islr_spec.json, models/asl/sign_to_prediction_index_map.json and shared_data/asl_results.json are required (run python tools/asl_results.py)");
  if (results.model.sha256 !== spec.model.sha256) throw new Error("landing page: shared_data/asl_results.json was measured on a different model than shared_data/asl_islr_spec.json names");
  const labels = new Array(Object.keys(indexMap).length);
  for (const [label, index] of Object.entries(indexMap)) labels[index] = label;
  const handModel = path.join(project, "models", "hand_landmarker.task");
  if (!existsSync(handModel)) throw new Error("landing page: models/hand_landmarker.task is missing (it is committed in the repository)");
  const downloads = readJson(path.join(project, "shared_data", "downloads.json"), { files: [] }).files;
  const bytesOf = (end) => downloads.find((f) => f.path.endsWith(end))?.bytes ?? null;
  return {
    spec,
    labels,
    results,
    tour: readJson(path.join(project, "shared_data", "asl_tour_recordings.json"), { recordings: [] }),
    performance: readJson(path.join(project, "reports", "performance_v3.json"), { measurements: [] }),
    sitePages: readJson(path.join(project, "shared_data", "site_pages.json"), {}),
    sizes: { hand: statSync(handModel).size, pose: bytesOf("pose_landmarker_lite.task"), face: bytesOf("face_landmarker.task"), model: spec.model.bytes },
  };
}

// The camera's signs, from the labels file, with each one's measured result (when per-sign results exist) and
// whether a recorded example exists.
export function librarySigns({ spec, labels, results, tour }) {
  const browserPath = results.paths?.fixed_32 || null;
  const perSign = new Map((browserPath?.per_sign || []).map((row) => [row.sign, row]));
  const recorded = new Set((tour.recordings || []).map((r) => r.sign));
  return labels
    .map((label) => ({ gloss: label, english: spec.display_names[label] ?? label, tested: perSign.get(label) || null, recorded: recorded.has(label) }))
    .sort((a, b) => a.english.localeCompare(b.english, "en"));
}

function signCard(sign) {
  const result = sign.tested ? `Rerun set: ${pct(sign.tested.top1, 0)} right first time (${sign.tested.samples} signs)` : "Per-sign result: with the next measurement run";
  const search = [sign.english, sign.gloss].join(" ").toLowerCase();
  return `<li class="sign" data-video="${sign.recorded ? 1 : 0}" data-search="${esc(search)}">
  <h3 class="sign-en">${esc(sign.english)}</h3>
  <p class="sign-roman"><span class="visually-hidden">Gloss: </span>${esc(sign.gloss.toUpperCase())}</p>
  <ul class="sign-meta"><li>${esc(result)}</li>${sign.recorded ? "<li>Recorded example in the guided tour</li>" : ""}</ul>
  <p class="sign-note">${NOT_VALIDATED}</p>
</li>`;
}

function signLibrary(input) {
  const signs = librarySigns(input);
  return {
    html: `<ul class="sign-grid" id="sign-list">\n${signs.map(signCard).join("\n")}\n</ul>`,
    facts: { signs: signs.length, recorded: signs.filter((s) => s.recorded).length },
  };
}

// Rows of the results table: from the per-path results when they exist, otherwise from the totals-only file.
function resultsRows({ results }) {
  const h = results.headline;
  if (results.status === "complete") {
    const rows = [];
    for (const [name, p] of Object.entries(results.paths)) {
      if (name === "native_mirrored") continue;
      rows.push([esc(p.title), int(p.samples), `<strong>${pct(p.top1)}</strong>`, pct(p.top5),
        `one-handed ${pct(p.groups.one_handed.top1)} (${int(p.groups.one_handed.samples)}) · two-handed ${pct(p.groups.two_handed.top1)} (${int(p.groups.two_handed.samples)}) · left- vs right-dominant ${pct(p.groups.dominant_left.top1)} vs ${pct(p.groups.dominant_right.top1)} · calibration error ${p.ece == null ? "—" : p.ece.toFixed(3)}`]);
    }
    return rows;
  }
  const g = results.groups;
  return [
    [`Sign's real length (as the model was built)`, int(results.dataset.samples_evaluated), `<strong>${pct(h.native_top1)}</strong>`, pct(h.native_top5), "the reference number"],
    [`${h.browser_frames} frames (what the website runs)`, int(h.browser_top1_samples), `<strong>${pct(h.browser_top1)}</strong>`, "—", `every 5th sign of the set`],
    [`One-handed signs (real length)`, int(g.one_handed.samples), pct(g.one_handed.top1), pct(g.one_handed.top5), ""],
    [`Two-handed signs (real length)`, int(g.two_handed.samples), pct(g.two_handed.top1), pct(g.two_handed.top5), "too few to mean anything"],
    [`Left- vs right-dominant signers (real length)`, `${int(g.dominant_left.samples)} / ${int(g.dominant_right.samples)}`, `${pct(g.dominant_left.top1)} vs ${pct(g.dominant_right.top1)}`, `${pct(g.dominant_left.top5)} vs ${pct(g.dominant_right.top5)}`, `gap ${((g.dominant_left.top1 - g.dominant_right.top1) * 100).toFixed(1)} points (target ≤ 3)`],
  ];
}

function resultsTable(input) {
  const { results } = input;
  return `<table class="data">
<caption>The ASL model on the GISLR rerun set (${int(results.dataset.samples_evaluated)} signs by Deaf signers it was not trained on, as reported by the dataset's publisher; CC0). Measured ${esc(results.measured_on.slice(0, 10))} on Kaggle (${esc(results.model.runtime)}); source <code>${esc(results.source)}</code>.</caption>
<thead><tr><th scope="col">How the model was run</th><th scope="col">Signs</th><th scope="col">Right first time (top-1)</th><th scope="col">Right in top 5</th><th scope="col">Notes</th></tr></thead>
<tbody>
${resultsRows(input).map((r) => `<tr><th scope="row">${r[0]}</th><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td></tr>`).join("\n")}
</tbody>
</table>`;
}

function calibrationTable({ results }) {
  const table = results.status === "complete" ? results.paths.fixed_32.calibration : results.calibration;
  const where = results.status === "complete" ? "the website's 32 frames" : "the sign's real length";
  return `<table class="data compact">
<caption>If SignMate only showed answers above a confidence level (${where})</caption>
<thead><tr><th scope="col">Shown when confidence is at least</th><th scope="col">Signs answered</th><th scope="col">Right among those answered</th></tr></thead>
<tbody>
${table.map((c) => `<tr><th scope="row">${c.threshold.toFixed(2)}</th><td>${pct(c.coverage)}</td><td>${pct(c.accuracy_when_covered)}</td></tr>`).join("\n")}
</tbody>
</table>`;
}

function perSignBlock({ results, labels, spec }) {
  if (results.status !== "complete") {
    return `<p class="note">Per-sign results and the confusion matrix (which sign is taken for which) come with the next measurement run of <code>notebooks/asl_mode_eval.ipynb</code>; the results file of ${esc(results.measured_on.slice(0, 10))} holds totals only. Nothing is shown until it is measured.</p>`;
  }
  const p = results.paths.fixed_32;
  const name = (label) => esc(spec.display_names[label] ?? label);
  const confused = p.confusion.filter(([t, a]) => t !== a).sort((x, y) => y[2] - x[2] || x[0] - y[0]).slice(0, 25);
  const rows = p.per_sign.slice().sort((a, b) => a.top1 - b.top1 || a.sign.localeCompare(b.sign));
  return `<div class="two-col">
<div class="table-scroll" tabindex="0" role="region" aria-label="Most frequent mistakes"><table class="data compact">
<caption>The ${confused.length} most frequent mistakes (32 frames)</caption>
<thead><tr><th scope="col">Signed</th><th scope="col">Taken for</th><th scope="col">Times</th></tr></thead>
<tbody>
${confused.map(([t, a, n]) => `<tr><th scope="row">${name(labels[t])}</th><td>${name(labels[a])}</td><td>${n}</td></tr>`).join("\n")}
</tbody></table></div>
<div class="table-scroll" tabindex="0" role="region" aria-label="Per-sign results"><table class="data compact">
<caption>Every sign, weakest first (32 frames)</caption>
<thead><tr><th scope="col">Sign</th><th scope="col">Signs</th><th scope="col">Top-1</th><th scope="col">Top-5</th><th scope="col">Most often taken for</th></tr></thead>
<tbody>
${rows.map((s) => `<tr><th scope="row">${name(s.sign)}</th><td>${s.samples}</td><td>${pct(s.top1)}</td><td>${pct(s.top5)}</td><td>${s.confused_with.map(([l, n]) => `${name(l)} (${n})`).join(", ") || "—"}</td></tr>`).join("\n")}
</tbody></table></div>
</div>`;
}

function speedRows({ performance }) {
  return (performance.measurements || [])
    .filter((m) => /^ASL model/.test(m.what))
    .map((m) => `<tr><th scope="row">${esc(m.what)}</th><td>${esc(m.result)}</td><td>${esc(m.where)}</td><td>${esc(m.date)}</td></tr>`)
    .join("\n");
}

function credits({ sitePages }) {
  const assets = sitePages.credits?.assets || [];
  return `<ul class="credits">
${assets.map((a) => `<li><strong>${esc(a.name)}</strong> — ${esc(a.licence)}. ${esc(a.attribution)}${/^https?:/.test(a.source_url) ? ` <a href="${esc(a.source_url)}" rel="noopener">Source<span class="visually-hidden">: ${esc(a.name)}</span></a>` : ""}</li>`).join("\n")}
</ul>`;
}

// Short facts used inline in the page: <!--@fact:name-->.
function facts(input, library) {
  const { spec, results, sizes } = input;
  const h = results.headline;
  const g = results.status === "complete" ? results.paths.native.groups : results.groups;
  const firstRun = sizes.hand + (sizes.pose || 0) + (sizes.face || 0) + sizes.model;
  return {
    signs: String(library.facts.signs),
    "signs-recorded": String(library.facts.recorded),
    "model-size": mb(sizes.model),
    "model-bytes": int(sizes.model),
    "model-sha": esc(spec.model.sha256.slice(0, 12)),
    "browser-frames": String(h.browser_frames ?? spec.fixed_length.frames),
    "hand-model-size": mb(sizes.hand),
    "pose-model-size": sizes.pose ? mb(sizes.pose) : "—",
    "face-model-size": sizes.face ? mb(sizes.face) : "—",
    "first-run-size": mb(firstRun),
    "eval-samples": int(results.dataset.samples_evaluated),
    "eval-date": esc(results.measured_on.slice(0, 10)),
    "native-top1": pct(h.native_top1),
    "native-top5": pct(h.native_top5),
    "browser-top1": pct(h.browser_top1),
    "left-top1": pct(g.dominant_left.top1),
    "right-top1": pct(g.dominant_right.top1),
    "two-handed-samples": int(g.two_handed.samples),
    "latency-median": h.latency_ms_median == null ? "—" : `${h.latency_ms_median.toFixed(1)} ms`,
    "accept-threshold": spec.confidence.sure.toFixed(2),
    "results-status": results.status === "complete" ? "Per-sign results and the most frequent mistakes are below." : "Per-sign results and the confusion matrix come with the next measurement run.",
    year: String(new Date().getFullYear()),
  };
}

export function renderLanding(html, input = loadInputs()) {
  const library = signLibrary(input);
  const blocks = {
    "sign-library": library.html,
    "results-table": resultsTable(input),
    "calibration-table": calibrationTable(input),
    "per-sign": perSignBlock(input),
    "speed-rows": speedRows(input),
    credits: credits(input),
  };
  const fact = facts(input, library);
  let out = html.replace(/<!--@block:([a-z0-9-]+)-->/g, (match, name) => {
    if (!(name in blocks)) throw new Error(`landing page: unknown block ${name}`);
    return blocks[name];
  });
  out = out.replace(/<!--@fact:([a-z0-9-]+)-->/g, (match, name) => {
    if (!(name in fact)) throw new Error(`landing page: unknown fact ${name}`);
    return fact[name];
  });
  const left = out.match(/<!--@[^>]*-->/);
  if (left) throw new Error(`landing page: marker left in the page: ${left[0]}`);
  return out;
}

// Vite plugin: only the project page (web/index.html) is filled in; translate/index.html, bench.html and the
// self-test are not (translate/index.html has the same file name, so the check is on the path from web/).
export function landingContent(options = {}) {
  return {
    name: "signmate-landing-content",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        const file = ctx.filename ? path.relative(webDir, ctx.filename) : String(ctx.path || "").replace(/^\//, "");
        if (file !== "index.html") return html;
        return renderLanding(html, loadInputs(options));
      },
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const args = process.argv.slice(2);
  const out = args.includes("--out") ? path.resolve(args[args.indexOf("--out") + 1]) : null;
  const html = renderLanding(readFileSync(path.join(webDir, "index.html"), "utf8"), loadInputs());
  if (out) { writeFileSync(out, html); console.log(`Wrote ${out}`); } else process.stdout.write(html);
}
