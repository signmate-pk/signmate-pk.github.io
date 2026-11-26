"""Look inside the licensed PSL datasets before writing their converters (master-v3 Stage 2).

Lists every file of each dataset through the public APIs (Hugging Face, Mendeley Data), downloads the
smallest SignSpeak archive and prints its layout: member names, file types, and the shape and first
values of a few samples. Prints only; writes nothing to the repository. Every dataset listed here has a
ledger entry that allows training (data/LICENSES.yaml), checked before anything is downloaded.

    python -m tools.psl_data.discover
"""

from __future__ import annotations

import io
import json
import os
import tempfile
import urllib.request
import zipfile
from pathlib import Path

from data_engine.ledger import assert_allowed

UA = {"User-Agent": "SignBridge-psl-data/1.0 (https://github.com/shaafrajput06-tech/SignBridge)"}
SIGNSPEAK_HF = "mohibkhansherwani/DynamicWordLevelPakistanSignLanguageDataset"
# Candidate landmark datasets on Hugging Face: ledger id -> repository. Listed only once the ledger allows
# training; until then assert_allowed refuses and the reason is printed (data/LICENSES.yaml notes say why).
HF_LANDMARKS = {"psl-bakhtyar12-landmarks": "Bakhtyar12/Pakistani-Sign-Language"}
MENDELEY = {  # ledger id -> (Mendeley dataset id, version)
    "psl-pkslmnm": ("m3m9924p3v", 2),
    "psl-ualpha40": ("3pvnnckxyb", 3),
    "psl-expression-hands": ("4d6tj5snkd", 3),
}


def get(url: str, timeout: int = 120) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as response:  # noqa: S310
        return response.read()


def show_array_like(name: str, data: bytes) -> None:
    suffix = Path(name).suffix.lower()
    try:
        if suffix == ".npy":
            import numpy as np

            array = np.load(io.BytesIO(data), allow_pickle=False)
            print(f"    {name}: npy shape {array.shape} dtype {array.dtype} first {array.reshape(-1)[:6]}")
        elif suffix in (".csv", ".txt"):
            lines = data.decode("utf-8", errors="replace").splitlines()
            print(f"    {name}: {len(lines)} lines; first: {lines[:3]}")
        elif suffix == ".json":
            obj = json.loads(data.decode("utf-8"))
            print(f"    {name}: json {type(obj).__name__} keys/len {list(obj)[:10] if isinstance(obj, dict) else len(obj)}")
        elif suffix in (".pkl", ".pickle"):
            print(f"    {name}: pickle ({len(data)} bytes) - not opened (pickles can run code)")
        else:
            print(f"    {name}: {len(data)} bytes")
    except Exception as error:  # noqa: BLE001
        print(f"    {name}: could not read ({error})")


def signspeak() -> None:
    assert_allowed("psl-signspeak-words", "train_labels")
    info = json.loads(get(f"https://huggingface.co/api/datasets/{SIGNSPEAK_HF}"))
    files = [s["rfilename"] for s in info.get("siblings", [])]
    print(f"SignSpeak (Hugging Face {SIGNSPEAK_HF}): sha {info.get('sha')}, licence {info.get('cardData', {}).get('license')}")
    for name in files:
        print("  file:", name)
    for name in ("README.md", "links_to_words.txt"):
        if name in files:
            text = get(f"https://huggingface.co/datasets/{SIGNSPEAK_HF}/resolve/main/{name}").decode("utf-8", errors="replace")
            print(f"  ----- {name} ({len(text)} chars) -----")
            for line in text.splitlines()[:120]:
                print("  |", line[:200])
    zips = [f for f in files if f.lower().endswith(".zip")]
    if not zips:
        return
    sizes = {}
    for name in zips:
        request = urllib.request.Request(f"https://huggingface.co/datasets/{SIGNSPEAK_HF}/resolve/main/{name}", headers=UA, method="HEAD")
        with urllib.request.urlopen(request, timeout=60) as response:  # noqa: S310
            sizes[name] = int(response.headers.get("Content-Length") or 0)
    # The first archive is known (docs/handoffs/v3-stage-2-plan.md); look inside the one not opened yet.
    smallest = os.environ.get("SIGNSPEAK_ARCHIVE") or max(zips, key=lambda n: sizes[n])
    print(f"  downloading {smallest} ({sizes[smallest]} bytes)")
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "a.zip"
        path.write_bytes(get(f"https://huggingface.co/datasets/{SIGNSPEAK_HF}/resolve/main/{smallest}", timeout=900))
        with zipfile.ZipFile(path) as archive:
            names = archive.namelist()
            print(f"  {len(names)} members; first 25 and every 5000th:")
            for name in names[:25] + names[25::5000]:
                print("   ", name)
            folders = sorted({n.split("/")[0] for n in names})[:10]
            second = sorted({"/".join(n.split("/")[:2]) for n in names if n.count("/") >= 1})[:15]
            print("  top folders:", folders)
            print("  second level:", second)
            suffixes = {}
            for n in names:
                suffixes[Path(n).suffix.lower()] = suffixes.get(Path(n).suffix.lower(), 0) + 1
            print("  file types:", suffixes)
            for n in [n for n in names if n.lower().endswith(".json")]:
                print(f"  ----- {n} -----")
                print("  |", archive.read(n).decode("utf-8", errors="replace")[:1500])
            counts: dict[tuple[str, str], set] = {}
            frames: dict[tuple[str, str, str], int] = {}
            for n in names:
                parts = n.split("/")
                if len(parts) == 4 and parts[3].endswith(".npy"):
                    counts.setdefault((parts[0], parts[1]), set()).add(parts[2])
                    frames[(parts[0], parts[1], parts[2])] = frames.get((parts[0], parts[1], parts[2]), 0) + 1
            words = sorted({w for _, w in counts})
            print(f"  words: {len(words)}; samples: {sum(len(v) for v in counts.values())}; frames per sample: "
                  f"{sorted(set(frames.values()))[:10]}")
            for folder in sorted({f for f, _ in counts}):
                per_word = [len(counts.get((folder, w), ())) for w in words]
                print(f"  {folder}: samples per word min {min(per_word)} max {max(per_word)} total {sum(per_word)}")
            print("  word list:", ", ".join(words))
            import numpy as np

            if not frames:
                for n in [n for n in names if n.lower().endswith(".npy")][:5]:
                    show_array_like(n, archive.read(n))
                return
            sample_key = sorted(k for k in frames)[len(frames) // 2]
            stack = np.stack([np.load(io.BytesIO(archive.read(f"{sample_key[0]}/{sample_key[1]}/{sample_key[2]}/{i}.npy")))
                              for i in range(frames[sample_key])])
            left, right = stack[:, :63], stack[:, 63:]
            print(f"  sample {sample_key}: shape {stack.shape}; frames with first block non-zero {int((np.abs(left).sum(1) > 0).sum())}, "
                  f"second block non-zero {int((np.abs(right).sum(1) > 0).sum())}; x range {stack[:, 0::3][stack[:, 0::3] != 0].min() if (stack != 0).any() else 0:.3f}"
                  f"..{stack[:, 0::3].max():.3f}")


def mendeley(ledger_id: str, dataset: str, version: int) -> None:
    assert_allowed(ledger_id, "train_labels")
    url = f"https://data.mendeley.com/public-api/datasets/{dataset}/files?folder_id=root&version={version}"
    try:
        files = json.loads(get(url))
    except Exception as error:  # noqa: BLE001
        print(f"{ledger_id}: listing failed ({error})")
        return
    print(f"{ledger_id} (Mendeley {dataset} v{version}): {len(files)} entries at the top level")
    for item in files[:40]:
        details = item.get("content_details", {})
        print(f"  {item.get('filename')} | {details.get('size')} bytes | {details.get('content_type')} | folder={item.get('folder_id')}")


def huggingface_landmarks(ledger_id: str, repo: str) -> None:
    assert_allowed(ledger_id, "train_labels")
    files = json.loads(get(f"https://huggingface.co/api/datasets/{repo}/tree/main?recursive=true"))
    print(f"{ledger_id} (Hugging Face {repo}): {len(files)} entries")
    for item in files[:40]:
        print(f"  {item.get('path')} | {item.get('size')} bytes")


def main() -> None:
    for ledger_id, repo in HF_LANDMARKS.items():
        try:
            huggingface_landmarks(ledger_id, repo)
        except Exception as error:  # noqa: BLE001 - a refused or missing dataset must not stop the others
            print(f"{ledger_id}: not used ({error})")
    try:
        signspeak()
    except Exception as error:  # noqa: BLE001
        print("SignSpeak discovery failed:", error)
    for ledger_id, (dataset, version) in MENDELEY.items():
        mendeley(ledger_id, dataset, version)


if __name__ == "__main__":
    main()
