// Real recorded PSL signs for the guided tour and as practice references: six hand-landmark recordings
// from the SignSpeak dataset (Apache-2.0, ledger psl-signspeak-words: redistribute_data allowed), copied
// from tests/golden/psl_parity_cases.json by scripts/copy-assets.mjs. They are landmark numbers (no video),
// already trimmed and resampled to the model's 32 frames, with the shipped model's saved top-5 answers.
import { assetUrl } from "../paths.js";
import { pslFrame } from "../recognition/engine.js";
import { rankPsl, pslBand } from "../psl_client.js";

let loading = null;

export function loadRecordings() {
  loading ??= fetch(assetUrl("demo_signs.json"))
    .then((response) => (response.ok ? response.json() : { cases: [] }))
    .then((data) => {
      const byGloss = new Map();
      for (const item of data.cases || []) {
        const frames = [];
        for (let f = 0; f < item.hands.length / 2; f += 1) {
          const hand = (h) => (h && h[0] && h[0][0] !== null ? h : null);
          frames.push({ left: hand(item.hands[2 * f]), right: hand(item.hands[2 * f + 1]) });
        }
        byGloss.set(item.sign, { gloss: item.sign, frames, top5: item.top5, top5Scores: item.top5_scores });
      }
      return byGloss;
    })
    .catch(() => new Map());
  return loading;
}

// The model's input sequence (32 x 543 x 3) for a recording.
export function recordingSequence(recording) {
  return recording.frames.map(({ left, right }) => pslFrame(left, right));
}

// The shipped model's saved answer for a recording, shaped like psl_client.predict's result. Used only when
// the model cannot run on this device; the tour then says the result is a saved one.
export function savedResult(recording, manifest) {
  const scores = new Array(manifest.classes.length).fill(-30);
  recording.top5.forEach((index, i) => { scores[index] = recording.top5Scores[i]; });
  const top = rankPsl(scores, manifest);
  return { top, band: pslBand(top, manifest), ms: null, frames: 32, saved: true };
}
