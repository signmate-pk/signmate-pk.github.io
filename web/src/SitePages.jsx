// "How well it works", "Credits and licences" and "What's new". They show only what tools/site_pages.py read from
// the committed files (shared_data/site_pages.json, built from shared_data/asl_results.json); nothing is typed here.
import React, { useEffect, useState } from "react";
import { assetUrl } from "./paths.js";

let loading = null;
function usePages() {
  const [pages, setPages] = useState(null);
  useEffect(() => {
    let alive = true;
    loading ??= fetch(assetUrl("site_pages.json")).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    loading.then((value) => { if (alive) setPages(value || {}); });
    return () => { alive = false; };
  }, []);
  return pages;
}

const pct = (v) => (v == null ? "—" : `${(v * 100).toFixed(1)} %`);

function Stat({ value, label }) {
  return <div className="report-stat"><strong>{value}</strong><small>{label}</small></div>;
}

export function HowWellItWorks() {
  const pages = usePages();
  if (!pages) return <p role="status">Loading…</p>;
  const { asl, performance } = pages;
  return <>
    <div className="section-intro"><div><span className="section-kicker">EVERY NUMBER IS MEASURED · FROM THE PROJECT'S FILES</span><h1>How well it works</h1>
      <p>Each number says what it was measured on, how and when. Read this before trusting an answer: SignMate always asks you to confirm.</p></div></div>

    {asl && <div className="panel report-body"><div className="report-summary"><div><span className="section-kicker">THE ASL CAMERA · 250 SIGNS</span><h2>Measured on signs by Deaf signers it was not trained on</h2>
      <p>{asl.dataset}: {asl.samples.toLocaleString("en")} signs, measured {asl.measured_on} on Kaggle ({asl.runtime}). Signers: {asl.signer_independence}.</p></div>
      <Stat value={pct(asl.browser_top1)} label={`right first time the way this website runs it (${asl.browser_frames} frames)`} /><Stat value={pct(asl.top5)} label="right sign in the top five (real length)" /></div>
      <ul className="report-facts">
        <li>Each sign at its real length, as the model was built: right first time {pct(asl.top1)}.</li>
        <li>Left-dominant signers {pct(asl.left_dominant_top1)}, right-dominant {pct(asl.right_dominant_top1)}: a gap SignMate is working to close.</li>
        <li>One-handed signs {pct(asl.one_handed.top1)} ({asl.one_handed.samples.toLocaleString("en")} signs). Two-handed signs: only {asl.two_handed.samples} in the test set, so no reliable number.</li>
        <li>When the model is at least {Math.round(asl.accept_at * 100)} % sure (SignMate then shows the word large), it covered {pct(asl.sure_share)} of signs and {pct(asl.right_when_sure)} of those were right. Even then, nothing is spoken until you confirm.</li>
        {asl.status !== "complete" && <li>Per-sign results and the confusion matrix come with the next measurement run.</li>}
        <li>No sign is validated by our Deaf reviewers yet. Real signing at a laptop or phone camera can differ from this dataset. Source: <code>{asl.source}</code>.</li>
      </ul>
      {Object.keys(asl.paths || {}).length > 0 && <table className="report-table"><thead><tr><th>How the model was run</th><th>Signs</th><th>Top-1</th><th>Top-5</th><th>Left − right</th><th>Calibration error</th></tr></thead>
        <tbody>{Object.entries(asl.paths).map(([name, p]) => <tr key={name}><td>{p.title}</td><td>{p.samples.toLocaleString("en")}</td><td>{pct(p.top1)}</td><td>{pct(p.top5)}</td><td>{p.left_right_gap == null ? "—" : `${(p.left_right_gap * 100).toFixed(1)} points`}</td><td>{p.ece == null ? "—" : p.ece.toFixed(3)}</td></tr>)}</tbody></table>}
    </div>}

    {performance?.measurements?.length > 0 && <div className="panel report-body"><span className="section-kicker">SPEED</span><h2>Measured speed</h2>
      <table className="report-table"><thead><tr><th>What</th><th>Result</th><th>Where</th><th>When</th></tr></thead>
        <tbody>{performance.measurements.map((m) => <tr key={m.what + m.where}><td>{m.what}</td><td>{m.result}</td><td>{m.where}</td><td>{m.date}</td></tr>)}</tbody></table>
      <p className="asl-credit">Source: <code>{performance.source}</code>. {performance.note || ""}</p></div>}
  </>;
}

export function Credits() {
  const pages = usePages();
  if (!pages) return <p role="status">Loading…</p>;
  const credits = pages.credits || { assets: [], software: [] };
  return <>
    <div className="section-intro"><div><span className="section-kicker">FROM data/LICENSES.yaml</span><h1>Credits and licences</h1><p>SignMate is built on other people's work. Every dataset and model it uses is listed here with the credit its licence asks for.</p></div></div>
    <div className="panel report-body"><h2>Data and models</h2>
      <table className="report-table"><thead><tr><th>What</th><th>Used for</th><th>Licence</th><th>Credit</th></tr></thead>
        <tbody>{credits.assets.map((a) => <tr key={a.id}><td>{a.source_url?.startsWith("http") ? <a href={a.source_url} target="_blank" rel="noreferrer">{a.name}</a> : a.name}</td><td>{a.used_for}</td><td>{a.licence}</td><td>{a.attribution}</td></tr>)}</tbody></table></div>
    <div className="panel report-body"><h2>Software</h2>
      <table className="report-table"><thead><tr><th>Package</th><th>Version</th><th>Licence</th></tr></thead>
        <tbody>{credits.software.map((s) => <tr key={s.name}><td>{s.name}</td><td>{s.version}</td><td>{s.licence}</td></tr>)}</tbody></table></div>
  </>;
}

export function WhatsNew() {
  const pages = usePages();
  if (!pages) return <p role="status">Loading…</p>;
  return <>
    <div className="section-intro"><div><span className="section-kicker">SIGNMATE · ASL</span><h1>What's new</h1><p>What changed since the previous version of this website.</p></div></div>
    {(pages.whats_new || []).map((section) => <div className="panel report-body" key={section.title}><h2>{section.title}</h2><ul className="report-facts">{section.items.map((item) => <li key={item}>{item}</li>)}</ul></div>)}
  </>;
}
