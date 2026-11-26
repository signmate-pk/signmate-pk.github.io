// The guided tour (#/tour, also #/demo): a working demonstration that needs no camera and no good light.
// It replays real recorded PSL signs (SignSpeak dataset, hand points only) through the real PSL model on
// this device, builds a sentence and speaks it. If the model cannot run here, it shows the model's saved
// answers for the same recordings and says so. Nothing in the tour is invented or staged.
import React, { useEffect, useRef, useState } from "react";
import RecordedSign from "./RecordedSign.jsx";
import { WordChip } from "./ResultCard.jsx";
import Icon from "./Icon.jsx";
import { decide } from "../recognition/decision.js";
import { warmUp } from "../recognition/engine.js";
import { loadRecordings, recordingSequence, savedResult } from "./recordings.js";
import { label, withRoman } from "./signs.js";
import { sentenceLines, speak, wordLines } from "./speech.js";
import SignClip from "../SignClip.jsx";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const STEPS = [
  { id: "word", title: { en: "1 · One word", ur: "۱ · ایک لفظ" }, text: { en: "A signer signs GOODBYE. SignMate reads the hand points, suggests the word, and speaks only after it is confirmed.", ur: "ایک شخص 'خدا حافظ' کا اشارہ کرتا ہے۔ سائن میٹ ہاتھوں کے نقطے پڑھ کر لفظ تجویز کرتا ہے، اور تصدیق کے بعد ہی بولتا ہے۔" } },
  { id: "sentence", title: { en: "2 · A sentence", ur: "۲ · ایک جملہ" }, text: { en: "Two signs in a row: DON'T TOUCH, then MOBILE PHONE. Each sure sign waits a moment, then joins the sentence tray.", ur: "دو اشارے: 'ہاتھ مت لگائیں' اور 'فون'۔ ہر اشارہ ایک لمحہ رک کر جملے میں شامل ہوتا ہے۔" } },
  { id: "reply", title: { en: "3 · The reply", ur: "۳ · جواب" }, text: { en: "The hearing person types a reply. It shows in large type, and words with a PSL video play for the Deaf person.", ur: "سننے والا جواب لکھتا ہے۔ وہ بڑے حروف میں دکھتا ہے، اور جن الفاظ کی ویڈیو ہے وہ چلتی ہیں۔" } },
];

export default function TourScreen({ bundle, lang, voiceOn, onCaption, onDone }) {
  const [recordings, setRecordings] = useState(null);
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(-1);
  const [playingGloss, setPlayingGloss] = useState(null);
  const [phase, setPhase] = useState("");
  const [chip, setChip] = useState(null);
  const [trayWords, setTrayWords] = useState([]);
  const [sentence, setSentence] = useState(null);
  const [usedSaved, setUsedSaved] = useState(false);
  const [modelInfo, setModelInfo] = useState(null);
  const finishPlay = useRef(null);
  const runId = useRef(0);
  const ui = lang === "ur" ? "ur" : "en";

  useEffect(() => { loadRecordings().then(setRecordings); }, []);
  useEffect(() => () => { runId.current += 1; }, []);

  const play = (gloss) => new Promise((resolve) => { finishPlay.current = resolve; setPlayingGloss(gloss); });

  async function recognise(gloss, recognizer) {
    const recording = recordings.get(gloss);
    if (recognizer) {
      try { return await recognizer.predict(recordingSequence(recording), bundle.spec.model_input.aspect_reference); } catch { /* fall back below */ }
    }
    setUsedSaved(true);
    return savedResult(recording, bundle.manifest);
  }

  async function run() {
    const id = ++runId.current;
    const alive = () => id === runId.current;
    setStarted(true); setTrayWords([]); setSentence(null); setChip(null); setUsedSaved(false);
    let recognizer = null;
    try {
      recognizer = await Promise.race([warmUp({ manifest: bundle.manifest, spec: bundle.spec }).recognizer, sleep(15000).then(() => null)]);
      if (recognizer) setModelInfo(recognizer.info);
    } catch { recognizer = null; }
    if (!alive()) return;

    // 1 · one word
    setStep(0); setPhase("signing");
    await play("goodbye"); if (!alive()) return;
    setPhase("thinking");
    const r1 = await recognise("goodbye", recognizer); if (!alive()) return;
    const d1 = decide(r1);
    setChip({ entry: d1.best, confidence: d1.confidence, verdict: d1.verdict });
    setPhase("confirm");
    await sleep(1600); if (!alive()) return;
    setPhase("speaking");
    const lines1 = wordLines(withRoman(d1.best));
    onCaption?.(lang === "ur" ? lines1.ur : lang === "roman" ? lines1.roman : lines1.en);
    if (voiceOn) speak(lines1, lang);
    await sleep(1800); if (!alive()) return;

    // 2 · a sentence
    setStep(1); setChip(null);
    const words = [];
    for (const gloss of ["donttouch", "mobile_phone"]) {
      setPhase("signing");
      await play(gloss); if (!alive()) return;
      setPhase("thinking");
      const result = await recognise(gloss, recognizer); if (!alive()) return;
      const decision = decide(result);
      setChip({ entry: decision.best, confidence: decision.confidence, verdict: decision.verdict, fly: true });
      await sleep(1300); if (!alive()) return;
      words.push(withRoman(decision.best));
      setTrayWords([...words]);
      setChip(null);
    }
    const lines = sentenceLines(words);
    setSentence(lines);
    setPhase("speaking");
    await sleep(900); if (!alive()) return;
    onCaption?.(lang === "ur" ? lines.ur : lang === "roman" ? lines.roman : lines.en);
    if (voiceOn) speak(lines, lang);
    await sleep(2600); if (!alive()) return;

    // 3 · the reply
    setStep(2); setPhase("reply"); setPlayingGloss(null);
    await sleep(9000); if (!alive()) return;
    setStep(3); setPhase("end");
  }

  const ready = recordings && recordings.size && bundle?.manifest;
  const current = STEPS[step];
  return <div className="screen screen-tour">
    <section className="stage stage-medium tour-stage" aria-label="Guided tour stage">
      {playingGloss && recordings?.get(playingGloss) && step < 2 && <RecordedSign key={`${playingGloss}-${step}`} recording={recordings.get(playingGloss)} loop={false} onDone={() => finishPlay.current?.()} className="stage-recorded" />}
      <div className="stage-top"><span className="pill pill-glass"><Icon name="sparkle" size={14} />{ui === "ur" ? "تعارفی ٹور · ریکارڈ شدہ اشارے" : "Guided tour · recorded signs"}</span>{phase === "signing" && <span className="pill pill-glass hands-both"><i className="dot" />{ui === "ur" ? "اشارہ ہو رہا ہے" : "Signing"}</span>}</div>
      {step === 2 && <div className="tour-reply"><p className="reply-big" dir="auto">{ui === "ur" ? "شکریہ۔ ڈاکٹر آ رہے ہیں۔" : "Thank you. The doctor is coming."}</p><SignClip word="doctor" title="Doctor" compact /></div>}
      {!started && <div className="stage-cover"><div className="stage-cover-inner">
        <p className="stage-cover-title">{ui === "ur" ? "ایک منٹ میں سائن میٹ دیکھیں" : "See SignMate work in one minute"}</p>
        <p className="stage-cover-sub">{ui === "ur" ? "حقیقی ریکارڈ شدہ پی ایس ایل اشارے اسی ڈیوائس پر اصل ماڈل سے پڑھے جاتے ہیں۔ کیمرہ بند رہتا ہے۔" : "Real recorded PSL signs, read by the real model on this device. Your camera stays off."}</p>
        <button className="btn btn-primary btn-lg" onClick={run} disabled={!ready}><Icon name="play" />{ready ? (ui === "ur" ? "ٹور شروع کریں" : "Start the tour") : "Loading…"}</button>
      </div></div>}
      <div className="stage-bottom">
        {phase === "thinking" && <p className="stage-status">{ui === "ur" ? "ماڈل پڑھ رہا ہے…" : "Reading the hand points…"}</p>}
        {chip && <div className={`result-card glass accept pop ${chip.fly ? "fly-down-late" : ""}`}>
          <WordChip entry={chip.entry} lang={lang} confidence={chip.confidence} />
          {step === 0 && <div className="row-wrap"><span className={`btn btn-primary ${phase === "speaking" ? "pressed" : ""}`} aria-hidden="true"><Icon name="speak" />{ui === "ur" ? "ہاں، بول دیں" : "Yes, speak it"}</span></div>}
        </div>}
      </div>
    </section>

    {!started && <section className="card tour-explain">
      <p className="kicker">{ui === "ur" ? "اس ٹور میں" : "In this tour"}</p>
      <ol className="pipeline">{STEPS.map((s) => <li key={s.id}>{s.text[ui]}</li>)}</ol>
      <p className="muted small">{ui === "ur" ? "کیمرہ یا روشنی کی ضرورت نہیں — پیشکش، کلاس یا کسی نئے صارف کو دکھانے کے لیے۔" : "No camera or good light needed: handy for a presentation, a classroom, or showing a new user what to expect."}</p>
    </section>}
    {started && <section className="card tour-explain" aria-live="polite">
      {current ? <><p className="kicker">{current.title[ui]}</p><p>{current.text[ui]}</p></> : <><p className="kicker">{ui === "ur" ? "بس اتنا ہی" : "That's it"}</p><p>{ui === "ur" ? "اب اپنے کیمرے سے آزمائیں۔" : "Now try it live with your own camera."}</p></>}
      {(step === 1 || step === 2 || step === 3) && trayWords.length > 0 && <div className="tray-words">{trayWords.map((w, i) => <span key={i} className="tray-chip fly-in" dir="auto">{label(w, lang)}</span>)}</div>}
      {sentence && <p className={`sentence-text ${lang === "ur" ? "urdu" : ""}`} dir="auto">{lang === "ur" ? sentence.ur : lang === "roman" ? sentence.roman : sentence.en}</p>}
      <p className="muted small">{usedSaved ? "The model could not run on this device, so the tour shows its saved answers for these recordings (from the project's test run)." : modelInfo ? `Recognised live by the PSL model on this device (${modelInfo.runtime || "LiteRT"}, ${modelInfo.thread || "worker"}).` : ""} Recordings: SignSpeak PSL dataset (Apache-2.0).</p>
      <div className="row-wrap">
        <button className="btn btn-glass" onClick={run}><Icon name="rotate" />{ui === "ur" ? "دوبارہ" : "Replay"}</button>
        <button className="btn btn-primary" onClick={onDone}><Icon name="camera" />{ui === "ur" ? "کیمرے سے آزمائیں" : "Try it live"}</button>
      </div>
    </section>}
  </div>;
}
