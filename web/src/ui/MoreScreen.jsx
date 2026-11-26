// More: everything that is not the live camera. About (who SignMate is for, how it works, the roadmap),
// settings, the phrasebook, the offline helper, offline saving and install, and the local-server tools.
import React, { useMemo, useState } from "react";
import Icon from "./Icon.jsx";
import QrCode from "./QrCode.jsx";
import CameraStage from "./CameraStage.jsx";
import { LIVE_URL } from "./site.js";
import { HAS_SERVER, API_BASE } from "../paths.js";
import { normalizeLandmarks } from "../vision.js";

const LINKS = [
  { to: "#/about", icon: "heart", en: "About SignMate", ur: "سائن میٹ کے بارے میں", sub: "Who it is for, how it works, what comes next" },
  { to: "#/tour", icon: "play", en: "Guided tour", ur: "تعارفی ٹور", sub: "One minute, no camera needed" },
  { to: "#/dictionary", icon: "book", en: "PSL dictionary", ur: "پی ایس ایل لغت", sub: "788 signs with real signer videos" },
  { to: "#/phrases", icon: "chat", en: "Phrasebook", ur: "جملوں کی کتاب", sub: "Everyday phrases in English and Urdu, with speech" },
  { to: "#/helper", icon: "sparkle", en: "Ask SignMate", ur: "سائن میٹ سے پوچھیں", sub: "An offline helper that answers from SignMate's own data" },
  { to: "#/report", icon: "chart", en: "How well it works", ur: "یہ کتنا درست ہے", sub: "Every number measured, with its test and date" },
  { to: "#/asl", icon: "globe", en: "ASL mode", ur: "اے ایس ایل موڈ", sub: "American Sign Language, a separate language and model" },
  { to: "#/settings", icon: "settings", en: "Settings", ur: "ترتیبات", sub: "Voice, pause length, learning, developer panel" },
  { to: "#/credits", icon: "info", en: "Credits & licences", ur: "حوالہ جات", sub: "Datasets, models and the people behind them" },
  { to: "#/whats-new", icon: "sparkle", en: "What's new", ur: "نیا کیا ہے", sub: "" },
];

export default function MoreScreen({ lang, offline, onSaveOffline, install }) {
  const ui = lang === "ur" ? "ur" : "en";
  const links = HAS_SERVER ? [...LINKS, { to: "#/teach", icon: "hand", en: "Teach a sign (this computer)", ur: "اشارہ سکھائیں", sub: "Optional personal signs, only on this computer" }] : LINKS;
  return <div className="screen screen-more">
    <h1 className="screen-title">{ui === "ur" ? "مزید" : "More"}</h1>
    <nav className="link-list" aria-label="More">
      {links.map((link) => <a key={link.to} href={link.to} className="link-row"><span className="link-icon"><Icon name={link.icon} /></span><span><b>{link[ui]}</b>{link.sub && <small>{link.sub}</small>}</span><Icon name="arrow" size={18} /></a>)}
    </nav>
    <section className="card">
      <h2>{ui === "ur" ? "انٹرنیٹ کے بغیر" : "Use it without internet"}</h2>
      <p className="muted">{ui === "ur" ? "ایک بار محفوظ کریں، پھر سائن میٹ آف لائن بھی چلے گا۔" : "Save once and SignMate keeps working offline: camera, model, dictionary videos."}</p>
      <div className="row-wrap">
        {offline.totalBytes ? <button className="btn btn-primary" onClick={onSaveOffline} disabled={offline.status === "saving" || offline.status === "saved"}><Icon name="download" />{offline.status === "saved" ? "Saved: works offline" : offline.status === "saving" ? `Saving… ${offline.total ? Math.round((100 * offline.done) / offline.total) : 0} %` : `Save for offline use (${Math.round(offline.totalBytes / 1e6)} MB)`}</button> : <span className="muted small">Offline saving is available on the published site.</span>}
        {install.available && <button className="btn btn-glass" onClick={install.prompt}><Icon name="install" />{ui === "ur" ? "ایپ کی طرح انسٹال کریں" : "Install as an app"}</button>}
      </div>
      {offline.status === "error" && <p className="muted small">Offline saving failed: {offline.message}</p>}
    </section>
    <section className="card qr-card">
      <QrCode text={LIVE_URL} size={112} />
      <div><h2>{ui === "ur" ? "کسی کے ساتھ شیئر کریں" : "Share SignMate"}</h2><p className="muted">{ui === "ur" ? "کیمرے سے اسکین کریں۔ مفت، بغیر اکاؤنٹ کے۔" : "Scan with a phone camera. Free, no account, works in the browser."}</p><p dir="ltr"><b>{LIVE_URL.replace("https://", "")}</b></p></div>
    </section>
  </div>;
}

const pct = (v) => (v == null ? "—" : `${(v * 100).toFixed(1)} %`);

export function AboutPage({ lang, signs, metrics }) {
  const ui = lang === "ur" ? "ur" : "en";
  const fair = metrics?.device_held_out;
  const solo = metrics?.independent_signer;
  const count = (rate) => (solo ? Math.round(rate * solo.samples) : "—");
  return <article className="screen prose">
    <a className="back" href="#/more"><Icon name="back" size={18} />{ui === "ur" ? "واپس" : "More"}</a>
    <h1>{ui === "ur" ? "آمنے سامنے بات کیجیے۔" : "Talk face to face."}</h1>
    <p className="lead">SignMate is a pocket companion for everyday conversations between Deaf people who sign Pakistan Sign Language and hearing people who speak Urdu or English. It runs in any modern browser, on the phone people already own, with no account and no server.</p>
    <h2>Where it helps</h2>
    <ul className="cards-list">
      <li><b>At a clinic or pharmacy counter.</b> A patient signs <i>help</i>, <i>doctor</i>, <i>where</i>; the receptionist replies in writing and sees the words in large type.</li>
      <li><b>In class.</b> Hearing classmates and teachers learn signs in the gallery and practise with live feedback.</li>
      <li><b>At a shop, a bank, an office.</b> Short exchanges that today need pen and paper.</li>
      <li><b>At home.</b> Hearing family members who are learning PSL check their signing.</li>
    </ul>
    <p className="note"><Icon name="info" size={18} />A helper, not an interpreter. For medical, legal or emergency decisions, use a qualified interpreter when you can.</p>
    <h2>How it works</h2>
    <ol className="pipeline">
      <li><b>Track.</b> MediaPipe finds 21 points on each hand (and the shoulders) in every camera frame, on the device.</li>
      <li><b>Cut.</b> A sign starts when the hands come up and ends when they come down.</li>
      <li><b>Read.</b> A 1.9 MB int8 model reads the whole movement (32 frames of both hands, measured relative to the wrist and scaled by hand size) and gives calibrated probabilities. It runs in a background thread.</li>
      <li><b>Check.</b> Sure answers are shown large; unsure ones become "Which one did you sign?"; unclear ones get a gentle hint. Nothing is spoken until the signer confirms.</li>
    </ol>
    <h2>Honest about today</h2>
    <p>The camera knows {signs} signs, learned from a public PSL dataset (SignSpeak, COMSATS Abbottabad). On {fair?.fair_test?.samples ?? "—"} phone recordings it had not seen it was right {pct(fair?.top1)} of the time, but those may include people it learned from. On one completely new signer it was right first time on {count(solo?.top1)} of {solo?.samples ?? "—"} signs and had the right sign in its top five for {count(solo?.top5)}. That is why it always asks. The full numbers, with their tests and dates, are on <a href="#/report">How well it works</a>.</p>
    <h2>What comes next</h2>
    <p>These are aims, not claims. Each step ships only when it is measured.</p>
    <ul className="roadmap">
      <li><b>Now</b>{signs} signs · sentence builder · replies with real PSL videos · works offline · Urdu, Roman Urdu and English.</li>
      <li><b>Next</b>Testing with Deaf PSL users through partner organisations; per-sign confidence; recordings of resting hands so fewer false signs; an Urdu-first interface reviewed by an Urdu editor.</li>
      <li><b>Then</b>500 signs chosen by need, recorded with consent and checked by Deaf validators; accuracy measured on signers the model never saw, in at least three cities.</li>
      <li><b>Later</b>Continuous signing for one everyday setting (a clinic or a shop); finger-spelling of names; an Android app built on the same model files.</li>
    </ul>
    <h2>Privacy</h2>
    <p>The camera picture never leaves the device. SignMate works with hand points, not video, keeps them only in memory, and saves nothing unless you choose to. While online, Google's MediaPipe library may send anonymous speed and usage counts, never images. Voice typing on the Reply screen uses the browser's speech service, which may send audio online; typing does not.</p>
    <h2>Built in Pakistan, in the open</h2>
    <p>Code, model and every measurement: <a href="https://github.com/signmate-pk/signmate-pk.github.io" target="_blank" rel="noreferrer">github.com/signmate-pk</a>. Deaf organisations, schools and clinics who want to help shape SignMate are welcome; that is how it grows.</p>
  </article>;
}

export function SettingsPage({ lang, settings, setSettings, personal, onForget, onPresentation }) {
  const ui = lang === "ur" ? "ur" : "en";
  const set = (patch) => setSettings((s) => ({ ...s, ...patch }));
  return <div className="screen">
    <a className="back" href="#/more"><Icon name="back" size={18} />{ui === "ur" ? "واپس" : "More"}</a>
    <h1 className="screen-title">{ui === "ur" ? "ترتیبات" : "Settings"}</h1>
    <section className="card settings">
      <label className="switch-row"><input type="checkbox" checked={settings.voice} onChange={(e) => set({ voice: e.target.checked })} /><span><b>Speak aloud</b><small>Uses the voices on this device. The words are always shown too.</small></span></label>
      <label className="range-row"><span><b>Voice speed</b><small>{settings.rate.toFixed(2)}×</small></span><input type="range" min="0.75" max="1.5" step="0.05" value={settings.rate} onChange={(e) => set({ rate: Number(e.target.value) })} /></label>
      <label className="range-row"><span><b>Pause before a word joins the sentence</b><small>{(settings.pauseMs / 1000).toFixed(1)} s</small></span><input type="range" min="800" max="2500" step="100" value={settings.pauseMs} onChange={(e) => set({ pauseMs: Number(e.target.value) })} /></label>
      <label className="switch-row"><input type="checkbox" checked={settings.learn} onChange={(e) => set({ learn: e.target.checked })} /><span><b>Learn my signing</b><small>When you confirm a sign, SignMate nudges its guesses towards your signing. Saved only in this browser{personal ? ` (${personal} confirmations so far)` : ""}.</small></span></label>
      <button className="btn btn-quiet btn-sm" onClick={onForget}><Icon name="clear" size={16} />Forget what it learned</button>
      <label className="switch-row"><input type="checkbox" checked={settings.devHud} onChange={(e) => set({ devHud: e.target.checked })} /><span><b>Developer panel</b><small>Frame rate, tracking and model times, backends. Also ?debug=1 or the D key.</small></span></label>
      <button className="btn btn-glass" onClick={onPresentation}><Icon name="presentation" />Presentation mode (full screen, larger text)</button>
    </section>
  </div>;
}

export function PhrasebookPage({ vocabulary, lang, onSpeak }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const categories = useMemo(() => ["All", ...new Set(vocabulary.map((v) => v.category))], [vocabulary]);
  const shown = vocabulary.filter((v) => (category === "All" || v.category === category) && (!query.trim() || `${v.english} ${v.urdu} ${v.romanUrdu}`.toLowerCase().includes(query.trim().toLowerCase())));
  return <div className="screen">
    <a className="back" href="#/more"><Icon name="back" size={18} />More</a>
    <h1 className="screen-title">Phrasebook</h1>
    <p className="muted">Tap a phrase to hear it. These are written phrases; the signs the camera knows are on the Words tab.</p>
    <label className="search"><Icon name="search" size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search English, Urdu, Roman Urdu" aria-label="Search phrases" dir="auto" /></label>
    <div className="segmented scroll" role="group" aria-label="Category">{categories.map((c) => <button key={c} className={category === c ? "on" : ""} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}</div>
    <ul className="sign-grid">{shown.map((v) => <li key={v.id}><button className="sign-card" onClick={() => onSpeak(v)}><strong dir="auto" className={lang === "ur" ? "urdu" : ""}>{lang === "ur" ? v.urdu : lang === "roman" ? v.romanUrdu : v.english}</strong><small dir="auto" className={lang === "en" ? "urdu" : ""}>{lang === "en" ? v.urdu : v.english}</small><span className="sign-card-meta"><Icon name="speak" size={12} />{v.category}</span></button></li>)}</ul>
  </div>;
}

// Optional personal signs (Tier C) on the local SignMate server: save consented hand-point examples and try
// the personal model. Only shown when the server runs (start_signbridge.bat); never needed for SignMate.
async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || `Request failed (${response.status})`);
  return response.headers.get("content-type")?.includes("application/json") ? response.json() : response.text();
}

function mainHand(hands) {
  let best = null;
  let bestSize = -1;
  for (const hand of hands || []) {
    const xs = hand.landmarks.map((r) => r[0]);
    const ys = hand.landmarks.map((r) => r[1]);
    const size = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    if (size > bestSize) { best = hand; bestSize = size; }
  }
  return best && { points: best.landmarks.map(([x, y, z]) => ({ x, y, z })), handedness: best.handedness || "Right" };
}

export function TeachPage({ bundle, lang, vocabulary, cameraWanted, setCameraWanted }) {
  const [features, setFeatures] = useState(null);
  const [selected, setSelected] = useState("");
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState("");
  const [tryIt, setTryIt] = useState(false);
  const [guess, setGuess] = useState(null);
  const busy = React.useRef(false);
  const onEvent = (event) => {
    if (event.type !== "hand-points") return;
    const hand = mainHand(event.hands);
    if (!hand) return;
    let f = null;
    try { f = normalizeLandmarks(hand.points, hand.handedness); } catch { return; }
    setFeatures(f);
    if (tryIt && !busy.current) {
      busy.current = true;
      request("/predict", { method: "POST", body: JSON.stringify({ features: f }) }).then((p) => setGuess(vocabulary.find((v) => v.id === p.vocabulary_id) || null)).catch(() => setGuess(null)).finally(() => { busy.current = false; });
    }
  };
  const save = async () => {
    if (!consent) { setMessage("Tick the consent box first."); return; }
    if (!features) { setMessage("Show your hand to the camera first."); return; }
    if (!selected) { setMessage("Choose the phrase this example is for."); return; }
    try {
      const response = await request("/recordings", { method: "POST", body: JSON.stringify({ consent: true, examples: [{ vocabulary_id: selected, participant: "anonymous", session_id: `web-${Date.now()}`, features, frame_width: 0, frame_height: 0 }] }) });
      setMessage(`${response.saved} example saved on this computer (hand points only, no image).`);
    } catch (error) { setMessage(error.message); }
  };
  return <div className="screen">
    <a className="back" href="#/more"><Icon name="back" size={18} />More</a>
    <h1 className="screen-title">Teach a sign · optional</h1>
    <p className="muted">SignMate never needs this. On this computer you can save examples of your own signs; a model trained from them gives "Personal" (Tier C) results that are only for you.</p>
    <CameraStage bundle={bundle} wanted={cameraWanted} onWant={setCameraWanted} lang={lang} onEvent={onEvent} variant="medium" emitHandsEvery={6}>
      {tryIt && guess ? <div className="result-card glass"><p className="result-title">Personal sign · Tier C: <b>{guess.english}</b></p></div> : null}
    </CameraStage>
    <section className="card settings">
      <label className="field"><span>Phrase</span><select value={selected} onChange={(e) => setSelected(e.target.value)}><option value="">Choose a phrase</option>{vocabulary.map((v) => <option key={v.id} value={v.id}>{v.english}</option>)}</select></label>
      <label className="switch-row"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span><b>I agree</b><small>Save this example (hand points only) on this computer for my personal signs. No image or video is saved.</small></span></label>
      <div className="row-wrap"><button className="btn btn-primary" onClick={save}>Save this example</button><label className="switch-row inline"><input type="checkbox" checked={tryIt} onChange={(e) => setTryIt(e.target.checked)} /><span><b>Try my personal signs</b></span></label></div>
      <p role="status" className="muted">{message || (features ? "An example is ready to save." : "Turn on the camera and show your sign.")}</p>
      <a className="btn btn-quiet btn-sm" href={`${API_BASE}/training-data.csv`}>Download examples (CSV)</a>
    </section>
  </div>;
}
