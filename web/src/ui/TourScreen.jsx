// The guided tour (#/tour, also #/demo): a working demonstration that needs no camera and no good light.
// It replays real recorded ASL signs of Deaf signers (GISLR rerun set, CC0, points only) through the real ASL model on
// this device, builds a sentence and speaks it. If the model cannot run here, it shows the model's saved answers for
// the same recordings (from notebooks/asl_mode_eval.ipynb) and says so. Nothing in the tour is invented or staged.
import React, { useEffect, useRef, useState } from "react";
import RecordedSign from "./RecordedSign.jsx";
import { WordChip } from "./ResultCard.jsx";
import Icon from "./Icon.jsx";
import { decide } from "../recognition/decision.js";
import { warmModel } from "../recognition/engine.js";
import { loadRecordings, savedResult } from "./recordings.js";
import { label } from "./signs.js";
import { sentenceLines, speak, wordLines } from "./speech.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const REPLY = "Thank you. Please wait here.";

export default function TourScreen({ bundle, lang, voiceOn, onCaption, onDone }) {
  const [recordings, setRecordings] = useState(null);
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(-1);
  const [playing, setPlaying] = useState(null);
  const [phase, setPhase] = useState("");
  const [chip, setChip] = useState(null);
  const [trayWords, setTrayWords] = useState([]);
  const [sentence, setSentence] = useState(null);
  const [usedSaved, setUsedSaved] = useState(false);
  const [modelInfo, setModelInfo] = useState(null);
  const finishPlay = useRef(null);
  const runId = useRef(0);

  useEffect(() => { loadRecordings().then(setRecordings); }, []);
  useEffect(() => () => { runId.current += 1; }, []);

  const list = recordings ? [...recordings.values()] : [];
  const nameOf = (gloss) => bundle.signs?.find((sign) => sign.gloss === gloss)?.english ?? gloss;
  const first = list[0];
  const rest = list.slice(1, 3);
  const steps = [
    first && { id: "word", title: "1 · One word", text: `A Deaf signer signs ${nameOf(first.gloss).toUpperCase()}. SignMate reads the points, suggests the word, and speaks only after it is confirmed.` },
    rest.length && { id: "sentence", title: "2 · A sentence", text: `${rest.length === 2 ? "Two signs" : "One more sign"} in a row. Each sure sign joins the sentence tray, then the sentence is spoken.` },
    { id: "reply", title: `${rest.length ? 3 : 2} · The reply`, text: "The hearing person types a reply. It shows in large type for the Deaf person to read." },
  ].filter(Boolean);

  const play = (recording) => new Promise((resolve) => { finishPlay.current = resolve; setPlaying(recording); });

  async function recognise(recording, recognizer) {
    if (recognizer) {
      try { return await recognizer.predict(recording.sequence); } catch { /* fall back below */ }
    }
    setUsedSaved(true);
    return savedResult(recording, bundle.signs);
  }

  async function run() {
    const id = ++runId.current;
    const alive = () => id === runId.current;
    setStarted(true); setTrayWords([]); setSentence(null); setChip(null); setUsedSaved(false);
    let recognizer = null;
    try {
      recognizer = await Promise.race([warmModel({ aslSpec: bundle.aslSpec, labels: bundle.labels }), sleep(15000).then(() => null)]);
      if (recognizer) setModelInfo(recognizer.info);
    } catch { recognizer = null; }
    if (!alive()) return;
    let index = 0;

    // 1 · one word
    setStep(index); setPhase("signing");
    await play(first); if (!alive()) return;
    setPhase("thinking");
    const d1 = decide(await recognise(first, recognizer)); if (!alive()) return;
    if (d1.best) {
      setChip({ entry: d1.best, confidence: d1.confidence, verdict: d1.verdict });
      setPhase("confirm");
      await sleep(1600); if (!alive()) return;
      setPhase("speaking");
      onCaption?.(wordLines(d1.best).en);
      if (voiceOn) speak(wordLines(d1.best), lang);
      await sleep(1800); if (!alive()) return;
    }

    // 2 · a sentence
    if (rest.length) {
      index += 1;
      setStep(index); setChip(null);
      const words = [];
      for (const recording of rest) {
        setPhase("signing");
        await play(recording); if (!alive()) return;
        setPhase("thinking");
        const decision = decide(await recognise(recording, recognizer)); if (!alive()) return;
        if (!decision.best) continue;
        setChip({ entry: decision.best, confidence: decision.confidence, verdict: decision.verdict, fly: true });
        await sleep(1300); if (!alive()) return;
        words.push(decision.best);
        setTrayWords([...words]);
        setChip(null);
      }
      if (words.length) {
        const lines = sentenceLines(words);
        setSentence(lines);
        setPhase("speaking");
        await sleep(900); if (!alive()) return;
        onCaption?.(lines.en);
        if (voiceOn) speak(lines, lang);
        await sleep(2600); if (!alive()) return;
      }
    }

    // the reply
    index += 1;
    setStep(index); setPhase("reply"); setPlaying(null);
    await sleep(6000); if (!alive()) return;
    setStep(index + 1); setPhase("end");
  }

  const ready = Boolean(first && bundle?.aslSpec && bundle?.labels);
  const none = recordings !== null && !first;
  const current = steps[step];
  return <div className="screen screen-tour">
    <section className="stage stage-medium tour-stage" aria-label="Guided tour stage">
      {playing && phase !== "reply" && <RecordedSign key={`${playing.gloss}-${step}`} recording={playing} loop={false} onDone={() => finishPlay.current?.()} className="stage-recorded" />}
      <div className="stage-top"><span className="pill pill-glass"><Icon name="sparkle" size={14} />Guided tour · recorded signs</span>{phase === "signing" && <span className="pill pill-glass hands-both"><i className="dot" />Signing</span>}</div>
      {phase === "reply" && <div className="tour-reply"><p className="reply-big">{REPLY}</p></div>}
      {!started && <div className="stage-cover"><div className="stage-cover-inner">
        <p className="stage-cover-title">See SignMate work in one minute</p>
        <p className="stage-cover-sub">{none ? "The tour's recordings are not on this version of the site yet: they come from the next measurement run. Try it live with your camera meanwhile." : "Real recorded ASL signs of Deaf signers, read by the real model on this device. Your camera stays off."}</p>
        {none ? <button className="btn btn-primary btn-lg" onClick={onDone}><Icon name="camera" />Try it live</button>
          : <button className="btn btn-primary btn-lg" onClick={run} disabled={!ready}><Icon name="play" />{ready ? "Start the tour" : "Loading…"}</button>}
      </div></div>}
      <div className="stage-bottom">
        {phase === "thinking" && <p className="stage-status">Reading the points…</p>}
        {chip && <div className={`result-card glass accept pop ${chip.fly ? "fly-down-late" : ""}`}>
          <WordChip entry={chip.entry} lang={lang} confidence={chip.confidence} />
          {step === 0 && <div className="row-wrap"><span className={`btn btn-primary ${phase === "speaking" ? "pressed" : ""}`} aria-hidden="true"><Icon name="speak" />Yes, speak it</span></div>}
        </div>}
      </div>
    </section>

    {!started && !none && <section className="card tour-explain">
      <p className="kicker">In this tour</p>
      <ol className="pipeline">{steps.map((s) => <li key={s.id}>{s.text}</li>)}</ol>
      <p className="muted small">No camera or good light needed: handy for a presentation, a classroom, or showing a new user what to expect.</p>
    </section>}
    {started && <section className="card tour-explain" aria-live="polite">
      {current ? <><p className="kicker">{current.title}</p><p>{current.text}</p></> : <><p className="kicker">That's it</p><p>Now try it live with your own camera.</p></>}
      {trayWords.length > 0 && <div className="tray-words">{trayWords.map((w, i) => <span key={i} className="tray-chip fly-in">{label(w)}</span>)}</div>}
      {sentence && <p className="sentence-text">{sentence.en}</p>}
      <p className="muted small">{usedSaved ? "The model could not run on this device, so the tour shows its saved answers for these recordings (from the project's measurement run)." : modelInfo ? `Recognised live by the ASL model on this device (${modelInfo.runtime || "LiteRT"}, ${modelInfo.thread || "worker"}).` : ""} Recordings: GISLR rerun set (Deaf signers, CC0).</p>
      <div className="row-wrap">
        <button className="btn btn-glass" onClick={run}><Icon name="rotate" />Replay</button>
        <button className="btn btn-primary" onClick={onDone}><Icon name="camera" />Try it live</button>
      </div>
    </section>}
  </div>;
}
