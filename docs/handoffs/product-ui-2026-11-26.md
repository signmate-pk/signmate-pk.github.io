# Handoff: product UI and recognition engine (2026-11-26)

- **Branch:** `v3/product-ui`, from `v3/master` at 32ad869. Not committed and not pushed: the owner reviews it,
  then commits and merges by pull request as usual.
- **Why:** the owner asked for an audit, then a mobile-first rebuild with separate Words and Sentences screens,
  a hearing→Deaf reply screen, a demo that works without a camera, and a product that does not look like a
  one-off exhibit.
- **Unchanged:** the model, the manifest, features, and the frozen baseline.

## Audit findings (short)
- **The recogniser was already a motion model.** It reads 32 frames, with wrist-relative, hand-size-scaled
  features, calibration and a "Not a sign" class. It was **not** replaced: no data or network was available
  here, and the v3 report shows a GRU scored lower (94.0 % vs 98.6 %).
- **Rejection was too generous.** Choices appeared from 0.25; one threshold applied to every sign; there was
  no check on the gap between the top two; resting hands were still read.
- **Speed.** The loop ran on `requestAnimationFrame`, so it processed duplicate camera frames. The face
  tracker ran although the PSL model does not read it (28 of 129 ms per frame measured). The baseline's
  per-part skip option had been lost. The overlay read layout every frame.
- **UI.** One long page: the camera sat below a headline and a status card, there were four mode switches,
  technical words ("Tier B"), text-symbol icons, the non-PSL gesture demo on the main screen, a checkbox
  dialog before the camera, and no fallback when the camera failed.
- **Speech.** It failed silently with no Urdu voice, and spoken text had no captions.

Measured numbers: `reports/perf_audit_2026-11-26.md`.

## File by file
### New
| File | What and why |
|---|---|
| `web/src/recognition/engine.js` | The live pipeline, without React. It runs once per camera frame, with no face tracker and pose on every second frame. **Light modes:** level 1 is hands only; level 2 skips every other frame, with the sign cutter's frame counts halved. **GPU→CPU switch:** when the GPU tracker is slow, the tracker moves to CPU, and the old tasks are left open because closing them aborted the WASM runtime. **Sharing:** MediaPipe and the model are made once per page (`warmUp`), so the camera restarts fast. One bad frame is tolerated. Statistics feed the developer panel. |
| `web/src/recognition/decision.js` | Accept / check / reject rules, each with its source: 0.60 and 0.25 from the manifest, a new 0.15 lead rule, and 0.75 for *help* and *where* (their own test: 83 % and 80 %). Also practice feedback and the plain-language hints. |
| `web/src/recognition/sentence_tray.js` | Pending word → 1.2 s pause → tray. A repeat within 1.5 s counts once. Remove, swap, undo, clear. |
| `web/src/recognition/overlay.js` | Hand skeleton drawing without layout reads. |
| `web/src/App.jsx` | **Rewritten.** The shell: four tabs, hash routes, language, settings, consent, speech and captions, personal adaptation, offline save, install prompt, presentation mode, keyboard. |
| `web/src/ui/*` | `CameraStage`, `ResultCard`, `WordsScreen` (gallery, sign sheet, practice), `SentencesScreen`, `ReplyScreen`, `MoreScreen` (About, Settings, Phrasebook, Teach a sign for the local server), `TourScreen`, `Onboarding`, `DevHud`, `RecordedSign`, `QrCode`/`qr.js` (offline QR encoder, checked with OpenCV), `i18n.js` (English and draft Urdu), `signs.js` (Roman Urdu labels and gallery groups), `speech.js` (voice choice and Roman Urdu fallback), `recordings.js`, `Icon.jsx`, `site.js`. |
| `web/src/styles.css` | **Rewritten.** Mobile-first, an indigo→pink accent, glass only over the camera and sheets, logical properties for RTL, dark mode by system setting, reduced motion. The classes of pages kept from v3 are styled under `.legacy`. |
| `web/public/manifest.webmanifest`, `icon.svg`, `icon-maskable.svg` | Installable as an app. |
| `web/tests/recognition.test.mjs`, `web/tests/product-ui.test.mjs`, `tests/test_qr_code.py` | Tests for the new rules and data. |
| `reports/perf_audit_2026-11-26.md` | Measured before and after. |

### Changed
| File | Change |
|---|---|
| `web/src/capture_v2.js` | Restores the per-part `run` option from the 19 Nov baseline build (reuse the last pose or face) and adds `"off"`, `forget()` and `fresh`. Old callers behave the same. |
| `web/scripts/copy-assets.mjs` | Copies `tests/golden/psl_parity_cases.json` to `public/demo_signs.json` for the tour. These are real SignSpeak landmarks, and the ledger allows redistributing them. |
| `web/index.html` | Manifest, icons and the theme colour; a first-paint shell matching the app. |
| `web/tests/two-hands-web.test.mjs` | **Behaviour change on purpose:** the PSL camera code moved to `engine.js` and no longer runs the face tracker. The test now checks hands and pose, and that the manifest reads hands only. |
| `web/tests/camera-smoke.mjs`, `web/tests/asl-selftest-run.mjs` | New selectors (Turn on camera, welcome card, `#/asl`, `#/words`). The gesture-demo check became "the gesture demo is gone". Vite is imported only when needed; `CHROME_PATH` is supported. |
| `data/LICENSES.yaml`, `tools/psl_data/discover.py` | `psl-bakhtyar12-landmarks`, status *unverified*: code refuses it until consent and provenance are confirmed. |
| `README.md` | Product README with model details, supported signs, the 30-second demo and the roadmap. The old README is now `docs/DEVELOPER_GUIDE_v3.md`. |
| `DEMO_SCRIPT.md`, `EXHIBITION_CHECKLIST.md` | New script; the checklist is now a general live-demo checklist. |
| `.gitignore` | Adds `web/public/demo_signs.json` (generated). |

### Removed
| File | Why |
|---|---|
| `web/src/Conversation.jsx`, `web/src/PslSuggestion.jsx` | Replaced by the Sentences, Reply and ResultCard components. `sentence.js` and `reply.js`, which they used, are kept and still tested. |
| Gesture demo in the website UI | Its hand shapes are not PSL (session 2026-11-25 found the old demo script taught them). `vision.js` and its parity tests stay. |

## Checks run (2026-11-26, Claude's workspace)
- `node --test tests/*.test.mjs` (web): **76 / 76 pass.**
- `python -m unittest discover -s tests`: **218 run, OK** (6 skipped, as before).
- `python tools/check_licenses.py`: **passed** (25 assets).
- Camera smoke test (fake camera, 4 scenarios: start, Words→Sentences, flip, stop/start): **4 / 4 pass**.
- ASL mode starts its camera in the new shell, with no page errors.
- Guided tour: three recorded signs recognised by the real model, the sentence built and spoken.
- Live pipeline on real PSL signer video: results, the "Which one?" sheet and rejections work; the full
  Sentences → Speak → Reply flow works. Numbers are in the report.
- Layout: 18 screens at 375 × 667 and 1366 × 800. No page-level horizontal scroll, no text under 14 px.

**How the website was built here.** Vite and the npm packages cannot be installed in this workspace, so it was
bundled with esbuild. MediaPipe and LiteRT were taken from the frozen baseline build (same versions, same
APIs). **`npm run build` with Vite has not been run on this branch; CI's preview workflow will run it.**

## Not done or open
- **Not measured on a real phone.** Measure on the owner's phone and laptop (docs/HOW_TO_MEASURE_SPEED.md)
  and log it in `reports/`.
- **Load time:** the 2 s target is met on a 4G-like link and missed on Fast 3G (LCP 2.6 s). Next: preload the
  manifest and specs, and split the gallery out of the first bundle.
- **Urdu text** in `i18n.js` and Roman Urdu in `signs.js` are drafts and need an Urdu editor. The words for
  "Deaf" need Deaf partners' input.
- **No new model.** The next real accuracy gains are recordings of resting hands and fidgeting (hard
  negatives), more signers, and signer IDs. The roadmap (README) and the upgrade plan say how.
- **Fonts:** Manrope and Noto Nastaliq are named in the CSS but not bundled (there was no network here).
  System fonts are used until woff2 subsets are added and given ledger entries.
- **The design brief conflicts with the upgrade plan.** The brief asked for gradients, glass and ≥ 16 px
  radii; the 25 Nov upgrade plan's "Takhti" anti-AI-tell list advised against them. This build follows the
  newer brief with restraint: the gradient only on primary actions and the signing ring, glass only over the
  camera. The owner should choose one direction before Phase 1.
