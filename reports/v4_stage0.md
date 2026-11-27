# Master v4, Stage 0: archive PSL, freeze ASL, clean the house

Status on 2026-11-27: **work done on `v4/asl`; the gate is not yet passed.** Two owner steps are open (the PSL archive
release and the Kaggle run); the mirrored-baseline numbers the gate asks for come from that run and are not here yet.
Nothing below is estimated.

## Gate

| Gate item | State | Evidence |
|---|---|---|
| No PSL left in the shipped site | Done | `web/tests/product-ui.test.mjs` "no PSL functionality ships"; `web/tests/landing.test.mjs` "website only, ASL only"; licence check: every PSL ledger entry is retired and covers no file |
| Every test green | Done | CI "Preview build and checks" run 45974140812 on `7d961e9`: all suites passed (its fail-step did not run); locally: Python, licence ledger and 73 website tests pass |
| Baseline outputs unchanged | Done | Same run: Inference Baseline v1 compared in Chromium with `BASELINE_REQUIRED=1`, passed; `tests/golden/baseline_v1_outputs.json` untouched |
| ASL camera end to end on the preview build | Partly | Same run: the translator starts the camera from the welcome card (Chromium's fake camera), hands/pose/face tracking and the ASL model load in the worker with no page errors, the gallery lists 250 signs, and `app.html` forwards to `translate/`. A real sign recognised on the preview build needs the tour recordings (Kaggle run) or a person |
| `reports/v4_stage0.md` with the mirrored-baseline numbers | **Open** | Waiting for the owner's Kaggle run (`docs/HOW_TO_RUN_ASL_EVAL.md`) |

## What changed (steps 1-8)

1. **Archive.** Tag pushes and releases are refused from this workspace (HTTP 403). `docs/HOW_TO_ARCHIVE_PSL.md`: the
   owner creates the release `psl-v3-final` on `c90d4df`. GitHub's automatic source archive holds everything (PSL code,
   model, reports, Flutter app); no offline copy is attached (owner, website only).
2. **Branch and constitution.** `v4/asl`; CLAUDE.md section 10 (items 1-6 from the master prompt, item 7 "website only");
   the owner's decisions in `docs/v4_owner_decisions.md`.
3. **PSL removed** from `main`'s successor: models, specs, results, vocabulary, PSL clients, tools, notebooks, tests,
   goldens and workflows. Also removed on the owner's "website only" decision: the Flutter app, the Phase 0 desktop app
   and its SVM pipeline, the local server, the Windows offline copy, the service worker, the web app manifest.
   `baseline/v1-site/` is unchanged (its PSL demo files stay inside the frozen copy).
4. **Ledger.** New status `retired` with a schema-checked record of the former status and uses; all 17 PSL entries
   retired. The rerun set's entry now records consent evidence (from the PopSign v1.0 documentation of the same
   DPAN / Georgia Tech collection; to confirm in Stage 1) and allows `reference_clip` (CC0) for landmark recordings
   in `shared_data/tour/`, a newly checked folder.
5. **Engine on ASL.** `web/src/recognition/engine.js` runs the ISLR 1st-place model through
   `recognition/asl_model.js` (LiteRT.js worker, 32 frames) with full 543-point frames. Kept: one pass per camera frame,
   light mode, the GPU→CPU switch. Face tracking is back on at a lower rate (full mode: pose and face take turns, each
   every second frame; light mode: no pose, face every third frame): **a starting value, not yet measured on ASL
   accuracy or speed** (Stage 3). Decision thresholds come from `shared_data/asl_islr_spec.json` (accept 0.60, suggest
   0.25). The translator moved to `/translate/`; `/app.html` forwards.
6. **Guided tour on ASL.** Rebuilt to replay CC0 rerun-set landmark recordings through the real model (or the
   notebook's saved answers when the model cannot run). The recordings come from the Kaggle run; until then the tour
   says so and offers the camera. A Python→JavaScript parity test checks the compact storage format.
7. **Evaluation.** `notebooks/asl_mode_eval.ipynb` now writes, for four paths (native, native + mirror average,
   32 frames, 32 frames + mirror average), per-sign results, the full confusion matrix, calibration error and the
   left/right gap; and up to six tour recordings re-checked against the model. `tools/asl_results.py` builds
   `shared_data/asl_results.json` and refuses numbers that do not add up (status "totals only" for the 2026-11-20 file).
8. **Test-time mirroring.** Uses the exact flip the model was trained with (`flip_lr` of the 1st-place solution, MIT,
   ported and tested step by step). **Not measured yet**: the Kaggle run will say whether it closes the 4.5-point
   left/right gap and what it costs.

## Measured results available today

| Metric | Value | Dataset / split | Machine | Date | Source |
|---|---|---|---|---|---|
| Top-1, native length | 86.2 % | GISLR rerun set, 39,443 signs (signers reported absent from training) | Kaggle CPU | 2026-11-20 | `reports/asl_eval_results_2026-11-20.json` |
| Top-5, native length | 95.4 % | same | same | same | same |
| Top-1, browser path (32 frames) | 85.3 % | every 5th sign (7,889) | same | same | same |
| Left- vs right-dominant top-1 | 89.1 % vs 84.6 % | same, native | same | same | same |
| Two-handed | 11 signs: not judged | same | same | same | same |

## Not done / not tested

- Mirrored-baseline, per-sign, confusion-matrix and ECE numbers (owner's Kaggle run).
- Lighthouse scores for `/` and `/translate/` on run 45974140812 were measured but not read here: this workspace
  cannot download Actions artifacts. They are in the run's Summary.
- A real sign recognised live on the preview build; the face-tracker rate; latency of the ASL engine on devices.
- The Urdu decision is honoured by showing English only until an Urdu editor reviews translations.
