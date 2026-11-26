"""The website's QR encoder (web/src/ui/qr.js) makes codes a real decoder reads back (OpenCV).

Skipped when Node.js or OpenCV is not installed.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SCRIPT = """
import { qrMatrix } from %s;
const texts = JSON.parse(process.argv[1]);
console.log(JSON.stringify(texts.map((t) => qrMatrix(t).map((row) => row.map((d) => (d ? 1 : 0))))));
"""


class QrCodeTest(unittest.TestCase):
    def test_decodes(self) -> None:
        node = shutil.which("node")
        try:
            import cv2  # noqa: PLC0415
            import numpy as np  # noqa: PLC0415
        except ImportError:
            self.skipTest("OpenCV is not installed")
        if not node:
            self.skipTest("Node.js is not installed")
        site = json.loads((ROOT / "shared_data" / "site.json").read_text(encoding="utf-8"))["site_url"]
        texts = [site, site + "#/tour", "HELLO", site + "?from=qr&lang=ur&screen=sentences&x=0123456789abcdef"]
        module = json.dumps((ROOT / "web" / "src" / "ui" / "qr.js").as_uri())
        out = subprocess.run([node, "--input-type=module", "-e", SCRIPT % module, json.dumps(texts)], capture_output=True, text=True, check=True)
        detector = cv2.QRCodeDetector()
        for text, matrix in zip(texts, json.loads(out.stdout)):
            grid = np.array(matrix, dtype=np.uint8)
            image = np.pad(255 - grid * 255, 4, constant_values=255).repeat(8, axis=0).repeat(8, axis=1)
            value, _, _ = detector.detectAndDecode(image)
            self.assertEqual(value, text)


if __name__ == "__main__":
    unittest.main()
