// The sentence tray: accepted signs wait for a short pause before they join the sentence, so a quick
// correction (or a sign the tracker cut in two) never lands as a word. Pure functions, no React, so the
// rules are tested on their own (web/tests/sentence-tray.test.mjs).
//
//   offer(state, word, now)    an accepted sign arrives. The same sign again within repeatMs of the pending
//                              or last word is treated as one sign cut in two and ignored. A different sign
//                              first commits the pending one.
//   tick(state, now)           commits the pending word once pauseMs have passed with no new sign.
//   cancelPending, remove, replace, undo, clear: the person's corrections.
//
// Nothing here speaks. The sentence is spoken only when the person presses Speak (one confirmation per
// sentence, upgrade plan Phase 1), and only accepted or person-chosen words ever enter the tray.

export const TRAY_DEFAULTS = Object.freeze({ pauseMs: 1200, repeatMs: 1500, maxWords: 20 });

export function emptyTray() {
  return { words: [], pending: null, lastAt: -Infinity, lastGloss: null };
}

function same(a, b) {
  return Boolean(a && b) && a === b;
}

function commit(state) {
  if (!state.pending) return state;
  const words = [...state.words, state.pending.word].slice(-TRAY_DEFAULTS.maxWords);
  return { ...state, words, pending: null };
}

// word: { gloss, english, urdu, romanUrdu?, choices?, scores?, index? }
export function offer(state, word, now, options = TRAY_DEFAULTS) {
  if (!word?.gloss) return state;
  const recent = now - state.lastAt < options.repeatMs;
  if (recent && same(word.gloss, state.lastGloss)) return { ...state, lastAt: now };
  const committed = state.pending ? commit(state) : state;
  return { ...committed, pending: { word, at: now }, lastAt: now, lastGloss: word.gloss };
}

export function tick(state, now, options = TRAY_DEFAULTS) {
  if (state.pending && now - state.pending.at >= options.pauseMs) return commit(state);
  return state;
}

// 0..1: how far the pending word is through its pause (for the progress ring).
export function pendingProgress(state, now, options = TRAY_DEFAULTS) {
  if (!state.pending) return 0;
  return Math.max(0, Math.min(1, (now - state.pending.at) / options.pauseMs));
}

export function commitNow(state) {
  return commit(state);
}

export function cancelPending(state) {
  return { ...state, pending: null, lastGloss: state.words.at(-1)?.gloss ?? null };
}

export function remove(state, index) {
  return { ...state, words: state.words.filter((_, i) => i !== index) };
}

export function replace(state, index, word) {
  return { ...state, words: state.words.map((item, i) => (i === index ? { ...word, choices: item.choices, scores: item.scores } : item)) };
}

export function undo(state) {
  if (state.pending) return cancelPending(state);
  return { ...state, words: state.words.slice(0, -1), lastGloss: null };
}

export function clear() {
  return emptyTray();
}

// Words plus the pending one, for building the sentence text while the person watches.
export function allWords(state) {
  return state.pending ? [...state.words, state.pending.word] : state.words;
}
