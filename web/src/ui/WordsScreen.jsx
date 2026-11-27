// Words: one sign at a time. The camera on top, the 250-sign gallery below. Tap a sign to see what is known about it
// and practise it with live feedback; or just sign, confirm the word, and SignMate speaks it.
import React, { useEffect, useMemo, useRef, useState } from "react";
import CameraStage from "./CameraStage.jsx";
import ResultCard, { Hint, WordChip } from "./ResultCard.jsx";
import RecordedSign from "./RecordedSign.jsx";
import Icon from "./Icon.jsx";
import { practiceFeedback } from "../recognition/decision.js";
import { cameraSigns, label, NOT_VALIDATED, secondary } from "./signs.js";
import { loadRecordings } from "./recordings.js";
import { t } from "./i18n.js";

const PRACTICE_TEXT = {
  match: "That matches. Well signed.",
  close: "Close: it was one of the top guesses. Try again, a little slower.",
  miss: "It looked more like another sign. Try again.",
};

function norm(text) {
  return String(text || "").toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, "");
}

export function SignSheet({ entry, recordings, onClose, onPractise, onSpeak }) {
  const dialog = useRef(null);
  useEffect(() => { dialog.current?.focus(); }, []);
  if (!entry) return null;
  const recording = recordings.get(entry.gloss);
  return <div className="sheet-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="sheet" role="dialog" aria-modal="true" aria-label={entry.english} tabIndex={-1} ref={dialog} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div className="sheet-handle" aria-hidden="true" />
      <header className="sheet-head">
        <div>
          <h2>{label(entry)}</h2>
          <p className="muted sheet-sub">{secondary(entry)}</p>
        </div>
        <button className="btn btn-quiet btn-sm" onClick={onClose}><Icon name="clear" size={16} />Close</button>
      </header>
      <div className="sheet-media">
        {recording ? <figure className="recorded-figure"><RecordedSign recording={recording} /><figcaption>Recorded movement of a Deaf signer from the GISLR rerun set (CC0): points only, no video.</figcaption></figure>
          : <div className="no-ref"><p>No licensed video of this sign yet. SignMate never makes up how a sign looks.</p></div>}
      </div>
      <p className="tags"><span className="tag">{NOT_VALIDATED}</span></p>
      <div className="row-wrap">
        <button className="btn btn-primary" onClick={() => onPractise(entry)}><Icon name="hand" />{t("practise")}</button>
        <button className="btn btn-glass" onClick={() => onSpeak(entry)}><Icon name="speak" />Hear the word</button>
      </div>
    </section>
  </div>;
}

export default function WordsScreen({ bundle, lang, cameraWanted, setCameraWanted, onEngine, onConfirm, onSpeakWord }) {
  const signs = useMemo(() => cameraSigns(bundle?.signs), [bundle?.signs]);
  const [item, setItem] = useState(null);
  const [target, setTarget] = useState(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(null);
  const [recordings, setRecordings] = useState(new Map());
  const stageRef = useRef(null);
  const hideTimer = useRef(0);
  useEffect(() => { loadRecordings().then(setRecordings); }, []);

  const onEvent = (event) => {
    if (event.type === "signing" && event.active) { clearTimeout(hideTimer.current); setItem((current) => (current?.decision.verdict === "reject" ? null : current)); }
    if (event.type !== "result") return;
    clearTimeout(hideTimer.current);
    setItem({ ...event, id: event.at });
    if (event.decision.verdict === "accept") navigator.vibrate?.(15);
    if (event.decision.verdict === "reject") hideTimer.current = setTimeout(() => setItem(null), 4500);
  };

  const shown = useMemo(() => {
    const q = norm(query);
    return signs.filter((entry) => !q || [entry.english, entry.gloss].some((text) => norm(text).includes(q)));
  }, [signs, query]);

  const confirm = (entry, from) => { onConfirm(entry, from?.result); setItem(null); };
  const practise = (entry) => { setTarget(entry); setOpen(null); setItem(null); stageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const feedback = target && item?.decision ? practiceFeedback(item.decision, item.result, target.gloss) : null;

  return <div className="screen screen-words">
    <div ref={stageRef}>
      <CameraStage bundle={bundle} wanted={cameraWanted} onWant={setCameraWanted} lang={lang} onEvent={onEvent} onEngine={onEngine} practising={target ? label(target) : null}>
        {item && feedback && feedback.status !== "unclear" ? <div className={`result-card glass practice ${feedback.status} pop`} role="status" aria-live="polite">
          {feedback.status === "match" ? <WordChip entry={target} lang={lang} confidence={item.decision.confidence} /> : null}
          <p className="result-title">{feedback.status === "match" ? <Icon name="check" /> : null}{PRACTICE_TEXT[feedback.status]}</p>
          {feedback.status !== "match" && item.decision.best && <p className="muted small">The camera saw: <b>{label(item.decision.best)}</b></p>}
          <div className="row-wrap">
            {feedback.status === "match" && <button className="btn btn-primary" onClick={() => confirm(target, item)}><Icon name="speak" />{t("speak")}</button>}
            <button className="btn btn-glass" onClick={() => setOpen(target)}><Icon name="info" />About this sign</button>
          </div>
        </div>
          : item ? (item.decision.verdict === "reject" ? <Hint reason={item.decision.reason} lang={lang} /> : <ResultCard item={item} lang={lang} onConfirm={confirm} onDismiss={() => setItem(null)} />)
          : null}
      </CameraStage>
    </div>

    {target && <div className="practice-bar glass">
      <span className="muted">{t("practising")}</span>
      <button className="linkish" onClick={() => setOpen(target)}><b>{label(target)}</b></button>
      <button className="btn btn-quiet btn-sm" onClick={() => setTarget(null)}><Icon name="clear" size={16} />End</button>
    </div>}

    <section className="gallery" aria-labelledby="gallery-title">
      <header className="section-head">
        <div>
          <h2 id="gallery-title">{`The camera knows ${signs.length} ASL signs`}</h2>
          <p className="muted">{t("validation")}</p>
        </div>
      </header>
      <label className="search"><Icon name="search" size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchSigns")} aria-label={t("searchSigns")} /></label>
      {shown.length === 0 ? <p className="empty">{t("noSignFound")}</p> : <ul className="sign-grid">
        {shown.map((entry) => <li key={entry.gloss}><button className={`sign-card ${target?.gloss === entry.gloss ? "on" : ""}`} onClick={() => setOpen(entry)}>
          <strong>{label(entry)}</strong>
          <small>{secondary(entry)}</small>
          {recordings.has(entry.gloss) ? <span className="sign-card-meta"><span className="has-ref"><Icon name="play" size={12} />recording</span></span> : null}
        </button></li>)}
      </ul>}
    </section>
    {open && <SignSheet entry={open} recordings={recordings} onClose={() => setOpen(null)} onPractise={practise} onSpeak={onSpeakWord} />}
  </div>;
}
