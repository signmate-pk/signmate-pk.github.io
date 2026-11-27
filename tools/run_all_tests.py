"""Run every automated SignMate test that this machine can run, and say what was skipped.

    python tools/run_all_tests.py           Python tests + licence ledger check + website tests (Node)
                                            + Inference Baseline v1 in a real browser (if restored)
    python tools/run_all_tests.py --smoke   also the fake-camera browser smoke test (needs Playwright)

The website's Node tests need no packages and run whenever Node is installed.

Exit code is non-zero when any suite that ran has failures. Suites that cannot run here
(for example Node is not installed) are reported as SKIPPED, never as passed.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"


def run(name: str, command: list[str], cwd: Path) -> str:
    print(f"\n=== {name} ===", flush=True)
    completed = subprocess.run(command, cwd=cwd)
    return "PASSED" if completed.returncode == 0 else f"FAILED (exit {completed.returncode})"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--smoke", action="store_true", help="also run the browser camera smoke test")
    args = parser.parse_args()
    results: dict[str, str] = {}

    results["Python unit tests"] = run("Python unit tests", [sys.executable, "-m", "unittest", "discover", "-s", "tests"], ROOT)
    results["Licence ledger check"] = run("Licence ledger check", [sys.executable, str(ROOT / "tools" / "check_licenses.py")], ROOT)

    node = shutil.which("node")
    node_tests = [str(p.relative_to(WEB)) for p in sorted((WEB / "tests").glob("*.test.mjs"))]
    if not node:
        results["Website tests (Node)"] = "SKIPPED: Node.js is not installed"
    else:
        results["Website tests (Node)"] = run("Website tests (Node)", [node, "--test", *node_tests], WEB)

    # Inference Baseline v1 (master-v3.md section 0): the frozen build and its real model in Chromium.
    if not node:
        results["Baseline v1 in a browser"] = "SKIPPED: Node.js is not installed"
    else:
        print("\n=== Baseline v1 in a browser ===", flush=True)
        completed = subprocess.run([node, str(ROOT / "tools" / "baseline" / "run.mjs")], cwd=ROOT, capture_output=True, text=True)
        print(completed.stdout + completed.stderr, end="")
        if completed.returncode == 3:
            reason = completed.stdout.strip().splitlines()[-1].split(": ", 1)[-1] if completed.stdout.strip() else "see above"
            results["Baseline v1 in a browser"] = f"SKIPPED: {reason[:120]}"
        else:
            results["Baseline v1 in a browser"] = "PASSED" if completed.returncode == 0 else f"FAILED (exit {completed.returncode})"

    if args.smoke:
        npm = shutil.which("npm")
        if not npm:
            results["Browser camera smoke test"] = "SKIPPED: npm is not installed"
        elif not (WEB / "node_modules" / "@mediapipe" / "tasks-vision").exists():
            results["Browser camera smoke test"] = "SKIPPED: run npm install in the web folder first"
        else:
            results["Browser camera smoke test"] = run("Browser camera smoke test", [npm, "run", "test:smoke"], WEB)
    else:
        results["Browser camera smoke test"] = "SKIPPED: add --smoke to run it"

    print("\n=== Summary ===")
    for name, outcome in results.items():
        print(f"{name:<32} {outcome}")
    return 1 if any(outcome.startswith("FAILED") for outcome in results.values()) else 0


if __name__ == "__main__":
    sys.exit(main())
