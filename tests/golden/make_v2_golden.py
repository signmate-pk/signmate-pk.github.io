"""Regenerate tests/golden/v2_holistic.json.gz, the v2 cross-language parity fixture.

Everything in it is synthetic geometry: an upper body, a face and two hands built from the
pose generator in tests/test_core.py, moved along smooth paths, with parts dropped in and out.
It exists only to check that every implementation of features v2 (Python, JavaScript, later
Dart) gives the same output for the same input. It is not recorded signer data and must never
be used for training or evaluation.

Contents:
  canonicalize_cases  raw landmarker frames (33-point pose, 468/478-point face, labelled hands,
                      mirrored and unmirrored input) and the canonical frame Python produces
  sequences           canonical frames, 1,000+ in total, with the reference Python computes,
                      checksums for every frame and the full 971-value vector for every 16th frame

Run from the project root:  python tests/golden/make_v2_golden.py
Regenerate only when features v2 change on purpose (and bump spec_version); the tests compare
against this file, so regenerating it hides a regression instead of catching it.
"""

from __future__ import annotations

import gzip
import json
import math
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "tests")]

from ml_engine.features_v2 import SPEC, canonicalize_frame, sequence_features  # noqa: E402

# A synthetic hand (moved here from the Phase 0 tests/test_core.py, removed with the PSL desktop app in master v4).
def sample_hand(extended, thumb="folded", spread=False, direction=None):
    wrist = (0.5, 0.9, 0.0)
    points = [wrist for _ in range(21)]
    if spread:
        bases = [0.3, 0.43, 0.58, 0.73]
        tips = [0.16, 0.37, 0.64, 0.87]
    elif extended == [True, True, True, True]:
        bases = [0.46, 0.49, 0.53, 0.56]
        tips = [0.44, 0.49, 0.54, 0.59]
    else:
        bases = [0.38, 0.46, 0.54, 0.62]
        tips = bases
    mcp_ids = [5, 9, 13, 17]
    pip_ids = [6, 10, 14, 18]
    dip_ids = [7, 11, 15, 19]
    tip_ids = [8, 12, 16, 20]
    for index, (base, mcp, pip, dip, tip) in enumerate(zip(bases, mcp_ids, pip_ids, dip_ids, tip_ids)):
        points[mcp] = (base, 0.66 if index != 1 else 0.62, 0.0)
        if extended[index]:
            points[pip] = (base, 0.49, 0.0)
            points[dip] = (tips[index], 0.36, 0.0)
            points[tip] = (tips[index], 0.20, 0.0)
        else:
            points[pip] = (base, 0.50, 0.0)
            points[dip] = (base + 0.04, 0.63, 0.0)
            points[tip] = (base + 0.02, 0.72, 0.0)
    if direction == "point":
        base = bases[0]
        points[6] = (base + 0.12, 0.62, 0.0)
        points[7] = (base + 0.23, 0.59, 0.0)
        points[8] = (base + 0.34, 0.56, 0.0)
    if thumb == "extended":
        points[1] = (0.44, 0.84, 0.0)
        points[2] = (0.26, 0.73, 0.0)
        points[3] = (0.08, 0.63, 0.0)
        points[4] = (-0.12, 0.54, 0.0)
    elif thumb == "up":
        points[1] = (0.45, 0.70, 0.0)
        points[2] = (0.44, 0.52, 0.0)
        points[3] = (0.44, 0.30, 0.0)
        points[4] = (0.44, 0.08, 0.0)
    elif thumb == "down":
        points[1] = (0.45, 1.06, 0.0)
        points[2] = (0.44, 1.23, 0.0)
        points[3] = (0.44, 1.40, 0.0)
        points[4] = (0.44, 1.58, 0.0)
    else:
        points[1] = (0.46, 0.84, 0.0)
        points[2] = (0.44, 0.78, 0.0)
        points[3] = (0.45, 0.76, 0.0)
        points[4] = (0.48, 0.74, 0.0)
    return points


OUTPUT = Path(__file__).resolve().parent / "v2_holistic.json.gz"
SEED = 20261117
SIZES = [(640, 480), (1280, 720), (480, 640), (720, 1280)]
FULL_VECTOR_EVERY = 16
POSE_PAIRS = SPEC["mirror_pairs"]["pose"]
FACE_PAIRS = SPEC["mirror_pairs"]["face"]
FACE_PARTNER = {a: b for a, b in FACE_PAIRS} | {b: a for a, b in FACE_PAIRS}
FACE_MIDLINE = {17, 0, 14, 13, 1, 10, 152}
POSES = [
    dict(extended=[False] * 4), dict(extended=[True, False, False, False]), dict(extended=[True, True, False, False]),
    dict(extended=[True] * 4, thumb="extended", spread=True), dict(extended=[False] * 4, thumb="up"),
    dict(extended=[False, True, True, False]), dict(extended=[False, False, False, True], thumb="extended"),
]


def r6(value: float) -> float:
    return round(value, 6)


def checksum_weights(count: int) -> list[float]:
    return [((index * 7919) % 1009) / 1009.0 - 0.5 for index in range(count)]


class Body:
    """A synthetic signer in pixel space for one image size; all outputs are normalised."""

    def __init__(self, rng: random.Random, width: int, height: int):
        self.rng = rng
        self.w, self.h = width, height
        self.mid = (width * rng.uniform(0.4, 0.6), height * rng.uniform(0.62, 0.8))
        self.shoulder = min(width, height) * rng.uniform(0.28, 0.42)
        self.head = (self.mid[0] + rng.uniform(-8, 8), self.mid[1] - self.shoulder * rng.uniform(0.75, 0.95))
        self.face_points = self._face()
        self.hand_shapes = [rng.choice(POSES), rng.choice(POSES)]
        self.phase = rng.uniform(0, math.tau)
        self.speed = rng.uniform(0.6, 2.4)

    def _face(self) -> list[tuple[float, float, float]]:
        rng = self.rng
        radius = self.shoulder * 0.33
        points: dict[int, tuple[float, float, float]] = {}
        for index in range(478):
            if index in points:
                continue
            angle = rng.uniform(0, math.tau)
            distance = radius * math.sqrt(rng.uniform(0.02, 1.0))
            dx, dy, dz = distance * math.cos(angle), distance * math.sin(angle) * 1.25, rng.uniform(-0.04, 0.04)
            if index in FACE_MIDLINE:
                points[index] = (0.0, dy, dz)
            elif index in FACE_PARTNER:
                dx = abs(dx) + 2.0
                # The signer's right side appears on the image's left in the unmirrored view.
                right_side = index in (46, 53, 52, 65, 55, 70, 63, 105, 66, 107, 33, 133, 234,
                                       61, 146, 91, 181, 84, 185, 40, 39, 37, 78, 95, 88, 178, 87, 191, 80, 81, 82)
                points[index] = (-dx if right_side else dx, dy, dz)
                partner = FACE_PARTNER[index]
                points[partner] = (dx if right_side else -dx, dy, dz)
            else:
                points[index] = (dx, dy, dz)
        return [points[index] for index in range(478)]

    def frame(self, t: float, keep: dict) -> dict:
        """Ground truth for time t (seconds), unmirrored, anatomical sides."""
        w, h, s = self.w, self.h, self.shoulder
        sway = 6.0 * math.sin(0.7 * t + self.phase)
        mx, my = self.mid[0] + sway, self.mid[1]
        rs = (mx - s / 2, my + 2.0)  # signer's right shoulder: image left
        ls = (mx + s / 2, my - 2.0)
        swing = math.sin(self.speed * t + self.phase)
        rw = (rs[0] + s * (0.15 + 0.35 * swing), rs[1] - s * (0.55 + 0.25 * math.cos(self.speed * t)))
        lw = (ls[0] - s * (0.2 + 0.3 * math.cos(1.3 * self.speed * t)), ls[1] - s * (0.35 + 0.3 * swing))
        re = ((rs[0] + rw[0]) / 2 - s * 0.12, (rs[1] + rw[1]) / 2 + s * 0.25)
        le = ((ls[0] + lw[0]) / 2 + s * 0.12, (ls[1] + lw[1]) / 2 + s * 0.25)
        pose = [[0.5, 0.5, 0.0, 0.2] for _ in range(33)]
        named = {0: (self.head[0] + sway, self.head[1]), 11: ls, 12: rs, 13: le, 14: re, 15: lw, 16: rw,
                 23: (ls[0] - s * 0.1, my + s * 1.4), 24: (rs[0] + s * 0.1, my + s * 1.4)}
        for index in range(33):
            x, y = named.get(index, (mx + self.rng.uniform(-s, s), my + self.rng.uniform(-s, s)))
            pose[index] = [r6(x / w), r6(y / h), r6(self.rng.uniform(-0.3, 0.3)), r6(self.rng.uniform(0.3, 1.0))]
        face = [[r6((self.head[0] + sway + x) / w), r6((self.head[1] + y) / h), r6(z)] for x, y, z in self.face_points]
        hands = {}
        for side, wrist, shape, mirror in (("right", rw, self.hand_shapes[0], False), ("left", lw, self.hand_shapes[1], True)):
            hands[side] = self._hand(wrist, shape, mirror, t)
        return {
            "pose": pose if keep.get("pose", True) else None,
            "face": face if keep.get("face", True) else None,
            "left": hands["left"] if keep.get("left", True) else None,
            "right": hands["right"] if keep.get("right", True) else None,
        }

    def _hand(self, wrist, shape, mirror, t):
        points = sample_hand(**shape)
        wx0, wy0, _ = points[0]
        size = self.shoulder * 0.9
        angle = 0.4 * math.sin(1.7 * t + self.phase)
        cos, sin = math.cos(angle), math.sin(angle)
        out = []
        for x, y, z in points:
            dx, dy = (x - wx0) * size, (y - wy0) * size
            if mirror:
                dx = -dx
            rx, ry = dx * cos - dy * sin, dx * sin + dy * cos
            out.append([r6((wrist[0] + rx + 3.0) / self.w), r6((wrist[1] + ry) / self.h), r6(z * 0.1 - 0.02 * math.sin(t))])
        return out


def raw_from_truth(truth: dict, timestamp: int, width: int, height: int, mirrored: bool, label_mode: str) -> dict:
    """What a landmarker would report for this ground truth, on mirrored or unmirrored input."""
    def flip(rows):
        return [[r6(1.0 - row[0])] + row[1:] for row in rows]

    pose, face = truth["pose"], truth["face"]
    hands = []
    for side in ("left", "right"):
        rows = truth[side]
        if rows is None:
            continue
        # MediaPipe labels assume a mirrored input: right for the signer's right hand only when mirrored.
        label = side.capitalize() if mirrored else ("Right" if side == "left" else "Left")
        if label_mode == "wrong":
            label = "Left" if label == "Right" else "Right"
        elif label_mode == "same":
            label = "Left"
        elif label_mode == "none":
            label = None
        hands.append({"landmarks": flip(rows) if mirrored else rows, "handedness": label})
    if mirrored:
        if pose is not None:
            pose = flip(pose)
            for a, b in POSE_PAIRS:
                pose[a], pose[b] = pose[b], pose[a]
        if face is not None:
            face = flip(face)
            for a, b in FACE_PAIRS:
                face[a], face[b] = face[b], face[a]
    return {"timestamp_ms": timestamp, "image_width": width, "image_height": height, "input_mirrored": mirrored,
            "hands": hands, "pose": pose, "face": face}


def build_canonicalize_cases(rng: random.Random) -> list[dict]:
    cases = []
    scenarios = []
    for mirrored in (False, True):
        for keep_pose in (True, False):
            for label_mode in ("normal", "wrong", "same", "none"):
                for hands in ("both", "left", "right", "none"):
                    scenarios.append((mirrored, keep_pose, label_mode, hands))
    for number, (mirrored, keep_pose, label_mode, hands) in enumerate(scenarios):
        if hands == "none" and label_mode != "normal":
            continue
        width, height = SIZES[number % len(SIZES)]
        body = Body(rng, width, height)
        keep = {"pose": keep_pose, "face": number % 5 != 0, "left": hands in ("both", "left"), "right": hands in ("both", "right")}
        truth = body.frame(rng.uniform(0, 3), keep)
        raw = raw_from_truth(truth, 1000 + number, width, height, mirrored, label_mode)
        if raw["face"] is not None and number % 3 == 0:
            raw["face"] = raw["face"][:468]
        if len(raw["hands"]) == 2 and number % 2:
            raw["hands"].reverse()
        cases.append({
            "id": f"canon_{number:03d}_{'mirrored' if mirrored else 'raw'}_{'pose' if keep_pose else 'nopose'}_{label_mode}_{hands}",
            "raw": raw,
            "expected": canonicalize_frame(raw),
        })
    return cases


def build_sequences(rng: random.Random) -> list[dict]:
    plans = [("single", 1), ("pair", 2), ("short", 5)] + [(f"seq{index:02d}", rng.randint(24, 48)) for index in range(30)]
    plans += [("no_pose_anywhere", 18), ("jittered_timestamps", 30), ("hands_flicker", 40), ("face_lost", 26)]
    sequences = []
    for number, (name, length) in enumerate(plans):
        width, height = SIZES[number % len(SIZES)]
        body = Body(rng, width, height)
        time_ms = rng.randint(0, 5000)
        frames = []
        for index in range(length):
            step = 33 if name != "jittered_timestamps" else rng.randint(12, 70)
            time_ms += step if index else 0
            keep = {
                "pose": name != "no_pose_anywhere" and rng.random() > 0.06,
                "face": not (name == "face_lost" and 8 <= index < 20) and rng.random() > 0.05,
                "left": rng.random() > (0.5 if name == "hands_flicker" else 0.12),
                "right": rng.random() > (0.5 if name == "hands_flicker" else 0.08),
            }
            truth = body.frame(time_ms / 1000.0, keep)
            raw = raw_from_truth(truth, time_ms, width, height, mirrored=bool(number % 2), label_mode="normal")
            frames.append(canonicalize_frame(raw))
        result = sequence_features(frames)
        weights = checksum_weights(len(result["features"][0]))
        sequences.append({
            "id": name,
            "frames": frames,
            "reference": result["reference"],
            "checksums": [[sum(row), sum(abs(value) for value in row), sum(value * weight for value, weight in zip(row, weights))] for row in result["features"]],
            "full_vectors": {str(index): row for index, row in enumerate(result["features"]) if index % FULL_VECTOR_EVERY == 0},
        })
    return sequences


def main() -> None:
    rng = random.Random(SEED)
    canonical = build_canonicalize_cases(rng)
    sequences = build_sequences(rng)
    total = sum(len(sequence["frames"]) for sequence in sequences)
    payload = {
        "fixture": "SignBridge v2 parity fixture",
        "spec_version": SPEC["spec_version"],
        "feature_version": SPEC["feature_version"],
        "note": "Synthetic geometry for cross-language parity tests only. Not recorded signer data. Never use for training or evaluation.",
        "generator": "tests/golden/make_v2_golden.py",
        "seed": SEED,
        "tolerance": 1e-6,
        "checksum": "per frame: [sum(v), sum(|v|), sum(v[i] * w[i])] with w[i] = ((i * 7919) % 1009) / 1009 - 0.5",
        "full_vector_every": FULL_VECTOR_EVERY,
        "frame_count": total,
        "canonicalize_cases": canonical,
        "sequences": sequences,
    }
    data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    OUTPUT.write_bytes(gzip.compress(data, compresslevel=9, mtime=0))
    print(f"Wrote {len(canonical)} canonicalize cases and {len(sequences)} sequences ({total} frames) to {OUTPUT} ({OUTPUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
