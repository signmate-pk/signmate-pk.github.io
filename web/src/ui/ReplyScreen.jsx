// Reply: the hearing person's side. Type or speak a reply; it shows in large type (and full screen, turned around
// for the person opposite). Words that are among the camera's 250 ASL signs are marked, so both people see which
// words SignMate knows. No sign videos yet: licensed ASL clips come with Type → Sign (master-v4 Stage 4), and
// SignMate never makes up how a sign looks (CLAUDE.md 10.3).
import React, { useMemo, useRef, useState } from "react";
import { matchWords, phraseIndex } from "../reply.js";
import Icon from "./Icon.jsx";
import { t } from "./i18n.js";

const SAMPLES = ["Thank you. Please wait here.", "The doctor is coming.", "What do you need?"];

function recognitionClass() {
  return typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
}

export default function ReplyScreen({ entries, lang, history }) {
  const [text, setText] = useState("");
  const [shown, setShown] = useState("");
  const [listening, setListening] = useState(false);
  const [full, setFull] = useState(false);
  const [turned, setTurned] = useState(false);
  const index = useMemo(() => phraseIndex(entries), [entries]);
  const segments = useMemo(() => (shown ? matchWords(shown, index) : []), [shown, index]);
  const known = segments.filter((segment) => segment.entry).length;
  const Recognition = recognitionClass();
  const last = history.at(-1);

  const showRef = useRef(null);
  const show = (value) => { setShown(value); requestAnimationFrame(() => showRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })); };
  const listen = () => {
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.onresult = (event) => { const said = event.results[0][0].transcript; setText(said); show(said); };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    setListening(true);
    recognition.start();
  };

  return <div className="screen screen-reply">
    {last && <section className="card said" aria-label="Last said by the signer">
      <p className="kicker">The signer said</p>
      <p className="said-text">{last.en}</p>
    </section>}

    <section className="card reply-compose">
      <h1 className="screen-title">Write back</h1>
      <p className="muted">Type or speak. Your reply shows in large type for the Deaf person to read.</p>
      <form onSubmit={(e) => { e.preventDefault(); show(text); }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t("replyPlaceholder", lang)} rows={3} aria-label={t("replyPlaceholder", lang)} />
        <div className="row-wrap">
          <button className="btn btn-primary" type="submit" disabled={!text.trim()}><Icon name="arrow" />{t("show", lang)}</button>
          {Recognition && <button className="btn btn-glass" type="button" onClick={listen} disabled={listening}><Icon name="mic" />{listening ? t("listening", lang) : t("voiceTyping", lang)}</button>}
        </div>
        {Recognition && <small className="muted">Voice typing uses your browser's speech service, which may send the audio online. Typing stays on this device.</small>}
      </form>
      <div className="phrase-row">{SAMPLES.map((sample) => <button key={sample} className="phrase" onClick={() => { setText(sample); show(sample); }}>{sample}</button>)}</div>
    </section>

    {shown && <section className="card reply-show" ref={showRef}>
      <p className="reply-big">{shown}</p>
      <div className="row-wrap">
        <button className="btn btn-glass" onClick={() => setFull(true)}><Icon name="expand" />{t("fullScreen", lang)}</button>
      </div>
      <div className="word-map" aria-label="Words among the camera's ASL signs">
        {segments.map((segment, i) => <span key={`${segment.text}-${i}`} className={`map-word ${segment.entry ? "known" : ""}`}>{segment.text}</span>)}
      </div>
      <small className="muted">{known ? `${known} of these ${known === 1 ? "word is" : "words are"} among the camera's 250 ASL signs (marked). ` : ""}ASL sign videos for replies come later, from licensed recordings only: SignMate never makes up how a sign looks.</small>
    </section>}

    {full && <div className={`fullscreen-reply ${turned ? "turned" : ""}`} role="dialog" aria-modal="true" aria-label="Reply in large type">
      <p>{shown}</p>
      <div className="row-wrap center">
        <button className="btn btn-glass" onClick={() => setTurned((v) => !v)}><Icon name="rotate" />{t("turnAround", lang)}</button>
        <button className="btn btn-primary" onClick={() => setFull(false)}><Icon name="clear" />Close</button>
      </div>
    </div>}
  </div>;
}
