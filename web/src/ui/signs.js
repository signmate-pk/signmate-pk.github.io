// Display helpers for the ASL camera's 250 signs (the ISLR 1st-place model's labels).
// The English word is shown large; the model's gloss (its label, in capitals) is shown under it (CLAUDE.md 10.4).
// English only for now: Urdu returns only for signs whose translation an Urdu editor has reviewed
// (docs/v4_owner_decisions.md, item 2), and none has been reviewed yet. These are word labels, never sign
// descriptions (CLAUDE.md 3).

// Every sign says this until a Deaf ASL reviewer signs it off (CLAUDE.md 10.5).
export const NOT_VALIDATED = "Dataset sign — not yet validated by our reviewers";

// The camera's signs, alphabetical by their English word.
export function cameraSigns(signs) {
  return [...(signs || [])].sort((a, b) => a.english.localeCompare(b.english, "en"));
}

// The word for a sign.
export function label(entry) {
  return entry ? entry.english : "";
}

// The gloss, shown smaller under the word: the model's own label in capitals (THANKYOU, CALLONPHONE).
export function secondary(entry) {
  return entry ? String(entry.gloss).toUpperCase() : "";
}

// Kept so callers written for several output languages keep working: English entries need nothing added.
export function withRoman(entry) {
  return entry;
}
