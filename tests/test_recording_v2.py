"""Recording format v2: landmarks only, byte-identical round trips, consent rules.

The v1 CSV converter and the v1/v2 feature switch went with the PSL desktop app (master v4, Stage 0)."""

from __future__ import annotations

import gzip
import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "tools")]

from ml_engine.features_v2 import sequence_features  # noqa: E402
from ml_engine.recording_v2 import (  # noqa: E402
    RecordingError, base_meta, read_recording, recording_features,
    training_use_refusal, write_recording,
)

FIXTURE = json.loads(gzip.decompress((ROOT / "tests" / "golden" / "v2_holistic.json.gz").read_bytes()))
KEY = b"test-key-not-a-secret-0123456789"


def live_meta(**changes):
    meta = base_meta(source="capture_v2", gloss_id="hello", signer_id="s_abc123", session_id="sess-1", device="laptop-webcam",
                     camera_orientation_degrees=0, input_mirrored=False, image_width=1, image_height=1, fps=None,
                     consent_id="consent-0001", consent_recorded=True, created_utc="2026-11-17T00:00:00+00:00")
    meta.update(changes)
    return meta


def float32_frames(frames):
    def rows(value):
        return None if value is None else np.asarray(value, dtype=np.float32).astype(np.float64).tolist()
    return [{**frame, **{key: rows(frame[key]) for key in ("left_hand", "right_hand", "pose", "pose_visibility", "face")}} for frame in frames]


class RecordingRoundTripTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.base = Path(self.temporary.name)
        self.frames = next(s for s in FIXTURE["sequences"] if s["id"] == "hands_flicker")["frames"]

    def tearDown(self):
        self.temporary.cleanup()

    def test_frames_and_features_survive_a_round_trip(self):
        path = write_recording(self.base / "a.npz", self.frames, live_meta())
        record = read_recording(path)
        expected = float32_frames(self.frames)
        self.assertEqual(record["frames"], expected)
        self.assertEqual(recording_features(path)["features"], sequence_features(expected)["features"])
        self.assertEqual(record["meta"]["frame_count"], len(self.frames))
        self.assertEqual(record["meta"]["fps"], round((len(self.frames) - 1) * 1000 / (self.frames[-1]["timestamp_ms"] - self.frames[0]["timestamp_ms"]), 3))
        self.assertEqual((record["meta"]["image_width"], record["meta"]["image_height"]), (self.frames[0]["image_width"], self.frames[0]["image_height"]))

    def test_same_input_gives_byte_identical_files(self):
        a = write_recording(self.base / "a.npz", self.frames, live_meta())
        b = write_recording(self.base / "b.npz", self.frames, live_meta())
        self.assertEqual(a.read_bytes(), b.read_bytes())

    def test_file_holds_landmarks_only(self):
        path = write_recording(self.base / "a.npz", self.frames, live_meta())
        with np.load(path, allow_pickle=False) as data:
            self.assertEqual(sorted(data.files), ["hand_assignment", "meta", "points", "pose_visibility", "present", "timestamps_ms"])
            for name in data.files:
                array = data[name]
                image_like = array.dtype == np.uint8 and array.ndim >= 2 and name != "present"
                self.assertFalse(image_like, name)
            self.assertEqual(data["points"].shape, (len(self.frames), 120, 3))
            self.assertEqual(data["meta"].ndim, 1)

    def test_metadata_rules(self):
        bad = [
            {"consent_id": " "},
            {"participant": "Ayesha"},
            {"video_stored": True},
            {"signer_id": "Ayesha Khan"},
            {"camera_orientation_degrees": 45},
            {"input_mirrored": None},
            {"feature_version": "v1"},
            {"source": "webcam"},
            {"consent_recorded": False},
            {"instance_unit": "frame"},
            {"signer_name": "Ayesha"},
            {"notes": "recorded with Ayesha"},
            {"v1": {"name": "Ayesha"}},
            {"device": "Ayesha's laptop"},
            {"warnings": [{"name": "Ayesha"}]},
        ]
        for change in bad:
            with self.assertRaises(RecordingError, msg=change):
                write_recording(self.base / "bad.npz", self.frames, live_meta(**change))
        meta = live_meta()
        del meta["consent_id"]
        with self.assertRaises(RecordingError):
            write_recording(self.base / "bad.npz", self.frames, meta)
        write_recording(self.base / "video.npz", self.frames, live_meta(video_stored=True, video_consent=True))
        self.assertIsNone(training_use_refusal(read_recording(self.base / "video.npz")["meta"]))

    def test_frame_rules(self):
        frames = [dict(frame) for frame in self.frames[:3]]
        frames[2]["timestamp_ms"] = frames[1]["timestamp_ms"]
        with self.assertRaises(RecordingError):
            write_recording(self.base / "t.npz", frames, live_meta())
        frames = [dict(frame) for frame in self.frames[:3]]
        frames[1]["image_width"] += 1
        with self.assertRaises(RecordingError):
            write_recording(self.base / "s.npz", frames, live_meta())
        with self.assertRaises(RecordingError):
            write_recording(self.base / "e.npz", [], live_meta())
        with self.assertRaises(RecordingError):
            write_recording(self.base / "x.json", self.frames, live_meta())


if __name__ == "__main__":
    unittest.main()
