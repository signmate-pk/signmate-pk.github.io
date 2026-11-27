"""Write notebooks/asl_mode_eval.ipynb from tools/asl_eval_core.py plus the driver cells below.

    python tools/build_asl_eval_notebook.py

The notebook runs on Kaggle with "Run all" (docs/HOW_TO_RUN_ASL_EVAL.md). Its evaluation code is a
verbatim copy of tools/asl_eval_core.py, which tests/test_asl_eval.py unit-tests; the same test
fails if the notebook is out of date.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CORE = ROOT / "tools" / "asl_eval_core.py"
SPEC = ROOT / "shared_data" / "asl_islr_spec.json"
OUT = ROOT / "notebooks" / "asl_mode_eval.ipynb"

INTRO = """# SignMate (ASL): accuracy on signers the model never saw

This notebook measures SignMate's ASL model (the 1st-place model of Google's Isolated Sign Language
Recognition competition, MIT licence) on the competition's **rerun set**: the hidden test data, released
under CC0, whose signers are reported not to be in the training data.

It measures four ways of running the model: the sign's real length ("native", as the model was built), the
website's 32 frames, and each of those averaged with the sign's left/right mirror image ("test-time
mirroring", with the flip the model was trained with). For each: accuracy, one- and two-handed, left- and
right-dominant, calibration, every sign's result and the full confusion matrix. It also picks a few clear
signs for the website's guided tour.

**How to run:** follow `docs/HOW_TO_RUN_ASL_EVAL.md`. In short: add the dataset *ASL Isolated Sign
Recognition Rerun Set* and your copy of the model as inputs, then **Save & Run All**. It takes roughly
45-120 minutes on Kaggle's free CPU.

**What to send back:** the two files `asl_eval_results.json` and `asl_tour_recordings.json` from the Output
panel. (The printed summary leaves out the per-sign results and the confusion matrix, so the files are needed.)

Nothing here trains anything. Every number it prints is measured, with the dataset and the date."""

SETTINGS = """# Settings. You do not need to change these.
FIXED_LENGTHS = [32]                  # the website's frame count (chosen from the 2026-11-20 run)
FIXED_EVERY = 1                       # every sample (the website's path is the number that matters)
MIRROR = True                         # also average each answer with the sign's mirror image
MAX_SAMPLES = None                    # None = all samples; a number = a quicker, shorter run
TOUR_COUNT = 6                        # recordings for the website's guided tour
INPUT_ROOT = "/kaggle/input"
OUTPUT_FILE = "/kaggle/working/asl_eval_results.json"
TOUR_FILE = "/kaggle/working/asl_tour_recordings.json"
MODEL = {MODEL}
CLASSES = {CLASSES}
"""

LOAD_MODEL = """import json, os, time, datetime, urllib.request
import numpy as np

def get_pinned(item, name):
    found = find_pinned_file(INPUT_ROOT, name, item["sha256"])
    if found:
        print(f"Using the attached {name}: {found}")
        return found
    target = f"/kaggle/working/{name}"
    if not os.path.exists(target) or sha256_of(target) != item["sha256"]:
        print(f"Downloading {name} from {item['url']} (needs Internet switched on in the notebook settings)")
        urllib.request.urlretrieve(item["url"], target)
    if sha256_of(target) != item["sha256"]:
        raise SystemExit(f"{name} is not the pinned file (SHA-256 {sha256_of(target)}). Stop: do not evaluate a different model.")
    return target

model_path = get_pinned(MODEL, "model.tflite")
classes_path = get_pinned(CLASSES, "sign_to_prediction_index_map.json")
index_map = json.load(open(classes_path))
labels = [None] * len(index_map)
for label, index in index_map.items():
    labels[index] = label
assert len(labels) == 250 and None not in labels

try:
    from ai_edge_litert.interpreter import Interpreter
    runtime = "ai-edge-litert"
except ImportError:
    import tensorflow as tf
    Interpreter = tf.lite.Interpreter
    runtime = f"tensorflow {tf.__version__}"
interpreter = Interpreter(model_path=model_path)
runner = interpreter.get_signature_runner("serving_default")
def predict(sequence):
    return runner(inputs=np.asarray(sequence, dtype=np.float32))["outputs"]
print("Model ready:", runtime, "| input", interpreter.get_input_details()[0]["shape_signature"])
"""

FIND_DATA = """found = find_label_table(INPUT_ROOT)
if found is None:
    raise SystemExit("No label table (CSV or parquet with a 'sign' column and a 'path' or 'sequence_id' column) was found. "
                     "Add the 'ASL Isolated Sign Recognition Rerun Set' dataset as input.")
label_path, columns = found
import pandas as pd
table = read_label_table(label_path)
print(f"Label file: {label_path} | columns: {list(table.columns)}")
print(table.head(3).to_string())
base = os.path.dirname(label_path)
if columns["path"] is None:  # the rerun set lists sequence ids; each names a landmark file
    stems = index_landmark_files(base, exclude=[label_path])
    table["path"] = [stems.get(str(value)) for value in table[columns["sequence"]]]
    print(f"Matched {int(table['path'].notna().sum())} of {len(table)} sequence ids to landmark files")
    table = table[table["path"].notna()].reset_index(drop=True)
    columns = {**columns, "path": "path"}
def resolve(relative):
    relative = str(relative)
    if os.path.isabs(relative) and os.path.exists(relative):
        return relative
    for candidate in (os.path.join(base, relative), os.path.join(INPUT_ROOT, relative)):
        if os.path.exists(candidate):
            return candidate
    for folder, _dirs, files in os.walk(base):
        if os.path.basename(relative) in files:
            return os.path.join(folder, os.path.basename(relative))
    return None
unknown = sorted(set(table[columns["sign"]]) - set(labels))
print(f"Samples: {len(table)} | signs: {table[columns['sign']].nunique()} | signers: {table[columns['participant']].nunique() if columns['participant'] else 'not given'}")
if unknown:
    print("Signs not in the model's 250 (skipped):", unknown[:20])
table = table[table[columns["sign"]].isin(labels)].reset_index(drop=True)
if MAX_SAMPLES:
    table = table.iloc[::max(1, len(table) // MAX_SAMPLES)].head(MAX_SAMPLES).reset_index(drop=True)

# Optional: if the competition's own train.csv is attached too, check that no rerun signer was in training.
train_overlap = None
competition = find_label_table(INPUT_ROOT, exclude=[label_path])
if competition and columns["participant"] and competition[1]["participant"]:
    train_ids = set(read_label_table(competition[0])[competition[1]["participant"]])
    train_overlap = sorted(set(table[columns["participant"]]) & train_ids)
    print(f"Signers also in {competition[0]}: {train_overlap if train_overlap else 'none'}")
"""

LAYOUT = """# The competition layout: every frame's rows go face, left_hand, pose, right_hand.
layout_checked = 0
for relative in table[columns["path"]].head(5):
    path = resolve(relative)
    if path:
        load_sequence(path, check_order=True)
        layout_checked += 1
print(f"Row order checked on {layout_checked} files: face, left_hand, pose, right_hand")
"""

RUN = """records, facts, errors, tour_candidates = [], [], [], []
started = time.time()
for i, row in table.iterrows():
    path = resolve(row[columns["path"]])
    if path is None:
        errors.append(f"missing file {row[columns['path']]}")
        continue
    try:
        sequence = load_sequence(path)
        if len(sequence) == 0:
            errors.append(f"empty {row[columns['path']]}")
            continue
        record = evaluate_sample(sequence, labels.index(row[columns["sign"]]), predict, FIXED_LENGTHS if i % FIXED_EVERY == 0 else (), mirror=MIRROR)
        record["participant"] = None if not columns["participant"] else str(row[columns["participant"]])
        records.append(record)
        facts.append(convention_facts(sequence))
        if tour_candidate(record, labels):
            tour_candidates.append({**record, "source": path, "sequence_id": None if not columns["sequence"] else str(row[columns["sequence"]])})
    except Exception as error:
        errors.append(f"{row[columns['path']]}: {error}")
    if (i + 1) % 1000 == 0:
        done = sum(r['native_top5'][0] == r['sign'] for r in records) / max(1, len(records))
        print(f"{i + 1}/{len(table)} samples, {time.time() - started:.0f} s, top-1 so far {done:.3f}")
print(f"Finished {len(records)} samples in {time.time() - started:.0f} s; {len(errors)} could not be read")
"""

SUMMARY = """summary = summarise(records, labels)
results = {
    "notebook": "notebooks/asl_mode_eval.ipynb",
    "measured_on": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
    "dataset": {"name": "ASL Isolated Sign Recognition Rerun Set", "label_file": label_path, "samples_listed": int(len(table)),
                "samples_evaluated": len(records), "unreadable": len(errors), "first_errors": errors[:10],
                "signers": sorted({r["participant"] for r in records if r["participant"] is not None}),
                "signers_also_in_training_csv": train_overlap},
    "model": {"sha256": MODEL["sha256"], "runtime": runtime},
    "machine": {"cpu_count": os.cpu_count(), "note": "Kaggle notebook CPU; latency here is not the laptop's"},
    "layout_files_checked": layout_checked,
    "conventions": convention_summary(facts, records),
    "summary": summary,
}
with open(OUTPUT_FILE, "w") as handle:
    json.dump(results, handle)
short = {key: results[key] for key in ("measured_on", "model", "conventions")}
short["dataset"] = {k: v for k, v in results["dataset"].items() if k != "signers"}
short["summary"] = {k: v for k, v in summary.items() if k not in ("per_sign", "paths")}
short["summary"]["paths"] = {name: {k: v for k, v in path.items() if k not in ("per_sign", "confusion")} for name, path in summary["paths"].items()}
print(json.dumps(short, indent=1))
print(f"\\nSaved {OUTPUT_FILE} ({os.path.getsize(OUTPUT_FILE) // 1024} KB). Download it from the Output panel.")
"""

TOUR = """# The guided tour's recordings: re-checked against the model after compact storage.
tour = []
for candidate in pick_tour(tour_candidates, labels, TOUR_COUNT):
    original = load_sequence(candidate["source"])
    full = softmax_if_needed(predict(original))
    rows = TOUR_ROWS
    data, clipped = encode_rows(original, rows)
    stored = decode_rows(data, len(original), rows)
    difference = max(abs(a - b) for a, b in zip(full, softmax_if_needed(predict(stored))))
    if difference > 1e-3:  # the model read a row that was left out: keep every row instead
        rows = list(range(ROWS_PER_FRAME))
        data, clipped = encode_rows(original, rows)
        stored = decode_rows(data, len(original), rows)
        difference = max(abs(a - b) for a, b in zip(full, softmax_if_needed(predict(stored))))
    expected = {}
    for name, sequence in (("native", stored), ("fixed_32", stored[resample_indices(len(stored), 32)])):
        p = softmax_if_needed(predict(sequence))
        expected[name] = [[labels[i], round(float(p[i]), 6)] for i in top5(p)]
    tour.append({"sign": labels[candidate["sign"]], "sequence_id": candidate["sequence_id"], "frames": int(len(original)),
                 "dominant": candidate["dominant"], "two_handed": candidate["two_handed"], "rows": rows,
                 "all_rows": len(rows) == ROWS_PER_FRAME, "clipped_values": clipped, "data": data,
                 "max_probability_change_from_storage": float(difference), "expected": expected})
    print(f"{labels[candidate['sign']]:>10}: {len(original)} frames, {candidate['dominant']}-dominant, "
          f"rows {len(rows)}, change from storage {difference:.2e}, website path says {expected['fixed_32'][0]}")
tour_file = {"source": "ASL Isolated Sign Recognition Rerun Set (Kaggle, sohier/461054610546105), CC0-1.0",
             "ledger_id": "asl-gislr-rerun-set", "measured_on": results["measured_on"], "model_sha256": MODEL["sha256"],
             "runtime": runtime, "quant": TOUR_QUANT, "nan_code": TOUR_NAN, "rows_per_frame": ROWS_PER_FRAME,
             "candidates_found": len(tour_candidates), "recordings": tour}
with open(TOUR_FILE, "w") as handle:
    json.dump(tour_file, handle)
print(f"\\nSaved {TOUR_FILE} with {len(tour)} recordings ({os.path.getsize(TOUR_FILE) // 1024} KB). Download it from the Output panel.")
"""


def code(source: str) -> dict:
    return {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": source.splitlines(keepends=True)}


def markdown(source: str) -> dict:
    return {"cell_type": "markdown", "metadata": {}, "source": source.splitlines(keepends=True)}


def build() -> dict:
    spec = json.loads(SPEC.read_text(encoding="utf-8"))
    model = {key: spec["model"][key] for key in ("url", "sha256")}
    classes = {key: spec["classes"][key] for key in ("url", "sha256")}
    settings = SETTINGS.replace("{MODEL}", json.dumps(model)).replace("{CLASSES}", json.dumps(classes))
    cells = [markdown(INTRO), code(settings), markdown("## The evaluation code (a copy of tools/asl_eval_core.py)"),
             code(CORE.read_text(encoding="utf-8")), markdown("## Model"), code(LOAD_MODEL), markdown("## Data"),
             code(FIND_DATA), code(LAYOUT), markdown("## Run"), code(RUN), markdown("## Results"), code(SUMMARY),
             markdown("## Guided-tour recordings"), code(TOUR)]
    return {"cells": cells, "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
                                         "language_info": {"name": "python"}}, "nbformat": 4, "nbformat_minor": 5}


def main() -> int:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(build(), indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
