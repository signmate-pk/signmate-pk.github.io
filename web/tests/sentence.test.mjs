// Glosses -> sentence rules: reorder and punctuate, never add content (phase-6 task 1).
import test from "node:test";
import assert from "node:assert/strict";
import { buildSentence, contentWords } from "../src/sentence.js";

const e = (gloss, english, urdu) => ({ gloss, english, urdu });
const HELLO = e("hello", "Hello", "ہیلو");
const YOU = e("you", "You", "آپ");
const WATER = e("water", "Water", "پانی");
const WHAT = e("what", "What", "کیا");
const TOMORROW = e("tomorrow", "Tomorrow", "کل");
const SCHOOL = e("school", "School", "اسکول");
const NO = e("no", "No", "نہیں");
const GO = e("go", "Go", "جانا");

test("expressions become their own sentences and glosses are listed", () => {
  const out = buildSentence([HELLO, YOU, WATER]);
  assert.equal(out.text, "Hello. You water.");
  assert.deepEqual(out.glosses, ["HELLO", "YOU", "WATER"]);
});

test("English puts the question word first and time last; Urdu keeps the signed order", () => {
  assert.equal(buildSentence([TOMORROW, YOU, SCHOOL, WHAT]).text, "What you school tomorrow?");
  assert.equal(buildSentence([TOMORROW, YOU, SCHOOL, WHAT], "ur").text, "کل آپ اسکول کیا؟");
});

test("NO inside a clause reads as 'not'; at the start it stays 'no'", () => {
  assert.equal(buildSentence([YOU, GO, NO]).text, "You go not.");
  assert.equal(buildSentence([NO, WATER]).text, "No water.");
});

test("never a content word that no gloss accounts for", () => {
  const glossWords = new Set(["hello", "you", "water", "what", "tomorrow", "school", "go", "not", "no"]);
  for (const sequence of [[HELLO, YOU, WATER], [TOMORROW, YOU, SCHOOL, WHAT], [YOU, GO, NO], [WATER, WATER, WHAT]]) {
    for (const word of contentWords(buildSentence(sequence).text)) assert.ok(glossWords.has(word), word);
  }
});

// The PSL bundle's Urdu labels for question words carry their own "؟" (manifest: where -> "کہاں؟"); the
// clause adds one end mark, so the sentence must not end in "؟؟". Expressions keep their own mark.
const DOCTOR = e("doctor", "Doctor", "ڈاکٹر");
const WHERE_MARKED = e("where", "Where", "کہاں؟");
const HOW_ARE_YOU = e("how_are_you", "How are you?", "آپ کیسے ہیں؟");

test("a label's own question mark is not doubled", () => {
  assert.equal(buildSentence([DOCTOR, WHERE_MARKED], "ur").text, "ڈاکٹر کہاں؟");
  assert.equal(buildSentence([DOCTOR, WHERE_MARKED]).text, "Where doctor?");
});

test("an expression that already ends in a mark gets no second one", () => {
  assert.equal(buildSentence([HOW_ARE_YOU]).text, "How are you?");
  assert.equal(buildSentence([HOW_ARE_YOU], "ur").text, "آپ کیسے ہیں؟");
  assert.equal(buildSentence([HELLO], "ur").text, "ہیلو۔");
});
