// What the person sees after a sign, on the camera stage:
//  accept -> a large word chip with a confidence ring (no percentages on the main screen, upgrade plan 3.7)
//  check  -> "Not sure. Which one did you sign?" with full-size choices and "None of these"
//  reject -> a gentle hint, never red, never "wrong"
import React from "react";
import { confidenceWord, HINTS } from "../recognition/decision.js";
import { t } from "./i18n.js";
import { label, secondary, withRoman } from "./signs.js";
import Icon from "./Icon.jsx";

const WORDS = {
  sure: { en: "Sure", ur: "یقین" },
  "fairly-sure": { en: "Fairly sure", ur: "کافی یقین" },
  check: { en: "Check", ur: "دیکھ لیں" },
  unclear: { en: "Didn't catch", ur: "سمجھ نہیں آیا" },
};

export function ConfidenceRing({ value, size = 46 }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  return <svg className="ring" width={size} height={size} viewBox="0 0 44 44" aria-hidden="true">
    <circle cx="22" cy="22" r={r} className="ring-track" />
    <circle cx="22" cy="22" r={r} className="ring-value" strokeDasharray={`${c * v} ${c}`} transform="rotate(-90 22 22)" />
  </svg>;
}

export function WordChip({ entry, lang, confidence, word, big = true }) {
  const e = withRoman(entry);
  return <div className={`word-chip ${big ? "big" : ""}`}>
    {confidence != null && <ConfidenceRing value={confidence} />}
    <div className="word-chip-text">
      <strong dir={lang === "ur" ? "rtl" : "auto"} className={lang === "ur" ? "urdu" : ""}>{label(e, lang)}</strong>
      <small dir="auto" className={lang === "en" ? "urdu" : ""}>{secondary(e, lang)}{word ? <span className="conf-word"> · {WORDS[word][lang === "ur" ? "ur" : "en"]}</span> : null}</small>
    </div>
  </div>;
}

export function Hint({ reason, lang }) {
  const hint = HINTS[reason];
  if (!hint) return null;
  return <div className="hint" role="status"><Icon name="info" size={18} /><span>{lang === "ur" ? hint.ur : hint.en}</span></div>;
}

export function ChoiceList({ choices, lang, onPick, onNone }) {
  return <div className="choices">
    {choices.map((entry) => <button key={entry.gloss} className="choice" onClick={() => onPick(entry)}>
      <strong dir="auto" className={lang === "ur" ? "urdu" : ""}>{label(withRoman(entry), lang)}</strong>
      <small dir="auto" className={lang === "en" ? "urdu" : ""}>{secondary(entry, lang)}</small>
    </button>)}
    <button className="choice none" onClick={onNone}><strong>{t("noneOfThese", lang)}</strong><small>{lang === "ur" ? "دوبارہ اشارہ کریں" : "Sign again"}</small></button>
  </div>;
}

// The single-word result on the Words screen.
export default function ResultCard({ item, lang, onConfirm, onDismiss }) {
  if (!item) return null;
  const { decision } = item;
  if (decision.verdict === "reject") return <Hint reason={decision.reason} lang={lang} />;
  if (decision.verdict === "check") {
    return <div className="result-card glass" role="status" aria-live="polite">
      <p className="result-title">{t("checkTitle", lang)}</p>
      <ChoiceList choices={decision.choices} lang={lang} onPick={(entry) => onConfirm(entry, item)} onNone={onDismiss} />
    </div>;
  }
  const best = decision.best;
  const others = decision.choices.slice(1);
  return <div className="result-card glass accept pop" role="status" aria-live="polite">
    <WordChip entry={best} lang={lang} confidence={decision.confidence} word={confidenceWord(decision)} />
    <div className="row-wrap">
      <button className="btn btn-primary" onClick={() => onConfirm(best, item)}><Icon name="speak" />{t("yesSpeak", lang)}</button>
      <button className="btn btn-quiet" onClick={onDismiss}>{t("notThis", lang)}</button>
    </div>
    {others.length > 0 && <div className="alts"><small>{t("orMaybe", lang)}</small>{others.map((entry) => <button key={entry.gloss} className="alt" onClick={() => onConfirm(entry, item)} dir="auto">{label(withRoman(entry), lang)}</button>)}</div>}
  </div>;
}
