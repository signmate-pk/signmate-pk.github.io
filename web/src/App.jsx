// SignMate's translator page (/translate/). American Sign Language only (CLAUDE.md 10.1); a website, not an app
// (CLAUDE.md 10.7). Four places, one tap away on a phone:
//   Words      one sign at a time: camera, confirm, speak; the 250-sign gallery with practice
//   Sentences  sign several words, fix them in the tray, speak the sentence
//   Reply      the hearing person's side: large type, voice typing
//   More       about, guided tour, how well it works, settings, credits, what's new
// The guided tour (#/tour, #/demo) works with no camera. Rules: every sign is a suggestion the person confirms
// before anything is spoken (no sign is validated by Deaf reviewers yet); nothing leaves the device.
// Master-v4 Stage 3 replaces this interface with the minimal Sign / Type / Learn shell.
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadAslSpec } from "./asl_islr.js";
import { loadAslLabels } from "./asl_client.js";
import { adapt, forgetPersonal, learn, loadPersonal, savePersonal } from "./personal.js";
import { aslSigns } from "./recognition/asl_model.js";
import { warmUp } from "./recognition/engine.js";
import Icon, { BrandMark } from "./ui/Icon.jsx";
import { t } from "./ui/i18n.js";
import { cameraSigns } from "./ui/signs.js";
import { canSpeak, speak, wordLines } from "./ui/speech.js";
import WordsScreen from "./ui/WordsScreen.jsx";
import SentencesScreen from "./ui/SentencesScreen.jsx";
import ReplyScreen from "./ui/ReplyScreen.jsx";
import MoreScreen, { AboutPage, SettingsPage } from "./ui/MoreScreen.jsx";
import Onboarding from "./ui/Onboarding.jsx";
import DevHud from "./ui/DevHud.jsx";

const TourScreen = lazy(() => import("./ui/TourScreen.jsx"));
const HowWellItWorks = lazy(() => import("./SitePages.jsx").then((m) => ({ default: m.HowWellItWorks })));
const Credits = lazy(() => import("./SitePages.jsx").then((m) => ({ default: m.Credits })));
const WhatsNew = lazy(() => import("./SitePages.jsx").then((m) => ({ default: m.WhatsNew })));

const CONSENT_KEY = "signbridge_mediapipe_metrics_consent"; // same key as before: returning visitors keep their answer
const ONBOARD_KEY = "signmate_onboarded_v1";
const SETTINGS_KEY = "signmate_settings_v1";
const LANG = "en"; // English only until an Urdu editor has reviewed translations (docs/v4_owner_decisions.md, item 2)
const DEFAULT_SETTINGS = { voice: true, rate: 0.95, pauseMs: 1200, learn: true, devHud: false, largeText: false };
const TABS = [["words", "hand", "tabWords"], ["sentences", "sentence", "tabSentences"], ["reply", "reply", "tabReply"], ["more", "more", "tabMore"]];
const MORE_ROUTES = new Set(["more", "about", "report", "settings", "credits", "whats-new"]);
// Routes of the PSL version that no longer exist go to the camera.
const GONE = new Set(["asl", "dictionary", "helper", "phrases", "teach"]);

const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode: this visit only */ } },
};

function routeFromHash() {
  const route = (window.location.hash || "").replace(/^#\/?/, "").split("?")[0] || "words";
  if (route === "demo") return "tour";
  return GONE.has(route) ? "words" : route;
}

export default function App() {
  const [route, setRoute] = useState(routeFromHash);
  const [settings, setSettings] = useState(() => { try { return { ...DEFAULT_SETTINGS, ...JSON.parse(store.get(SETTINGS_KEY, "{}")) }; } catch { return DEFAULT_SETTINGS; } });
  const [bundle, setBundle] = useState({ status: "loading" });
  const [cameraWanted, setCameraWanted] = useState(false);
  const [consented, setConsented] = useState(() => store.get(CONSENT_KEY, "") === "yes");
  const [onboarding, setOnboarding] = useState(() => store.get(ONBOARD_KEY, "") !== "yes" && routeFromHash() !== "tour");
  const [engine, setEngine] = useState(null);
  const [caption, setCaption] = useState(null);
  const [history, setHistory] = useState([]);
  const [presenting, setPresenting] = useState(false);
  const [devHud, setDevHud] = useState(() => new URLSearchParams(window.location.search).has("debug") || settings.devHud);
  // Large text: the Settings switch, or ?large=1 for this visit (the project page's demo offers it).
  const [largeFromUrl] = useState(() => new URLSearchParams(window.location.search).has("large"));
  const largeText = settings.largeText || largeFromUrl;
  const personalRef = useRef(null);
  const [personalCount, setPersonalCount] = useState(0);
  const captionTimer = useRef(0);
  const lang = LANG;

  useEffect(() => { store.set(SETTINGS_KEY, JSON.stringify(settings)); }, [settings]);
  useEffect(() => { setDevHud((v) => v || settings.devHud); }, [settings.devHud]);
  useEffect(() => { if (GONE.has((window.location.hash || "").replace(/^#\/?/, "").split("?")[0])) window.location.replace("#/words"); }, []);

  useEffect(() => {
    const onHash = () => { setRoute(routeFromHash()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // The ASL spec (the sign cutter's rules, the model's SHA-256) and the model's 250 labels: loaded once.
  useEffect(() => {
    let alive = true;
    loadAslSpec().then(async (aslSpec) => {
      const labels = await loadAslLabels(aslSpec);
      if (!alive) return;
      const version = `asl-${aslSpec.model.sha256.slice(0, 12)}`;
      personalRef.current = loadPersonal(version, labels.length);
      setPersonalCount(personalRef.current.confirmed);
      setBundle({ status: "ready", aslSpec, labels, signs: aslSigns(labels, aslSpec), version });
    }).catch((error) => { if (alive) setBundle({ status: "missing", message: String(error?.message || error) }); });
    return () => { alive = false; };
  }, []);

  // Warm MediaPipe and the model in the background on camera screens, so "Turn on camera" is quick. Only for
  // visitors who have used the camera before: a first visit must not download ~30 MB of trackers unasked
  // (prepaid mobile data), and never in data-saver mode.
  useEffect(() => {
    if (!consented || bundle.status !== "ready" || !["words", "sentences"].includes(route) || navigator.connection?.saveData) return undefined;
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
    const cancel = window.cancelIdleCallback || clearTimeout;
    const id = idle(() => { try { warmUp({ aslSpec: bundle.aslSpec, labels: bundle.labels }); } catch { /* the stage reports errors */ } }, { timeout: 4000 });
    return () => cancel(id);
  }, [bundle, route, consented]);

  useEffect(() => { if (engine) engine.setAdjust((scores) => (settings.learn && personalRef.current ? adapt(scores, personalRef.current) : scores)); }, [engine, settings.learn]);

  // The camera turns on only after the privacy notice has been seen once.
  const wantCamera = useCallback((on) => {
    if (on && !consented) { setOnboarding(true); return; }
    setCameraWanted(on);
  }, [consented]);
  const acceptAndStart = () => {
    store.set(CONSENT_KEY, "yes");
    store.set(ONBOARD_KEY, "yes");
    setConsented(true);
    setOnboarding(false);
    if (!["words", "sentences"].includes(route)) window.location.hash = "#/words";
    setCameraWanted(true);
  };

  const showCaption = (text, note) => {
    clearTimeout(captionTimer.current);
    setCaption({ text, note });
    captionTimer.current = setTimeout(() => setCaption(null), Math.max(3500, text.length * 110));
  };
  const say = (lines) => {
    let note = null;
    if (settings.voice) {
      const out = speak(lines, lang, { rate: settings.rate });
      if (out.fallback === "none" || !canSpeak()) note = t("noVoice", lang);
    }
    showCaption(lines.en, note);
  };

  const learnFrom = (entry, scores) => {
    if (!settings.learn || !scores || !personalRef.current || entry?.index == null) return;
    personalRef.current = learn(personalRef.current, scores, entry.index);
    savePersonal(personalRef.current);
    setPersonalCount(personalRef.current.confirmed);
  };
  const confirmWord = (entry, result) => {
    navigator.vibrate?.([40, 40, 40]);
    say(wordLines(entry));
    learnFrom(entry, result?.scores);
    setHistory((h) => [...h, wordLines(entry)].slice(-20));
  };
  const speakSentence = (words, lines) => {
    navigator.vibrate?.([40, 40, 40]);
    say(lines);
    for (const word of words) learnFrom(word, word.scores);
    setHistory((h) => [...h, lines].slice(-20));
  };
  const forget = () => { forgetPersonal(); if (bundle.version) personalRef.current = loadPersonal(bundle.version, bundle.labels.length); setPersonalCount(0); };
  const presentation = () => {
    setPresenting(true);
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    window.location.hash = "#/sentences";
  };

  useEffect(() => {
    const onKey = (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "d") setDevHud((v) => !v);
      else if (key === "q") setCameraWanted(false);
      else if (key === "escape" && presenting) { setPresenting(false); if (document.fullscreenElement) document.exitFullscreen?.(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presenting]);

  const signs = useMemo(() => cameraSigns(bundle.signs), [bundle.signs]);
  const replyEntries = useMemo(() => signs.map((entry) => ({ id: entry.gloss, english: entry.english, aliases: entry.english.split(" / ") })), [signs]);
  const activeTab = MORE_ROUTES.has(route) ? "more" : route;
  const fallback = <p className="screen muted" role="status">Loading…</p>;
  const back = <a className="back" href="#/more"><Icon name="back" size={18} />More</a>;

  let content;
  if (route === "sentences") content = <SentencesScreen bundle={bundle} lang={lang} cameraWanted={cameraWanted} setCameraWanted={wantCamera} onEngine={setEngine} onSpeakSentence={speakSentence} pauseMs={settings.pauseMs} />;
  else if (route === "reply") content = <ReplyScreen entries={replyEntries} lang={lang} history={history} />;
  else if (route === "more") content = <MoreScreen lang={lang} />;
  else if (route === "about") content = <AboutPage lang={lang} signs={signs.length} />;
  else if (route === "settings") content = <SettingsPage lang={lang} settings={settings} setSettings={setSettings} personal={personalCount} onForget={forget} onPresentation={presentation} />;
  else if (route === "tour") content = <Suspense fallback={fallback}><TourScreen bundle={bundle} lang={lang} voiceOn={settings.voice} onCaption={(text) => showCaption(text, null)} onDone={() => { window.location.hash = "#/words"; wantCamera(true); }} /></Suspense>;
  else if (route === "report") content = <div className="screen legacy">{back}<Suspense fallback={fallback}><HowWellItWorks /></Suspense></div>;
  else if (route === "credits") content = <div className="screen legacy">{back}<Suspense fallback={fallback}><Credits /></Suspense></div>;
  else if (route === "whats-new") content = <div className="screen legacy">{back}<Suspense fallback={fallback}><WhatsNew /></Suspense></div>;
  else content = <WordsScreen bundle={bundle} lang={lang} cameraWanted={cameraWanted} setCameraWanted={wantCamera} onEngine={setEngine} onConfirm={confirmWord} onSpeakWord={(entry) => say(wordLines(entry))} />;

  return <div className={`app ${presenting ? "presenting" : ""} ${largeText ? "large-text" : ""}`} dir="ltr">
    <a className="skip" href="#main">Skip to content</a>
    <header className="topbar">
      <a className="brand" href="#/words" aria-label="SignMate home"><BrandMark size={34} /><span><b>SignMate</b><small>American Sign Language</small></span><span className="sl-tag asl" title="Active sign language">ASL</span></a>
      <a className="btn btn-quiet btn-sm" href="../">About the project</a>
      {presenting && <button className="btn btn-quiet btn-sm" onClick={() => { setPresenting(false); if (document.fullscreenElement) document.exitFullscreen?.(); }}>Exit presentation</button>}
    </header>

    <main id="main" tabIndex={-1}>{content}</main>

    <nav className="tabbar" aria-label="Main">
      {TABS.map(([id, icon, key]) => <a key={id} href={`#/${id}`} className={activeTab === id ? "on" : ""} aria-current={activeTab === id ? "page" : undefined}><Icon name={icon} size={22} /><span>{t(key, lang)}</span></a>)}
    </nav>

    {caption && <div className="caption" role="status" aria-live="assertive"><Icon name="speak" size={18} /><div><p>{caption.text}</p>{caption.note && <small>{caption.note}</small>}</div></div>}
    {devHud && <DevHud engine={engine} onClose={() => { setDevHud(false); setSettings((s) => ({ ...s, devHud: false })); }} />}
    {onboarding && <Onboarding lang={lang} signs={signs.length} onCamera={acceptAndStart}
      onTour={() => { store.set(ONBOARD_KEY, "yes"); setOnboarding(false); window.location.hash = "#/tour"; }}
      onBrowse={() => { store.set(ONBOARD_KEY, "yes"); setOnboarding(false); }} />}
  </div>;
}
