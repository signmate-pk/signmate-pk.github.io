// What SignMate does with one recognised sign: accept it, ask the person to check, or say it is not sure.
//
// The PSL model already gives calibrated probabilities (temperature 0.55, calibration error 0.004 on the
// fair test, models/psl/manifest.json). This file adds the product rules on top. Every threshold below says
// where it comes from; none of them changes the model or the frozen baseline.
//
//   accept  top-1 >= the sign's threshold AND it leads the runner-up by >= margin. Shown large; the person
//           still confirms before anything is spoken (CLAUDE.md 1, 8.3: every sign is Tier B).
//   check   top-1 >= suggest. "Not sure — is it one of these?" with the top 3 as full-size choices.
//   reject  everything else, "Not a sign" ranked first, or a segment that cannot be a sign (hands resting).
//           The person sees a gentle hint; nothing is shown as a word and nothing is spoken.

export const DEFAULT_POLICY = Object.freeze({
  // models/psl/manifest.json confidence.sure (0.60). Measured on the fair test: when top-1 >= 0.70, 0.8 %
  // of answers were wrong (reports/psl_v3.md); 0.60 is the shipped band edge.
  accept: 0.6,
  // New rule (2026-11-26): the winner must lead the runner-up by 0.15. Guards near-ties between confusable
  // signs, which the single threshold let through. A starting value; tune it on the real-world test set.
  margin: 0.15,
  // models/psl/manifest.json confidence.unsure (0.25): below this, no list of guesses is offered.
  suggest: 0.25,
  // Signs that were weaker on their own held-out test need more confidence before they count as sure:
  // help 83.3 %, where 80.4 % top-1 (manifest classes[].device_held_out), against 94-100 % for the rest.
  perSign: Object.freeze({ help: 0.75, where: 0.75 }),
  // How many choices the "check" state offers.
  choices: 3,
});

export const REASONS = Object.freeze({
  notASign: "not-a-sign",
  resting: "resting",
  tooShort: "too-short",
  low: "low-confidence",
  close: "too-close",
});

// Plain-language hints for each reason (English and Urdu draft, upgrade plan "Bilingual microcopy").
export const HINTS = Object.freeze({
  [REASONS.notASign]: { en: "Not sure — adjust your hand position and sign once more.", ur: "یقین نہیں — ہاتھوں کی جگہ ٹھیک کر کے ایک بار پھر اشارہ کیجیے۔" },
  [REASONS.resting]: { en: "Hands seem to be resting. Lower them fully between signs.", ur: "لگتا ہے ہاتھ رکے ہوئے ہیں۔ ہر اشارے کے بعد ہاتھ پوری طرح نیچے کر لیں۔" },
  [REASONS.tooShort]: { en: "That was very quick. Sign at a steady speed.", ur: "یہ بہت جلدی تھا۔ آرام سے اشارہ کیجیے۔" },
  [REASONS.low]: { en: "Not sure — adjust your hand position and try once more, a little slower.", ur: "یقین نہیں — ہاتھوں کی جگہ ٹھیک کر کے ایک بار پھر، تھوڑا آہستہ کیجیے۔" },
  [REASONS.close]: { en: "Not sure — it could be one of these.", ur: "یقین نہیں — یہ ان میں سے کوئی ہو سکتا ہے۔" },
});

export function thresholdFor(gloss, policy = DEFAULT_POLICY) {
  return Math.max(policy.accept, policy.perSign?.[gloss] ?? 0);
}

// result: { top: [{ gloss, english, urdu, probability, unknown, index, ... }] } from psl_client.predict.
// quality: { hitMaxFrames?, handFrames?, frames? } from the engine (optional).
// -> { verdict: "accept" | "check" | "reject", reason, best, choices, confidence, lead }
export function decide(result, quality = {}, policy = DEFAULT_POLICY) {
  const top = result?.top ?? [];
  const signs = top.filter((entry) => !entry.unknown);
  const best = signs[0] ?? null;
  const runnerUp = top.find((entry) => entry !== top[0]) ?? null;
  const lead = top[0] && runnerUp ? top[0].probability - runnerUp.probability : top[0]?.probability ?? 0;
  const choices = signs.filter((entry) => entry.probability >= 0.02).slice(0, policy.choices);
  const base = { best, choices, confidence: best?.probability ?? 0, lead };

  if (quality.hitMaxFrames) return { ...base, verdict: "reject", reason: REASONS.resting, choices: [] };
  if (!best || top[0]?.unknown) return { ...base, verdict: "reject", reason: REASONS.notASign, choices: [] };
  if (best.probability >= thresholdFor(best.gloss, policy) && lead >= policy.margin) return { ...base, verdict: "accept", reason: null };
  if (best.probability >= policy.suggest) return { ...base, verdict: "check", reason: best.probability >= policy.accept ? REASONS.close : REASONS.low };
  return { ...base, verdict: "reject", reason: REASONS.low, choices: [] };
}

// Practice feedback for the Words screen: did the person's sign match the sign they chose to practise?
// -> { status: "match" | "close" | "miss" | "unclear", rank (1-based or 0), probability }
export function practiceFeedback(decision, result, targetGloss) {
  const top = (result?.top ?? []).filter((entry) => !entry.unknown);
  const position = top.findIndex((entry) => entry.gloss === targetGloss);
  const rank = position + 1;
  const probability = position >= 0 ? top[position].probability : 0;
  if (decision.verdict === "reject") return { status: "unclear", rank, probability };
  if (rank === 1 && decision.verdict === "accept") return { status: "match", rank, probability };
  if (rank >= 1 && rank <= 3) return { status: "close", rank, probability };
  return { status: "miss", rank, probability };
}

// The three words the person sees instead of a percentage (upgrade plan 3.7: no false precision).
export function confidenceWord(decision) {
  if (decision.verdict === "accept") return decision.confidence >= 0.85 ? "sure" : "fairly-sure";
  if (decision.verdict === "check") return "check";
  return "unclear";
}
