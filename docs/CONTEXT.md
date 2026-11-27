# SignMate — Context pack (master v4: ASL only, Stage 0 in progress, 2026-11-27)

## Product goal
SignMate: American Sign Language ↔ English, in real time, in the browser, on the person's own device. A website
only (no app, no offline copy). Every answer is a suggestion the signer confirms before anything is spoken.

## Plan in force: master v4
`docs/prompts/master-v4-asl.md` (Stages 0-8) and CLAUDE.md section 10 (ASL is the language; consent first, then
licence; nothing is generated; honest captions; Deaf-led; baseline protection; website only). The owner's answers to
its section 10 questions and the later "website only" decision: `docs/v4_owner_decisions.md`.
All work happens on the branch **`v4/asl`**. `main` is the live PSL site (commit `c90d4df`, PR #9) and changes only
when the owner replies "release" and merges at Stage 8. The PSL project (v3) is archived on the tag `psl-v3-final`
(to be created by the owner: `docs/HOW_TO_ARCHIVE_PSL.md`).

## Where things live
- GitHub: `signmate-pk/signmate-pk.github.io`. Live site: <https://signmate-pk.github.io/> (`shared_data/site.json`).
- The owner works on Windows (`D:\sigmbridge\SignMate`, a clone that may lag behind GitHub); GitHub is the source of truth.
- Pages (v4): project page `web/index.html` (filled at build time by `web/scripts/landing-content.mjs` from committed
  data); translator `web/translate/index.html` (React, `web/src/`; finds the site's files through
  `<meta name="signmate-base" content="../">`); `web/public/app.html` forwards old links to `translate/`.
- Recognition: `web/src/recognition/engine.js` (one pass per camera frame, light mode, GPU→CPU switch; hands every
  frame, pose and face in turn) → `recognition/asl_model.js` (LiteRT.js in a worker, 32 frames) → `decision.js`.
- CI: `.github/workflows/preview.yml` (`v4/**` and PRs: all tests incl. the baseline comparison in Chromium, the ASL
  browser self-test with the translator on a fake camera, Lighthouse on `/` and `/translate/`; never deploys);
  `website.yml` (main only: deploy to Pages). This workspace cannot download Actions artifacts (blob host blocked).
- This workspace can push branches but not tags or releases (HTTP 403): those are owner steps.

## Baseline (protected, CLAUDE.md 9.1 / 10.6)
- The ISLR 1st-place model (Hoyeol Sohn, MIT), `models/asl/model.tflite`, 11,242,036 bytes, SHA-256 `f55a2bb1…`.
- Inference Baseline v1: `baseline/v1-site/`, tag `inference-baseline-v1`, `tests/golden/baseline_v1_outputs.json`
  (unchanged; CI's browser comparison passed on `7d961e9`).

## Measured state
- GISLR rerun set (39,443 signs, CC0, Kaggle CPU, 2026-11-20; `reports/asl_eval_results_2026-11-20.json` →
  `shared_data/asl_results.json`, "totals only"): top-1 86.2 % native, top-5 95.4 %, 85.3 % at the browser's 32 frames
  (every 5th sign); left- vs right-dominant 89.1 % vs 84.6 %; two-handed: 11 signs only. At ≥ 0.60: 97.2 % right on
  76.6 % of signs; at ≥ 0.80: 99.0 % right (1.0 % wrong) on 64.2 %.
- Not yet measured: per-sign results, the confusion matrix, test-time mirroring, calibration error (ECE), the live ASL
  camera latency on named devices.

## Waiting for (owner)
1. `docs/HOW_TO_ARCHIVE_PSL.md`: create the release `psl-v3-final` on `c90d4df`, reply "archived".
2. `docs/HOW_TO_RUN_ASL_EVAL.md`: one Kaggle "Save & Run All"; attach `asl_eval_results.json` and
   `asl_tour_recordings.json`. Then the agent commits them (`reports/asl_eval_results_<date>.json`,
   `shared_data/tour/asl_tour_recordings.json`), runs `tools/asl_results.py`, and finishes `reports/v4_stage0.md`.
3. Device names for the budgets (laptop + browser, Android phone), needed from Stage 3.
4. Review the drafts: `docs/permission_requests.md` section 7 (Microsoft, ASL Citizen), `docs/outreach/` (Deaf reviewers).

## Open findings
- The GISLR rerun set's signer independence is the publisher's claim (no signer ids in its labels).
- The face-tracker rate (every 2nd frame in full mode, every 3rd in light mode) is a starting value, not measured.
- The ASL model has no "not a sign" class: resting or out-of-vocabulary movement can come out as a word (Stage 2).
- `tools/web_learn/` is still PSL-shaped (its PSL tests are skipped); Stage 1 rebuilds it for ASL.
- Recorded-sign drawings assume a 4:3 camera; GISLR recordings do not state their camera shape.
- Urdu interface text is not shown (never reviewed); drafts are on `psl-v3-final`.
