# SignMate

**American Sign Language → English, in the browser, on your own device. Built in Pakistan.**

SignMate watches a sign through the camera, shows the English word (with the ASL gloss underneath), and says it out
loud once the signer confirms it. It is a website, nothing to install: the project page is
<https://signmate-pk.github.io/> and the translator is <https://signmate-pk.github.io/translate/>. Recognition runs in the
visitor's browser; the camera picture never leaves the device.

> **Work in progress on the branch `v4/asl`.** The live site is still the Pakistan Sign Language version until the
> owner releases v4 (master-v4 Stage 8). The PSL version is archived on the tag `psl-v3-final`.

## Status, honestly

- **250 ASL signs**, one at a time: everyday words, many from a young child's first vocabulary.
- Measured on the GISLR rerun set (39,443 signs by Deaf signers the model was not trained on, as reported by the
  dataset's publisher; CC0), on Kaggle, 2026-11-20: **86.2 %** right first time at each sign's real length, **95.4 %**
  with the right sign in the top five, and **85.3 %** the way the website runs the model (32 frames, measured on every
  5th sign). Left-dominant signers 89.1 % vs right-dominant 84.6 %. Source: `reports/asl_eval_results_2026-11-20.json`,
  built into `shared_data/asl_results.json` by `tools/asl_results.py`.
- These are dataset numbers. Real signing at a laptop or phone camera can differ, which is why every answer is a
  suggestion the signer confirms before anything is spoken.
- **No sign is validated by Deaf reviewers yet.** Every sign says "Dataset sign — not yet validated by our reviewers".
- English only for now; Urdu returns for translations an Urdu editor has reviewed.

## Who it is for

Short, face-to-face exchanges between a Deaf ASL signer and a hearing person who does not sign (at a counter, in a
class, between family members), and people learning ASL who want to practise signs with feedback. It is a helper,
not an interpreter: for medical, legal or emergency decisions, use a qualified interpreter.

## How it works

1. **Track:** MediaPipe (hands every frame, face and upper body in turn) turns each camera frame into 543 landmark
   points, in the browser.
2. **Cut:** a sign starts when the hands come up and ends when they come down.
3. **Read:** the 1st-place model of Google's Isolated Sign Language Recognition competition (Hoyeol Sohn, MIT licence,
   11.2 MB) reads the hands, lips, nose and eyes over 32 frames, in a Web Worker (LiteRT.js).
4. **Check:** sure answers (from 0.60 with a clear lead) are shown large; unsure ones become "Which one did you sign?";
   unclear ones get a hint. Nothing is spoken until the signer confirms.

## Privacy

The camera picture never leaves the device: SignMate works with landmark points, keeps them only in memory, and saves
nothing unless the person chooses to. No accounts, no analytics, no server. While online, Google's MediaPipe library
may send anonymous speed and usage counts (never images). Voice typing on the Reply screen uses the browser's speech
service, which may send audio online; typing does not.

## Work on it

Windows: run `setup_windows.bat` once, then `start_web.bat` (the website at <http://localhost:5173/>; the translator at
<http://localhost:5173/translate/>). Elsewhere:

```
python -m pip install -r requirements.txt
python tools/fetch_assets.py
cd web && npm install && npm run dev
```

Tests: `python tools/run_all_tests.py` (Python, licence ledger, website), `cd web && npm test`.

| Where | What |
|---|---|
| `web/index.html`, `web/scripts/landing-content.mjs` | The project page, filled at build time from committed data |
| `web/translate/index.html`, `web/src/` | The translator (React); `web/src/recognition/` is the live engine |
| `models/asl/`, `shared_data/asl_islr_spec.json` | The ASL model's labels and spec (the weights are downloaded, SHA-256 checked) |
| `notebooks/asl_mode_eval.ipynb`, `tools/asl_eval_core.py` | The accuracy run on Kaggle (`docs/HOW_TO_RUN_ASL_EVAL.md`) |
| `data/LICENSES.yaml` | The licence ledger: every dataset and model, checked before use |
| `baseline/v1-site/` | The frozen Inference Baseline v1 (never changed) |
| `docs/prompts/master-v4-asl.md`, `CLAUDE.md` | The plan in force and the project's rules |

## Rules the project keeps

Every number names its dataset, split and date; nothing is estimated. Only data recorded with signers' consent and
under a licence that allows the use is trained on or shown, recorded in the ledger before download. Nothing is
generated: no model invents a sign, a handshape or a description. A new model replaces the baseline only after a
measured, side-by-side improvement. See `CLAUDE.md`.

## Credits

The ASL model: Hoyeol Sohn, 1st place in Google's Isolated Sign Language Recognition competition (MIT). Training and
test data: Google, the Deaf Professional Arts Network and Georgia Tech (GISLR competition data, CC BY 4.0; rerun set,
CC0). Tracking: Google MediaPipe (Apache-2.0). Runtime: LiteRT.js (Apache-2.0). Full list with attributions:
`data/LICENSES.yaml` and the website's Credits page.
