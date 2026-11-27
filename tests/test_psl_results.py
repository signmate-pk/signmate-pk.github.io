"""shared_data/psl_results.json (the website's results section and confusion matrix) must match the committed
measurements of the PSL v3 run, and the matrix must add up exactly (tools/psl_results.py)."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import psl_results  # noqa: E402


class PslResultsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = psl_results.build()
        cls.manifest = json.loads((ROOT / "models" / "psl" / "manifest.json").read_text(encoding="utf-8"))

    def test_committed_file_is_up_to_date(self):
        committed = (ROOT / "shared_data" / "psl_results.json").read_text(encoding="utf-8")
        self.assertEqual(committed, psl_results.render(self.data), "run python tools/psl_results.py")

    def test_matrix_rows_add_up_to_the_test_recordings(self):
        cm = self.data["confusion_matrix"]
        self.assertEqual(len(cm["order"]), len(cm["counts"]))
        for sign, row, stats in zip(cm["order"], cm["counts"], cm["per_sign"]):
            self.assertEqual(len(row), len(cm["order"]))
            self.assertEqual(sum(row), stats["samples"], sign["gloss"])
        total = sum(map(sum, cm["counts"]))
        diagonal = sum(cm["counts"][i][i] for i in range(len(cm["counts"])))
        self.assertEqual(total, self.data["fair_test"]["samples"])
        self.assertEqual(diagonal, self.data["fair_test"]["correct"])
        self.assertAlmostEqual(diagonal / total, self.data["fair_test"]["top1"], places=4)
        self.assertEqual(sum(e["times"] for e in cm["errors"]), total - diagonal)

    def test_signs_come_from_the_model_labels(self):
        glosses = {c["gloss"] for c in self.manifest["classes"]}
        self.assertEqual(self.data["model"]["classes"], len(self.manifest["classes"]))
        self.assertEqual(self.data["model"]["signs"], sum(1 for c in self.manifest["classes"] if c.get("tier")))
        for sign in self.data["confusion_matrix"]["order"]:
            self.assertIn(sign["gloss"], glosses)
        # Signs with no fair-test recordings are listed, never given a made-up score.
        tested = {s["gloss"] for s in self.data["confusion_matrix"]["order"]}
        for gloss in self.data["fair_test"]["not_measured"]:
            self.assertNotIn(gloss, tested)

    def test_labels_say_which_numbers_are_weaker(self):
        self.assertEqual(self.data["fair_test"]["label"], "weaker")
        self.assertIn("weaker", self.data["calibration_part"]["label"])
        solo = self.data["independent_signer"]
        self.assertEqual(solo["top1_count"], sum(1 for c in solo["clips"] if c["answer"] == c["gloss"]))

    def test_an_incomplete_confusion_list_is_refused(self):
        per_class = {"a": {"samples": 3, "top1": 2 / 3}, "b": {"samples": 2, "top1": 1.0}}
        with self.assertRaises(psl_results.InconsistentMeasurements):
            psl_results.confusion_matrix(per_class, [], ["a", "b"])
        matrix = psl_results.confusion_matrix(per_class, [{"sign": "a", "taken_for": "b", "times": 1}], ["a", "b"])
        self.assertEqual(matrix["a"], {"a": 2, "b": 1})


if __name__ == "__main__":
    unittest.main()
