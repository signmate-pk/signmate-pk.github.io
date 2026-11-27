// Fills the project page (web/index.html) with content generated from committed files, at build time, so
// every section is plain HTML in the shipped page (readable with JavaScript off, by crawlers, AI reviewers and
// slow phones). Nothing here is typed by hand:
//   - the sign library comes from the model's labels file, models/psl/manifest.json (never invented signs);
//   - results and the confusion matrix come from shared_data/psl_results.json (tools/psl_results.py, which
//     rebuilds them from reports/psl_v3_measurements.json and checks that they add up);
//   - speed rows come from reports/performance_v3.json; credits from shared_data/site_pages.json.
// Videos for a sign are used only when a licensed clip exists: the pinned offline clips (public/psl_clips.json,
// written by scripts/copy-assets.mjs) or the SLT dictionary entry of the same word (public/psl_dictionary.json).
//
// Use as a Vite plugin (vite.config.js) or from the command line to look at the result without Vite:
//   node scripts/landing-content.mjs [--out file.html]
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { ROMAN_URDU, groupOf } from "../src/ui/signs.js";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectDir = path.resolve(webDir, "..");

const esc = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const readJson = (file, fallback = null) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback);
const pct = (rate, digits = 1) => (rate == null ? "—" : `${(rate * 100).toFixed(digits)} %`);
const int = (n) => Number(n).toLocaleString("en-US");
const mb = (bytes) => `${(bytes / 1e6).toFixed(2)} MB`;
const kb = (bytes) => `${Math.round(bytes / 1000)} KB`;
const norm = (text) => String(text).toLowerCase().split(".")[0].replace(/[^a-z0-9]/g, "");
const ur = (text, tag = "span", cls = "ur") => (text ? `<${tag} class="${cls}" lang="ur" dir="rtl">${esc(text)}</${tag}>` : "");

export function loadInputs({ project = projectDir, publicDir = path.join(webDir, "public") } = {}) {
  const manifest = readJson(path.join(project, "models", "psl", "manifest.json"));
  const results = readJson(path.join(project, "shared_data", "psl_results.json"));
  if (!manifest || !results) throw new Error("landing page: models/psl/manifest.json and shared_data/psl_results.json are required (run python tools/psl_results.py)");
  if (results.model.sha256 !== manifest.model.sha256) throw new Error("landing page: shared_data/psl_results.json was built for a different model; run python tools/psl_results.py");
  const handModel = path.join(project, "models", "hand_landmarker.task");
  if (!existsSync(handModel)) throw new Error("landing page: models/hand_landmarker.task is missing (it is committed in the repository)");
  return {
    manifest,
    results,
    performance: readJson(path.join(project, "reports", "performance_v3.json"), { measurements: [] }),
    sitePages: readJson(path.join(project, "shared_data", "site_pages.json"), {}),
    // Built files from copy-assets.mjs; at dev time they may be missing, and then no videos are linked.
    clips: readJson(path.join(publicDir, "psl_clips.json"), { clips: [] }),
    clipSizes: Object.fromEntries((readJson(path.join(project, "shared_data", "psl_clips.json"), { clips: [] }).clips || []).map((c) => [c.file, c.bytes])),
    dictionary: readJson(path.join(publicDir, "psl_dictionary.json"), { entries: [] }),
    handModelBytes: statSync(handModel).size,
  };
}

// The camera's signs, from the labels file, with the reference video each one has (if any).
export function librarySigns({ manifest, results, clips, clipSizes, dictionary }) {
  const offline = new Map((clips.clips || []).map((c) => [c.word, c]));
  const dictByLabel = new Map();
  for (const entry of dictionary.entries || []) if (!dictByLabel.has(norm(entry.label))) dictByLabel.set(norm(entry.label), entry);
  const perSign = new Map(results.confusion_matrix.per_sign.map((s) => [s.gloss, s]));
  return manifest.classes
    .filter((c) => c.tier && c.gloss !== manifest.unknown_class)
    .map((c) => {
      const local = offline.get(c.vocabulary_id) || offline.get(c.gloss);
      const remote = local ? null : dictByLabel.get(norm(c.english)) || dictByLabel.get(norm(c.gloss));
      let clip = null;
      if (local) clip = { url: local.file, label: local.label, bytes: clipSizes[local.file] || null, where: "offline" };
      else if (remote) clip = { url: remote.file || remote.url, label: remote.label, bytes: remote.bytes || null, where: remote.file ? "offline" : "dictionary" };
      return { ...c, roman: ROMAN_URDU[c.gloss] || c.english, group: groupOf(c.gloss), tested: perSign.get(c.gloss) || null, clip };
    })
    .sort((a, b) => a.english.localeCompare(b.english, "en"));
}

function signCard(sign) {
  const test = sign.tested ? `Fair test: ${sign.tested.correct} of ${sign.tested.samples} right` : "Not measured on the fair test";
  const links = [];
  if (sign.clip) {
    const details = [sign.clip.bytes ? `video, ${kb(sign.clip.bytes)}` : "video"];
    if (norm(sign.clip.label) !== norm(sign.english)) details.push(`dictionary entry “${sign.clip.label.replace(/\./g, ", ")}”`);
    links.push(`<a class="clip-link" href="${esc(sign.clip.url)}" data-clip="${esc(sign.clip.url)}" data-en="${esc(sign.english)}" data-ur="${esc(sign.urdu)}">Watch the sign<span class="visually-hidden"> ${esc(sign.english)}</span> <small>(${esc(details.join("; "))})</small></a>`);
  }
  if (sign.dictionary_url) links.push(`<a href="${esc(sign.dictionary_url)}" rel="noopener">psl.org.pk entry<span class="visually-hidden"> for ${esc(sign.english)} (external site)</span></a>`);
  const reference = links.length ? `<p class="sign-links">${links.join(" ")}</p>` : `<p class="sign-links muted">No licensed reference video yet.</p>`;
  const note = sign.data_note ? `<p class="sign-note">${esc(sign.data_note)}</p>` : "";
  const search = [sign.english, sign.gloss.replace(/_/g, " "), sign.roman, sign.urdu].join(" ").toLowerCase();
  return `<li class="sign" data-group="${sign.group}" data-hands="${esc(sign.hands)}" data-video="${sign.clip ? 1 : 0}" data-search="${esc(search)}">
  <h3 class="sign-en">${esc(sign.english)}</h3>
  ${ur(sign.urdu, "p", "sign-ur")}
  <p class="sign-roman"><span class="visually-hidden">Roman Urdu: </span>${esc(sign.roman)}</p>
  <ul class="sign-meta"><li>${sign.hands === "two" ? "Two hands" : "One hand"}</li><li>${test}</li></ul>
  ${note}${reference}
</li>`;
}

function signLibrary(input) {
  const signs = librarySigns(input);
  const withVideo = signs.filter((s) => s.clip).length;
  const two = signs.filter((s) => s.hands === "two").length;
  return {
    html: `<ul class="sign-grid" id="sign-list">\n${signs.map(signCard).join("\n")}\n</ul>`,
    facts: { signs: signs.length, two, one: signs.length - two, withVideo, withDictionary: signs.filter((s) => s.dictionary_url).length },
  };
}

function resultsTable({ results }) {
  const f = results.fair_test;
  const s = results.independent_signer;
  const c = results.calibration_part;
  const rows = [
    [`<strong>One new signer</strong> (SLT dictionary performer, not in the training data)`, `${s.samples} clips`, `<strong>${pct(s.top1)}</strong> (${s.top1_count} of ${s.samples})`, `${pct(s.top5)} (${s.top5_count} of ${s.samples})`, "Signer-independent, but very small"],
    [`Phone recordings never seen in training (“fair test”)`, `${int(f.samples)}`, `<strong>${pct(f.top1)}</strong> (${int(f.correct)} of ${int(f.samples)})`, pct(f.top5), "Weaker: no signer ids, so the same people may be in training"],
    [`Fair test, one-handed signs`, int(f.one_handed.samples), pct(f.one_handed.top1), pct(f.one_handed.top5), "Weaker"],
    [`Fair test, two-handed signs`, int(f.two_handed.samples), pct(f.two_handed.top1), pct(f.two_handed.top5), "Weaker"],
    [`Fair test, right- vs left-handed signing`, int(f.samples), `${pct(f.left_right.right_top1)} vs ${pct(f.left_right.left_top1)}`, "—", `Gap ${f.left_right.gap_points.toFixed(1)} points`],
    [`All phone recordings, including signs this test cannot learn`, int(f.all_phone_samples), pct(f.all_phone_top1), "—", "Weaker"],
    [`Comparison model (GRU) on the fair test`, int(f.samples), pct(f.gru_top1), "—", "Not shipped"],
    [`Calibration part (same people and sessions)`, int(c.samples), pct(c.top1), pct(c.top5), "Weaker"],
  ];
  return `<table class="data">
<caption>PSL recogniser v${esc(results.model.bundle)}: every test, with how much to trust it. Source: run ${esc(results.source.run)} (commit ${esc(results.source.commit)}), ${esc(results.source.date)}.</caption>
<thead><tr><th scope="col">Test</th><th scope="col">Signs tested</th><th scope="col">Right first time (top-1)</th><th scope="col">Right in top 5</th><th scope="col">How much to trust it</th></tr></thead>
<tbody>
${rows.map((r) => `<tr><th scope="row">${r[0]}</th><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td></tr>`).join("\n")}
</tbody>
</table>`;
}

function confusionSvg({ results }) {
  const cm = results.confusion_matrix;
  const n = cm.order.length;
  const cell = 13;
  const pad = 132;
  const size = pad + n * cell + 6;
  const parts = [];
  parts.push(`<rect x="${pad}" y="${pad}" width="${n * cell}" height="${n * cell}" fill="#16132b"/>`);
  for (let i = 0; i <= n; i += 5) {
    parts.push(`<path d="M${pad + i * cell} ${pad}V${pad + n * cell}M${pad} ${pad + i * cell}H${pad + n * cell}" stroke="#2a2550" stroke-width="0.6"/>`);
  }
  cm.order.forEach((sign, i) => {
    const y = pad + i * cell + cell * 0.72;
    parts.push(`<text x="${pad - 4}" y="${y.toFixed(1)}" text-anchor="end" font-size="9.6" fill="#b9b6d3">${esc(sign.english)}</text>`);
    const x = pad + i * cell + cell * 0.72;
    parts.push(`<text transform="translate(${x.toFixed(1)} ${pad - 4}) rotate(-60)" font-size="9.6" fill="#b9b6d3">${esc(sign.english)}</text>`);
  });
  cm.counts.forEach((row, i) => {
    const total = row.reduce((a, b) => a + b, 0);
    row.forEach((count, j) => {
      if (!count) return;
      const share = count / total;
      const label = `${cm.order[i].english} answered as ${cm.order[j].english}: ${count} of ${total}`;
      if (i === j) {
        parts.push(`<rect x="${pad + j * cell + 0.5}" y="${pad + i * cell + 0.5}" width="${cell - 1}" height="${cell - 1}" fill="#3ddc97" fill-opacity="${(0.25 + 0.75 * share).toFixed(2)}"><title>${esc(label)}</title></rect>`);
      } else {
        const cx = pad + j * cell + cell / 2;
        const cy = pad + i * cell + cell / 2;
        const r = 3.4 + Math.min(2.8, share * 10);
        parts.push(`<path d="M${cx} ${(cy - r).toFixed(1)}L${(cx + r).toFixed(1)} ${cy}L${cx} ${(cy + r).toFixed(1)}L${(cx - r).toFixed(1)} ${cy}Z" fill="#ffb547" stroke="#0d0b1c" stroke-width="0.6"><title>${esc(label)}</title></path>`);
      }
    });
  });
  const f = results.fair_test;
  return `<svg class="matrix" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-labelledby="cm-title cm-desc" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif">
<title id="cm-title">Confusion matrix of the fair test</title>
<desc id="cm-desc">Rows are the sign that was signed, columns the answer. ${n} signs, ${int(f.samples)} phone recordings. ${int(f.correct)} answers lie on the diagonal (right). The ${int(f.samples - f.correct)} wrong answers are the amber diamonds, listed in the table below.</desc>
${parts.join("\n")}
</svg>`;
}

function errorsTable({ results }) {
  const cm = results.confusion_matrix;
  const name = new Map(cm.order.map((s) => [s.gloss, s.english]));
  const totals = new Map(cm.per_sign.map((s) => [s.gloss, s.samples]));
  return `<table class="data compact">
<caption>Every wrong answer on the fair test (${int(cm.errors.reduce((a, e) => a + e.times, 0))} of ${int(results.fair_test.samples)} recordings)</caption>
<thead><tr><th scope="col">Signed</th><th scope="col">Taken for</th><th scope="col">Times</th></tr></thead>
<tbody>
${cm.errors.map((e) => `<tr><th scope="row">${esc(name.get(e.sign) || e.sign)}</th><td>${esc(name.get(e.taken_for) || e.taken_for)}</td><td>${e.times} of ${totals.get(e.sign)}</td></tr>`).join("\n")}
</tbody>
</table>`;
}

function perSignTable({ results }) {
  const rows = results.confusion_matrix.per_sign;
  return `<table class="data compact">
<caption>Per sign, fair test (${rows.length} signs with test recordings)</caption>
<thead><tr><th scope="col">Sign</th><th scope="col">Hands</th><th scope="col">Right</th><th scope="col">Top-1</th><th scope="col">Top-5</th></tr></thead>
<tbody>
${rows.map((s) => `<tr><th scope="row">${esc(s.english)} ${ur(s.urdu)}</th><td>${s.hands === "two" ? "two" : "one"}</td><td>${s.correct} of ${s.samples}</td><td>${pct(s.top1)}</td><td>${pct(s.top5)}</td></tr>`).join("\n")}
</tbody>
</table>`;
}

function independentTable({ results }) {
  const s = results.independent_signer;
  return `<table class="data compact">
<caption>One new signer: each of the ${s.samples} clips</caption>
<thead><tr><th scope="col">Signed</th><th scope="col">First answer</th><th scope="col">Probability</th><th scope="col">Right sign in top 5?</th></tr></thead>
<tbody>
${s.clips.map((c) => `<tr><th scope="row">${esc(c.english)}</th><td>${esc(c.answer_english)}${c.answer === c.gloss ? " <span class=\"ok\">(right)</span>" : ""}</td><td>${c.probability.toFixed(2)}</td><td>${c.top5 ? "yes" : "no"}</td></tr>`).join("\n")}
</tbody>
</table>`;
}

function speakLimits({ results }) {
  return `<table class="data compact">
<caption>If SignMate only showed answers above a confidence level (fair test)</caption>
<thead><tr><th scope="col">Shown when confidence is at least</th><th scope="col">Signs answered</th><th scope="col">Wrong among those answered</th></tr></thead>
<tbody>
${results.fair_test.speak_limits.map((l) => `<tr><th scope="row">${l.at_least.toFixed(1)}</th><td>${pct(l.answered_share)}</td><td>${pct(l.wrong_share_of_answered)}</td></tr>`).join("\n")}
</tbody>
</table>`;
}

function speedRows({ performance }) {
  return (performance.measurements || [])
    .filter((m) => /PSL|Lighthouse/.test(m.what))
    .map((m) => `<tr><th scope="row">${esc(m.what)}</th><td>${esc(m.result)}</td><td>${esc(m.where)}</td><td>${esc(m.date)}</td></tr>`)
    .join("\n");
}

function credits({ sitePages }) {
  const assets = (sitePages.credits?.assets || []).filter((a) => !/^asl-/.test(a.id));
  return `<ul class="credits">
${assets.map((a) => `<li><strong>${esc(a.name)}</strong> — ${esc(a.licence)}. ${esc(a.attribution)}${/^https?:/.test(a.source_url) ? ` <a href="${esc(a.source_url)}" rel="noopener">Source<span class="visually-hidden">: ${esc(a.name)}</span></a>` : ""}</li>`).join("\n")}
</ul>`;
}

// Short facts used inline in the page: <!--@fact:name-->.
function facts(input, library) {
  const { manifest, results } = input;
  const f = results.fair_test;
  const s = results.independent_signer;
  return {
    signs: String(library.facts.signs),
    "signs-one": String(library.facts.one),
    "signs-two": String(library.facts.two),
    "signs-video": String(library.facts.withVideo),
    "signs-dictionary": String(library.facts.withDictionary),
    classes: String(manifest.classes.length),
    "model-size": mb(manifest.model.bytes),
    "model-bytes": int(manifest.model.bytes),
    "model-params": int(manifest.model.parameters),
    "model-precision": esc(manifest.model.precision),
    "model-arch": esc(manifest.model.architecture),
    "model-sha": esc(manifest.model.sha256.slice(0, 12)),
    "model-version": esc(manifest.version),
    "model-frames": String(manifest.input.shape[0]),
    "model-temperature": String(manifest.model.temperature),
    "hand-model-size": mb(input.handModelBytes),
    "fair-top1": pct(f.top1),
    "fair-top5": pct(f.top5),
    "fair-samples": int(f.samples),
    "fair-correct": int(f.correct),
    "fair-errors": int(f.samples - f.correct),
    "fair-signs": String(results.confusion_matrix.order.length),
    "solo-top1": pct(s.top1),
    "solo-top5": pct(s.top5),
    "solo-samples": String(s.samples),
    "solo-top1-count": String(s.top1_count),
    "solo-top5-count": String(s.top5_count),
    "tier-a": String(manifest.tiers.A),
    "tier-b": String(manifest.tiers.B),
    badge: esc(manifest.badge),
    "not-measured": results.fair_test.not_measured.map((g) => esc(manifest.classes.find((c) => c.gloss === g)?.english || g)).join(", "),
    run: esc(results.source.run),
    commit: esc(results.source.commit),
    "run-date": esc(results.source.date),
    "train-samples": int(input.sitePages.psl?.samples ?? 0),
    "calibration-error": String(results.fair_test.calibration_error),
    year: String(new Date().getFullYear()),
  };
}

export function renderLanding(html, input = loadInputs()) {
  const library = signLibrary(input);
  const blocks = {
    "sign-library": library.html,
    "results-table": resultsTable(input),
    "confusion-matrix": confusionSvg(input),
    "confusion-errors": errorsTable(input),
    "per-sign": perSignTable(input),
    independent: independentTable(input),
    "speak-limits": speakLimits(input),
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

// Vite plugin: only the project page (index.html) is filled in; app.html, bench.html and the self-test are not.
export function landingContent(options = {}) {
  return {
    name: "signmate-landing-content",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        if (path.basename(ctx.filename || ctx.path || "") !== "index.html") return html;
        return renderLanding(html, loadInputs(options));
      },
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const args = process.argv.slice(2);
  const out = args.includes("--out") ? path.resolve(args[args.indexOf("--out") + 1]) : null;
  const publicDir = args.includes("--public") ? path.resolve(args[args.indexOf("--public") + 1]) : undefined;
  const html = renderLanding(readFileSync(path.join(webDir, "index.html"), "utf8"), loadInputs({ publicDir }));
  if (out) { writeFileSync(out, html); console.log(`Wrote ${out}`); } else process.stdout.write(html);
}
