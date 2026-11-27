// SignMate's app shell (product UI, 2026-11-26). Four places, one tap away on a phone:
//   Words      one sign at a time: camera, confirm, speak; the sign gallery with practice
//   Sentences  sign several words, fix them in the tray, speak the sentence
//   Reply      the hearing person's side: large type, voice typing, PSL videos
//   More       dictionary, ASL mode, how well it works, helper, phrasebook, settings, offline, about
// The guided tour (#/tour, #/demo) works with no camera. Rules kept from v3: PSL first, ASL separate; every
// PSL sign is a suggestion the person confirms before anything is spoken; nothing leaves the device.
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadPslManifest } from "./psl_client.js";
import { loadPslSpec } from "./psl_hands.js";
import { loadAslSpec } from "./asl_islr.js";
import { assetUrl } from "./paths.js";
import { useClips } from "./SignClip.jsx";
import { offlineSize, saveForOffline } from "./offline.js";
import { adapt, forgetPersonal, learn, loadPersonal, savePersonal } from "./personal.js";
import { warmUp } from "./recognition/engine.js";
import Icon, { BrandMark } from "./ui/Icon.jsx";
import { t } from "./ui/i18n.js";
import { cameraSigns, withRoman } from "./ui/signs.js";
import { canSpeak, speak, wordLines } from "./ui/speech.js";
import WordsScreen from "./ui/WordsScreen.jsx";
import SentencesScreen from "./ui/SentencesScreen.jsx";
import ReplyScreen from "./ui/ReplyScreen.jsx";
import MoreScreen, { AboutPage, PhrasebookPage, SettingsPage, TeachPage } from "./ui/MoreScreen.jsx";
import Onboarding from "./ui/Onboarding.jsx";
import DevHud from "./ui/DevHud.jsx";

const TourScreen = lazy(() => import("./ui/TourScreen.jsx"));
const AslMode = lazy(() => import("./AslMode.jsx"));
const Dictionary = lazy(() => import("./Dictionary.jsx"));
const HelperChat = lazy(() => import("./HelperChat.jsx"));
const HowWellItWorks = lazy(() => import("./SitePages.jsx").then((m) => ({ default: m.HowWellItWorks })));
const Credits = lazy(() => import("./SitePages.jsx").then((m) => ({ default: m.Credits })));
const WhatsNew = lazy(() => import("./SitePages.jsx").then((m) => ({ default: m.WhatsNew })));

const CONSENT_KEY = "signbridge_mediapipe_metrics_consent"; // same key as v3: returning visitors keep their answer
const ONBOARD_KEY = "signmate_onboarded_v1";
const LANG_KEY = "signmate_lang";
const SETTINGS_KEY = "signmate_settings_v1";
const DEFAULT_SETTINGS = { voice: true, rate: 0.95, pauseMs: 1200, learn: true, devHud: false, largeText: false };
const TABS = [["words", "hand", "tabWords"], ["sentences", "sentence", "tabSentences"], ["reply", "reply", "tabReply"], ["more", "more", "tabMore"]];
const MORE_ROUTES = new Set(["more", "about", "dictionary", "asl", "report", "helper", "phrases", "settings", "credits", "whats-new", "teach"]);

const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode: this visit only */ } },
};

function routeFromHash() {
  const route = (window.location.hash || "").replace(/^#\/?/, "").split("?")[0] || "words";
  return route === "demo" ? "tour" : route;
}

export default function App() {
  const [route, setRoute] = useState(routeFromHash);
  const [lang, setLangState] = useState(() => { const v = store.get(LANG_KEY, ""); return ["en", "ur", "roman"].includes(v) ? v : (navigator.language || "").startsWith("ur") ? "ur" : "en"; });
  const [settings, setSettings] = useState(() => { try { return { ...DEFAULT_SETTINGS, ...JSON.parse(store.get(SETTINGS_KEY, "{}")) }; } catch { return DEFAULT_SETTINGS; } });
  const [bundle, setBundle] = useState({ status: "loading" });
  const [vocabulary, setVocabulary] = useState([]);
  const [cameraWanted, setCameraWanted] = useState(false);
  const [consented, setConsented] = useState(() => store.get(CONSENT_KEY, "") === "yes");
  const [onboarding, setOnboarding] = useState(() => store.get(ONBOARD_KEY, "") !== "yes" && routeFromHash() !== "tour");
  const [engine, setEngine] = useState(null);
  const [caption, setCaption] = useState(null);
  const [history, setHistory] = useState([]);
  const [offline, setOffline] = useState({ status: "idle", totalBytes: null });
  const [installEvent, setInstallEvent] = useState(null);
  const [presenting, setPresenting] = useState(false);
  const [devHud, setDevHud] = useState(() => new URLSearchParams(window.location.search).has("debug") || settings.devHud);
  // Large text: the Settings switch, or ?large=1 for this visit (the project page's demo offers it).
  const [largeFromUrl] = useState(() => new URLSearchParams(window.location.search).has("large"));
  const largeText = settings.largeText || largeFromUrl;
  const personalRef = useRef(null);
  const [personalCount, setPersonalCount] = useState(0);
  const pendingAsl = useRef(null);
  const captionTimer = useRef(0);
  const clips = useClips();
  const ui = lang === "ur" ? "ur" : "en";

  const setLang = (value) => { setLangState(value); store.set(LANG_KEY, value); };
  useEffect(() => { store.set(SETTINGS_KEY, JSON.stringify(settings)); }, [settings]);
  useEffect(() => { setDevHud((v) => v || settings.devHud); }, [settings.devHud]);
  useEffect(() => { document.documentElement.lang = ui === "ur" ? "ur" : "en"; }, [ui]);

  useEffect(() => {
    const onHash = () => { setRoute(routeFromHash()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // The PSL bundle, its spec and the sign cutter's rules: loaded once.
  useEffect(() => {
    let alive = true;
    Promise.all([loadPslManifest(), loadPslSpec(), loadAslSpec()]).then(([manifest, spec, aslSpec]) => {
      if (!alive) return;
      personalRef.current = loadPersonal(manifest.version, manifest.classes.length);
      setPersonalCount(personalRef.current.confirmed);
      setBundle({ status: "ready", manifest, spec, aslSpec });
    }).catch((error) => { if (alive) setBundle({ status: "missing", message: String(error?.message || error) }); });
    fetch(assetUrl("vocabulary.json")).then((r) => (r.ok ? r.json() : [])).then((data) => { if (alive) setVocabulary(Array.isArray(data) ? data : data.items || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Warm MediaPipe and the model in the background on camera screens, so "Turn on camera" is quick. Only for
  // visitors who have used the camera before: a first visit must not download ~30 MB of trackers unasked
  // (prepaid mobile data), and never in data-saver mode.
  useEffect(() => {
    if (!consented || bundle.status !== "ready" || !["words", "sentences"].includes(route) || navigator.connection?.saveData) return undefined;
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
    const cancel = window.cancelIdleCallback || clearTimeout;
    const id = idle(() => { try { warmUp({ manifest: bundle.manifest, spec: bundle.spec }); } catch { /* the stage reports errors */ } }, { timeout: 4000 });
    return () => cancel(id);
  }, [bundle, route, consented]);

  useEffect(() => { if (engine) engine.setAdjust((scores) => (settings.learn && personalRef.current ? adapt(scores, personalRef.current) : scores)); }, [engine, settings.learn]);

  useEffect(() => {
    if (!import.meta.env?.PROD || !("serviceWorker" in navigator)) return;
    offlineSize().then((totalBytes) => setOffline((v) => ({ ...v, totalBytes })));
  }, []);
  useEffect(() => {
    const onPrompt = (event) => { event.preventDefault(); setInstallEvent(event); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

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
    if (pendingAsl.current) { const start = pendingAsl.current; pendingAsl.current = null; start(); return; }
    if (route === "asl") return; // ASL mode has its own camera button; the notice has now been seen.
    if (!["words", "sentences", "teach"].includes(route)) window.location.hash = "#/words";
    setCameraWanted(true);
  };
  const requestAslCamera = (start) => { if (consented) start(); else { pendingAsl.current = start; setOnboarding(true); } };

  const showCaption = (text, note) => {
    clearTimeout(captionTimer.current);
    setCaption({ text, note });
    captionTimer.current = setTimeout(() => setCaption(null), Math.max(3500, text.length * 110));
  };
  const say = (lines) => {
    const text = lang === "ur" ? lines.ur : lang === "roman" ? lines.roman : lines.en;
    let note = null;
    if (settings.voice) {
      const out = speak(lines, lang, { rate: settings.rate });
      if (out.fallback === "roman") note = t("noUrduVoice", lang);
      if (out.fallback === "none" || !canSpeak()) note = t("noVoice", lang);
    }
    showCaption(text, note);
  };

  const learnFrom = (entry, scores) => {
    if (!settings.learn || !scores || !personalRef.current || entry?.index == null) return;
    personalRef.current = learn(personalRef.current, scores, entry.index);
    savePersonal(personalRef.current);
    setPersonalCount(personalRef.current.confirmed);
  };
  const confirmWord = (entry, result) => {
    const e = withRoman(entry);
    navigator.vibrate?.([40, 40, 40]);
    say(wordLines(e));
    learnFrom(e, result?.scores);
    setHistory((h) => [...h, wordLines(e)].slice(-20));
  };
  const speakSentence = (words, lines) => {
    navigator.vibrate?.([40, 40, 40]);
    say(lines);
    for (const word of words) learnFrom(word, word.scores);
    setHistory((h) => [...h, lines].slice(-20));
  };
  const speakPhrase = (item) => say({ en: item.english, ur: item.urdu || item.english, roman: item.romanUrdu || item.english });
  const forget = () => { forgetPersonal(); if (bundle.manifest) personalRef.current = loadPersonal(bundle.manifest.version, bundle.manifest.classes.length); setPersonalCount(0); };
  const saveOffline = () => {
    setOffline((v) => ({ ...v, status: "saving", done: 0, total: 0 }));
    saveForOffline((m) => {
      if (m.type === "progress") setOffline((v) => ({ ...v, status: "saving", done: m.done, total: m.total }));
      else if (m.type === "cached") setOffline((v) => ({ ...v, status: "saved" }));
      else setOffline((v) => ({ ...v, status: "error", message: m.message }));
    }).catch((error) => setOffline((v) => ({ ...v, status: "error", message: String(error?.message || error) })));
  };
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
      else if (key === "e") setLang("en");
      else if (key === "u") setLang("ur");
      else if (key === "o") setLang("roman");
      else if (key === "q") setCameraWanted(false);
      else if (key === "escape" && presenting) { setPresenting(false); if (document.fullscreenElement) document.exitFullscreen?.(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presenting]);

  const signs = useMemo(() => cameraSigns(bundle.manifest), [bundle.manifest]);
  const replyEntries = useMemo(() => [
    ...vocabulary.map((item) => ({ id: item.id, english: item.english, urdu: item.urdu, romanUrdu: item.romanUrdu })),
    ...signs.map((entry) => ({ id: entry.gloss, english: entry.english, urdu: entry.urdu, romanUrdu: entry.romanUrdu, vocabularyId: entry.vocabulary_id })),
  ], [vocabulary, signs]);
  const activeTab = MORE_ROUTES.has(route) ? "more" : route;
  const fallback = <p className="screen muted" role="status">Loading…</p>;
  const back = <a className="back" href="#/more"><Icon name="back" size={18} />{ui === "ur" ? "واپس" : "More"}</a>;

  let content;
  if (route === "sentences") content = <SentencesScreen bundle={bundle} lang={lang} cameraWanted={cameraWanted} setCameraWanted={wantCamera} onEngine={setEngine} vocabulary={vocabulary} onSpeakSentence={speakSentence} onSpeakPhrase={speakPhrase} pauseMs={settings.pauseMs} />;
  else if (route === "reply") content = <ReplyScreen entries={replyEntries} clips={clips} lang={lang} history={history} />;
  else if (route === "more") content = <MoreScreen lang={lang} offline={offline} onSaveOffline={saveOffline} install={{ available: Boolean(installEvent), prompt: () => { installEvent?.prompt(); setInstallEvent(null); } }} />;
  else if (route === "about") content = <AboutPage lang={lang} signs={signs.length} metrics={bundle.manifest?.metrics} />;
  else if (route === "settings") content = <SettingsPage lang={lang} settings={settings} setSettings={setSettings} personal={personalCount} onForget={forget} onPresentation={presentation} />;
  else if (route === "phrases") content = <PhrasebookPage vocabulary={vocabulary} lang={lang} onSpeak={speakPhrase} />;
  else if (route === "teach") content = <TeachPage bundle={bundle} lang={lang} vocabulary={vocabulary} cameraWanted={cameraWanted} setCameraWanted={wantCamera} />;
  else if (route === "tour") content = <Suspense fallback={fallback}><TourScreen bundle={bundle} lang={lang} voiceOn={settings.voice} onCaption={(text) => showCaption(text, null)} onDone={() => { window.location.hash = "#/words"; wantCamera(true); }} /></Suspense>;
  else if (route === "asl") content = <div className="screen legacy">{back}<Suspense fallback={fallback}><AslMode requestCamera={requestAslCamera} voiceEnabled={settings.voice} /></Suspense></div>;
  else if (route === "dictionary") content = <div className="screen legacy">{back}<Suspense fallback={fallback}><Dictionary pslClasses={bundle.manifest?.classes || []} /></Suspense></div>;
  else if (route === "report") content = <div className="screen legacy">{back}<Suspense fallback={fallback}><HowWellItWorks /></Suspense></div>;
  else if (route === "credits") content = <div className="screen legacy">{back}<Suspense fallback={fallback}><Credits /></Suspense></div>;
  else if (route === "whats-new") content = <div className="screen legacy">{back}<Suspense fallback={fallback}><WhatsNew /></Suspense></div>;
  else if (route === "helper") content = <div className="screen legacy">{back}<Suspense fallback={fallback}><HelperChat vocabulary={vocabulary} pslClasses={bundle.manifest?.classes || []} /></Suspense></div>;
  else content = <WordsScreen bundle={bundle} lang={lang} cameraWanted={cameraWanted} setCameraWanted={wantCamera} onEngine={setEngine} clips={clips} onConfirm={confirmWord} onSpeakWord={(entry) => say(wordLines(withRoman(entry)))} />;

  return <div className={`app ${presenting ? "presenting" : ""} ${largeText ? "large-text" : ""}`} dir={ui === "ur" ? "rtl" : "ltr"}>
    <a className="skip" href="#main">Skip to content</a>
    <header className="topbar">
      <a className="brand" href="#/words" aria-label="SignMate home"><BrandMark size={34} /><span><b>SignMate</b><small>{route === "asl" ? "American Sign Language mode" : ui === "ur" ? "پاکستانی اشاروں کی زبان" : "Pakistan Sign Language"}</small></span><span className={`sl-tag ${route === "asl" ? "asl" : ""}`} title="Active sign language">{route === "asl" ? "ASL" : "PSL"}</span></a>
      <div className="lang-toggle" role="group" aria-label={t("langLabel", lang)}>
        {[["en", "EN"], ["ur", "اردو"], ["roman", "Roman"]].map(([id, name]) => <button key={id} className={lang === id ? "on" : ""} aria-pressed={lang === id} onClick={() => setLang(id)} lang={id === "ur" ? "ur" : "en"}>{name}</button>)}
      </div>
      {presenting && <button className="btn btn-quiet btn-sm" onClick={() => { setPresenting(false); if (document.fullscreenElement) document.exitFullscreen?.(); }}>Exit presentation</button>}
    </header>

    <main id="main" tabIndex={-1}>{content}</main>

    <nav className="tabbar" aria-label="Main">
      {TABS.map(([id, icon, key]) => <a key={id} href={`#/${id}`} className={activeTab === id ? "on" : ""} aria-current={activeTab === id ? "page" : undefined}><Icon name={icon} size={22} /><span>{t(key, lang)}</span></a>)}
    </nav>

    {caption && <div className="caption" role="status" aria-live="assertive"><Icon name="speak" size={18} /><div><p dir="auto" className={lang === "ur" ? "urdu" : ""}>{caption.text}</p>{caption.note && <small>{caption.note}</small>}</div></div>}
    {devHud && <DevHud engine={engine} onClose={() => { setDevHud(false); setSettings((s) => ({ ...s, devHud: false })); }} />}
    {onboarding && <Onboarding lang={lang} setLang={setLang} signs={signs.length} onCamera={acceptAndStart}
      onTour={() => { store.set(ONBOARD_KEY, "yes"); setOnboarding(false); window.location.hash = "#/tour"; }}
      onBrowse={() => { store.set(ONBOARD_KEY, "yes"); setOnboarding(false); pendingAsl.current = null; }} />}
  </div>;
}
