# Master v4, Stage 0 handoff — 2026-11-27

## Result
Gate **not yet passed** (two owner steps open). Branch `v4/asl`, last commit in this handoff's push. Details and evidence:
`reports/v4_stage0.md`.

## What changed
- CLAUDE.md section 10 (ASL only; item 7 website only), `docs/v4_owner_decisions.md`.
- PSL, the Flutter app, the desktop app, the local server, the offline copy, the service worker and the manifest removed
  (all on `psl-v3-final` once the owner creates it). Ledger: status `retired`, 17 PSL entries retired.
- The engine runs the ASL model (`web/src/recognition/asl_model.js`); face tracking back on at a lower, unmeasured rate.
- The translator moved to `/translate/` (finds files through `<meta name="signmate-base">`); `/app.html` forwards.
- The project page, site pages and CI rebuilt for ASL; new sharing image.
- The Kaggle evaluation adds mirroring, per-sign results, the confusion matrix, ECE and tour recordings;
  `tools/asl_results.py` builds `shared_data/asl_results.json` with add-up checks.
- Rewritten on purpose (CLAUDE.md 6): `App.jsx`, `MoreScreen.jsx`, `ReplyScreen.jsx`, `TourScreen.jsx`, `WordsScreen.jsx`,
  `recordings.js`, `signs.js`, `i18n.js` (English only), `landing-content.mjs`, `index.html`: each was built around PSL
  data that no longer exists (manifest tiers, Urdu glosses, SLT clips, PSL recordings). Stage 3 replaces this interface.

## Measured results
See `reports/v4_stage0.md` (2026-11-20 rerun-set numbers; nothing new measured on accuracy in this stage).

## Not done / not tested
- [ME] PSL archive release (`docs/HOW_TO_ARCHIVE_PSL.md`).
- [ME] Kaggle run (`docs/HOW_TO_RUN_ASL_EVAL.md`); then: commit both files, `python tools/asl_results.py`,
  `python tools/site_pages.py`, finish `reports/v4_stage0.md` (mirrored numbers), check the tour plays real signs.
- [ME] Device names; review `docs/permission_requests.md` section 7 and `docs/outreach/deaf_reviewers.md`.
- The browser vs server parity check went with the server; the frozen-baseline comparison still guards the browser path.

## Current state / open findings
Copied into `docs/CONTEXT.md`.
