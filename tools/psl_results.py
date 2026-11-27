"""Builds shared_data/psl_results.json: the PSL v3 test results the website shows, including the full
confusion matrix, computed from the committed measurements of the training run (never typed by hand).

    python tools/psl_results.py          write shared_data/psl_results.json
    python tools/psl_results.py --check  exit 1 if the committed file is out of date

Where the numbers come from
---------------------------
reports/psl_v3_measurements.json is the machine-readable output of psl-train run 44884632047
(reports/psl_v3_run.md). For the shipped recipe on the fair test (2,151 phone recordings never seen in
training) it holds, per sign, the number of test recordings and the top-1 rate, plus the list of every
wrong answer ("sign X was taken for Y, n times"). Those two together are the whole confusion matrix:

    diagonal  (sign X answered as X) = samples(X) * top1(X), rounded (the report keeps 4 decimals)
    off-diagonal (X answered as Y)   = the "times" of the confusion entry X -> Y

The script refuses to write anything unless the matrix adds up: for every sign the wrong answers must
equal samples minus correct, and the overall top-1 rebuilt from the matrix must match the reported one.

What this script cannot do: re-run the model on the test recordings. The SignSpeak data is not in this
repository (CLAUDE.md 6: no commit contains data), so a fresh evaluation needs the training workflow
(.github/workflows/psl-train.yml). If that workflow writes a new measurements file, run this again.

Honesty rules (CLAUDE.md 1): the fair test is "weaker" because SignSpeak publishes no signer ids, so the
same people may be in training and test. The only signer-independent number is the 14-clip check on one
SLT dictionary performer. Both are written out with their labels.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "shared_data" / "psl_results.json"
MEASUREMENTS = ROOT / "reports" / "psl_v3_measurements.json"
MANIFEST = ROOT / "models" / "psl" / "manifest.json"
RUN_REPORT = ROOT / "reports" / "psl_v3.md"


class InconsistentMeasurements(ValueError):
    """The committed measurements do not add up to a confusion matrix; nothing is written."""


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def run_id() -> str | None:
    match = re.search(r"run (\d{9,})", RUN_REPORT.read_text(encoding="utf-8")) if RUN_REPORT.exists() else None
    return match.group(1) if match else None


def confusion_matrix(per_class: dict, confusions: list[dict], order: list[str]) -> dict:
    """Rebuilds the matrix and checks it. Returns counts keyed [true][predicted]."""
    matrix: dict[str, dict[str, int]] = {gloss: {} for gloss in order}
    for gloss in order:
        stats = per_class[gloss]
        correct = stats["samples"] * stats["top1"]
        if abs(correct - round(correct)) > 0.01:
            raise InconsistentMeasurements(f"{gloss}: samples x top1 = {correct:.4f} is not a whole number of recordings")
        if round(correct):
            matrix[gloss][gloss] = round(correct)
    for item in confusions:
        true, predicted = item["sign"], item["taken_for"]
        if true not in matrix:
            raise InconsistentMeasurements(f"confusion for {true}, which has no test recordings")
        matrix[true][predicted] = matrix[true].get(predicted, 0) + int(item["times"])
    for gloss in order:
        row = matrix[gloss]
        if sum(row.values()) != per_class[gloss]["samples"]:
            raise InconsistentMeasurements(f"{gloss}: the row adds up to {sum(row.values())}, but it has {per_class[gloss]['samples']} test recordings (the confusion list is incomplete)")
    return matrix


def build() -> dict:
    measured = read_json(MEASUREMENTS)
    manifest = read_json(MANIFEST)
    held = measured["device_held_out"]
    recipe = "mirror_average" if manifest["model"]["mirror_average"] else "plain"
    shipped = held["islr_lite"][recipe]
    classes = manifest["classes"]
    by_gloss = {c["gloss"]: c for c in classes}

    # Matrix rows and columns in the manifest's order, only the signs that have test recordings.
    order = [c["gloss"] for c in classes if c["gloss"] in shipped["per_class"]]
    matrix = confusion_matrix(shipped["per_class"], shipped["confusions"], order)
    predicted_outside = sorted({p for row in matrix.values() for p in row if p not in order})
    if predicted_outside:
        raise InconsistentMeasurements(f"answers outside the test signs: {predicted_outside}")
    total = sum(shipped["per_class"][g]["samples"] for g in order)
    correct = sum(matrix[g].get(g, 0) for g in order)
    if total != shipped["samples"]:
        raise InconsistentMeasurements(f"{total} recordings in the per-sign table, {shipped['samples']} in the report")
    if abs(correct / total - shipped["top1"]) > 0.00006:
        raise InconsistentMeasurements(f"top-1 from the matrix {correct / total:.5f} differs from the reported {shipped['top1']}")

    def name(gloss):
        entry = by_gloss.get(gloss, {})
        return {"gloss": gloss, "english": entry.get("english", gloss), "urdu": entry.get("urdu") or "", "hands": entry.get("hands")}

    errors = sorted(
        ({"sign": t, "taken_for": p, "times": n} for t, row in matrix.items() for p, n in row.items() if p != t),
        key=lambda e: (-e["times"], e["sign"], e["taken_for"]),
    )
    solo = measured["independent_signer"]
    solo_top1 = sum(1 for c in solo["clips"] if c["answer"] == c["sign"])
    solo_top5 = sum(1 for c in solo["clips"] if c["top5"])
    if solo_top1 != round(solo["top1"] * solo["samples"]) or solo_top5 != round(solo["top5"] * solo["samples"]):
        raise InconsistentMeasurements("independent-signer clips do not match its top-1 / top-5")

    return {
        "about": "Generated by tools/psl_results.py from reports/psl_v3_measurements.json and models/psl/manifest.json; do not edit by hand.",
        "model": {"bundle": manifest["version"], "file": manifest["model"]["file"], "bytes": manifest["model"]["bytes"],
                  "parameters": manifest["model"]["parameters"], "precision": manifest["model"]["precision"],
                  "architecture": manifest["model"]["architecture"], "sha256": manifest["model"]["sha256"],
                  "classes": len(classes), "signs": sum(1 for c in classes if c.get("tier")),
                  "tiers": {"A": manifest["tiers"]["A"], "B": manifest["tiers"]["B"]}, "badge": manifest["badge"]},
        "source": {"run": run_id(), "commit": measured["commit"], "date": measured["date"], "dataset": measured["data"]["source"],
                   "report": "reports/psl_v3_run.md", "measurements": "reports/psl_v3_measurements.json"},
        "fair_test": {
            "label": "weaker",
            "why_weaker": "SignSpeak publishes no signer ids, so the same people may appear in training and test.",
            "protocol": manifest["metrics"]["device_held_out"]["protocol"],
            "rule": held["fair_test"]["rule"],
            "recipe": recipe,
            "samples": total, "correct": correct, "top1": shipped["top1"], "top5": shipped["top5"],
            "one_handed": shipped["one_handed"], "two_handed": shipped["two_handed"],
            "all_phone_top1": held["islr_lite"].get("plain_all_phone", {}).get("top1"),
            "all_phone_samples": held["islr_lite"].get("plain_all_phone", {}).get("samples"),
            "gru_top1": held["gru"]["plain"]["top1"],
            "left_right": held.get("left_right"),
            "calibration_error": shipped["expected_calibration_error"],
            "speak_limits": shipped["speak_limits"],
            "not_measured": held["untrained_in_this_protocol"],
            "label_conflicts": held["label_conflicts"],
        },
        "confusion_matrix": {
            "order": [name(g) for g in order],
            "counts": [[matrix[t].get(p, 0) for p in order] for t in order],
            "errors": errors,
            "per_sign": [{**name(g), "samples": shipped["per_class"][g]["samples"], "correct": matrix[g].get(g, 0),
                          "top1": shipped["per_class"][g]["top1"], "top5": shipped["per_class"][g]["top5"]} for g in order],
        },
        "independent_signer": {
            "label": "signer-independent, but only 14 clips",
            "protocol": manifest["metrics"]["independent_signer"]["protocol"],
            "samples": solo["samples"], "top1": solo["top1"], "top5": solo["top5"], "top1_count": solo_top1, "top5_count": solo_top5,
            "one_handed": solo["one_handed"], "two_handed": solo["two_handed"],
            "clips": [{**name(c["sign"]), "answer": c["answer"], "answer_english": by_gloss.get(c["answer"], {}).get("english", c["answer"]),
                       "probability": c["probability"], "top5": c["top5"]} for c in solo["clips"]],
        },
        "calibration_part": {"label": "weaker (same people and sessions)", **{k: manifest["metrics"]["calibration_part"][k] for k in ("top1", "top5")},
                             "samples": measured["shipped"]["validation"]["samples"]},
    }


def render(data: dict) -> str:
    return json.dumps(data, ensure_ascii=False, indent=1) + "\n"


def main(argv: list[str]) -> int:
    text = render(build())
    if "--check" in argv:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
            print("shared_data/psl_results.json is out of date: run python tools/psl_results.py")
            return 1
        print("shared_data/psl_results.json is up to date")
        return 0
    OUT.write_text(text, encoding="utf-8")
    data = json.loads(text)
    fair = data["fair_test"]
    print(f"Wrote {OUT.relative_to(ROOT)}: fair test {fair['correct']}/{fair['samples']} = {fair['top1']:.1%} (weaker), "
          f"{len(data['confusion_matrix']['errors'])} kinds of error, independent signer {data['independent_signer']['top1_count']}/{data['independent_signer']['samples']}.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
