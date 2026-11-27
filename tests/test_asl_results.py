"""shared_data/asl_results.json (tools/asl_results.py): built from the committed Kaggle results, refuses numbers
that do not add up, and is never out of date."""

from __future__ import annotations

import copy
import json
import random
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "tools")]

import asl_eval_core as core  # noqa: E402
import asl_results  # noqa: E402


def complete_results(labels: list[str]) -> dict:
    """A results file shaped like the master-v4 notebook's, from made-up records run through the real summariser."""
    rng = random.Random(4)
    records = []
    for i in range(300):
        sign = i % 12
        paths = {}
        for name in ("native", "native_mirrored", "native_tta", "fixed_32", "fixed_32_tta"):
            answer = sign if rng.random() < 0.8 else rng.randrange(12)
            paths[name] = {"top5": [answer] + [j for j in range(5) if j != answer][:4], "p": rng.random()}
        records.append({"sign": sign, "native_top5": paths["native"]["top5"], "native_p": paths["native"]["p"], "native_ms": 10.0,
                        "fixed": {"32": [paths["fixed_32"]["top5"][0], paths["fixed_32"]["p"]]}, "paths": paths,
                        "two_handed": i % 7 == 0, "dominant": ["left", "right", "right"][i % 3]})
    return {"measured_on": "2026-11-28T00:00:00+00:00", "model": {"sha256": "f" * 64, "runtime": "test"},
            "dataset": {"name": "ASL Isolated Sign Recognition Rerun Set", "samples_evaluated": 300, "unreadable": 0},
            "summary": core.summarise(records, labels)}


class AslResultsTests(unittest.TestCase):
    def test_committed_file_is_up_to_date(self):
        self.assertEqual(asl_results.OUT.read_text(encoding="utf-8"), asl_results.render(asl_results.build()),
                         "run python tools/asl_results.py")

    def test_totals_only_file_says_so(self):
        source = ROOT / "reports" / "asl_eval_results_2026-11-20.json"
        data = asl_results.build(source)
        raw = json.loads(source.read_text(encoding="utf-8"))
        self.assertEqual(data["status"], "totals only")
        self.assertEqual(data["paths"], {})
        self.assertEqual(data["headline"]["native_top1"], raw["summary"]["native"]["top1"])
        self.assertEqual(data["headline"]["browser_frames"], 32)
        self.assertEqual(data["headline"]["browser_top1"], raw["summary"]["best_fixed_length"]["top1"])
        self.assertEqual(len(data["labels"]), 250)

    def test_complete_file_builds_and_bad_numbers_are_refused(self):
        labels = asl_results.labels_in_order()
        good = complete_results(labels)
        with tempfile.TemporaryDirectory(dir=ROOT / "reports") as folder:
            path = Path(folder) / "asl_eval_results_2026-11-28.json"
            path.write_text(json.dumps(good), encoding="utf-8")
            data = asl_results.build(path)
            self.assertEqual(data["status"], "complete")
            self.assertEqual(set(data["paths"]), {"native", "native_mirrored", "native_tta", "fixed_32", "fixed_32_tta"})
            native = data["paths"]["native"]
            self.assertEqual(sum(row["samples"] for row in native["per_sign"]), 300)
            self.assertEqual([row["sign"] for row in native["per_sign"]], labels[:12])

            broken = copy.deepcopy(good)
            broken["summary"]["paths"]["fixed_32"]["confusion"][0][2] += 1
            path.write_text(json.dumps(broken), encoding="utf-8")
            with self.assertRaises(asl_results.DoesNotAddUp):
                asl_results.build(path)

            broken = copy.deepcopy(good)
            broken["summary"]["paths"]["native"]["per_sign"][labels[3]]["top1"] += 0.01
            path.write_text(json.dumps(broken), encoding="utf-8")
            with self.assertRaises(asl_results.DoesNotAddUp):
                asl_results.build(path)

            broken = copy.deepcopy(good)
            broken["summary"]["paths"]["native_tta"]["top1"] = 0.99
            path.write_text(json.dumps(broken), encoding="utf-8")
            with self.assertRaises(asl_results.DoesNotAddUp):
                asl_results.build(path)


if __name__ == "__main__":
    unittest.main()
