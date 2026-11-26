// Reply: the hearing person's side (hearing -> Deaf). Type or use voice typing; the reply is shown in very
// large type, can fill the screen and turn 180° for someone across the table, and the words SignMate knows
// play as real PSL dictionary videos, one after another. A word-by-word aid, not signed translation.
import React, { useMemo, useRef, useState } from "react";
import { assetUrl } from "../paths.js";
import { matchWords, phraseIndex } from "../reply.js";
import Icon from "./Icon.jsx";
import { t } from "./i18n.js";

const SAMPLES = { en: ["The doctor is coming.", "Please wait here.", "Thank you. What do you need?"], ur: ["ڈاکٹر آ رہے ہیں۔", "براہ کرم یہاں انتظار کریں۔", "شکریہ۔ آپ کو کیا چاہیے؟"] };

function recognitionClass() {
  return typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
}

export default function ReplyScreen({ entries, clips, lang, history }) {
  const [text, setText] = useState("");
  const [shown, setShown] = useState("");
  const [playing, setPlaying] = useState(-1);
  const [listening, setListening] = useState(false);
  const [full, setFull] = useState(false);
  const [turned, setTurned] = useState(false);
  const videoRef = useRef(null);
  const index = useMemo(() => phraseIndex(entries), [entries]);
  const segments = useMemo(() => (shown ? matchWords(shown, index) : []), [shown, index]);
  const clipFor = (segment) => segment.entry && clips.byWord.get(segment.entry.vocabularyId ?? segment.entry.id);
  const playable = segments.map((segment, i) => ({ i, clip: clipFor(segment) })).filter((item) => item.clip);
  const Recognition = recognitionClass();
  const last = history.at(-1);

  const play = (position) => {
    const item = playable[position];
    if (!item) { setPlaying(-1); return; }
    setPlaying(item.i);
    const video = videoRef.current;
    if (video) { video.src = assetUrl(item.clip.file); video.play().catch(() => {}); video.onended = () => play(position + 1); }
  };
  const showRef = useRef(null);
  const show = (value) => { setShown(value); setPlaying(-1); requestAnimationFrame(() => showRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })); };
  const listen = () => {
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = lang === "ur" ? "ur-PK" : "en-US";
    recognition.interimResults = false;
    recognition.onresult = (event) => { const said = event.results[0][0].transcript; setText(said); show(said); };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    setListening(true);
    recognition.start();
  };

  return <div className="screen screen-reply">
    {last && <section className="card said" aria-label="Last said by the signer">
      <p className="kicker">{lang === "ur" ? "اشارہ کرنے والے نے کہا" : "The signer said"}</p>
      <p className={`said-text ${lang === "ur" ? "urdu" : ""}`} dir="auto">{lang === "ur" ? last.ur : lang === "roman" ? last.roman : last.en}</p>
    </section>}

    <section className="card reply-compose">
      <h1 className="screen-title">{lang === "ur" ? "سننے والے کا جواب" : "Write back"}</h1>
      <p className="muted">{lang === "ur" ? "لکھیں یا بولیں۔ جواب بڑے حروف میں نظر آئے گا، اور جن الفاظ کی ویڈیو ہے وہ پی ایس ایل میں چلیں گے۔" : "Type or speak. Your reply shows in large type, and words with a PSL video play in order."}</p>
      <form onSubmit={(e) => { e.preventDefault(); show(text); }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t("replyPlaceholder", lang)} rows={3} aria-label={t("replyPlaceholder", lang)} dir="auto" />
        <div className="row-wrap">
          <button className="btn btn-primary" type="submit" disabled={!text.trim()}><Icon name="arrow" />{t("show", lang)}</button>
          {Recognition && <button className="btn btn-glass" type="button" onClick={listen} disabled={listening}><Icon name="mic" />{listening ? t("listening", lang) : t("voiceTyping", lang)}</button>}
        </div>
        {Recognition && <small className="muted">{lang === "ur" ? "بول کر لکھنا آپ کے براؤزر کی سروس استعمال کرتا ہے، جو آواز آن لائن بھیج سکتی ہے۔" : "Voice typing uses your browser's speech service, which may send the audio online. Typing stays on this device."}</small>}
      </form>
      <div className="phrase-row">{SAMPLES[lang === "ur" ? "ur" : "en"].map((sample) => <button key={sample} className="phrase" onClick={() => { setText(sample); show(sample); }} dir="auto">{sample}</button>)}</div>
    </section>

    {shown && <section className="card reply-show" ref={showRef}>
      <p className="reply-big" dir="auto">{shown}</p>
      <div className="row-wrap">
        <button className="btn btn-glass" onClick={() => setFull(true)}><Icon name="expand" />{t("fullScreen", lang)}</button>
      </div>
      <div className="word-map" aria-label="Words SignMate knows">
        {segments.map((segment, i) => <span key={`${segment.text}-${i}`} className={`map-word ${segment.entry ? "known" : ""} ${clipFor(segment) ? "has-clip" : ""} ${playing === i ? "playing" : ""}`} dir="auto">{segment.text}{clipFor(segment) ? <Icon name="play" size={12} /> : null}</span>)}
      </div>
      {playable.length ? <div className="reply-player">
        <video ref={videoRef} muted playsInline controls aria-label="PSL dictionary videos for the reply" />
        <button className="btn btn-primary" onClick={() => play(0)}><Icon name="play" />{lang === "ur" ? `${playable.length} ویڈیو ترتیب سے چلائیں` : `Play ${playable.length} PSL ${playable.length === 1 ? "video" : "videos"} in order`}</button>
        <small className="muted">Community dictionary videos (SLT, CC BY 4.0), not yet validated by Deaf signers. Word by word: PSL grammar is not applied.</small>
      </div> : <small className="muted">{lang === "ur" ? "ان الفاظ کی پی ایس ایل ویڈیو ابھی موجود نہیں۔ سائن میٹ کبھی اپنی طرف سے اشارہ نہیں بناتا۔" : "None of these words has a licensed PSL video yet. SignMate never makes up how a sign looks."}</small>}
    </section>}

    {full && <div className={`fullscreen-reply ${turned ? "turned" : ""}`} role="dialog" aria-modal="true" aria-label="Reply in large type">
      <p dir="auto">{shown}</p>
      <div className="row-wrap center">
        <button className="btn btn-glass" onClick={() => setTurned((v) => !v)}><Icon name="rotate" />{t("turnAround", lang)}</button>
        <button className="btn btn-primary" onClick={() => setFull(false)}><Icon name="clear" />{lang === "ur" ? "بند کریں" : "Close"}</button>
      </div>
    </div>}
  </div>;
}
