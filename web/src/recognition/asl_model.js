// The ASL model as the recognition engine uses it: the ISLR 1st-place model (250 signs, MIT) in LiteRT.js, in a Web
// Worker when the browser allows it (otherwise on the page). It gives the engine one call, predict(sign), that
// returns the top answers in the shape decision.js reads: { gloss, english, index, probability, unknown }.
// Only landmark numbers are used; no image leaves the browser.
import { createBrowserAsl } from "../asl_client.js";
import { displayName, probabilities, resample } from "../asl_islr.js";

const FLOOR = 1e-12;

// The model's 250 signs in output order: gloss = the model's label (shown in capitals under the English, CLAUDE.md
// 10.4), english = its display name from shared_data/asl_islr_spec.json.
export function aslSigns(labels, aslSpec) {
  return labels.map((label, index) => ({ gloss: label, english: displayName(label, aslSpec), index }));
}

// Log-probabilities (what personal.js adapts) from the model's raw output.
export function logProbabilities(scores) {
  return probabilities(scores).map((p) => Math.log(Math.max(p, FLOOR)));
}

// The k most likely signs, highest first (ties: lower index first, as in asl_islr.topK).
export function rankAsl(logScores, signs, k = 5) {
  const p = probabilities(logScores);
  return p.map((probability, index) => ({ index, probability }))
    .sort((a, b) => b.probability - a.probability || a.index - b.index)
    .slice(0, k)
    .map(({ index, probability }) => ({ ...signs[index], probability, unknown: false }));
}

export async function createAslModel({ aslSpec, labels, useWorker = true }) {
  const signs = aslSigns(labels, aslSpec);
  const frames = aslSpec.fixed_length.frames;
  const model = await createBrowserAsl({ aslSpec, labels, useWorker });
  return {
    info: model.info,
    signs,
    // sequence: frames x 543 x 3 (any length; resampled to the browser's fixed frame count).
    // adjust(logScores) -> logScores lets the page add the person's own adaptation (personal.js) before ranking.
    async predict(sequence, _aspect, adjust = (scores) => scores) {
      const result = await model.scoresFixed(resample(sequence, frames));
      const scores = logProbabilities(result.scores);
      const top = rankAsl(adjust(scores), signs);
      return { top, ms: result.ms, frames: sequence.length, scores };
    },
    close: () => model.close(),
  };
}
