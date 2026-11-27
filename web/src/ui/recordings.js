// Real recorded ASL signs for the guided tour and the sign gallery: a few sequences from the GISLR rerun set (CC0,
// ledger asl-gislr-rerun-set: reference_clip and redistribute_data allowed), picked and re-checked by
// notebooks/asl_mode_eval.ipynb, committed as shared_data/tour/asl_tour_recordings.json and copied to the site as
// tour/asl_tour.json by scripts/copy-assets.mjs. They are landmark numbers of Deaf signers (no
// video), stored as int16 (value x quant, nan_code for a missing point) for the rows the model reads plus the pose.
// Until the owner's Kaggle run delivers the file, there are none and the tour says so.
import { assetUrl } from "../paths.js";

const LEFT = 468;
const POSE = 489;
const RIGHT = 522;
const ARM_ROWS = [11, 12, 13, 14, 15, 16]; // pose: shoulders, elbows, wrists

let loading = null;

function bytesFromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// One stored recording -> { gloss, sequence (frames x 543 x [x, y, z], NaN where missing), frames (for drawing),
// expected (the notebook's top 5 on the browser's path), dominant }.
export function decodeRecording(item, file) {
  const rows = item.rows;
  const total = file.rows_per_frame ?? 543;
  const bytes = bytesFromBase64(item.data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const per = rows.length * 3;
  if (bytes.byteLength !== item.frames * per * 2) throw new Error(`recording ${item.sign} has ${bytes.byteLength} bytes, expected ${item.frames * per * 2}`);
  const sequence = [];
  for (let f = 0; f < item.frames; f += 1) {
    const frame = Array.from({ length: total }, () => [NaN, NaN, NaN]);
    rows.forEach((row, r) => {
      const point = [0, 1, 2].map((c) => {
        const code = view.getInt16(2 * (f * per + r * 3 + c), true);
        return code === file.nan_code ? NaN : code / file.quant;
      });
      frame[row] = point;
    });
    sequence.push(frame);
  }
  const has = (frame, start) => !Number.isNaN(frame[start][0]);
  const frames = sequence.map((frame) => ({
    left: has(frame, LEFT) ? frame.slice(LEFT, LEFT + 21) : null,
    right: has(frame, RIGHT) ? frame.slice(RIGHT, RIGHT + 21) : null,
    face: rows.filter((row) => row < LEFT && !Number.isNaN(frame[row][0])).map((row) => frame[row]),
    arms: ARM_ROWS.map((i) => frame[POSE + i]),
  }));
  return { gloss: item.sign, sequence, frames, expected: item.expected?.fixed_32 ?? [], dominant: item.dominant, source: file.source };
}

export function loadRecordings(url = assetUrl("tour/asl_tour.json")) {
  loading ??= fetch(url)
    .then((response) => (response.ok ? response.json() : { recordings: [] }))
    .then((file) => {
      const byGloss = new Map();
      for (const item of file.recordings || []) {
        try { byGloss.set(item.sign, decodeRecording(item, file)); } catch { /* a damaged entry is left out */ }
      }
      return byGloss;
    })
    .catch(() => new Map());
  return loading;
}

// The notebook's saved answer for a recording, shaped like asl_model.predict's result (log-probabilities are not
// needed). Used only when the model cannot run on this device; the tour then says the result is a saved one.
export function savedResult(recording, signs) {
  const byGloss = new Map(signs.map((sign) => [sign.gloss, sign]));
  const top = recording.expected.filter(([gloss]) => byGloss.has(gloss)).map(([gloss, probability]) => ({ ...byGloss.get(gloss), probability, unknown: false }));
  return { top, ms: null, frames: recording.sequence.length, saved: true };
}
