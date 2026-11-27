# Release v4: ASL only, website only (Stage 0 state)

Released 2026-11-27 at the owner's request ("release", then "Yes, merge it now"). Pull request #10, squash-merged into
`main` as `ce34f15`. Deployed by "Website and checks" run 45981852121 (build and "Publish to GitHub Pages" both
succeeded). This is master v4's Stage 0 state, not the finished plan: see "Not in this release".

## Live checks (2026-11-27, the Claude desktop app's built-in browser on the owner's computer)

| Check | Result |
|---|---|
| `https://signmate-pk.github.io/` | The ASL project page: title "SignMate — American Sign Language to English, on your device", 250 sign cards, hero shows 85.3 % (browser path), no PSL, offline or install wording, no web app manifest |
| `/ci/status.json` | commit `ce34f15…`, tests "success", licence release rules "success", ASL browser check "success", built 2026-11-27T10:25:56Z |
| `/sw.js` | the clean-up worker ("SignMate no longer uses a service worker…"); no service worker registered on the page |
| `/app.html#/words` | forwards to `/translate/#/words` |
| `/translate/` | the translator: "The camera knows 250 ASL signs", 250 gallery cards, ASL tag, welcome card; `../asl_islr_spec.json` and `../models/asl/model.tflite` answer 200 |
| Live camera with a real signer | **not checked** (needs a person) |
| Lighthouse on the live pages | not measured here; the preview runs measured both pages (scores in their Summaries) |

## Numbers in this release
Unchanged from `reports/v4_stage0.md`: GISLR rerun set (39,443 signs, Kaggle CPU, 2026-11-20): top-1 86.2 % native,
top-5 95.4 %, 85.3 % at the browser's 32 frames (7,889 signs), left- vs right-dominant 89.1 % vs 84.6 %.

## Not in this release
- Guided-tour recordings, per-sign results, the confusion matrix, test-time mirroring, calibration error (the owner's
  Kaggle run, `docs/HOW_TO_RUN_ASL_EVAL.md`).
- A real sign tested live; the live camera's speed on named devices; the face-tracker rate.
- Stages 1-7 of master v4.

## Owner steps after the release
- Tag `v4.0.0` on `ce34f15` (this workspace cannot push tags): GitHub → Releases → Draft a new release → Choose a
  tag: `v4.0.0` → Target: `main` → title "SignMate v4.0.0 — ASL, website only" → Publish. No file to attach.
- The PSL archive `psl-v3-final` on `c90d4df` is still to be created (`docs/HOW_TO_ARCHIVE_PSL.md`; pick c90d4df under
  Recent commits, since `main` has moved on).

If anything is broken and cannot be fixed quickly: revert `ce34f15` on `main` (the pull request #10 page → Revert),
which brings the PSL site back.

## Branches
`v4/asl` continues after the release (its content equals `main` at `ce34f15`; the squash merge gave `main` one commit
instead of v4/asl's nine). New work reaches `main` by pull request from `v4/asl`.
