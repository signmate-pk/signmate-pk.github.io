"""Builds shared_data/asl_results.json: the ASL test results the website shows, computed from the newest committed
Kaggle results file (reports/asl_eval_results_YYYY-MM-DD.json), never typed by hand.

    python tools/asl_results.py          write shared_data/asl_results.json
    python tools/asl_results.py --check  exit 1 if the committed file is out of date

Where the numbers come from
---------------------------
notebooks/asl_mode_eval.ipynb runs the ASL model on the GISLR rerun set (39,443 signs, CC0) on Kaggle and
writes asl_eval_results.json; the owner downloads it and it is committed as reports/asl_eval_results_<date>.json.
From the master-v4 version of the notebook on, the file holds, for each way of running the model ("path":
native length, the website's 32 frames, and each with test-time mirroring), the full confusion matrix and every
sign's result. Older files (2026-11-20) hold totals only; this script then says so ("status": "totals only")
and the website must not show per-sign numbers.

The script refuses to write anything unless every path adds up:
- the confusion matrix holds exactly `samples` answers, and each sign's row holds that sign's samples;
- each sign's top-1 equals its diagonal cell divided by its row, and the overall top-1 equals the diagonal
  divided by all samples;
- one-handed + two-handed samples, and left- + right-dominant samples (plus samples with no hand), equal all
  samples.

Honesty rules (CLAUDE.md 1): the rerun set's signers are reported by its publisher as absent from training, but
its label file has no signer ids, so that could not be re-checked; the file says so.
"""

from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "shared_data" / "asl_results.json"
REPORTS = ROOT / "reports"
CLASSES = ROOT / "models" / "asl" / "sign_to_prediction_index_map.json"
TOLERANCE = 1e-9
PATH_NAMES = {
    "native": "Sign's real length (as the model was built)",
    "native_mirrored": "Mirror image only (left and right swapped)",
    "native_tta": "Real length, averaged with the mirror image",
    "fixed_32": "32 frames (what the website runs)",
    "fixed_32_tta": "32 frames, averaged with the mirror image",
}


class DoesNotAddUp(ValueError):
    pass


def newest_results() -> Path:
    files = sorted(REPORTS.glob("asl_eval_results_*.json"), key=lambda p: re.findall(r"\d{4}-\d{2}-\d{2}", p.name) or [""])
    if not files:
        raise SystemExit("no reports/asl_eval_results_*.json found")
    return files[-1]


def labels_in_order() -> list[str]:
    index_map = json.loads(CLASSES.read_text(encoding="utf-8"))
    labels = [None] * len(index_map)
    for label, index in index_map.items():
        labels[index] = label
    if None in labels:
        raise SystemExit("the class map has gaps")
    return labels


def _close(a: float | None, b: float | None) -> bool:
    if a is None or b is None:
        return a is b
    return math.isclose(a, b, rel_tol=0, abs_tol=TOLERANCE)


def check_path(name: str, path: dict, labels: list[str], total: int | None = None) -> None:
    """Raise DoesNotAddUp with the first inconsistency found."""
    samples = path["samples"]
    if total is not None and samples != total:
        raise DoesNotAddUp(f"{name}: {samples} samples, but the run evaluated {total}")
    cells = path["confusion"]
    if sum(n for _t, _a, n in cells) != samples:
        raise DoesNotAddUp(f"{name}: the confusion matrix holds {sum(n for _t, _a, n in cells)} answers, not {samples}")
    rows: dict[int, int] = {}
    diagonal: dict[int, int] = {}
    for true, answer, count in cells:
        if not (0 <= true < len(labels) and 0 <= answer < len(labels)) or count <= 0:
            raise DoesNotAddUp(f"{name}: bad confusion cell {[true, answer, count]}")
        rows[true] = rows.get(true, 0) + count
        if true == answer:
            diagonal[true] = count
    for label, entry in path["per_sign"].items():
        index = labels.index(label)
        if rows.get(index, 0) != entry["samples"]:
            raise DoesNotAddUp(f"{name}: {label} has {entry['samples']} samples but {rows.get(index, 0)} in its matrix row")
        if not _close(diagonal.get(index, 0) / entry["samples"], entry["top1"]):
            raise DoesNotAddUp(f"{name}: {label} top-1 {entry['top1']} does not match its diagonal")
    if set(rows) != {labels.index(label) for label in path["per_sign"]}:
        raise DoesNotAddUp(f"{name}: the matrix has rows for signs missing from per_sign")
    if not _close(sum(diagonal.values()) / samples, path["top1"]):
        raise DoesNotAddUp(f"{name}: overall top-1 {path['top1']} does not match the diagonal")
    groups = path["groups"]
    if groups["one_handed"]["samples"] + groups["two_handed"]["samples"] != samples:
        raise DoesNotAddUp(f"{name}: one- plus two-handed samples do not add up to {samples}")
    if groups["dominant_left"]["samples"] + groups["dominant_right"]["samples"] > samples:
        raise DoesNotAddUp(f"{name}: left- plus right-dominant samples exceed {samples}")


def build(source: Path | None = None) -> dict:
    source = source or newest_results()
    raw = json.loads(source.read_text(encoding="utf-8"))
    labels = labels_in_order()
    summary = raw["summary"]
    dataset = raw["dataset"]
    out = {
        "generated_by": "tools/asl_results.py",
        "source": source.relative_to(ROOT).as_posix(),
        "measured_on": raw["measured_on"],
        "dataset": {"name": dataset["name"], "samples_evaluated": dataset["samples_evaluated"], "unreadable": dataset["unreadable"],
                    "licence": "CC0-1.0", "signer_independence": "reported by the dataset's publisher; the label file has no signer ids, so not re-checked"},
        "model": raw["model"],
        "machine": raw.get("machine", {"note": "Kaggle notebook CPU"}),
        "labels": labels,
        "headline": {
            "native_top1": summary["native"]["top1"],
            "native_top5": summary["native"]["top5"],
            "browser_frames": summary.get("best_fixed_length", {}).get("frames"),
            "browser_top1": summary.get("best_fixed_length", {}).get("top1"),
            "browser_top1_samples": summary.get("fixed_length", {}).get(str(summary.get("best_fixed_length", {}).get("frames")), {}).get("samples"),
            "latency_ms_median": summary.get("latency_ms", {}).get("median"),
        },
    }
    paths = summary.get("paths") or {}
    if not paths:
        out["status"] = "totals only"
        out["note"] = ("This results file predates per-sign results and the confusion matrix (master v4, Stage 0). "
                       "Run notebooks/asl_mode_eval.ipynb again (docs/HOW_TO_RUN_ASL_EVAL.md) and commit its file.")
        out["groups"] = summary["groups"]
        out["calibration"] = summary["calibration"]
        out["paths"] = {}
        return out
    out["status"] = "complete"
    out["paths"] = {}
    for name, path in paths.items():
        check_path(name, path, labels, dataset["samples_evaluated"] if name.startswith("native") else None)
        out["paths"][name] = {
            "title": PATH_NAMES.get(name, name),
            **{key: path[key] for key in ("samples", "top1", "top5", "groups", "left_right_gap", "calibration", "ece")},
            "per_sign": [{"sign": label, **path["per_sign"][label]} for label in labels if label in path["per_sign"]],
            "confusion": path["confusion"],
        }
    return out


def render(data: dict) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"


def main(argv: list[str]) -> int:
    text = render(build())
    if "--check" in argv:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
            print("shared_data/asl_results.json is out of date: run python tools/asl_results.py")
            return 1
        print("shared_data/asl_results.json is up to date")
        return 0
    OUT.write_text(text, encoding="utf-8")
    data = json.loads(text)
    print(f"wrote {OUT.relative_to(ROOT)} from {data['source']} ({data['status']}, {len(text) // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
