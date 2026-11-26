// Words: one sign at a time. The camera on top, the sign gallery below. Tap a sign to see a reference and
// practise it with live feedback; or just sign, confirm the word, and SignMate speaks it.
import React, { useEffect, useMemo, useRef, useState } from "react";
import CameraStage from "./CameraStage.jsx";
import ResultCard, { Hint, WordChip } from "./ResultCard.jsx";
import RecordedSign from "./RecordedSign.jsx";
import SignClip from "../SignClip.jsx";
import Icon from "./Icon.jsx";
import { practiceFeedback } from "../recognition/decision.js";
import { cameraSigns, GROUPS, inGroup, label, secondary } from "./signs.js";
import { loadRecordings } from "./recordings.js";
import { t } from "./i18n.js";

const PRACTICE_TEXT = {
  match: { en: "That matches. Well signed.", ur: "یہ مل گیا۔ بہت خوب۔" },
  close: { en: "Close: it was one of the top guesses. Watch the reference and try again.", ur: "قریب تھا۔ حوالہ دیکھ کر دوبارہ کوشش کریں۔" },
  miss: { en: "It looked more like another sign. Watch the reference and try again.", ur: "یہ کسی اور اشارے جیسا لگا۔ حوالہ دیکھ کر دوبارہ کوشش کریں۔" },
};

function norm(text) {
  return String(text || "").toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, "");
}

export function SignSheet({ entry, lang, clips, recordings, onClose, onPractise, onSpeak }) {
  const dialog = useRef(null);
  useEffect(() => { dialog.current?.focus(); }, []);
  if (!entry) return null;
  const recording = recordings.get(entry.gloss);
  const clip = entry.vocabulary_id && clips.byWord.has(entry.vocabulary_id);
  return <div className="sheet-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="sheet" role="dialog" aria-modal="true" aria-label={entry.english} tabIndex={-1} ref={dialog} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div className="sheet-handle" aria-hidden="true" />
      <header className="sheet-head">
        <div>
          <h2 dir="auto" className={lang === "ur" ? "urdu" : ""}>{label(entry, lang)}</h2>
          <p className="muted sheet-sub"><span dir="auto" className={lang === "en" ? "urdu" : ""}>{lang === "en" ? entry.urdu : entry.english}</span>{entry.romanUrdu && entry.romanUrdu !== entry.english && lang !== "roman" ? <span dir="ltr"> · {entry.romanUrdu}</span> : null}</p>
        </div>
        <button className="btn btn-quiet btn-sm" onClick={onClose}><Icon name="clear" size={16} />{lang === "ur" ? "بند" : "Close"}</button>
      </header>
      <div className="sheet-media">
        {clip ? <SignClip word={entry.vocabulary_id} title={entry.english} compact />
          : recording ? <figure className="recorded-figure"><RecordedSign recording={recording} /><figcaption>Recorded hand movement from the SignSpeak PSL dataset (one of its signers). Points only, no video.</figcaption></figure>
          : <div className="no-ref"><p>No licensed video of this sign yet. SignMate never makes up how a sign looks.</p>{entry.dictionary_url && <a className="btn btn-glass btn-sm" href={entry.dictionary_url} target="_blank" rel="noreferrer"><Icon name="external" size={16} />See it in the PSL dictionary</a>}</div>}
      </div>
      <p className="tags"><span className="tag">{entry.hands === "two" ? (lang === "ur" ? "دونوں ہاتھ" : "Two hands") : (lang === "ur" ? "ایک ہاتھ" : "One hand")}</span>{entry.device_held_out?.top1 == null && <span className="tag">Not measured yet</span>}</p>
      <div className="row-wrap">
        <button className="btn btn-primary" onClick={() => onPractise(entry)}><Icon name="hand" />{t("practise", lang)}</button>
        <button className="btn btn-glass" onClick={() => onSpeak(entry)}><Icon name="speak" />{lang === "ur" ? "لفظ سنیں" : "Hear the word"}</button>
      </div>
    </section>
  </div>;
}

export default function WordsScreen({ bundle, lang, cameraWanted, setCameraWanted, onEngine, clips, onConfirm, onSpeakWord }) {
  const signs = useMemo(() => cameraSigns(bundle?.manifest), [bundle?.manifest]);
  const [item, setItem] = useState(null);
  const [target, setTarget] = useState(null);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
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
    return signs.filter((entry) => inGroup(entry, group) && (!q || [entry.english, entry.urdu, entry.romanUrdu, entry.gloss].some((text) => norm(text).includes(q))));
  }, [signs, query, group]);

  const confirm = (entry, from) => { onConfirm(entry, from?.result); setItem(null); };
  const practise = (entry) => { setTarget(entry); setOpen(null); setItem(null); stageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const feedback = target && item?.decision ? practiceFeedback(item.decision, item.result, target.gloss) : null;

  return <div className="screen screen-words">
    <div ref={stageRef}>
      <CameraStage bundle={bundle} wanted={cameraWanted} onWant={setCameraWanted} lang={lang} onEvent={onEvent} onEngine={onEngine} practising={target ? label(target, lang) : null}>
        {item && feedback && feedback.status !== "unclear" ? <div className={`result-card glass practice ${feedback.status} pop`} role="status" aria-live="polite">
          {feedback.status === "match" ? <WordChip entry={target} lang={lang} confidence={item.decision.confidence} /> : null}
          <p className="result-title">{feedback.status === "match" ? <Icon name="check" /> : null}{PRACTICE_TEXT[feedback.status][lang === "ur" ? "ur" : "en"]}</p>
          {feedback.status !== "match" && item.decision.best && <p className="muted small">{lang === "ur" ? "کیمرے نے دیکھا:" : "The camera saw:"} <b dir="auto">{label(item.decision.best, lang)}</b></p>}
          <div className="row-wrap">
            {feedback.status === "match" && <button className="btn btn-primary" onClick={() => confirm(target, item)}><Icon name="speak" />{t("speak", lang)}</button>}
            <button className="btn btn-glass" onClick={() => setOpen(target)}><Icon name="play" />{lang === "ur" ? "حوالہ دیکھیں" : "Watch the reference"}</button>
          </div>
        </div>
          : item ? (item.decision.verdict === "reject" ? <Hint reason={item.decision.reason} lang={lang} /> : <ResultCard item={item} lang={lang} onConfirm={confirm} onDismiss={() => setItem(null)} />)
          : null}
      </CameraStage>
    </div>

    {target && <div className="practice-bar glass">
      <span className="muted">{t("practising", lang)}</span>
      <button className="linkish" onClick={() => setOpen(target)} dir="auto"><b>{label(target, lang)}</b></button>
      <button className="btn btn-quiet btn-sm" onClick={() => setTarget(null)}><Icon name="clear" size={16} />{lang === "ur" ? "ختم" : "End"}</button>
    </div>}

    <section className="gallery" aria-labelledby="gallery-title">
      <header className="section-head">
        <div>
          <h2 id="gallery-title">{lang === "ur" ? `کیمرہ ${signs.length} اشارے جانتا ہے` : `The camera knows ${signs.length} signs`}</h2>
          <p className="muted">{t("validation", lang)}</p>
        </div>
      </header>
      <label className="search"><Icon name="search" size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchSigns", lang)} aria-label={t("searchSigns", lang)} dir="auto" /></label>
      <div className="segmented scroll" role="group" aria-label="Filter signs">
        {GROUPS.map((g) => <button key={g.id} className={group === g.id ? "on" : ""} aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>{lang === "ur" ? g.ur : g.en}</button>)}
      </div>
      {shown.length === 0 ? <p className="empty">{t("noSignFound", lang)}</p> : <ul className="sign-grid">
        {shown.map((entry) => {
          const hasRef = (entry.vocabulary_id && clips.byWord.has(entry.vocabulary_id)) || recordings.has(entry.gloss);
          return <li key={entry.gloss}><button className={`sign-card ${target?.gloss === entry.gloss ? "on" : ""}`} onClick={() => setOpen(entry)}>
            <strong dir="auto" className={lang === "ur" ? "urdu" : ""}>{label(entry, lang)}</strong>
            <small dir="auto" className={lang === "en" ? "urdu" : ""}>{secondary(entry, lang)}</small>
            <span className="sign-card-meta">{entry.hands === "two" ? "2 hands" : "1 hand"}{hasRef ? <span className="has-ref"><Icon name="play" size={12} />ref</span> : null}</span>
          </button></li>;
        })}
      </ul>}
    </section>
    {open && <SignSheet entry={open} lang={lang} clips={clips} recordings={recordings} onClose={() => setOpen(null)} onPractise={practise} onSpeak={onSpeakWord} />}
  </div>;
}
