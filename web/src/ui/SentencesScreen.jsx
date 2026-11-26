// Sentences: sign several words; each sure sign waits a short pause, then joins the tray. Tap a word to
// remove or swap it, then press Speak. Nothing is spoken until Speak is pressed: one confirmation for the
// whole sentence, and a word the camera was not sure of only enters the tray when the person picks it.
import React, { useEffect, useMemo, useRef, useState } from "react";
import CameraStage from "./CameraStage.jsx";
import { ChoiceList, Hint, WordChip } from "./ResultCard.jsx";
import Icon from "./Icon.jsx";
import * as tray from "../recognition/sentence_tray.js";
import { sentenceLines } from "./speech.js";
import { label, withRoman } from "./signs.js";
import { t } from "./i18n.js";

const QUICK = ["hello", "thank_you", "please", "sorry", "yes", "no", "wait", "repeat", "speak_slowly", "i_do_not_understand"];
const EMERGENCY = ["emergency", "help", "pain", "doctor", "hospital", "call", "dangerous", "medicine"];

function Ring({ progress }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  return <svg className="mini-ring" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r={r} className="ring-track" /><circle cx="11" cy="11" r={r} className="ring-value" strokeDasharray={`${c * progress} ${c}`} transform="rotate(-90 11 11)" /></svg>;
}

export function QuickPhrases({ vocabulary, lang, onSpeak }) {
  const byId = useMemo(() => new Map(vocabulary.map((item) => [item.id, item])), [vocabulary]);
  const row = (ids, cls) => ids.map((id) => byId.get(id)).filter(Boolean).map((item) => <button key={item.id} className={`phrase ${cls}`} onClick={() => onSpeak(item)} dir="auto">{lang === "ur" ? item.urdu : lang === "roman" ? item.romanUrdu : item.english}</button>);
  if (!vocabulary.length) return null;
  return <details className="card quick">
    <summary><Icon name="chat" />{t("quickPhrases", lang)}</summary>
    <div className="phrase-row">{row(QUICK, "")}</div>
    <p className="kicker danger">{t("emergency", lang)}</p>
    <div className="phrase-row">{row(EMERGENCY, "urgent")}</div>
  </details>;
}

export default function SentencesScreen({ bundle, lang, cameraWanted, setCameraWanted, onEngine, vocabulary, onSpeakSentence, onSpeakPhrase, pauseMs }) {
  const [state, setState] = useState(tray.emptyTray);
  const [now, setNow] = useState(() => performance.now());
  const [checkItem, setCheckItem] = useState(null);
  const [hint, setHint] = useState(null);
  const [flash, setFlash] = useState(null);
  const [menu, setMenu] = useState(-1);
  const hintTimer = useRef(0);
  const options = useMemo(() => ({ ...tray.TRAY_DEFAULTS, pauseMs }), [pauseMs]);

  // Advance the pause while a word is waiting.
  useEffect(() => {
    if (!state.pending) return undefined;
    let raf = 0;
    const step = () => {
      const time = performance.now();
      setNow(time);
      setState((s) => tray.tick(s, time, options));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [state.pending, options]);

  const toWord = (entry, result) => ({ ...withRoman(entry), scores: result?.scores, choices: result?.top?.filter((e) => !e.unknown).slice(0, 4) });

  const onEvent = (event) => {
    if (event.type === "signing" && event.active) setHint(null);
    if (event.type !== "result") return;
    const { decision, result } = event;
    clearTimeout(hintTimer.current);
    if (decision.verdict === "accept") {
      navigator.vibrate?.(15);
      setFlash({ entry: decision.best, confidence: decision.confidence, id: event.at });
      setTimeout(() => setFlash((f) => (f?.id === event.at ? null : f)), 900);
      setState((s) => tray.offer(s, toWord(decision.best, result), performance.now(), options));
      setHint(null);
    } else if (decision.verdict === "check") {
      setCheckItem(event);
    } else {
      setHint(decision.reason);
      hintTimer.current = setTimeout(() => setHint(null), 4500);
    }
  };

  const pick = (entry) => {
    const result = checkItem?.result;
    setCheckItem(null);
    setState((s) => tray.commitNow(tray.offer(tray.commitNow(s), toWord(entry, result), performance.now(), options)));
  };

  const words = tray.allWords(state);
  const lines = words.length ? sentenceLines(words) : null;
  const shown = lines ? (lang === "ur" ? lines.ur : lang === "roman" ? lines.roman : lines.en) : "";
  const speakAll = () => {
    const committed = tray.commitNow(state);
    setState(committed);
    if (!committed.words.length) return;
    onSpeakSentence(committed.words, sentenceLines(committed.words));
  };

  return <div className="screen screen-sentences">
    <CameraStage bundle={bundle} wanted={cameraWanted} onWant={setCameraWanted} lang={lang} onEvent={onEvent} onEngine={onEngine} variant="medium">
      {flash ? <div className="flash-chip fly-down"><WordChip entry={flash.entry} lang={lang} confidence={flash.confidence} /></div>
        : hint ? <Hint reason={hint} lang={lang} /> : null}
    </CameraStage>

    <section className="tray card" aria-label="Sentence">
      <div className="tray-words" aria-live="polite">
        {words.length === 0 && <p className="muted">{t("trayEmpty", lang)}</p>}
        {state.words.map((word, i) => <div key={`${word.gloss}-${i}`} className="tray-slot">
          <button className={`tray-chip ${menu === i ? "on" : ""}`} onClick={() => setMenu(menu === i ? -1 : i)} aria-expanded={menu === i} dir="auto">{label(word, lang)}</button>
          {menu === i && <div className="chip-menu glass" role="menu">
            <button role="menuitem" className="btn btn-quiet btn-sm" onClick={() => { setState((s) => tray.remove(s, i)); setMenu(-1); }}><Icon name="clear" size={16} />{t("remove", lang)}</button>
            {(word.choices || []).filter((c) => c.gloss !== word.gloss).slice(0, 3).map((c) => <button key={c.gloss} role="menuitem" className="btn btn-glass btn-sm" onClick={() => { setState((s) => tray.replace(s, i, withRoman(c))); setMenu(-1); }} dir="auto">{lang === "ur" ? "بدلیں: " : "Swap: "}{label(withRoman(c), lang)}</button>)}
          </div>}
        </div>)}
        {state.pending && <div className="tray-slot"><span key={state.pending.at} className="tray-chip pending fly-in" dir="auto">
          <Ring progress={tray.pendingProgress(state, now, options)} />{label(state.pending.word, lang)}
          <button className="chip-x" onClick={() => setState((s) => tray.cancelPending(s))} aria-label={`${t("remove", lang)} ${state.pending.word.english}`}><Icon name="clear" size={14} /></button>
        </span></div>}
      </div>
      {lines && <div className="sentence-preview">
        <p className="kicker">{t("sentenceCheck", lang)}</p>
        <p className={`sentence-text ${lang === "ur" ? "urdu" : ""}`} dir={lang === "ur" ? "rtl" : "auto"}>{shown}</p>
        <p className="glosses" title="The signs exactly as recognised">{lines.glosses.join(" · ")}</p>
      </div>}
      <div className="tray-actions">
        <button className="btn btn-quiet" onClick={() => setState((s) => tray.undo(s))} disabled={!words.length}><Icon name="undo" />{t("undo", lang)}</button>
        <button className="btn btn-quiet" onClick={() => setState(tray.clear())} disabled={!words.length}><Icon name="clear" />{t("clear", lang)}</button>
        <button className="btn btn-primary btn-lg grow" onClick={speakAll} disabled={!words.length} aria-describedby={!words.length ? "speak-why" : undefined}><Icon name="speak" />{t("speak", lang)}</button>
      </div>
      {!words.length && <small id="speak-why" className="muted center-text">{t("speakNeedsWords", lang)}</small>}
    </section>

    <QuickPhrases vocabulary={vocabulary} lang={lang} onSpeak={onSpeakPhrase} />

    {checkItem && <div className="sheet-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setCheckItem(null); }}>
      <section className="sheet" role="dialog" aria-modal="true" aria-label={t("checkTitle", lang)}>
        <div className="sheet-handle" aria-hidden="true" />
        <h2 className="sheet-title">{t("checkTitle", lang)}</h2>
        <ChoiceList choices={checkItem.decision.choices} lang={lang} onPick={pick} onNone={() => setCheckItem(null)} />
      </section>
    </div>}
  </div>;
}
