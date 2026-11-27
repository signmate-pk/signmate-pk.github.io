"""Download the model files listed in shared_data/downloads.json, once, and refuse any file whose size or
SHA-256 differs from the pinned value. Used by tools/fetch_assets.py and ml_engine/capture_v2.py;
web/scripts/copy-assets.mjs does the same in Node for the website.
"""

from __future__ import annotations

import hashlib
import json
import os
import urllib.request
from pathlib import Path
from typing import Callable

ROOT = Path(__file__).resolve().parents[1]
DOWNLOADS_PATH = ROOT / "shared_data" / "downloads.json"


class DownloadError(RuntimeError):
    """A file could not be downloaded, or it is not the file the project pinned."""


def load_downloads(path: Path = DOWNLOADS_PATH) -> list[dict]:
    return json.loads(Path(path).read_text(encoding="utf-8"))["files"]


def entry_for(relative_path: str, path: Path = DOWNLOADS_PATH) -> dict | None:
    relative_path = Path(relative_path).as_posix()
    for item in load_downloads(path):
        if item["path"] == relative_path:
            return item
    return None


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def verify(path: Path, item: dict) -> str | None:
    """None if `path` is the pinned file, otherwise a sentence saying what is wrong."""
    if not path.exists():
        return f"{item['path']} is missing"
    size = path.stat().st_size
    if size != item["bytes"]:
        return f"{item['path']} has {size} bytes, expected {item['bytes']}"
    actual = sha256_file(path)
    if actual != item["sha256"]:
        return f"{item['path']} has SHA-256 {actual}, expected {item['sha256']}"
    return None


def fetch(item: dict, root: Path = ROOT, opener: Callable = urllib.request.urlopen, log: Callable[[str], None] = print) -> Path:
    """Make sure `item` is present and correct under `root`, downloading it if needed. Returns its path."""
    from data_engine.ledger import LicenceError, assert_allowed

    try:
        assert_allowed(item["asset_id"], "redistribute_weights")
    except LicenceError as error:
        raise DownloadError(f"{item['path']}: {error}") from error
    target = Path(root) / item["path"]
    problem = verify(target, item)
    if problem is None:
        return target
    if target.exists():
        bad = target.with_name(target.name + ".bad")
        os.replace(target, bad)
        log(f"{problem}; moved it to {bad.name} and downloading the pinned file again")
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_name(target.name + ".download")
    log(f"Downloading {item['path']} ({item['bytes'] / 1e6:.1f} MB) from {item['url']}")
    try:
        with opener(item["url"], timeout=60) as response, open(partial, "wb") as handle:
            while True:
                block = response.read(1 << 20)
                if not block:
                    break
                handle.write(block)
    except Exception as error:
        partial.unlink(missing_ok=True)
        raise DownloadError(f"Could not download {item['path']}: {error}. Connect to the internet once and try again.") from error
    problem = verify(partial, item)
    if problem is not None:
        partial.unlink(missing_ok=True)
        raise DownloadError(f"The downloaded file is not the pinned one ({problem.replace(item['path'], 'download')}); nothing was saved.")
    os.replace(partial, target)
    return target
