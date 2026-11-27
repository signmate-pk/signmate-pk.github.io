"""ASL mode evaluation: the logic of notebooks/asl_mode_eval.ipynb (fast track Stage 2).

Pure Python + numpy (pandas only to read parquet files), so it can be unit-tested without TensorFlow
and copied verbatim into the Kaggle notebook by tools/build_asl_eval_notebook.py. Do not import
project modules here: the notebook runs on Kaggle without the repository.

It measures, on the GISLR "rerun set" (the competition's hidden test data, CC0):
- top-1 / top-5 accuracy with the model's native variable-length input (how the local server runs it);
- top-1 with each fixed frame count (how the browser runs it, after nearest-frame resampling);
- accuracy per signer, for one-handed vs two-handed samples, and for left- vs right-dominant samples;
- how often the predicted probability clears each threshold, and how accurate those predictions are;
- which hand slot holds the dominant hand and how hand slots relate to pose wrists (the hand-slot
  convention that shared_data/asl_islr_spec.json assumes).

Added for master v4, Stage 0 (2026-11-27):
- test-time mirroring: the average of the model's answer on a sign and on its left/right mirror image,
  using the exact flip the model was trained with (`flip_lr` below);
- per "path" (native, native mirrored-average, 32 frames, 32 frames mirrored-average): top-1/top-5,
  groups, calibration, expected calibration error, per-sign results and the full confusion matrix;
- a few clear recordings for the website's guided tour, stored compactly and re-checked against the model.
"""

from __future__ import annotations

import math
import statistics
from typing import Any, Callable, Iterable, Sequence

ROWS_PER_FRAME = 543
TYPE_ORDER = ["face", "left_hand", "pose", "right_hand"]
LEFT_HAND = (468, 489)
POSE = (489, 522)
RIGHT_HAND = (522, 543)
NOSE_ROW = 1  # face mesh point 1 (nose tip)
POSE_LEFT_WRIST = 489 + 15
POSE_RIGHT_WRIST = 489 + 16
THRESHOLDS = (0.25, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9)


def resample_indices(length: int, frames: int) -> list[int]:
    """Nearest-frame indices; identical to ml_engine/asl_islr.py and web/src/asl_islr.js."""
    if length < 1 or frames < 1:
        raise ValueError("length and frames must be at least 1")
    if frames == 1:
        return [0]
    return [(2 * i * (length - 1) + (frames - 1)) // (2 * (frames - 1)) for i in range(frames)]


def softmax_if_needed(scores: Sequence[float]) -> list[float]:
    values = [float(v) for v in scores]
    if values and all(0.0 <= v <= 1.0 for v in values) and abs(sum(values) - 1.0) < 1e-3:
        return values
    top = max(values)
    exps = [math.exp(v - top) for v in values]
    total = sum(exps)
    return [e / total for e in exps]


def top5(probabilities: Sequence[float]) -> list[int]:
    return sorted(range(len(probabilities)), key=lambda i: (-probabilities[i], i))[:5]


# --------------------------------------------------------------------------- the model's own left/right flip
# Copied from the 1st-place solution's training augmentation `flip_lr` (Hoyeol Sohn,
# ISLR_1st_place_Hoyeol_Sohn.ipynb in github.com/hoyso48/Google---Isolated-Sign-Language-Recognition-1st-place-solution,
# MIT licence, read 2026-11-27): x becomes 1 - x and each row below swaps with its partner at the same position.
# The model reads only these face rows plus both hands (its POINT_LANDMARKS: lips, nose, eyes); the pose rows are
# swapped too, exactly as in the original, although the model does not read them.
LIP = [0, 61, 185, 40, 39, 37, 267, 269, 270, 409, 291, 146, 91, 181, 84, 17, 314, 405, 321, 375,
       78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308]
LLIP = [84, 181, 91, 146, 61, 185, 40, 39, 37, 87, 178, 88, 95, 78, 191, 80, 81, 82]
RLIP = [314, 405, 321, 375, 291, 409, 270, 269, 267, 317, 402, 318, 324, 308, 415, 310, 311, 312]
NOSE = [1, 2, 98, 327]
LNOSE = [98]
RNOSE = [327]
REYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 246, 161, 160, 159, 158, 157, 173]
LEYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 466, 388, 387, 386, 385, 384, 398]
LPOSE = [513, 505, 503, 501]
RPOSE = [512, 504, 502, 500]
LHAND_ROWS = list(range(*LEFT_HAND))
RHAND_ROWS = list(range(*RIGHT_HAND))
FLIP_SWAPS = ((LHAND_ROWS, RHAND_ROWS), (LLIP, RLIP), (LPOSE, RPOSE), (LEYE, REYE), (LNOSE, RNOSE))
# Rows the model reads, by its source code (the tour export below checks this against the model itself).
MODEL_ROWS = sorted(set(LIP + LHAND_ROWS + RHAND_ROWS + NOSE + REYE + LEYE))


def flip_permutation() -> list[int]:
    """Row order of the mirrored frame: mirrored[r] = original[perm[r]] (then x -> 1 - x)."""
    perm = list(range(ROWS_PER_FRAME))
    for left, right in FLIP_SWAPS:
        for a, b in zip(left, right):
            perm[a], perm[b] = b, a
    return perm


def flip_lr(sequence):
    """The sign's left/right mirror image, as the model's training augmentation made it."""
    import numpy as np

    flipped = np.asarray(sequence, dtype=np.float32)[:, flip_permutation(), :].copy()
    flipped[..., 0] = 1.0 - flipped[..., 0]
    return flipped


def _entry(probabilities: Sequence[float]) -> dict:
    ranked = top5(probabilities)
    return {"top5": [int(i) for i in ranked], "p": float(probabilities[ranked[0]])}


def _average(a: Sequence[float], b: Sequence[float]) -> list[float]:
    return [(x + y) / 2 for x, y in zip(a, b)]


# --------------------------------------------------------------------------- reading the data

def check_type_order(types: Sequence[str]) -> bool:
    """True when every frame's rows go face, left_hand, pose, right_hand (468, 21, 33, 21 rows)."""
    expected = [name for name, count in zip(TYPE_ORDER, (468, 21, 33, 21)) for _ in range(count)]
    if len(types) % ROWS_PER_FRAME:
        return False
    for start in range(0, len(types), ROWS_PER_FRAME):
        if list(types[start:start + ROWS_PER_FRAME]) != expected:
            return False
    return True


def load_sequence(path: str, check_order: bool = False):
    """The competition reference reader: frames x 543 x 3 float32 from a landmark parquet file."""
    import numpy as np
    import pandas as pd

    columns = ["x", "y", "z"] + (["type"] if check_order else [])
    data = pd.read_parquet(path, columns=columns)
    if check_order and not check_type_order(list(data["type"])):
        raise ValueError(f"{path}: rows are not in face, left_hand, pose, right_hand order")
    frames = len(data) // ROWS_PER_FRAME
    return data[["x", "y", "z"]].values.reshape(frames, ROWS_PER_FRAME, 3).astype(np.float32)


# --------------------------------------------------------------------------- per-sample facts

def _present(frame, rows: tuple[int, int]) -> bool:
    value = float(frame[rows[0]][0])
    return not math.isnan(value)


def hand_facts(sequence) -> dict:
    """Frames with each hand, the dominant slot and whether the sample counts as two-handed.

    Two-handed: both hands are visible in at least half of the frames that show any hand.
    Dominant slot: the hand slot visible in more frames (ties go to 'right').
    """
    left = right = both = 0
    for frame in sequence:
        has_left, has_right = _present(frame, LEFT_HAND), _present(frame, RIGHT_HAND)
        left += int(has_left)
        right += int(has_right)
        both += int(has_left and has_right)
    any_hand = left + right - both
    return {
        "frames": len(sequence),
        "left_frames": left,
        "right_frames": right,
        "both_frames": both,
        "two_handed": bool(any_hand > 0 and both * 2 >= any_hand),
        "dominant": None if any_hand == 0 else ("left" if left > right else "right"),
    }


def convention_facts(sequence) -> dict:
    """Counts that show the hand-slot convention: is the 'right_hand' wrist nearer the pose's right
    wrist (index 16) than its left wrist (15), and is it on the image's left of the nose?"""
    near_pose_right = with_pose = image_left_of_nose = with_nose = 0
    for frame in sequence:
        if not _present(frame, RIGHT_HAND):
            continue
        wx, wy = frame[RIGHT_HAND[0]][0], frame[RIGHT_HAND[0]][1]
        rx, ry = float(frame[POSE_RIGHT_WRIST][0]), float(frame[POSE_RIGHT_WRIST][1])
        lx, ly = float(frame[POSE_LEFT_WRIST][0]), float(frame[POSE_LEFT_WRIST][1])
        wx, wy = float(wx), float(wy)
        if not (math.isnan(rx) or math.isnan(lx)):
            with_pose += 1
            near_pose_right += int((wx - rx) ** 2 + (wy - ry) ** 2 < (wx - lx) ** 2 + (wy - ly) ** 2)
        nx = float(frame[NOSE_ROW][0])
        if not math.isnan(nx):
            with_nose += 1
            image_left_of_nose += int(wx < nx)
    return {"right_slot_frames_with_pose": with_pose, "right_slot_near_pose_right_wrist": near_pose_right,
            "right_slot_frames_with_nose": with_nose, "right_slot_left_of_nose": image_left_of_nose}


# --------------------------------------------------------------------------- evaluation

def evaluate_sample(sequence, sign_index: int, predict: Callable[[Any], Sequence[float]], fixed_lengths: Iterable[int] = (),
                    clock: Callable[[], float] | None = None, mirror: bool = False) -> dict:
    """Native and fixed-length predictions for one sample. `predict` maps frames x 543 x 3 to scores.

    With mirror=True each answer is also computed on the mirrored sign (flip_lr) and the two probability lists
    are averaged ("test-time mirroring"). record["paths"] holds the top 5 and top probability of every path:
    native, native_mirrored, native_tta, fixed_N and (with mirror) fixed_N_tta."""
    import time

    clock = clock or time.perf_counter
    started = clock()
    native = softmax_if_needed(predict(sequence))
    elapsed = (clock() - started) * 1000
    ranked = top5(native)
    record = {"sign": int(sign_index), "native_top5": [int(i) for i in ranked], "native_p": float(native[ranked[0]]), "native_ms": float(elapsed),
              "fixed": {}, "paths": {"native": _entry(native)}, **hand_facts(sequence)}
    if mirror:
        mirrored = softmax_if_needed(predict(flip_lr(sequence)))
        record["paths"]["native_mirrored"] = _entry(mirrored)
        record["paths"]["native_tta"] = _entry(_average(native, mirrored))
    for frames in fixed_lengths:
        indices = resample_indices(len(sequence), frames)
        part = sequence[indices] if hasattr(sequence, "shape") else [sequence[i] for i in indices]
        fixed = softmax_if_needed(predict(part))
        best = max(range(len(fixed)), key=lambda i: (fixed[i], -i))
        record["fixed"][str(frames)] = [int(best), float(fixed[best])]
        record["paths"][f"fixed_{frames}"] = _entry(fixed)
        if mirror:
            record["paths"][f"fixed_{frames}_tta"] = _entry(_average(fixed, softmax_if_needed(predict(flip_lr(part)))))
    return record


def _rate(hits: int, total: int) -> float | None:
    return None if total == 0 else hits / total


def summarise(records: Sequence[dict], labels: Sequence[str], thresholds: Sequence[float] = THRESHOLDS) -> dict:
    """Every number in reports/asl_mode_v1.md comes from this dictionary."""
    def top1(rs):
        return _rate(sum(r["native_top5"][0] == r["sign"] for r in rs), len(rs))

    def top5_rate(rs):
        return _rate(sum(r["sign"] in r["native_top5"] for r in rs), len(rs))

    out: dict[str, Any] = {"samples": len(records), "native": {"top1": top1(records), "top5": top5_rate(records)}}
    lengths = sorted({int(k) for r in records for k in r["fixed"]})
    fixed = {}
    for frames in lengths:
        subset = [r for r in records if str(frames) in r["fixed"]]
        fixed[str(frames)] = {"samples": len(subset),
                              "top1": _rate(sum(r["fixed"][str(frames)][0] == r["sign"] for r in subset), len(subset)),
                              "native_top1_same_samples": top1(subset)}
    out["fixed_length"] = fixed
    if fixed:
        best = max(fixed, key=lambda k: (fixed[k]["top1"] or 0, -int(k)))
        out["best_fixed_length"] = {"frames": int(best), "top1": fixed[best]["top1"],
                                    "loss_vs_native": None if fixed[best]["top1"] is None else fixed[best]["native_top1_same_samples"] - fixed[best]["top1"]}
    groups = {}
    for name, test in (("one_handed", lambda r: not r["two_handed"]), ("two_handed", lambda r: r["two_handed"]),
                       ("dominant_left", lambda r: r["dominant"] == "left"), ("dominant_right", lambda r: r["dominant"] == "right"),
                       ("no_hands", lambda r: r["dominant"] is None)):
        members = [r for r in records if test(r)]
        groups[name] = {"samples": len(members), "top1": top1(members), "top5": top5_rate(members)}
    out["groups"] = groups
    participants = sorted({r.get("participant") for r in records if r.get("participant") is not None}, key=str)
    out["per_signer"] = {str(p): {"samples": sum(r.get("participant") == p for r in records),
                                  "top1": top1([r for r in records if r.get("participant") == p])} for p in participants}
    calibration = []
    for t in thresholds:
        covered = [r for r in records if r["native_p"] >= t]
        calibration.append({"threshold": t, "coverage": _rate(len(covered), len(records)), "accuracy_when_covered": top1(covered)})
    out["calibration"] = calibration
    good = [c for c in calibration if c["accuracy_when_covered"] is not None and c["accuracy_when_covered"] >= 0.95]
    out["suggested_sure_threshold"] = good[0]["threshold"] if good else None
    times = [r["native_ms"] for r in records]
    if times:
        ordered = sorted(times)
        out["latency_ms"] = {"median": statistics.median(times), "p90": ordered[min(len(ordered) - 1, int(0.9 * len(ordered)))]}
    per_sign = {}
    for index, label in enumerate(labels):
        members = [r for r in records if r["sign"] == index]
        if members:
            per_sign[label] = {"samples": len(members), "top1": top1(members)}
    out["per_sign"] = per_sign
    names = sorted({name for r in records for name in r.get("paths", {})}, key=_path_order)
    out["paths"] = {name: path_summary(records, name, labels, thresholds) for name in names}
    return out


def _path_order(name: str):
    return (0 if name.startswith("native") else 1, len(name), name)


def expected_calibration_error(pairs: Sequence[tuple[float, bool]], bins: int = 15) -> float | None:
    """ECE with `bins` equal-width bins of the top-1 probability: the average gap between how sure the model
    was and how often it was right, weighted by how many answers fall in each bin."""
    if not pairs:
        return None
    totals = [[0, 0.0, 0] for _ in range(bins)]  # count, sum of confidence, correct
    for confidence, correct in pairs:
        b = min(bins - 1, max(0, int(confidence * bins)))
        totals[b][0] += 1
        totals[b][1] += confidence
        totals[b][2] += int(correct)
    return sum(abs(c / n - s / n) * n for n, s, c in totals if n) / len(pairs)


def path_summary(records: Sequence[dict], name: str, labels: Sequence[str], thresholds: Sequence[float] = THRESHOLDS) -> dict:
    """Everything the project page and reports need for one path: accuracy, groups, calibration, per sign and
    the confusion matrix (sparse: [true index, answered index, count], every non-zero cell)."""
    rs = [r for r in records if name in r.get("paths", {})]

    def hit(r):
        return r["paths"][name]["top5"][0] == r["sign"]

    def top1(members):
        return _rate(sum(hit(r) for r in members), len(members))

    def top5_rate(members):
        return _rate(sum(r["sign"] in r["paths"][name]["top5"] for r in members), len(members))

    out: dict[str, Any] = {"samples": len(rs), "top1": top1(rs), "top5": top5_rate(rs)}
    groups = {}
    for group, test in (("one_handed", lambda r: not r["two_handed"]), ("two_handed", lambda r: r["two_handed"]),
                        ("dominant_left", lambda r: r["dominant"] == "left"), ("dominant_right", lambda r: r["dominant"] == "right")):
        members = [r for r in rs if test(r)]
        groups[group] = {"samples": len(members), "top1": top1(members), "top5": top5_rate(members)}
    out["groups"] = groups
    left, right = groups["dominant_left"]["top1"], groups["dominant_right"]["top1"]
    out["left_right_gap"] = None if left is None or right is None else left - right
    out["calibration"] = [{"threshold": t, "coverage": _rate(len(c), len(rs)), "accuracy_when_covered": top1(c), "wrong_when_covered": None if not c else 1 - top1(c)}
                          for t in thresholds for c in [[r for r in rs if r["paths"][name]["p"] >= t]]]
    out["ece"] = expected_calibration_error([(r["paths"][name]["p"], hit(r)) for r in rs])
    cells: dict[tuple[int, int], int] = {}
    for r in rs:
        key = (r["sign"], r["paths"][name]["top5"][0])
        cells[key] = cells.get(key, 0) + 1
    out["confusion"] = [[t, a, n] for (t, a), n in sorted(cells.items())]
    per_sign = {}
    for index, label in enumerate(labels):
        members = [r for r in rs if r["sign"] == index]
        if not members:
            continue
        wrong = sorted(((n, a) for (t, a), n in cells.items() if t == index and a != index), key=lambda x: (-x[0], x[1]))[:3]
        per_sign[label] = {"samples": len(members), "top1": top1(members), "top5": top5_rate(members),
                           "confused_with": [[labels[a], n] for n, a in wrong]}
    out["per_sign"] = per_sign
    return out


# --------------------------------------------------------------------------- guided-tour recordings
# A few clear, short, correctly read signs from the rerun set (CC0), stored as int16 (value x 10,000; -32768 for a
# missing point) so the website's guided tour can replay them through the real model with no camera.
TOUR_SIGNS = ("hello", "thankyou", "please", "yes", "no", "water", "mom", "dad", "happy", "bye")
TOUR_QUANT = 10000
TOUR_NAN = -32768
TOUR_ROWS = sorted(set(MODEL_ROWS) | set(range(*POSE)))  # what the model reads, plus the pose for drawing arms


def tour_candidate(record: dict, labels: Sequence[str], min_p: float = 0.9, min_frames: int = 12, max_frames: int = 64,
                   path: str = "fixed_32") -> bool:
    """A sign worth showing: one of TOUR_SIGNS, short, with a hand in view, and read right with at least `min_p` on
    the native path and on the browser's path."""
    if labels[record["sign"]] not in TOUR_SIGNS or record["dominant"] is None or not (min_frames <= record["frames"] <= max_frames):
        return False
    for name in ("native", path):
        entry = record.get("paths", {}).get(name)
        if not entry or entry["top5"][0] != record["sign"] or entry["p"] < min_p:
            return False
    return True


def pick_tour(candidates: Sequence[dict], labels: Sequence[str], count: int = 6, path: str = "fixed_32") -> list[dict]:
    """One candidate per sign, in TOUR_SIGNS order, the surest first; at least one left-dominant signer if any
    candidate has one. Each candidate is a record with an extra "source" key (where its file is)."""
    by_sign: dict[str, list[dict]] = {}
    for record in candidates:
        by_sign.setdefault(labels[record["sign"]], []).append(record)
    chosen = []
    for sign in TOUR_SIGNS:
        if sign in by_sign and len(chosen) < count:
            chosen.append(max(by_sign[sign], key=lambda r: (r["paths"][path]["p"], -r["frames"])))
    if chosen and not any(r["dominant"] == "left" for r in chosen):
        for i in range(len(chosen) - 1, -1, -1):
            lefts = [r for r in by_sign[labels[chosen[i]["sign"]]] if r["dominant"] == "left"]
            if lefts:
                chosen[i] = max(lefts, key=lambda r: (r["paths"][path]["p"], -r["frames"]))
                break
    return chosen


def encode_rows(sequence, rows: Sequence[int]) -> tuple[str, int]:
    """Base64 of int16 little-endian values (frames x len(rows) x 3) and how many values had to be clipped."""
    import base64
    import numpy as np

    part = np.asarray(sequence, dtype=np.float64)[:, list(rows), :]
    scaled = np.round(part * TOUR_QUANT)
    clipped = int(np.sum(np.abs(scaled[~np.isnan(scaled)]) > 32767))
    codes = np.where(np.isnan(scaled), TOUR_NAN, np.clip(np.nan_to_num(scaled), -32767, 32767)).astype("<i2")
    return base64.b64encode(codes.tobytes()).decode("ascii"), clipped


def decode_rows(text: str, frames: int, rows: Sequence[int], total_rows: int = ROWS_PER_FRAME):
    """The inverse of encode_rows: frames x total_rows x 3 float32, NaN in every row that was not stored."""
    import base64
    import numpy as np

    codes = np.frombuffer(base64.b64decode(text), dtype="<i2").reshape(frames, len(rows), 3)
    values = codes.astype(np.float32) / TOUR_QUANT
    values[codes == TOUR_NAN] = np.nan
    out = np.full((frames, total_rows, 3), np.nan, dtype=np.float32)
    out[:, list(rows), :] = values
    return out


def convention_summary(facts: Iterable[dict], hand_records: Iterable[dict]) -> dict:
    facts = list(facts)
    hand_records = list(hand_records)
    total = {key: sum(f[key] for f in facts) for key in ("right_slot_frames_with_pose", "right_slot_near_pose_right_wrist",
                                                          "right_slot_frames_with_nose", "right_slot_left_of_nose")}
    dominant = [r["dominant"] for r in hand_records if r["dominant"] is not None]
    return {
        "right_slot_near_pose_right_wrist": _rate(total["right_slot_near_pose_right_wrist"], total["right_slot_frames_with_pose"]),
        "right_slot_left_of_nose_in_image": _rate(total["right_slot_left_of_nose"], total["right_slot_frames_with_nose"]),
        "samples_with_right_slot_dominant": _rate(sum(d == "right" for d in dominant), len(dominant)),
        "frames_counted": total,
    }


# --------------------------------------------------------------------------- finding inputs on Kaggle

def sha256_of(path: str) -> str:
    import hashlib

    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def find_pinned_file(root: str, name: str, sha256: str) -> str | None:
    """A file called `name` under `root` whose SHA-256 is `sha256` (an attached dataset), or None."""
    import os

    for folder, _dirs, files in os.walk(root):
        if name in files:
            path = os.path.join(folder, name)
            if sha256_of(path) == sha256:
                return path
    return None


LABEL_TABLE_SUFFIXES = (".csv", ".parquet", ".parqet", ".pq")  # the rerun set names its file "labels.parqet"
SKIP_DIR_HINTS = ("landmark",)  # folders full of per-sample landmark files are never label tables


def table_columns(path: str) -> list[str]:
    """Column names of a CSV or parquet file, without reading all of it."""
    if path.lower().endswith(".csv"):
        import csv

        with open(path, newline="", encoding="utf-8") as handle:
            return [h.strip() for h in next(csv.reader(handle), [])]
    try:
        import pyarrow.parquet as pq

        return list(pq.read_schema(path).names)
    except Exception:  # noqa: BLE001 (no pyarrow, or not a parquet file)
        try:
            import pandas as pd

            return [str(c) for c in pd.read_parquet(path).columns]
        except Exception:  # noqa: BLE001
            return []


def label_columns(names: Iterable[str]) -> dict | None:
    """Which columns hold the sign, the landmark file (or the sequence id that names it) and the signer."""
    lower = {str(h).strip().lower(): h for h in names}
    path_col = lower.get("path") or lower.get("file") or lower.get("filename")
    sequence_col = lower.get("sequence_id") or lower.get("sequence") or lower.get("id")
    sign_col = lower.get("sign") or lower.get("label")
    if not sign_col or not (path_col or sequence_col):
        return None
    participant_col = lower.get("participant_id") or lower.get("participant") or lower.get("signer")
    return {"path": path_col, "sequence": sequence_col, "sign": sign_col, "participant": participant_col}


def find_label_table(root: str, exclude: Iterable[str] = ()) -> tuple[str, dict] | None:
    """The table listing samples and signs: (path, columns for path / sequence, sign, participant).

    Accepts the competition's train.csv (path, participant_id, sequence_id, sign), the rerun set's
    labels.parqet (sequence ids instead of paths) and close variants, as CSV or parquet.
    """
    import os

    excluded = {os.path.abspath(p) for p in exclude}
    candidates = []
    for folder, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if not any(hint in d.lower() for hint in SKIP_DIR_HINTS)]
        for name in sorted(files):
            path = os.path.join(folder, name)
            if not name.lower().endswith(LABEL_TABLE_SUFFIXES) or os.path.abspath(path) in excluded:
                continue
            columns = label_columns(table_columns(path))
            if columns:
                candidates.append((path, columns))
    if not candidates:
        return None
    candidates.sort(key=lambda item: (item[1]["participant"] is None, item[1]["path"] is None, len(item[0])))
    return candidates[0]


find_label_csv = find_label_table  # the name used before the rerun set's parquet label file was known


def read_label_table(path: str):
    import pandas as pd

    return pd.read_csv(path) if path.lower().endswith(".csv") else pd.read_parquet(path)


def index_landmark_files(root: str, exclude: Iterable[str] = ()) -> dict[str, str]:
    """File stem -> path for every landmark parquet file under root (sequence id -> its file)."""
    import os

    excluded = {os.path.abspath(p) for p in exclude}
    index = {}
    for folder, _dirs, files in os.walk(root):
        for name in files:
            stem, suffix = os.path.splitext(name)
            path = os.path.join(folder, name)
            if suffix.lower() == ".parquet" and os.path.abspath(path) not in excluded:
                index.setdefault(stem, path)
    return index