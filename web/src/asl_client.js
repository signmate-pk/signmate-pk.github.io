// Runs the ASL model in the browser and gives the page one predict(sign) call: LiteRT.js in a Web Worker (or on the
// page if workers fail); the sign is resampled to the fixed frame count in shared_data/asl_islr_spec.json. SignMate is
// a website only (CLAUDE.md 10.7): there is no server. Only landmark numbers are used; no image leaves the browser.
import { confidenceBand, labelsFromIndexMap, resample, toFloat32, topK } from "./asl_islr.js";
import { assetUrl } from "./paths.js";

export async function loadAslLabels(aslSpec, url = assetUrl("models/asl/sign_to_prediction_index_map.json")) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The ASL class list was not found (${response.status}). Run npm run assets.`);
  return labelsFromIndexMap(await response.json(), aslSpec.classes.count);
}

function finish(scoresOrTop, labels, aslSpec, extra) {
  const top = Array.isArray(scoresOrTop) && typeof scoresOrTop[0] === "number" ? topK(scoresOrTop, labels, 5, aslSpec) : scoresOrTop;
  return { top, band: confidenceBand(top[0]?.probability ?? 0, aslSpec), ...extra };
}

export function workerChannel(worker) {
  let nextId = 1;
  const waiting = new Map();
  worker.onmessage = (event) => {
    const { id, ok, result, error } = event.data;
    const entry = waiting.get(id);
    if (!entry) return;
    waiting.delete(id);
    if (ok) entry.resolve(result); else entry.reject(new Error(error));
  };
  worker.onerror = (event) => {
    for (const entry of waiting.values()) entry.reject(new Error(event.message || "the model worker stopped"));
    waiting.clear();
  };
  return (type, payload, transfer = []) => new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, { resolve, reject });
    worker.postMessage({ id, type, payload }, transfer);
  });
}

// URLs are made absolute here, on the page: a worker would resolve relative ones against its own script.
export async function createBrowserAsl({ aslSpec, labels, useWorker = true, modelUrl = assetUrl("models/asl/model.tflite"), wasmPath = assetUrl("litert/") }) {
  const frames = aslSpec.fixed_length.frames;
  const options = { modelUrl, wasmPath, frames, sha256: aslSpec.model.sha256, rowsPerFrame: aslSpec.layout.rows_per_frame };
  let call;
  let info;
  let close;
  if (useWorker && typeof Worker !== "undefined") {
    const worker = new Worker(new URL("./asl_worker.js", import.meta.url), { type: "module" });
    call = workerChannel(worker);
    try {
      info = { ...(await call("init", options)), thread: "worker" };
    } catch (error) {
      worker.terminate();
      throw error;
    }
    close = () => worker.terminate();
  } else {
    const { createLiteRtAslModel } = await import("./asl_litert.js");
    const model = await createLiteRtAslModel(options);
    call = (type, payload) => model.run(payload.input);
    info = { ...model.info, thread: "page" };
    close = () => model.close();
  }
  return {
    kind: "browser",
    info,
    async scoresFixed(fixedSequence) {
      const input = toFloat32(fixedSequence, aslSpec.layout.rows_per_frame);
      return call("run", { input }, [input.buffer]);
    },
    async predict(sequence) {
      const result = await this.scoresFixed(resample(sequence, frames));
      return finish(result.scores, labels, aslSpec, { ms: result.ms, frames: sequence.length, runtime: "browser" });
    },
    close,
  };
}

// The worker first, then the page thread.
export async function createAslRecognizer({ aslSpec, labels }) {
  const errors = [];
  for (const useWorker of [true, false]) {
    try {
      return await createBrowserAsl({ aslSpec, labels, useWorker });
    } catch (error) {
      errors.push(`${useWorker ? "worker" : "page"}: ${error.message || error}`);
    }
  }
  throw new Error(`The ASL model could not start (${errors.join("; ")})`);
}
