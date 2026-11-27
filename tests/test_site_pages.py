"""The website's "How well it works", "Credits" and "What's new" pages read shared_data/site_pages.json.
It must be exactly what tools/site_pages.py builds from the committed files, so the pages and the measurements
never disagree. Master v4: ASL only."""

import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def builder():
    spec = importlib.util.spec_from_file_location("site_pages", ROOT / "tools" / "site_pages.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class SitePagesTests(unittest.TestCase):
    def test_committed_pages_match_the_reports(self):
        stored = json.loads((ROOT / "shared_data" / "site_pages.json").read_text(encoding="utf-8"))
        self.assertEqual(stored, json.loads(json.dumps(builder().build(), ensure_ascii=False)), "rerun python tools/site_pages.py")

    def test_every_shipped_asset_is_credited_with_its_ledger_licence(self):
        pages = builder().build()
        ids = {a["id"] for a in pages["credits"]["assets"]}
        self.assertIn("asl-islr-1st-place-tflite", ids)
        self.assertIn("asl-gislr-rerun-set", ids)
        self.assertFalse(any(i.startswith("psl-") for i in ids), "PSL is retired (CLAUDE.md 10.1)")
        for asset in pages["credits"]["assets"]:
            self.assertTrue(asset["licence"])
            if asset["licence"] not in ("project-owned",):
                self.assertTrue(asset["attribution"], asset["id"])

    def test_asl_numbers_come_from_the_results_file(self):
        pages = builder().build()
        results = json.loads((ROOT / "shared_data" / "asl_results.json").read_text(encoding="utf-8"))
        self.assertEqual(pages["asl"]["top1"], results["headline"]["native_top1"])
        self.assertEqual(pages["asl"]["browser_top1"], results["headline"]["browser_top1"])
        self.assertEqual(pages["asl"]["samples"], results["dataset"]["samples_evaluated"])
        self.assertTrue(all(m["what"].startswith("ASL model") for m in pages["performance"]["measurements"]))
        self.assertNotIn("psl", pages)


if __name__ == "__main__":
    unittest.main()
