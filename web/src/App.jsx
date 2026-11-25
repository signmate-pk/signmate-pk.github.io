import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { classifyGesture, drawLandmarks, normalizeLandmarks } from "./vision.js";
// MediaPipe (capture_v2) and ASL mode load only when needed, so the first visit stays light (Stage 5).
const AslMode = lazy(() => import("./AslMode.jsx"));
const Dictionary = lazy(() => import("./Dictionary.jsx"));
const HowWellItWorks = lazy(() => import("./SitePages.jsx").then((m) => ({ default: m.HowWellItWorks })));
const Credits = lazy(() => import("./SitePages.jsx").then((m) => ({ default: m.Credits })));
const WhatsNew = lazy(() => import("./SitePages.jsx").then((m) => ({ default: m.WhatsNew })));
const HAND_COLOURS = { left: "#f0c876", right: "#83d7b8" };
import PslSuggestion from "./PslSuggestion.jsx";
import SignClip, { useClips } from "./SignClip.jsx";
import { QuickPhrases, ReplyPanel, SentenceStrip } from "./Conversation.jsx";
import HelperChat from "./HelperChat.jsx";
import { offlineSize, saveForOffline } from "./offline.js";
import { adapt, forgetPersonal, learn, loadPersonal, savePersonal } from "./personal.js";
import { cameraAdvice, createCameraCheck, videoBrightness } from "./camera_check.js";
import { islrFrame, loadAslSpec, SignSegmenter } from "./asl_islr.js";
import { createPslRecognizer, loadPslManifest } from "./psl_client.js";
import { loadPslSpec } from "./psl_hands.js";
import { API_BASE, HAS_SERVER, assetUrl } from "./paths.js";

const API = API_BASE;
const HOLD_FRAMES = 8;
const LOST_MS = 900;
const localHost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
// PSL screen modes. "psl" runs the PSL bundle (models/psl, master-v3 Stage 2): every sign in it is Tier B,
// a suggestion the person confirms. Without a bundle the camera tracks without guessing, unless the person
// turns on the Phase 0 gesture demo (never called PSL) or, with the local server, personal signs (Tier C).
const MODE_LABELS = { off: "PSL · tracking only", psl: "PSL · suggestions (Tier B)", demo: "Gesture demo · not PSL", trained: "Personal signs · Tier C" };
const ORIGIN_LABELS = { psl: "PSL · Tier B · you confirmed it", demo: "Gesture demo · not a PSL sign", trained: "Personal sign · Tier C", vocabulary: "Chosen from the vocabulary" };
const HANDS_TEXT = { both: "Both hands seen", one: "Only one hand seen", none: "No hands seen" };
const IDLE_STATUS = "Show both hands to the camera";
const TRACKING_STATUS = "Hands tracked · PSL recognition is not installed yet";
const PSL_STATUS = "PSL · sign one word, then lower your hands";

// The hand the Phase 0 rules and personal model read: the larger one in view (they were built for one hand).
function mainHand(rawHands) {
  let best = null;
  let bestSize = -1;
  for (const hand of rawHands || []) {
    const xs = hand.landmarks.map((row) => row[0]);
    const ys = hand.landmarks.map((row) => row[1]);
    const size = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    if (size > bestSize) { best = hand; bestSize = size; }
  }
  return best && { points: best.landmarks.map(([x, y, z]) => ({ x, y, z })), handedness: best.handedness || "Right" };
}

async function request(path, options = {}) {
  if (!HAS_SERVER) throw new Error("This website version has no SignMate server.");
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || `Request failed (${response.status})`);
  return response.headers.get("content-type")?.includes("application/json") ? response.json() : response.text();
}

function speakItem(item, language, enabled) {
  if (!enabled || !item || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(language === "ur" ? item.urdu : item.english);
  utterance.lang = language === "ur" ? "ur-PK" : "en-US";
  utterance.rate = 0.92;
  window.speechSynthesis.speak(utterance);
}

function Icon({ children }) { return <span className="icon" aria-hidden="true">{children}</span>; }



export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const modeRef = useRef("off");
  const languageRef = useRef("en");
  const backendRef = useRef(false);
  const modelRef = useRef(false);
  const busyPredictRef = useRef(false);
  const sampleRef = useRef(null);
  const lastAcceptedRef = useRef("");
  const vocabularyRef = useRef([]);
  const acceptWordRef = useRef(() => {});
  const originRef = useRef(null);
  // The PSL bundle and its live state; the camera loop reads it through this ref.
  const pslRef = useRef({ manifest: null, spec: null, aslSpec: null, recognizer: null, personal: null });

  const [vocabulary, setVocabulary] = useState([]);
  const [connection, setConnection] = useState("checking");
  const [modelInfo, setModelInfo] = useState({ available: false, mode: "AI Demo Mode" });
  const [hands, setHands] = useState("none");
  const [origin, setOrigin] = useState(null);
  const [view, setView] = useState("translate");
  const [language, setLanguage] = useState("en");
  const [romanUrdu, setRomanUrdu] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [dark, setDark] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [metricsConsent, setMetricsConsent] = useState(() => {
    try { return localStorage.getItem("signbridge_mediapipe_metrics_consent") === "yes"; } catch { return false; }
  });
  const [metricsNoticeOpen, setMetricsNoticeOpen] = useState(false);
  const [metricsNoticeChecked, setMetricsNoticeChecked] = useState(false);
  const [facing, setFacing] = useState("user");
  const [cameraError, setCameraError] = useState("");
  const [mode, setMode] = useState("off");
  const [status, setStatus] = useState(IDLE_STATUS);
  const [current, setCurrent] = useState(null);
  const [lastFeatures, setLastFeatures] = useState(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All categories");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [exhibition, setExhibition] = useState(false);
  const [participant, setParticipant] = useState("");
  const [consent, setConsent] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [counts, setCounts] = useState({});
  const [report, setReport] = useState("");
  // Which sign language is active. PSL is the main language; ASL is a separate, clearly labelled mode (CLAUDE.md 8.2).
  const [signLanguage, setSignLanguage] = useState(() => {
    try { return localStorage.getItem("signbridge_sign_language") === "ASL" ? "ASL" : "PSL"; } catch { return "PSL"; }
  });
  const pendingCameraStartRef = useRef(null);
  const [pslBundle, setPslBundle] = useState({ status: "loading" });
  const [pslResult, setPslResult] = useState(null);
  const [pslSigning, setPslSigning] = useState(false);
  const [sentenceWords, setSentenceWords] = useState([]);
  const [offline, setOffline] = useState({ status: "idle", totalBytes: null });
  const [cameraCheck, setCameraCheck] = useState(null);
  // The AI helpers switch (master-v3 Stage 4): camera check, learning from confirmations, sentence builder, helper.
  const [aiHelpers, setAiHelpers] = useState(() => { try { return localStorage.getItem("signbridge_ai_helpers") !== "off"; } catch { return true; } });
  const aiRef = useRef(aiHelpers);
  aiRef.current = aiHelpers;
  const toggleAi = (on) => { setAiHelpers(on); try { localStorage.setItem("signbridge_ai_helpers", on ? "on" : "off"); } catch { /* not saved */ } if (!on) setCameraCheck(null); };

  const currentMode = MODE_LABELS[mode];
  modeRef.current = mode;
  originRef.current = origin;
  languageRef.current = language;
  backendRef.current = connection === "online";
  modelRef.current = modelInfo.available;

  const requestCameraStart = () => {
    setCameraError("");
    if (metricsConsent) setCameraOn(true);
    else { setMetricsNoticeChecked(false); setMetricsNoticeOpen(true); }
  };

  const acceptMetricsNotice = () => {
    try { localStorage.setItem("signbridge_mediapipe_metrics_consent", "yes"); } catch { /* Ask again after reload if storage is unavailable. */ }
    setMetricsConsent(true);
    setMetricsNoticeOpen(false);
    const pending = pendingCameraStartRef.current;
    pendingCameraStartRef.current = null;
    if (pending) pending(); else setCameraOn(true);
  };

  // ASL mode asks for the camera through the same MediaPipe notice as PSL mode.
  const requestAslCamera = (start) => {
    if (metricsConsent) start();
    else { pendingCameraStartRef.current = start; setMetricsNoticeChecked(false); setMetricsNoticeOpen(true); }
  };

  function changeSignLanguage(next) {
    setSignLanguage(next);
    setCameraOn(false);
    setCurrent(null);
    setOrigin(null);
    try { localStorage.setItem("signbridge_sign_language", next); } catch { /* the choice lasts for this visit only */ }
  }

  useEffect(() => {
    let active = true;
    // Without a local server (GitHub Pages, offline copy) go straight to the bundled file: no failing request.
    (HAS_SERVER ? fetch(`${API}/vocabulary?page_size=128`) : Promise.reject(new Error("no server"))).then((response) => response.ok ? response.json() : Promise.reject()).then((data) => {
      if (active) setVocabulary(data.items || []);
    }).catch(async () => {
      try {
        const response = await fetch(assetUrl("vocabulary.json"));
        if (active && response.ok) setVocabulary(await response.json());
      } catch { if (active) setVocabulary([]); }
    });
    return () => { active = false; };
  }, []);

  const refreshConnection = useCallback(async () => {
    try {
      const [health, model] = await Promise.all([request("/health"), request("/model-status")]);
      setConnection("online");
      setModelInfo(model);
      if (!model.available) setMode((value) => value === "trained" ? "off" : value);
      if (health.model_available !== model.available) setStatus("Backend and model status are updating");
    } catch {
      setConnection("offline");
      setModelInfo({ available: false, mode: "AI Demo Mode" });
      setMode((value) => value === "trained" ? "off" : value);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([loadPslManifest(), loadPslSpec(), loadAslSpec()]).then(([manifest, spec, aslSpec]) => {
      if (!alive) return;
      Object.assign(pslRef.current, { manifest, spec, aslSpec, personal: loadPersonal(manifest.version, manifest.classes.length) });
      setPslBundle({ status: "ready", manifest });
      setMode((value) => (value === "off" ? "psl" : value));
    }).catch((error) => { if (alive) setPslBundle({ status: "missing", message: String(error?.message || error) }); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!import.meta.env?.PROD || !("serviceWorker" in navigator)) return;
    offlineSize().then((totalBytes) => setOffline((value) => ({ ...value, totalBytes })));
  }, []);
  const startOfflineSave = () => {
    setOffline((value) => ({ ...value, status: "saving", done: 0, total: 0 }));
    saveForOffline((message) => {
      if (message.type === "progress") setOffline((value) => ({ ...value, status: "saving", done: message.done, total: message.total }));
      else if (message.type === "cached") setOffline((value) => ({ ...value, status: "saved" }));
      else setOffline((value) => ({ ...value, status: "error", message: message.message }));
    }).catch((error) => setOffline((value) => ({ ...value, status: "error", message: String(error?.message || error) })));
  };

  useEffect(() => {
    refreshConnection();
    const timer = window.setInterval(refreshConnection, 12000);
    return () => window.clearInterval(timer);
  }, [refreshConnection]);

  useEffect(() => {
    let alive = true;
    request("/settings").then((saved) => {
      if (!alive) return;
      setLanguage(saved.language === "ur" ? "ur" : "en");
      setRomanUrdu(Boolean(saved.roman_urdu));
      setVoiceEnabled(saved.voice_enabled !== false);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const persistSettings = useCallback((patch) => {
    request("/settings", { method: "PUT", body: JSON.stringify(patch) }).catch(() => {});
  }, []);

  const acceptWord = useCallback((item, source, nextStatus) => {
    if (!item) return;
    setCurrent(item);
    setSelected(item);
    setOrigin(source === "camera" ? modeRef.current : "vocabulary");
    setStatus(nextStatus || ORIGIN_LABELS.vocabulary);
    if (source !== "camera" || lastAcceptedRef.current !== item.id) {
      lastAcceptedRef.current = item.id;
      speakItem(item, languageRef.current, voiceEnabled);
      request("/history", { method: "POST", body: JSON.stringify({ vocabulary_id: item.id, language: languageRef.current, source }) }).catch(() => {});
    }
  }, [voiceEnabled]);
  // The camera loop reads these through refs so that loading the vocabulary or toggling voice
  // does not tear down and restart the camera.
  vocabularyRef.current = vocabulary;
  acceptWordRef.current = acceptWord;

  // The person confirmed a PSL suggestion: show and speak it like any chosen phrase.
  const confirmPsl = useCallback((entry) => {
    const item = vocabulary.find((phrase) => phrase.id === entry.vocabulary_id)
      ?? { id: `psl:${entry.gloss}`, english: entry.english, urdu: entry.urdu || entry.english, romanUrdu: entry.english, category: "PSL", audioText: entry.english };
    acceptWord(item, "camera", ORIGIN_LABELS.psl);
    const psl = pslRef.current;
    if (aiHelpers && pslResult?.scores && psl.personal) {
      // Learn from what the person confirmed; stays in this browser (personal.js).
      psl.personal = learn(psl.personal, pslResult.scores, entry.index);
      savePersonal(psl.personal);
    }
    setPslResult(null);
    if (aiHelpers) setSentenceWords((words) => [...words, { gloss: entry.gloss, english: entry.english, urdu: entry.urdu || entry.english }].slice(-20));
  }, [vocabulary, acceptWord, pslResult, aiHelpers]);
  const forgetMine = () => {
    forgetPersonal();
    const psl = pslRef.current;
    if (psl.manifest) psl.personal = loadPersonal(psl.manifest.version, psl.manifest.classes.length);
    setPslBundle((bundle) => ({ ...bundle }));
  };
  const speakText = useCallback((text) => {
    if (!voiceEnabled || !text || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language === "ur" ? "ur-PK" : "en-US";
    utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
  }, [voiceEnabled, language]);
  const replyEntries = useMemo(() => [
    ...vocabulary.map((item) => ({ id: item.id, english: item.english, urdu: item.urdu, romanUrdu: item.romanUrdu })),
    ...(pslBundle.manifest?.classes || []).filter((entry) => entry.tier).map((entry) => ({ id: entry.gloss, english: entry.english, urdu: entry.urdu, vocabularyId: entry.vocabulary_id })),
  ], [vocabulary, pslBundle.manifest]);
  const pslReady = pslBundle.status === "ready" || (pslBundle.status === "error" && pslBundle.manifest);
  const clips = useClips();
  const pslVocabulary = useMemo(() => new Set((pslBundle.manifest?.classes || []).filter((entry) => entry.tier && entry.vocabulary_id).map((entry) => entry.vocabulary_id)), [pslBundle.manifest]);
  const pslSigns = pslBundle.manifest ? pslBundle.manifest.classes.filter((entry) => entry.tier).length : 0;

  useEffect(() => {
    if (!cameraOn) return undefined;
    let active = true;
    let stream;
    let capture;
    let raf = 0;
    let recent = [];
    let lastHandAt = 0;
    let frameNumber = 0;
    let lastStatus = "";
    let lastSeen = "";
    let segmenter = null;
    let lastSigning = false;
    const check = createCameraCheck();
    const sampleCanvas = document.createElement("canvas");
    setCameraCheck(null);
    let pslBusy = false;
    let pslPending = null;
    const psl = pslRef.current;
    const showStatus = (text) => { if (text !== lastStatus) { lastStatus = text; setStatus(text); } };
    const classifyPsl = (sign, aspect) => {
      if (pslBusy) { pslPending = [sign, aspect]; return; }
      pslBusy = true;
      psl.recognizer.predict(sign, aspect, (scores) => (aiRef.current ? adapt(scores, psl.personal) : scores))
        .then((answer) => { if (active) setPslResult({ ...answer, at: Date.now() }); })
        .catch((error) => { if (active) setPslBundle((bundle) => ({ ...bundle, status: "error", message: `The PSL model stopped: ${error?.message || error}` })); })
        .finally(() => {
          pslBusy = false;
          if (pslPending && active) { const [nextSign, nextAspect] = pslPending; pslPending = null; classifyPsl(nextSign, nextAspect); }
        });
    };

    async function start() {
      if (!window.isSecureContext && !localHost) {
        setCameraError("Phone and tablet browsers require HTTPS before they allow camera access. Use the mobile app or open the site through a trusted HTTPS address.");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("This browser does not provide camera access. Use a recent browser or browse the vocabulary without a camera.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (!active) { stream.getTracks().forEach((track) => track.stop()); return; }
        setCameraError("");
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        // Capture v2: both hands, pose and face, with left and right assigned by the F12 rules and the
        // pose wrists (CLAUDE.md 8.4). The same capture feeds ASL mode and the coming PSL model.
        const { createCaptureV2, loadFeatureSpecV2 } = await import("./capture_v2.js");
        const featureSpec = await loadFeatureSpecV2();
        capture = await createCaptureV2({ spec: featureSpec });
        if (!active) { capture.close(); return; }
        if (psl.manifest && !psl.recognizer) {
          // Compiled once in a Web Worker and kept while the page is open.
          createPslRecognizer({ manifest: psl.manifest, spec: psl.spec })
            .then((recognizer) => { psl.recognizer = recognizer; setPslBundle((bundle) => ({ ...bundle, runtime: recognizer.info })); })
            .catch((error) => setPslBundle((bundle) => ({ ...bundle, status: "error", message: `The PSL model could not start: ${error?.message || error}` })));
        }

        const loop = () => {
          if (!active || !videoRef.current || videoRef.current.readyState < 2) {
            raf = requestAnimationFrame(loop);
            return;
          }
          try {
            // Browser camera frames are unmirrored; only the preview is mirrored.
            const out = capture.processVideoFrame(videoRef.current, performance.now(), { inputMirrored: false });
            if (!out) { raf = requestAnimationFrame(loop); return; }
            const { left_hand: left, right_hand: right } = out.frame;
            drawLandmarks(canvasRef.current, videoRef.current, [left && { points: left, colour: HAND_COLOURS.left }, right && { points: right, colour: HAND_COLOURS.right }].filter(Boolean));
            const seen = left && right ? "both" : left || right ? "one" : "none";
            if (seen !== lastSeen) { lastSeen = seen; setHands(seen); }
            frameNumber += 1;
            if (!check.done && aiRef.current) {
              check.add(out.frame, frameNumber % 15 === 1 ? videoBrightness(videoRef.current, sampleCanvas) : null);
              if (check.done) setCameraCheck(cameraAdvice(check.stats));
            }
            if (modeRef.current === "psl" && psl.recognizer && psl.aslSpec) {
              // The baseline's frame layout and sign cutter (asl_islr_spec.json), then the PSL bundle.
              segmenter ??= new SignSegmenter(psl.aslSpec);
              const sign = segmenter.push(islrFrame(out.raw, featureSpec, psl.aslSpec));
              if (segmenter.active !== lastSigning) { lastSigning = segmenter.active; setPslSigning(lastSigning); }
              const video = videoRef.current;
              if (sign) classifyPsl(sign, (video.videoWidth || 4) / (video.videoHeight || 3));
            } else if (segmenter) {
              segmenter = null;
              if (lastSigning) { lastSigning = false; setPslSigning(false); }
            }
            const hand = mainHand(out.raw.hands);
            if (hand) {
              lastHandAt = performance.now();
              let features = null;
              try { features = normalizeLandmarks(hand.points, hand.handedness); } catch { features = null; }
              if (features && frameNumber % 6 === 0) {
                sampleRef.current = features;
                setLastFeatures(features);
              }
              if (modeRef.current === "trained" && modelRef.current && backendRef.current) {
                if (features && frameNumber % 6 === 0 && !busyPredictRef.current) {
                  busyPredictRef.current = true;
                  request("/predict", { method: "POST", body: JSON.stringify({ features }) })
                    .then((prediction) => {
                      const item = vocabularyRef.current.find((entry) => entry.id === prediction.vocabulary_id);
                      const id = item?.id || null;
                      recent = [...recent, id].slice(-HOLD_FRAMES);
                      if (id && recent.length === HOLD_FRAMES && recent.every((entry) => entry === id) && lastAcceptedRef.current !== id) acceptWordRef.current(item, "camera", ORIGIN_LABELS.trained);
                      if (id) showStatus(ORIGIN_LABELS.trained);
                    })
                    .catch(() => showStatus("Your personal model is unavailable; turn personal signs off"))
                    .finally(() => { busyPredictRef.current = false; });
                }
              } else if (modeRef.current === "demo") {
                const item = vocabularyRef.current.find((entry) => entry.gestureId === classifyGesture(hand.points));
                const id = item?.id || null;
                recent = [...recent, id].slice(-HOLD_FRAMES);
                showStatus(id ? ORIGIN_LABELS.demo : "Gesture demo · hold the hand shape steady");
                if (id && recent.length === HOLD_FRAMES && recent.every((entry) => entry === id) && lastAcceptedRef.current !== id) {
                  acceptWordRef.current(item, "camera", ORIGIN_LABELS.demo);
                }
              } else {
                recent = [];
                showStatus(modeRef.current === "psl" ? (psl.recognizer ? PSL_STATUS : "PSL · loading the model…") : TRACKING_STATUS);
              }
            } else {
              recent = [];
              if (performance.now() - lastHandAt > LOST_MS) {
                lastAcceptedRef.current = "";
                if (originRef.current === "demo" || originRef.current === "trained") { setCurrent(null); setOrigin(null); }
                showStatus(IDLE_STATUS);
              }
            }
          } catch (error) {
            setCameraError(`Camera tracking paused: ${error.message || "hand tracking error"}`);
          }
          raf = requestAnimationFrame(loop);
        };
        loop();
      } catch (error) {
        const text = String(error?.message || error);
        setCameraError(error.name === "NotAllowedError" ? "Camera permission was declined. Allow camera access in your browser settings and try again."
          : /pose_landmarker|face_landmarker|Feature spec/i.test(text) ? `${text} Start the website once with internet (start_web.bat) so it can download the models.`
          : text || "The camera could not start.");
      }
    }
    start();
    return () => {
      active = false;
      cancelAnimationFrame(raf);
      capture?.close();
      stream?.getTracks().forEach((track) => track.stop());
      setHands("none");
    };
  }, [cameraOn, facing]);

  useEffect(() => {
    const handleKey = (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target?.isContentEditable) return;
      if (view === "vocabulary" && ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) {
        const cards = [...document.querySelectorAll(".vocab-card")];
        if (cards.length) {
          const currentIndex = cards.indexOf(document.activeElement);
          const forward = event.key === "ArrowDown" || event.key === "ArrowRight";
          const nextIndex = currentIndex < 0 ? (forward ? 0 : cards.length - 1) : Math.max(0, Math.min(cards.length - 1, currentIndex + (forward ? 1 : -1)));
          cards[nextIndex].focus();
          event.preventDefault();
          return;
        }
      }
      const key = event.key.toLowerCase();
      if (key === "e") { setLanguage("en"); persistSettings({ language: "en" }); }
      else if (key === "u") { setLanguage("ur"); persistSettings({ language: "ur" }); }
      else if (key === "l") { setLanguage((previous) => { const next = previous === "en" ? "ur" : "en"; persistSettings({ language: next }); return next; }); }
      else if (key === "r" && current) speakItem(current, language, voiceEnabled);
      else if (key === "v") { setVoiceEnabled((value) => { persistSettings({ voice_enabled: !value }); return !value; }); }
      else if (key === "g") setMode((value) => value === "demo" ? "off" : "demo");
      else if (key === "m" && modelInfo.available) setMode((value) => value === "trained" ? "off" : "trained");
      else if (key === "b") setView((value) => value === "vocabulary" ? "translate" : "vocabulary");
      else if (key === "h") setHelpOpen((value) => !value);
      else if (key === "q") setCameraOn(false);
      else if (key === "escape") { setHelpOpen(false); setExhibition(false); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [current, language, voiceEnabled, modelInfo.available, persistSettings, view]);

  useEffect(() => {
    if (connection !== "online" || view !== "training") return;
    request("/training-counts").then(setCounts).catch(() => {});
  }, [connection, view]);

  useEffect(() => {
    if (connection === "online" && view === "report") request("/training-report").then(setReport).catch((error) => setReport(error.message));
  }, [connection, view]);

  const categories = useMemo(() => ["All categories", ...new Set(vocabulary.map((item) => item.category))], [vocabulary]);
  const filtered = useMemo(() => vocabulary.filter((item) => (category === "All categories" || item.category === category) && (!search.trim() || `${item.english} ${item.urdu} ${item.romanUrdu} ${item.category}`.toLowerCase().includes(search.trim().toLowerCase()))), [vocabulary, category, search]);
  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleItems = filtered.slice(page * pageSize, (page + 1) * pageSize);

  function changeLanguage(next) {
    setLanguage(next);
    persistSettings({ language: next });
  }

  async function saveExample() {
    if (!consent) { setSaveMessage("Check the consent box before saving landmarks."); return; }
    const features = sampleRef.current;
    if (!features) { setSaveMessage("Show a hand to the camera first."); return; }
    if (!selected) { setSaveMessage("Choose a vocabulary item to label this example."); return; }
    try {
      const response = await request("/recordings", { method: "POST", body: JSON.stringify({ consent: true, examples: [{ vocabulary_id: selected.id, participant: participant || "anonymous", session_id: `web-${Date.now()}`, features, frame_width: videoRef.current?.videoWidth || 0, frame_height: videoRef.current?.videoHeight || 0 }] }) });
      setSaveMessage(`${response.saved} landmark example saved on this computer. Camera images were not saved.`);
      setCounts((value) => ({ ...value, [selected.id]: (value[selected.id] || 0) + response.saved }));
    } catch (error) { setSaveMessage(error.message); }
  }

  async function openReport() {
    setView("report");
    if (connection === "online") request("/training-report").then(setReport).catch((error) => setReport(error.message));
  }

  const selectedText = current ? (language === "ur" ? (romanUrdu ? current.romanUrdu : current.urdu) : current.english) : "Show a sign to the camera";
  const helperText = current ? (language === "ur" ? current.english : (romanUrdu ? current.romanUrdu : current.urdu)) : "Your result appears here";

  return <div className={`app-shell ${dark ? "theme-dark" : "theme-light"} ${exhibition ? "exhibition" : ""}`}>
    {!exhibition && <header className="topbar">
      <a className="brand" href="#home" onClick={(event) => { event.preventDefault(); setView("translate"); }} aria-label="SignMate home"><span className="brand-mark">S</span><span><strong>SignMate</strong><small>Words that connect</small></span></a>
      <nav className="main-nav" aria-label="Main navigation">
        {[["translate", "Translate"], ["vocabulary", "Vocabulary"], ["dictionary", "Dictionary"], ...(HAS_SERVER ? [["training", "Teach a sign · optional"]] : []), ["report", "How well it works"]].map(([id, label]) => <button key={id} className={view === id ? "nav-link active" : "nav-link"} onClick={() => setView(id)}>{label}</button>)}
      </nav>
      <div className="top-actions">
        <div className="sign-language-switch" role="group" aria-label="Sign language">
          <span>Sign language</span>
          <button className={signLanguage === "PSL" ? "selected" : ""} aria-pressed={signLanguage === "PSL"} onClick={() => changeSignLanguage("PSL")} title="Pakistan Sign Language (main)">PSL</button>
          <button className={signLanguage === "ASL" ? "selected asl" : "asl"} aria-pressed={signLanguage === "ASL"} onClick={() => changeSignLanguage("ASL")} title="American Sign Language (separate mode, not PSL)">ASL</button>
        </div>
        <span className={`connection-pill ${connection}`}><i />{connection === "online" ? "Backend connected" : connection === "offline" ? (HAS_SERVER ? "Offline demo" : "Website version") : "Connecting"}</span>
        <button className="icon-button" title="Switch theme" aria-label="Switch theme" onClick={() => setDark((value) => !value)}>{dark ? "☼" : "◐"}</button>
        <button className="help-button" onClick={() => setHelpOpen(true)}><span>?</span> Help</button>
      </div>
    </header>}

    <main className="page-wrap">
      {(view === "translate" || exhibition) && signLanguage === "ASL" && <Suspense fallback={<div className="panel asl-loading" role="status">Loading ASL mode…</div>}><AslMode requestCamera={requestAslCamera} voiceEnabled={voiceEnabled} /></Suspense>}
      {(view === "translate" || exhibition) && signLanguage === "PSL" && <>
        {!exhibition && <section className="welcome-row">
          <div className="welcome-intro"><div className="eyebrow"><span className="pulse-dot" /> Pakistan Sign Language · runs on this device</div><h1>Sign in PSL. Read it in Urdu and English.</h1><p>{pslReady ? `SignMate knows ${pslSigns} PSL signs. ` : ""}It shows what it saw and asks you before it speaks. Your camera video never leaves this device.</p></div>
          <div className="psl-status panel" role="status">
            <span className="section-kicker">PSL RECOGNITION</span>
            {pslReady ? <>
              <strong>{pslSigns} PSL signs · suggestions</strong>
              <small>Learned from a public PSL dataset. <b>{pslBundle.manifest.badge}</b>: every answer is a suggestion (Tier B) that you confirm, and nothing is spoken until you do.</small>
              {pslBundle.status === "error" && <small className="inline-warning">{pslBundle.message}</small>}
              <label className="toggle-row"><input type="checkbox" checked={mode === "psl"} onChange={(event) => setMode(event.target.checked ? "psl" : "off")} /><span><b>PSL suggestions</b>Sign one word, lower your hands, then confirm.</span></label>
              <small>Your confirmations tune the suggestions to your signing, only in this browser{pslRef.current.personal?.confirmed ? ` (${pslRef.current.personal.confirmed} so far)` : ""}. <button className="text-button" onClick={forgetMine}>Forget them</button></small>
            </> : <>
              <strong>{pslBundle.status === "loading" ? "Loading…" : "Not installed"}</strong>
              <small>The PSL model could not be loaded on this device, so SignMate does not guess PSL signs. The vocabulary and ASL mode still work.</small>
            </>}
            <label className="toggle-row"><input type="checkbox" checked={mode === "demo"} onChange={(event) => setMode(event.target.checked ? "demo" : "off")} /><span><b>Gesture demo</b>Hand shapes from the first prototype. They are not PSL signs.</span></label>
            {modelInfo.available && <label className="toggle-row"><input type="checkbox" checked={mode === "trained"} onChange={(event) => setMode(event.target.checked ? "trained" : "off")} /><span><b>Your personal signs · Tier C</b>Signs you taught on this computer. Only for you.</span></label>}
          </div>
        </section>}

        <section className="translator-grid">
          <div className="camera-card panel">
            <div className="panel-heading">
              <div><span className="section-kicker">LIVE CAMERA</span><h2>Show a sign</h2></div>
              <div className="camera-indicator"><i className={cameraOn && !cameraError ? "live" : ""} />{cameraOn && !cameraError ? "Camera on" : "Camera off"}</div>
            </div>
            <div className="camera-stage">
              <video ref={videoRef} className={cameraOn && !cameraError ? "camera-video visible" : "camera-video"} muted playsInline aria-label="Local camera preview" />
              <canvas ref={canvasRef} className="landmark-canvas" aria-hidden="true" />
              {(!cameraOn || cameraError) && <div className="camera-placeholder"><div className="camera-orb"><Icon>⌖</Icon></div><strong>{cameraError ? "Camera needs attention" : "Your camera stays on this device"}</strong><p>{cameraError || "Turn on the camera to see both hands tracked. Nothing is recorded."}</p><button className="button button-primary" onClick={requestCameraStart}><Icon>◉</Icon> Enable camera</button></div>}
              {cameraOn && !cameraError && <div className="camera-overlay-top"><span className="mini-live"><i /> LIVE</span><span className={`hands-chip ${hands}`} role="status">{HANDS_TEXT[hands]}</span><span className="overlay-mode">{currentMode}</span></div>}
              {cameraOn && <button className="camera-switch" aria-label="Switch front or rear camera" title="Switch camera" onClick={() => setFacing((value) => value === "user" ? "environment" : "user")}>↺</button>}
              {cameraOn && <button className="camera-stop" aria-label="Stop camera" onClick={() => { setCameraOn(false); setCurrent(null); setStatus("Camera stopped"); }}>Stop camera</button>}
            </div>
            {cameraOn && cameraCheck && cameraCheck.some((item) => !item.ok) && <div className="camera-check" role="status"><b>Camera check</b>{cameraCheck.filter((item) => !item.ok).map((item) => <span key={item.id}>{item.text}</span>)}<button className="text-button" onClick={() => setCameraCheck(null)}>OK</button></div>}
            {cameraOn && cameraCheck && cameraCheck.every((item) => item.ok) && <div className="camera-check ok" role="status"><b>Camera check</b><span>Light, distance and framing look good.</span></div>}
            <div className="camera-caption hand-legend"><span><i style={{ background: HAND_COLOURS.left }} /> Your left hand</span><span><i style={{ background: HAND_COLOURS.right }} /> Your right hand</span>{cameraOn && hands === "one" && <span className="inline-warning">Keep both hands in view.</span>}<button className="text-button" onClick={() => setHelpOpen(true)}>How it works <span>↗</span></button></div>
          </div>

          <div className="result-column">
            <div className="result-card panel">
              <div className="panel-heading result-heading"><div><span className="section-kicker">TRANSLATION</span><h2>Result</h2></div><span className={`mode-badge ${mode}`}>{currentMode}</span></div>
              <div className="language-switch" role="group" aria-label="Output language"><button className={language === "en" ? "selected" : ""} onClick={() => changeLanguage("en")}>English</button><button className={language === "ur" ? "selected" : ""} onClick={() => changeLanguage("ur")}>اردو</button><button className="cycle-button" title="Switch language" onClick={() => changeLanguage(language === "en" ? "ur" : "en")}>↔</button></div>
              <div className={`translation-output ${current ? "has-result" : ""}`}>
                <div className="translation-main" dir={language === "ur" && !romanUrdu ? "rtl" : "auto"}>{selectedText}</div>
                <div className="translation-helper" dir={language === "en" && !romanUrdu ? "rtl" : "auto"}>{helperText}</div>
              </div>
              {current && clips.byWord.has(current.id) && <SignClip word={current.id} title={current.english} compact />}
              {mode === "psl" && pslReady && <PslSuggestion result={pslResult} signing={pslSigning} language={language} badge={pslBundle.manifest.badge} onConfirm={confirmPsl} onDismiss={() => setPslResult(null)} />}
              <div className="recognition-status"><span className={current ? "status-check" : "status-wait"}>{current ? "✓" : "…"}</span><span>{status}</span><span className="rule-label">{current ? ORIGIN_LABELS[origin] || "" : "Waiting"}</span></div>
              {current && origin === "demo" && current.demoAvailable && current.handSignHint?.trim() && <div className="gesture-hint"><span className="hint-icon">✳</span><span><b>Gesture demo shape · not a PSL sign</b>{current.handSignHint}</span></div>}
              <div className="result-actions"><button className="button button-primary" onClick={() => current && speakItem(current, language, voiceEnabled)} disabled={!current}><Icon>◖</Icon> Speak</button><button className={`button button-quiet ${voiceEnabled ? "voice-on" : ""}`} onClick={() => { setVoiceEnabled((value) => { persistSettings({ voice_enabled: !value }); return !value; }); }}><Icon>{voiceEnabled ? "♪" : "∅"}</Icon>{voiceEnabled ? "Voice on" : "Voice off"}</button><button className={`button button-quiet ${romanUrdu ? "voice-on" : ""}`} onClick={() => { setRomanUrdu((value) => { persistSettings({ roman_urdu: !value }); return !value; }); }}>Roman Urdu</button></div>
            </div>
            <div className="demo-guide panel">
              <div className="guide-title"><span className="guide-star">✳</span><div><span className="section-kicker">TRY IT TODAY</span><h3>What you can do now</h3></div></div>
              <div className="guide-steps"><div><span>01</span><p>Keep both hands, your shoulders and your face in view.</p></div><div><span>02</span><p>Open Vocabulary to read and hear every phrase.</p></div><div><span>03</span><p>{pslReady ? "Sign one PSL word, lower your hands, then confirm the suggestion." : "For live recognition today, switch to ASL (a separate language)."}</p></div></div>
              <button className="text-button" onClick={() => setHelpOpen(true)}>What works today <span>→</span></button>
            </div>
          </div>
        </section>
        <section className="conversation-row">
          {aiHelpers && <SentenceStrip words={sentenceWords} language={language} onSpeak={speakText} onUndo={() => setSentenceWords((words) => words.slice(0, -1))} onClear={() => setSentenceWords([])} />}
          <QuickPhrases vocabulary={vocabulary} language={language} onPick={(item) => acceptWord(item, "vocabulary", "Quick phrase")} />
          <ReplyPanel entries={replyEntries} clips={clips} language={language} />
          {aiHelpers && <HelperChat vocabulary={vocabulary} pslClasses={pslBundle.manifest?.classes || []} />}
          <label className="toggle-row ai-switch"><input type="checkbox" checked={aiHelpers} onChange={(event) => toggleAi(event.target.checked)} /><span><b>AI helpers</b>Camera check, learning from your confirmations, sentence builder and the helper. They run on this device and never add a sign.</span></label>
        </section>
        {!exhibition && <section className="feature-row"><article><span className="feature-icon mint">◌</span><div><b>Both hands, body and face</b><small>Tracked on this device, nothing recorded</small></div></article><article><span className="feature-icon gold">Aa</span><div><b>English + Urdu</b><small>Urdu script and Roman fallback</small></div></article><article><span className="feature-icon violet">♪</span><div><b>Speech support</b><small>Uses voices available on your device</small></div></article><button className="button button-outline" onClick={() => { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); setExhibition(true); }}>⛶ Exhibition view</button></section>}
      </>}

      {view === "credits" && !exhibition && <section className="content-section"><Suspense fallback={<p role="status">Loading…</p>}><Credits /></Suspense></section>}
      {view === "whats-new" && !exhibition && <section className="content-section"><Suspense fallback={<p role="status">Loading…</p>}><WhatsNew /></Suspense></section>}
      {view === "dictionary" && !exhibition && <Suspense fallback={<p role="status">Loading the dictionary…</p>}><Dictionary pslClasses={pslBundle.manifest?.classes || []} /></Suspense>}
      {view === "vocabulary" && !exhibition && <section className="content-section">
        <div className="section-intro"><div><span className="section-kicker">{vocabulary.length} PHRASES · {categories.length - 1} CATEGORIES</span><h1>Vocabulary</h1><p>Every phrase in English and Urdu, with speech. Tap a phrase to hear it{clips.byWord.size ? ` and, for the ${clips.byWord.size} phrases marked ▶, to see a real PSL signer from a community dictionary` : ""}. {pslVocabulary.size ? `${pslVocabulary.size} phrases are also suggested by the PSL camera.` : ""}</p></div><button className="button button-outline" onClick={() => setView("translate")}>Back to translator</button></div>
        <div className="vocab-tools"><label className="search-box"><span>⌕</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Search English, Urdu, Roman Urdu…" aria-label="Search vocabulary" /></label><select value={category} onChange={(event) => { setCategory(event.target.value); setPage(0); }} aria-label="Filter by category">{categories.map((name) => <option key={name}>{name}</option>)}</select><span className="result-count">{filtered.length} phrases</span></div>
        {selected && <div className="panel vocab-detail"><div><span className="section-kicker">{selected.category}</span><h2>{selected.english} · <span dir="rtl">{selected.urdu}</span></h2></div><SignClip word={selected.id} title={selected.english} showMissing /></div>}
        <div className="vocab-grid">{visibleItems.map((item) => <button key={item.id} className={`vocab-card panel ${selected?.id === item.id ? "chosen" : ""}`} onClick={() => { setSelected(item); acceptWord(item, "vocabulary", ORIGIN_LABELS.vocabulary); }}><span className="vocab-category">{item.category}</span><strong>{item.english}</strong><span className="vocab-urdu" dir="rtl">{item.urdu}</span><small>{item.romanUrdu}</small>{pslVocabulary.has(item.id) ? <span className="availability demo">PSL camera · suggestion (Tier B)</span> : <span className="availability training">Vocabulary only · not recognised yet</span>}{clips.byWord.has(item.id) && <span className="video-tag">▶ How-to video</span>}<span className="card-speak">♪</span></button>)}</div>
        <div className="pagination"><button disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>← Previous</button><span>Page {page + 1} of {pageCount}</span><button disabled={page + 1 >= pageCount} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>Next →</button></div>
      </section>}

      {view === "training" && !exhibition && <section className="content-section">
        <div className="section-intro"><div><span className="section-kicker">OPTIONAL EXTRA · TIER C</span><h1>Teach a sign</h1><p>SignMate never needs this. If you like, save examples of your own signs on this computer; a model trained from them gives "Personal" results that are only for you. Nothing is saved until you confirm.</p></div><span className="privacy-pill">⌑ Local storage · no camera images</span></div>
        <div className="training-layout"><div className="panel training-card"><h2>Save one example</h2><p>Turn on the camera on the Translate screen, choose a phrase, show your sign, then save it here.</p><label>Vocabulary item<select value={selected?.id || ""} onChange={(event) => setSelected(vocabulary.find((item) => item.id === event.target.value) || null)}><option value="">Choose a phrase</option>{vocabulary.map((item) => <option key={item.id} value={item.id}>{item.english} · {item.category}</option>)}</select></label><label>Participant name <span className="optional">optional</span><input value={participant} onChange={(event) => setParticipant(event.target.value)} placeholder="Anonymous if left blank" /></label><label className="consent-row"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>I agree to save this example (hand points only) on this computer for my personal signs. No image or video is saved.</span></label><button className="button button-primary" onClick={saveExample} disabled={connection !== "online"}>Save this example</button><div className="inline-message" role="status">{saveMessage || (connection === "online" ? (lastFeatures ? "An example is ready to save." : "Turn on the camera and show your sign first.") : "Start SignMate on this computer (start_signbridge.bat) to save personal signs.")}</div></div><div className="panel training-card"><span className="section-kicker">YOUR PERSONAL SIGNS</span><h2>{modelInfo.available ? "Personal model ready" : "No personal signs yet"}</h2><p>{modelInfo.available ? `${modelInfo.model_name || "Classifier"} · ${modelInfo.examples || 0} examples · ${modelInfo.classes?.length || 0} classes` : "That's fine: nothing here is needed for SignMate to work."}</p><div className="count-list">{vocabulary.slice(0, 8).map((item) => <div key={item.id}><span>{item.english}</span><b>{counts[item.id] || 0}</b></div>)}</div><button className="button button-outline" onClick={() => setView("report")}>View the report</button></div></div>
      </section>}

      {view === "report" && !exhibition && <section className="content-section">
        <Suspense fallback={<p role="status">Loading…</p>}><HowWellItWorks /></Suspense>
        <p className="asl-credit">{HAS_SERVER ? <button className="text-button" onClick={() => { window.location.href = `${API}/confusion-matrix.csv`; }}>Download the personal-signs confusion matrix</button> : <a className="text-button" href={assetUrl("ci/status.json")}>Latest automatic checks</a>}</p>
        {HAS_SERVER && <div className="report-summary panel"><div><span className="section-kicker">YOUR PERSONAL SIGNS · TIER C</span><h2>{modelInfo.available ? "Personal model ready" : "No personal signs"}</h2><p>{modelInfo.available ? `Selected: ${modelInfo.model_name || "trained classifier"}` : "Optional. Only appears if you teach your own signs."}</p></div><div className="report-stat"><strong>{modelInfo.accuracy == null ? "—" : `${(modelInfo.accuracy * 100).toFixed(1)}%`}</strong><small>{modelInfo.accuracy == null ? "No measured score" : "Measured validation accuracy"}</small></div><div className="report-stat"><strong>{modelInfo.examples || 0}</strong><small>examples used</small></div></div>}
        {HAS_SERVER && <div className="panel report-body"><div className="panel-heading"><div><span className="section-kicker">PERSONAL SIGNS</span><h2>Training report</h2></div><a className="text-button" href={`${API}/training-data.csv`}>Download examples CSV →</a></div>{report ? <pre>{report}</pre> : <div className="empty-report">{connection === "online" ? "No personal model yet. That's fine: SignMate works without one." : "The SignMate server is not running. The vocabulary and ASL mode still work."}</div>}</div>}
      </section>}

      {!exhibition && <footer className="page-footer"><span>SignMate · Pakistan Sign Language first · runs on your device</span><span>Camera frames are not saved. Personal sign examples need your consent.</span>{offline.totalBytes ? <button onClick={startOfflineSave} disabled={offline.status === "saving" || offline.status === "saved"} title="Stores every SignMate file on this device so it works with no internet">{offline.status === "saved" ? "Saved: works offline" : offline.status === "saving" ? `Saving for offline… ${offline.total ? Math.round((100 * offline.done) / offline.total) : 0} %` : offline.status === "error" ? `Offline saving failed: ${offline.message}` : `Save for offline use (${Math.round(offline.totalBytes / 1e6)} MB)`}</button> : null}<button onClick={() => setView("whats-new")}>What's new</button><button onClick={() => setView("credits")}>Credits & licences</button><button onClick={() => setHelpOpen(true)}>Privacy & help</button></footer>}
    </main>

    {helpOpen && <div className="modal-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHelpOpen(false); }}><section className="help-modal panel" role="dialog" aria-modal="true" aria-labelledby="help-title"><button className="modal-close" onClick={() => setHelpOpen(false)} aria-label="Close help">×</button><span className="section-kicker">A QUICK GUIDE</span><h2 id="help-title">How to use SignMate</h2><div className="help-columns"><div><h3>What works today</h3><ul><li>{pslReady ? `PSL: ${pslSigns} signs, shown as suggestions you confirm (community dataset, not yet validated by Deaf signers).` : "PSL: both hands, shoulders and face are tracked. PSL recognition is not installed on this device."}</li><li>ASL mode: 250 everyday ASL words. A separate language, not PSL.</li><li>Vocabulary: every phrase in English and Urdu, with speech.</li></ul><h3>Gesture demo (off unless you turn it on; not PSL)</h3><ul><li>Open, spread palm → Hello</li><li>Flat, close fingers → Stop</li><li>Fist → No · thumbs up/down → Yes/Bad</li><li>V sign → Please · index up → Wait</li><li>OK → Good · call-me pose → Phone</li><li>Three fingers → Thank you · four → Water</li><li>Five close fingers → Emergency</li><li>Horizontal point → Help</li></ul></div><div><h3>Keyboard</h3><ul><li>E English · U Urdu · L switch</li><li>R repeat · V voice on/off</li><li>G gesture demo on/off</li><li>M personal signs on/off (when you have some)</li><li>B opens vocabulary · H help · Q quit</li><li>In vocabulary, type to search; Escape closes it</li></ul><h3>Privacy</h3><p>Browser hand images are processed here and are not sent to Google or saved. MediaPipe Tasks may send aggregate performance and usage metrics to Google. Personal sign examples are saved only after you tick consent and press Save.</p></div></div><button className="button button-primary" onClick={() => setHelpOpen(false)}>Got it</button></section></div>}
    {metricsNoticeOpen && <div className="modal-scrim" role="presentation"><section className="help-modal panel" role="dialog" aria-modal="true" aria-labelledby="metrics-title"><span className="section-kicker">CAMERA PRIVACY</span><h2 id="metrics-title">Before the camera turns on</h2><p>SignMate reads your hand movements here, in this browser. Your camera video is never saved and never sent anywhere. While you are online, Google's hand-tracking library (MediaPipe) may send Google overall speed and usage statistics, never images or video.</p><label className="consent-row"><input type="checkbox" checked={metricsNoticeChecked} onChange={(event) => setMetricsNoticeChecked(event.target.checked)} /><span>I understand. Use hand tracking with these statistics.</span></label><div className="result-actions"><button className="button button-quiet" onClick={() => setMetricsNoticeOpen(false)}>Not now</button><button className="button button-primary" disabled={!metricsNoticeChecked} onClick={acceptMetricsNotice}>Agree and enable camera</button></div></section></div>}
    {exhibition && <button className="exit-exhibition" onClick={() => { setExhibition(false); if (document.fullscreenElement) document.exitFullscreen?.(); }}>Exit exhibition view · Esc</button>}
  </div>;
}
