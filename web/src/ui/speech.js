// Speaking with the browser's own voices (speechSynthesis), on the device. Urdu uses an ur-* voice when
// the device has one; otherwise SignMate says so and reads the Roman Urdu with the English voice, instead
// of failing silently (upgrade plan 3.8). Every spoken line is also shown as a caption by the caller.
import { buildSentence } from "../sentence.js";

export const speechStats = { lastStartMs: null };

let voicesCache = null;
function voices() {
  if (typeof speechSynthesis === "undefined") return [];
  const list = speechSynthesis.getVoices();
  if (list.length) voicesCache = list;
  return voicesCache || list;
}
if (typeof speechSynthesis !== "undefined") speechSynthesis.addEventListener?.("voiceschanged", () => { voicesCache = speechSynthesis.getVoices(); });

export function canSpeak() {
  return typeof speechSynthesis !== "undefined" && typeof SpeechSynthesisUtterance !== "undefined";
}

export function hasUrduVoice() {
  return voices().some((voice) => /^ur(-|_|$)/i.test(voice.lang));
}

// lines: { en, ur, roman }; lang: "en" | "ur" | "roman".
// -> { spoken: text actually spoken, lang used, fallback: null | "roman" | "none" }
export function speak(lines, lang, { rate = 0.95, onStart, onEnd } = {}) {
  if (!canSpeak()) return { spoken: null, fallback: "none" };
  let text = lines.en;
  let bcp = "en-US";
  let fallback = null;
  if (lang === "ur") {
    if (hasUrduVoice()) { text = lines.ur; bcp = "ur-PK"; } else { text = lines.roman || lines.en; bcp = "en-IN"; fallback = "roman"; }
  } else if (lang === "roman") {
    text = lines.roman || lines.en;
    bcp = "en-IN";
  }
  if (!text) return { spoken: null, fallback: "none" };
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = bcp;
  const voice = voices().find((v) => v.lang?.toLowerCase() === bcp.toLowerCase()) || voices().find((v) => v.lang?.toLowerCase().startsWith(bcp.slice(0, 2)));
  if (voice) utterance.voice = voice;
  utterance.rate = rate;
  const asked = performance.now();
  utterance.onstart = () => { speechStats.lastStartMs = performance.now() - asked; onStart?.(); };
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  speechSynthesis.speak(utterance);
  return { spoken: text, lang: bcp, fallback };
}

export function stopSpeaking() {
  if (canSpeak()) speechSynthesis.cancel();
}

// The sentence from the tray in all three forms. Roman Urdu keeps the Urdu (signed) order.
export function sentenceLines(words) {
  const en = buildSentence(words, "en");
  const ur = buildSentence(words, "ur");
  const romanWords = words.map((w) => ({ gloss: w.gloss, english: w.romanUrdu || w.english, urdu: w.romanUrdu || w.english }));
  const romanRaw = buildSentence(romanWords, "ur").text.replace(/؟/g, "?").replace(/۔/g, ".");
  const roman = romanRaw.replace(/(^|[.?!]\s+)([a-z])/g, (_, a, b) => a + b.toUpperCase());
  return { en: en.text, ur: ur.text, roman, glosses: en.glosses };
}

export function wordLines(entry) {
  return { en: entry.english, ur: entry.urdu || entry.english, roman: entry.romanUrdu || entry.english };
}
