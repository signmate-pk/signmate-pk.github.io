// ASL mode browser code: model-file patching (on a hand-built TFLite flatbuffer), resampling, layout,
// segmenter. Needs no npm packages. Cross-language parity with Python is in
// tests/test_asl_islr.py (it runs tests/tools/dump-asl.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { checkAslSpec, confidenceBand, patchTfliteFrames, readTfliteInput, resample, resampleIndices, sequenceForJson, SignSegmenter, toFloat32 } from "../src/asl_islr.js";

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const aslSpec = checkAslSpec(JSON.parse(readFileSync(path.join(project, "shared_data/asl_islr_spec.json"), "utf8")));

// A minimal TFLite-shaped flatbuffer: Model{subgraphs[0]} -> SubGraph{tensors[0], inputs[0]} -> Tensor{shape, shape_signature}.
function buildModel({ shape, signature = null, identifier = "TFL3" }) {
  const buffer = new ArrayBuffer(512);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  bytes.set(Array.from(identifier, (c) => c.charCodeAt(0)), 4);
  let p = 8;
  const alloc = (n) => { const at = p; p = (p + n + 3) & ~3; return at; };
  const vtable = (fields, tableSize) => {
    const size = 4 + 2 * fields.length;
    const at = alloc(size);
    view.setUint16(at, size, true);
    view.setUint16(at + 2, tableSize, true);
    fields.forEach((offset, i) => view.setUint16(at + 4 + 2 * i, offset, true));
    return at;
  };
  const table = (vt, size) => { const at = alloc(size); view.setInt32(at, at - vt, true); return at; };
  // Flatbuffer offsets only point forward, so each table or vector is placed after whatever refers to it.
  const vector = (field, count) => { const at = alloc(4 + 4 * count); view.setUint32(at, count, true); view.setUint32(field, at - field, true); return at; };
  const element = (vectorAt, index, target) => view.setUint32(vectorAt + 4 + 4 * index, target - (vectorAt + 4 + 4 * index), true);
  const ints = (field, values) => { const at = vector(field, values.length); values.forEach((x, i) => view.setInt32(at + 4 + 4 * i, x, true)); };
  const modelVt = vtable([0, 0, 4], 8);
  const subgraphVt = vtable([4, 8], 12);
  const tensorVt = vtable([4, 0, 0, 0, 0, 0, 0, signature ? 8 : 0], 12);
  const model = table(modelVt, 8);
  view.setUint32(0, model, true);
  const subgraphs = vector(model + 4, 1);
  const subgraph = table(subgraphVt, 12);
  element(subgraphs, 0, subgraph);
  const tensors = vector(subgraph + 4, 1);
  ints(subgraph + 8, [0]);
  const tensor = table(tensorVt, 12);
  element(tensors, 0, tensor);
  ints(tensor + 4, shape);
  if (signature) ints(tensor + 8, signature);
  return new Uint8Array(buffer, 0, p);
}

test("the model input is read from the flatbuffer", () => {
  const model = buildModel({ shape: [1, 543, 3], signature: [-1, 543, 3] });
  assert.deepEqual(readTfliteInput(model), { shape: [1, 543, 3], signature: [-1, 543, 3] });
});

test("patching changes only the frame dimension, in a copy", () => {
  const model = buildModel({ shape: [1, 543, 3], signature: [-1, 543, 3] });
  const before = Uint8Array.from(model);
  const patched = patchTfliteFrames(model, 32);
  assert.deepEqual(readTfliteInput(patched), { shape: [32, 543, 3], signature: [32, 543, 3] });
  assert.deepEqual(model, before, "the original bytes must not change");
  assert.equal(patched.length, model.length);
  const changed = patched.reduce((count, byte, i) => count + (byte !== model[i] ? 1 : 0), 0);
  assert.ok(changed > 0 && changed <= 8, `${changed} bytes changed`);
  assert.deepEqual(readTfliteInput(patchTfliteFrames(buildModel({ shape: [1, 543, 3] }), 7)), { shape: [7, 543, 3], signature: null });
});

test("models that are not the ASL model are refused", () => {
  assert.throws(() => patchTfliteFrames(buildModel({ shape: [1, 224, 224, 3] }), 32), /unexpected model input shape/);
  assert.throws(() => patchTfliteFrames(buildModel({ shape: [1, 100, 3], signature: [-1, 100, 3] }), 32), /unexpected/);
  assert.throws(() => patchTfliteFrames(buildModel({ shape: [1, 543, 3], identifier: "XXXX" }), 32), /TFL3/);
  assert.throws(() => patchTfliteFrames(buildModel({ shape: [1, 543, 3] }), 0), /positive integer/);
});

test("resampling keeps the ends and the order", () => {
  assert.deepEqual(resampleIndices(10, 4), [0, 3, 6, 9]);
  assert.deepEqual(resampleIndices(5, 9), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
  assert.deepEqual(resample([..."abcdefghij"], 4), [..."adgj"]);
  assert.throws(() => resampleIndices(0, 3));
});

test("layout, float packing and JSON nulls", () => {
  const parts = aslSpec.layout.parts.map((part) => [part.name, part.start, part.count]);
  assert.deepEqual(parts, [["face", 0, 468], ["left_hand", 468, 21], ["pose", 489, 33], ["right_hand", 522, 21]]);
  const frame = Array.from({ length: 543 }, (_, i) => (i === 522 ? [0.5, 0.25, -0.1] : [NaN, NaN, NaN]));
  const packed = toFloat32([frame, frame]);
  assert.equal(packed.length, 2 * 543 * 3);
  assert.equal(packed[522 * 3 + 1], 0.25);
  assert.ok(Number.isNaN(packed[0]));
  assert.deepEqual(sequenceForJson([frame])[0][522], [0.5, 0.25, -0.1]);
  assert.deepEqual(sequenceForJson([frame])[0][0], [null, null, null]);
});

test("the segmenter finds one sign with its margins", () => {
  const segmenter = new SignSegmenter(aslSpec);
  const stream = [...Array(5).fill(0), ...Array(12).fill(1), ...Array(12).fill(0)];
  const signs = [];
  stream.forEach((present, i) => { const sign = segmenter.push(i, Boolean(present)); if (sign) signs.push(sign); });
  assert.deepEqual(signs, [Array.from({ length: 16 }, (_, i) => i + 3)]);
  assert.equal(confidenceBand(0.9, aslSpec), "sure");
  assert.equal(confidenceBand(0.3, aslSpec), "unsure");
  assert.equal(confidenceBand(0.1, aslSpec), "none");
});

