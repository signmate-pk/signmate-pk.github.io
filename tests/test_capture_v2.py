"""Capture v2 (Phase 1): rotation correction (F4), the capture loop, and "no image or video on disk"."""

from __future__ import annotations

import builtins
import json
import os
import random
import re
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ml_engine.capture_v2 import (  # noqa: E402
    CaptureV2, FpsMeter, SplitLandmarkerBackend, correction_rotation_degrees, model_path,
    rotate_image_clockwise, rotate_points_clockwise,
)
from ml_engine.features_v2 import LAYOUT, sequence_features  # noqa: E402

ROTATION_CASES = json.loads((ROOT / "tests" / "golden" / "rotation_cases.json").read_text(encoding="utf-8"))
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".gif", ".webp", ".tif", ".tiff", ".mp4", ".avi", ".mov", ".mkv", ".webm", ".h264", ".yuv", ".raw"}


class RotationRuleTests(unittest.TestCase):
    def test_shared_rotation_cases(self):
        for case in ROTATION_CASES["cases"]:
            self.assertEqual(
                correction_rotation_degrees(case["sensor"], case["device"], case["lens"], case["platform"]), case["expected"], case)

    def test_invalid_values_are_rejected(self):
        for args in ((45, "portraitUp", "back"), (90, "sideways", "back"), (90, "portraitUp", "periscope"), (90, 0, "back", "symbian")):
            with self.assertRaises((ValueError, KeyError), msg=args):
                correction_rotation_degrees(*args)
        with self.assertRaises(ValueError):
            rotate_image_clockwise(np.zeros((2, 3)), 45)


class MarkerBackend:
    """A stand-in for MediaPipe that 'detects' landmarks by finding uniquely coloured marker pixels.

    It reads the frame it is given, so it sees exactly what the real backend would see after the
    capture layer has (or has not) rotated the frame.
    """

    def __init__(self, scene: "MarkerScene"):
        self.scene = scene
        self.closed = False

    def detect(self, rgb, timestamp_ms):
        height, width = rgb.shape[:2]
        ids = rgb[:, :, 0].astype(np.int64) + 256 * rgb[:, :, 1].astype(np.int64)
        ys, xs = np.nonzero(ids)
        found = {int(ids[y, x]): ((x + 0.5) / width, (y + 0.5) / height) for y, x in zip(ys, xs)}

        def point(key):
            x, y = found[self.scene.ids[key]]
            return [x, y, self.scene.z[key]]

        pose = [point(("pose", i)) + [0.9] if ("pose", i) in self.scene.ids else [0.5, 0.5, 0.0, 0.0] for i in range(33)]
        face = [point(("face", i)) if ("face", i) in self.scene.ids else [0.5, 0.5, 0.0] for i in range(478)]
        hands = [{"landmarks": [point((side, i)) for i in range(21)], "handedness": label} for side, label in (("left", "Right"), ("right", "Left"))]
        return {"hands": hands, "pose": pose, "face": face}

    def close(self):
        self.closed = True


class MarkerScene:
    """Distinct marker pixels for both hands, the 9 pose points and the 69 face points."""

    def __init__(self, width=320, height=240, seed=1):
        rng = random.Random(seed)
        self.width, self.height = width, height
        taken = set()

        def pixel(cx, cy, spread):
            while True:
                x = min(width - 1, max(0, int(rng.gauss(cx, spread))))
                y = min(height - 1, max(0, int(rng.gauss(cy, spread))))
                if (x, y) not in taken:
                    taken.add((x, y))
                    return x, y

        self.pixels, self.z = {}, {}
        anchors = {11: (200, 160), 12: (120, 160), 13: (215, 200), 14: (105, 200), 15: (190, 110), 16: (130, 110), 23: (190, 235), 24: (130, 235), 0: (160, 80)}
        for index, (x, y) in anchors.items():
            self.pixels[("pose", index)] = pixel(x, y, 2)
        for side, wrist in (("left", 15), ("right", 16)):
            wx, wy = self.pixels[("pose", wrist)]
            for i in range(21):
                self.pixels[(side, i)] = pixel(wx, wy - 12, 10) if i else pixel(wx, wy, 1)
        for index in LAYOUT.face_indices:
            self.pixels[("face", index)] = pixel(160, 70, 14)
        self.ids = {key: number + 1 for number, key in enumerate(sorted(self.pixels, key=str))}
        self.z = {key: rng.uniform(-0.1, 0.1) for key in self.pixels}

    def image(self, sensor_rotation=0):
        """The upright scene, or the raw sensor frame that needs `sensor_rotation` clockwise to be upright."""
        image = np.zeros((self.height, self.width, 3), np.uint8)
        for key, (x, y) in self.pixels.items():
            marker = self.ids[key]
            image[y, x] = (marker % 256, marker // 256, 255)
        return np.ascontiguousarray(np.rot90(image, k=sensor_rotation // 90)) if sensor_rotation else image


class RotatedFrameTests(unittest.TestCase):
    """Gate: identical features for upright and rotated input after correction."""

    def test_image_rotation_moves_pixels_the_way_the_point_rule_says(self):
        scene = MarkerScene()
        upright = scene.image()
        keys = sorted(scene.pixels, key=str)
        points = [[(scene.pixels[k][0] + 0.5) / scene.width, (scene.pixels[k][1] + 0.5) / scene.height] for k in keys]
        for degrees in (0, 90, 180, 270):
            rotated = rotate_image_clockwise(upright, degrees)
            height, width = rotated.shape[:2]
            expected = rotate_points_clockwise(points, degrees)
            for key, (ex, ey) in zip(keys, expected):
                ys, xs = np.nonzero((rotated[:, :, 0].astype(int) + 256 * rotated[:, :, 1].astype(int)) == scene.ids[key])
                self.assertEqual(len(xs), 1)
                self.assertAlmostEqual((xs[0] + 0.5) / width, ex, places=12)
                self.assertAlmostEqual((ys[0] + 0.5) / height, ey, places=12)

    def test_corrected_rotated_frames_give_identical_features(self):
        for seed, sensor in ((1, 90), (2, 180), (3, 270), (4, 0)):
            scene = MarkerScene(seed=seed)
            upright = CaptureV2(MarkerBackend(scene)).process_rgb(scene.image(), 1000)
            corrected = CaptureV2(MarkerBackend(scene), rotation_degrees=sensor).process_rgb(scene.image(sensor), 1000)
            a = sequence_features([upright])["features"][0]
            b = sequence_features([corrected])["features"][0]
            self.assertEqual((corrected["image_width"], corrected["image_height"]), (scene.width, scene.height))
            self.assertLess(max(abs(x - y) for x, y in zip(a, b)), 1e-9, sensor)

    def test_uncorrected_rotated_frames_give_different_features(self):
        """The control: without the correction (the Phase 0 phone path) the features change."""
        scene = MarkerScene(seed=5)
        upright = CaptureV2(MarkerBackend(scene)).process_rgb(scene.image(), 1000)
        uncorrected = CaptureV2(MarkerBackend(scene)).process_rgb(scene.image(90), 1000)
        a = sequence_features([upright])["features"][0]
        b = sequence_features([uncorrected])["features"][0]
        self.assertGreater(max(abs(x - y) for x, y in zip(a, b)), 0.5)


class CaptureLoopTests(unittest.TestCase):
    def test_timestamps_are_strictly_increasing_and_frames_canonical(self):
        scene = MarkerScene()
        capture = CaptureV2(MarkerBackend(scene))
        frames = [capture.process_bgr(scene.image()[:, :, ::-1], 500) for _ in range(5)]
        self.assertEqual([f["timestamp_ms"] for f in frames], [500, 501, 502, 503, 504])
        self.assertEqual(len(sequence_features(frames)["features"]), 5)
        self.assertIsNotNone(frames[0]["left_hand"])
        self.assertEqual(frames[0]["hand_assignment"], 1)
        capture.close()
        self.assertTrue(capture.backend.closed)

    def test_bgr_and_rgb_paths_agree(self):
        scene = MarkerScene()
        rgb_frame = CaptureV2(MarkerBackend(scene)).process_rgb(scene.image(), 10)
        bgr_frame = CaptureV2(MarkerBackend(scene)).process_bgr(np.ascontiguousarray(scene.image()[:, :, ::-1]), 10)
        self.assertEqual(rgb_frame, bgr_frame)

    def test_fps_meter(self):
        meter = FpsMeter(window=10)
        for index in range(10):
            meter.tick(index / 25.0)
        self.assertAlmostEqual(meter.fps, 25.0)


def _snapshot(*roots: Path) -> set[Path]:
    files = set()
    for root in roots:
        for directory, _, names in os.walk(root):
            if "node_modules" in directory or ".git" in directory:
                continue
            files.update(Path(directory) / name for name in names)
    return files


class NoImageOnDiskTests(unittest.TestCase):
    """Gate: no image or video is written to disk by any capture path."""

    FORBIDDEN = {
        "python": [r"imwrite", r"VideoWriter", r"\.save\(", r"imencode", r"savez", r"np\.save", r"tofile"],
        "javascript": [r"MediaRecorder", r"toBlob", r"toDataURL", r"createObjectURL", r"writeFile", r"indexedDB", r"localStorage", r"captureStream"],
    }
    SOURCES = {
        "python": ["ml_engine/capture_v2.py", "ml_engine/features_v2.py"],
        "javascript": ["web/src/capture_v2.js", "web/src/features_v2.js", "web/src/bench.js"],
    }

    def test_capture_sources_contain_no_image_or_video_writers(self):
        for language, files in self.SOURCES.items():
            for name in files:
                text = (ROOT / name).read_text(encoding="utf-8")
                code = "\n".join(line for line in text.splitlines() if not line.lstrip().startswith(("#", "//", "*", "\"\"\"")))
                for pattern in self.FORBIDDEN[language]:
                    self.assertIsNone(re.search(pattern, code), f"{name} uses {pattern}")

    def _run_guarded(self, run):
        """Run `run()` with every Python image/video writer patched to fail, then diff the file system."""
        calls = []
        real_open = builtins.open

        def guarded_open(file, mode="r", *args, **kwargs):
            if any(flag in mode for flag in "wax+") and Path(str(file)).suffix.lower() in IMAGE_EXTENSIONS | {".npy", ".npz"}:
                calls.append(("open", str(file)))
                raise AssertionError(f"capture tried to write {file}")
            return real_open(file, mode, *args, **kwargs)

        def refuse(name):
            def _refuse(*args, **kwargs):
                calls.append((name, args[:1]))
                raise AssertionError(f"capture called {name}")
            return _refuse

        patches = [patch("builtins.open", guarded_open), patch("numpy.save", refuse("numpy.save")), patch("numpy.savez", refuse("numpy.savez"))]
        try:
            import cv2
            patches += [patch.object(cv2, "imwrite", refuse("cv2.imwrite")), patch.object(cv2, "VideoWriter", refuse("cv2.VideoWriter"))]
        except ImportError:
            pass
        try:
            from PIL import Image
            patches.append(patch.object(Image.Image, "save", refuse("PIL.Image.save")))
        except ImportError:
            pass
        with tempfile.TemporaryDirectory() as workdir:
            roots = [ROOT, Path(workdir), Path(tempfile.gettempdir())]
            before = _snapshot(*roots)
            cwd = os.getcwd()
            os.chdir(workdir)
            try:
                for item in patches:
                    item.start()
                run()
            finally:
                for item in reversed(patches):
                    item.stop()
                os.chdir(cwd)
            created = _snapshot(*roots) - before
        self.assertEqual(calls, [])
        media = [path for path in created if path.suffix.lower() in IMAGE_EXTENSIONS]
        inside_project = [path for path in created if ROOT in path.parents and "__pycache__" not in path.parts]
        self.assertEqual(media, [], "image or video files appeared")
        self.assertEqual(inside_project, [], "files appeared inside the project")

    def test_capture_loop_with_a_stand_in_backend_writes_nothing(self):
        scene = MarkerScene()

        def run():
            capture = CaptureV2(MarkerBackend(scene), rotation_degrees=90)
            frames = [capture.process_bgr(scene.image(90)[:, :, ::-1], 100 + i) for i in range(30)]
            sequence_features(frames)
            capture.close()
        self._run_guarded(run)

    def test_capture_loop_with_real_mediapipe_hand_model_writes_nothing(self):
        if not model_path("hands").exists():
            self.skipTest("models/hand_landmarker.task is not present")
        try:
            import mediapipe  # noqa: F401
        except ImportError as error:
            self.skipTest(f"mediapipe is not installed: {error}")
        rng = np.random.default_rng(0)

        def run():
            with CaptureV2(SplitLandmarkerBackend(parts=("hands",), download=False), rotation_degrees=270) as capture:
                for index in range(20):
                    frame = rng.integers(0, 255, size=(240, 320, 3), dtype=np.uint8)
                    capture.process_bgr(frame, 33 * index)
        self._run_guarded(run)


if __name__ == "__main__":
    unittest.main()
