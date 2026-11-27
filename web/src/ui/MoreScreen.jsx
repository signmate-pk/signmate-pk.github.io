// More: everything that is not the live camera. About (who SignMate is for, how it works, what comes next), the
// guided tour, how well it works, settings, credits. SignMate is a website only: no install, no offline copy.
import React, { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import QrCode from "./QrCode.jsx";
import { LIVE_URL } from "./site.js";
import { assetUrl } from "../paths.js";

const LINKS = [
  { to: "#/about", icon: "heart", title: "About SignMate", sub: "Who it is for, how it works, what comes next" },
  { to: "#/tour", icon: "play", title: "Guided tour", sub: "One minute, no camera needed" },
  { to: "#/report", icon: "chart", title: "How well it works", sub: "Every number measured, with its test and date" },
  { to: "#/settings", icon: "settings", title: "Settings", sub: "Voice, pause length, learning, large text, developer panel" },
  { to: "#/credits", icon: "info", title: "Credits & licences", sub: "Datasets, models and the people behind them" },
  { to: "#/whats-new", icon: "sparkle", title: "What's new", sub: "" },
];

export default function MoreScreen() {
  return <div className="screen screen-more">
    <h1 className="screen-title">More</h1>
    <nav className="link-list" aria-label="More">
      {LINKS.map((link) => <a key={link.to} href={link.to} className="link-row"><span className="link-icon"><Icon name={link.icon} /></span><span><b>{link.title}</b>{link.sub && <small>{link.sub}</small>}</span><Icon name="arrow" size={18} /></a>)}
    </nav>
    <section className="card qr-card">
      <QrCode text={LIVE_URL} size={112} />
      <div><h2>Share SignMate</h2><p className="muted">Scan with a phone camera. Free, no account, works in the browser.</p><p dir="ltr"><b>{LIVE_URL.replace("https://", "")}</b></p></div>
    </section>
  </div>;
}

const pct = (v) => (v == null ? "—" : `${(v * 100).toFixed(1)} %`);

// The headline numbers come from shared_data/asl_results.json (built from the committed Kaggle results by
// tools/asl_results.py), never typed here.
function useResults() {
  const [results, setResults] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch(assetUrl("asl_results.json")).then((r) => (r.ok ? r.json() : null)).then((data) => { if (alive) setResults(data); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return results;
}

export function AboutPage({ signs }) {
  const results = useResults();
  const h = results?.headline;
  const when = results?.measured_on?.slice(0, 10);
  return <article className="screen prose">
    <a className="back" href="#/more"><Icon name="back" size={18} />More</a>
    <h1>Talk face to face.</h1>
    <p className="lead">SignMate turns American Sign Language (ASL) into English words, in the browser, on the person's own device. It is built in Pakistan, with no account and no server: the camera picture never leaves the device.</p>
    <h2>Why ASL</h2>
    <p>SignMate began with Pakistan Sign Language. For ASL, large collections of signs recorded with the consent of Deaf signers exist under licences that allow this use; for PSL they do not yet, and the PSL version was right first time on only about a third of one new signer's signs. With ASL, SignMate can be honest and useful at the same time. The PSL version is archived, not forgotten.</p>
    <h2>Where it helps</h2>
    <ul className="cards-list">
      <li><b>At a counter.</b> A Deaf person signs a few words; the hearing person reads them, and writes back in large type.</li>
      <li><b>Learning ASL.</b> The gallery lists all {signs || 250} signs; practise one and the camera tells you whether it read it.</li>
      <li><b>Between friends and family.</b> Short exchanges that today need pen and paper.</li>
    </ul>
    <p className="note"><Icon name="info" size={18} />A helper, not an interpreter. For medical, legal or emergency decisions, use a qualified interpreter when you can.</p>
    <h2>How it works</h2>
    <ol className="pipeline">
      <li><b>Track.</b> MediaPipe finds the hands, the face and the upper body in each camera frame, on the device.</li>
      <li><b>Cut.</b> A sign starts when the hands come up and ends when they come down.</li>
      <li><b>Read.</b> The 1st-place model of Google's Isolated Sign Language Recognition competition (Hoyeol Sohn, MIT licence) reads the movement of the hands, lips, nose and eyes and ranks its 250 signs. It runs in a background thread.</li>
      <li><b>Check.</b> Sure answers are shown large; unsure ones become "Which one did you sign?"; unclear ones get a gentle hint. Nothing is spoken until the signer confirms.</li>
    </ol>
    <h2>Honest about today</h2>
    <p>On the GISLR rerun set ({results?.dataset?.samples_evaluated?.toLocaleString("en") ?? "—"} signs by Deaf signers the model was not trained on, as reported by the dataset's publisher), measured on {when ?? "—"}: the model was right first time on {pct(h?.native_top1)} of signs, and on {pct(h?.browser_top1)} the way this website runs it ({h?.browser_frames ?? "—"} frames). The right sign was in its top five {pct(h?.native_top5)} of the time. Real signing in front of a laptop or phone camera can differ, which is why SignMate always asks. No sign is validated by our Deaf reviewers yet. The full numbers are on <a href="#/report">How well it works</a>.</p>
    <h2>What comes next</h2>
    <p>These are aims, not claims. Each step ships only when it is measured.</p>
    <ul className="roadmap">
      <li><b>Now</b>{signs || 250} ASL signs · sentence builder · large-type replies · English.</li>
      <li><b>Next</b>Testing with Deaf ASL signers; fingerspelling of names; live captions while signing; a vocabulary of 1,000 and then 2,000 signs, measured on signers the model never saw.</li>
      <li><b>Then</b>Type → Sign: typed English shown as real, licensed ASL sign recordings, word by word; Urdu captions reviewed by an Urdu editor.</li>
    </ul>
    <h2>Privacy</h2>
    <p>The camera picture never leaves the device. SignMate works with landmark points, not video, keeps them only in memory, and saves nothing unless you choose to. While online, Google's MediaPipe library may send anonymous speed and usage counts, never images. Voice typing on the Reply screen uses the browser's speech service, which may send audio online; typing does not.</p>
    <h2>Built in Pakistan, in the open</h2>
    <p>Code, models and every measurement: <a href="https://github.com/signmate-pk/signmate-pk.github.io" target="_blank" rel="noreferrer">github.com/signmate-pk</a>. Deaf organisations and ASL teachers who want to help shape SignMate are welcome.</p>
  </article>;
}

export function SettingsPage({ settings, setSettings, personal, onForget, onPresentation }) {
  const set = (patch) => setSettings((s) => ({ ...s, ...patch }));
  return <div className="screen">
    <a className="back" href="#/more"><Icon name="back" size={18} />More</a>
    <h1 className="screen-title">Settings</h1>
    <section className="card settings">
      <label className="switch-row"><input type="checkbox" checked={settings.voice} onChange={(e) => set({ voice: e.target.checked })} /><span><b>Speak aloud</b><small>Uses the voices on this device. The words are always shown too.</small></span></label>
      <label className="range-row"><span><b>Voice speed</b><small>{settings.rate.toFixed(2)}×</small></span><input type="range" min="0.75" max="1.5" step="0.05" value={settings.rate} onChange={(e) => set({ rate: Number(e.target.value) })} /></label>
      <label className="range-row"><span><b>Pause before a word joins the sentence</b><small>{(settings.pauseMs / 1000).toFixed(1)} s</small></span><input type="range" min="800" max="2500" step="100" value={settings.pauseMs} onChange={(e) => set({ pauseMs: Number(e.target.value) })} /></label>
      <label className="switch-row"><input type="checkbox" checked={settings.learn} onChange={(e) => set({ learn: e.target.checked })} /><span><b>Learn my signing</b><small>When you confirm a sign, SignMate nudges its guesses towards your signing. Saved only in this browser{personal ? ` (${personal} confirmations so far)` : ""}.</small></span></label>
      <button className="btn btn-quiet btn-sm" onClick={onForget}><Icon name="clear" size={16} />Forget what it learned</button>
      <label className="switch-row"><input type="checkbox" checked={settings.largeText} onChange={(e) => set({ largeText: e.target.checked })} /><span><b>Large text</b><small>Bigger words, sentences, captions and buttons on every screen. Also ?large=1 in the address.</small></span></label>
      <label className="switch-row"><input type="checkbox" checked={settings.devHud} onChange={(e) => set({ devHud: e.target.checked })} /><span><b>Developer panel</b><small>Frame rate, tracking and model times, backends. Also ?debug=1 or the D key.</small></span></label>
      <button className="btn btn-glass" onClick={onPresentation}><Icon name="presentation" />Presentation mode (full screen, larger text)</button>
    </section>
  </div>;
}
