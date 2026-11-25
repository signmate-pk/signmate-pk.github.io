// "Ask SignMate": a small offline helper (master-v3 Stage 4). It answers only from SignMate's own data:
// the dictionary videos, the PSL camera's sign list and the help text. It never describes how to make a sign in
// words and never invents one: if there is no licensed video, it says so.
import React, { useEffect, useRef, useState } from "react";
import { assetUrl } from "./paths.js";
import { answer } from "./helper.js";

export default function HelperChat({ vocabulary, pslClasses }) {
  const [dictionary, setDictionary] = useState([]);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const end = useRef(null);
  useEffect(() => {
    fetch(assetUrl("psl_dictionary.json")).then((r) => (r.ok ? r.json() : { entries: [] })).then((data) => setDictionary(data.entries || [])).catch(() => {});
  }, []);
  // Scroll only the message box, and only once there are messages. scrollIntoView() also scrolled the whole
  // page on load, so phone visitors landed halfway down, below the camera.
  useEffect(() => {
    const box = end.current?.parentElement;
    if (box && messages.length) box.scrollTop = box.scrollHeight;
  }, [messages]);
  const ask = (event) => {
    event.preventDefault();
    if (!text.trim()) return;
    setMessages((list) => [...list, { from: "you", text }, { from: "helper", ...answer(text, { dictionary, vocabulary, pslClasses }) }].slice(-12));
    setText("");
  };
  return <div className="helper-chat panel">
    <div className="panel-heading"><div><span className="section-kicker">ASK SIGNMATE · WORKS OFFLINE</span><h2>Helper</h2></div><small>Answers only from SignMate's own data.</small></div>
    <div className="helper-messages" aria-live="polite">{messages.length === 0 && <p className="helper-hint">Try: “how do I sign doctor”, “which signs does the camera know”, “does it work offline?”</p>}
      {messages.map((m, i) => <div key={i} className={`helper-message ${m.from}`}><p dir="auto">{m.text}</p>{m.video && <video src={m.video} controls loop muted playsInline autoPlay aria-label="PSL dictionary video" />}</div>)}<div ref={end} /></div>
    <form className="helper-form" onSubmit={ask}><input value={text} onChange={(event) => setText(event.target.value)} placeholder="Ask a question" aria-label="Ask SignMate" dir="auto" /><button className="button button-primary" type="submit">Ask</button></form>
  </div>;
}
