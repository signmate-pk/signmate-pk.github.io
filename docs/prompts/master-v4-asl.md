# SignMate — Master Prompt v4: ASL-only, two-way, real-time

Save this file as `docs/prompts/master-v4-asl.md`. Start a coding-agent session on the GitHub repository
**`signmate-pk/signmate-pk.github.io`** (give it push access) and paste:

> Read CLAUDE.md, docs/CONTEXT.md, reports/asl_mode_v1.md, reports/asl_eval_results_2026-11-20.json,
> reports/perf_audit_2026-11-26.md, docs/handoffs/project-page-2026-11-27.md and
> docs/prompts/master-v4-asl.md. First ask me the questions in section 10 that are still open. Then execute
> master-v4-asl.md stage by stage on the branch `v4/asl`. Stop at every gate and tell me in plain words
> exactly what I need to do. The live website changes only at Stage 8, after I reply "release".

---

## 0. Where the project stands (2026-11-27)

Read these facts before touching code. Every number comes from a committed file in the repository.

**Live site.** <https://signmate-pk.github.io/> is published from `main` (commit `c90d4df`, PR #9). `/` is a
static project page built at build time (`web/index.html` + `web/scripts/landing-content.mjs`). The app is
at `/app.html` (React 19 + Vite 8, `web/src/`). The app is a PSL product. ASL is a side screen
(`app.html#/asl`, `web/src/AslMode.jsx`).

**ASL today: the strongest asset in the repo.**

| Fact | Value | Source |
|---|---|---|
| Model | ISLR 1st place (Hoyeol Sohn), MIT; `models/asl/model.tflite`, 11,242,036 bytes, SHA-256 `f55a2bb1…f0bb7`; 250 signs (`models/asl/sign_to_prediction_index_map.json`) | `data/LICENSES.yaml` `asl-islr-1st-place-tflite` |
| Input | frames × 543 × 3 (face 468, left hand 21, pose 33, right hand 21; NaN = missing); hands in anatomical slots by pose wrists (confirmed in 99.85 % of 679,537 frames) | `reports/asl_mode_v1.md` |
| Accuracy, signer-independent (GISLR rerun set, 39,443 signs, CC0, Kaggle CPU, 2026-11-20) | top-1 **86.2 %** at native length; **85.3 %** at the browser's 32 frames; top-5 **95.4 %** | `reports/asl_eval_results_2026-11-20.json` |
| Left- vs right-dominant | 89.1 % vs 84.6 %: a 4.5-point gap (target ≤ 3) | same |
| Two-handed | 11 signs only in that set: cannot be judged | same |
| Confidence | at ≥ 0.70: 98.3 % right on the 71.1 % of signs it answers (1.7 % wrong); at ≥ 0.90: 99.6 % on 52.1 % | same |
| Model time per sign | median 10.9 ms (Kaggle CPU, TensorFlow); 9.8–16.3 ms in a Web Worker (LiteRT.js, GitHub Actions) | same; `reports/asl_mode_v1.md` |
| Tracking per frame, CPU (hands + pose + face) | 129 ms (hands 64.5, pose 36.4, face 28.4) on a 2-core VM with no GPU: a slow-device floor | `reports/perf_audit_2026-11-26.md` |
| End of sign → word on screen (PSL engine, same VM) | 638–846 ms | same |
| Lighthouse mobile, preview run 45940644364 (2026-11-27) | project page 99 / 100 / 100 / 100; **app 85** / 100 / 100 / 100, LCP 3.5 s | PR #9 checks |

**Why the pivot makes sense.** For ASL, consented and licensed data from Deaf signers exists at scale. PSL
has nothing comparable: its best honest number is 35.7 % first-time accuracy on one new signer
(`reports/psl_v3.md`). The ASL baseline already reaches 85.3 % on 39,443 signs from signers it never saw.
SignMate keeps its values (truth, consent, privacy, Deaf-led), not its language.

**What exists and should be reused.**
- `web/src/recognition/engine.js`, `decision.js` and `overlay.js` (product-UI engine). They give one pass per
  camera frame (`requestVideoFrameCallback`), automatic light mode, a GPU→CPU tracker switch, and
  accept/check/reject rules. Today they run PSL. Point them at the ASL model.
- `capture_v2.js`, `features_v2.js` and `asl_islr.js` (543-point frames, `SignSegmenter`).
- `asl_litert.js`, `asl_worker.js` and `asl_client.js` (LiteRT.js 2.6.0 in a worker; patches the model to 32
  frames). `wasm_locate.js` fixes the worker's WASM path.
- Golden fixtures and the Inference Baseline v1 (`baseline/v1-site/`, `tests/golden/baseline_v1_outputs.json`,
  tag `inference-baseline-v1`).
- `notebooks/asl_mode_eval.ipynb` (Kaggle evaluation), `tools/asl_eval_core.py` and `tools/web_learn/` (licence-first
  internet pipeline).
- The licence ledger and its checks (`data/LICENSES.yaml`, `tools/check_licenses.py`, `data_engine/ledger.py`).
- The project-page generator pattern: build-time HTML from committed data, a test that fails on drift, and
  visible `[TODO]` placeholders.
- `offline.js`, `public/sw.js` and the precache list in `vite.config.js`. `npm run build:shared` makes the
  Windows offline copy.

**What goes (Stage 0).** Everything PSL:
- `models/psl/` and `shared_data/psl_*`;
- `web/src/psl_client.js` and `psl_hands.js`;
- the PSL recordings used by the tour, the SLT clips and the PSL dictionary;
- `tools/psl_data/`, `tools/psl_train/` and `tools/psl_browser/`;
- `tools/psl_results.py`;
- PSL tests and workflows (`psl-train.yml`, `psl-data.yml`);
- PSL copy on both pages.

The Flutter app (`mobile/`) is PSL-only. Freeze it on the archive tag and remove it from `main`.

---

## 1. Goal

**SignMate: American Sign Language ↔ English, in real time, in the browser, on the person's own device.**

| Mode | What it does | Done means |
|---|---|---|
| **Sign → Text** | Live captions while the person signs: isolated signs and fingerspelling, assembled into readable English. The raw ASL glosses are shown underneath. Optional speech. | A word appears while the hands are still coming down. Fingerspelled names come out letter by letter. |
| **Type → Sign** | English text (typed or spoken) becomes a sequence of real ASL sign clips, with fingerspelling for unknown words. Labelled "word-by-word, English order". | Every shown sign comes from a licensed, consented recording. Nothing is generated. |
| **Learn** | The full sign library (from the model's labels file): each sign's video, linguistic info and live practice feedback. | Search in under 100 ms; every entry has a source and a licence. |

The app **keeps improving itself** from licensed internet data (section 4, the learning loop). It is
**simple, minimal and fast**, with measured targets and budgets (sections 6–8). It works offline after the first
visit.

"100× better" is not a number you can measure. Here it means all of these, each one measured:
- about **10× the vocabulary** (250 → 2,000+ signs) at equal or better signer-independent accuracy;
- **two new capabilities** (fingerspelling and Type → Sign);
- **≥ 4× faster** from end of sign to word;
- **the app at Lighthouse ≥ 95** on mobile.

---

## 2. Constitution section 10 (add to CLAUDE.md in the first commit)

Section 10 amends sections 1–9. Where they conflict, section 10 wins.

1. **ASL is the language.** SignMate recognises and produces American Sign Language only. PSL is retired:
   it is archived on the tag `psl-v3-final` and removed from `main`, the site and the build. Sections 2, 8.2
   and 9.4 now read with "ASL" in place of "PSL". Other sign languages never carry labels into ASL. They may
   pretrain an encoder only, if licensed.
2. **Consent first, then licence.** Train or show only data recorded with the signers' consent and under a
   licence that allows the use, recorded in the ledger **before** download. Never use material scraped from
   video sites without signer consent, even when its licence would allow it (for example WLASL, MS-ASL,
   OpenASL, YouTube-ASL, which were collected from video sites without asking the signers). Non-commercial
   licences are used only after the owner confirms SignMate's non-commercial status [ME]. Shipped weights
   or clips that need a licensor's permission are used only with it in writing.
3. **Nothing is generated.** Type → Sign shows only real recordings, or landmark animations taken directly
   from real recordings whose licence allows redistribution. No model invents a sign, a handshape, a
   description or a gloss. Unknown words are fingerspelled from real letter recordings, or shown as "no sign
   yet".
4. **Honest captions.** Each caption word carries its confidence. A word that is not sure is marked and never
   spoken automatically. Auto-speak is on only above a threshold where the measured wrong-word rate is
   ≤ 1 %. Glosses are shown under the English. Type → Sign says it follows English word order, not ASL grammar.
5. **Deaf-led.** The "Validated by Deaf signers" badge needs a recorded sign-off from a Deaf ASL user
   (validator ID + date). Until then each sign says "Dataset sign — not yet validated by our reviewers".
6. **Baseline protection** (9.1, unchanged). The ISLR 1st-place model is the baseline. A new model replaces it
   only with a measured, side-by-side improvement on the same frozen, signer-independent test sets, without
   breaking the latency budget.

---

## 3. Architecture

```
SIGN → TEXT (all on the device)
camera ─▶ worker A: MediaPipe tracking (Holistic Landmarker, or Hand×2 + Pose + Face; whichever is measured faster
          at equal accuracy), GPU delegate with automatic CPU fallback, frames passed as VideoFrame/ImageBitmap
       ─▶ 543×3 frame ring buffer (shared with worker B)
       ─▶ worker B: router (sign / fingerspelling / rest) ─┬─▶ isolated-sign model (streaming windows, early commit)
                                                          └─▶ fingerspelling model (CTC, letter by letter)
       ─▶ caption assembler: glosses + letters → English (rules + small on-device language model, never adds meaning)
       ─▶ UI: live caption strip, transcript, optional speech (Web Speech API)

TYPE → SIGN (all on the device)
text / speech ─▶ normaliser (lemma, numbers, contractions) ─▶ English→gloss map (labels + ASL-LEX + synonyms)
       ─▶ per token: licensed clip ▸ landmark animation from a redistributable recording ▸ fingerspelling ▸ "no sign yet"
       ─▶ player: one timeline, 0.5×/1× speed, repeat, word chips

LEARNING LOOP (section 4)
internet discovery ─▶ licence + consent gate ─▶ landmarks ─▶ signer-disjoint splits ─▶ train (Kaggle / Actions)
       ─▶ gate vs baseline ─▶ versioned bundle ─▶ the site's service worker updates the model
on device: personal adaptation (confirmations) and opt-in landmark export ("donate"); no video ever leaves the device
```

The main thread only draws. Tracking, recognition and the language model run in workers. Nothing on the
main thread takes over 50 ms during recognition.

---

## 4. The learning loop: "the website trains itself from internet data"

A browser cannot train a 2,000-sign model on internet video, and must not upload anyone's camera. So
"self-training" works in three layers, and each one is automatic:

**4.1 Discovery and intake (cloud, scheduled).** Extend `tools/web_learn/` to ASL.
- A scheduled GitHub Actions workflow searches dataset registries for new ASL data: Hugging Face, Kaggle,
  Zenodo, OSF, Mendeley Data and GitHub releases. Where the source allows, it also searches YouTube via the
  Data API with `videoLicense=creativeCommon`, and only takes a clip there when consent can be shown
  (section 2.2).
- For each candidate it writes a ledger entry: licence, consent evidence, allowed uses, attribution and date.
  It downloads only what the ledger allows.
- When a valuable source has no licence or no consent evidence, it drafts a permission request into
  `docs/permission_requests.md` [ME] and moves on.
- It extracts landmarks with the **same MediaPipe version the site runs**, filters quality (no hands, several
  signers, cuts), dedupes near-identical clips, and assigns **signer-disjoint** splits.
- It writes `reports/asl_web_learn_vN.md`: sources found, licensed and used, clips kept or rejected and why,
  and new signs covered.

**4.2 Training and promotion (cloud, scheduled weekly).**
- A workflow (or a one-click Kaggle notebook when a GPU is needed) retrains the models of Stage 2 on all
  allowed data.
- It evaluates them on the frozen test sets (§5.1) and writes a bundle: weights, manifest, metrics, licence
  IDs and SHA-256.
- **It promotes the bundle automatically only if every gate number is at least as good as the current
  model's and the latency budget holds.** Otherwise it opens an issue with the numbers.
- Promotion is a pull request that the owner merges [ME]. The site never changes without that merge.

**4.3 On the device.**
- *Personal adaptation:* the person's confirmations re-rank the model's guesses for them, stored only in
  their browser. Extend `web/src/personal.js`.
- *Add your own sign* (optional, Tier C): a few-shot prototype from 3–5 of the person's own examples,
  landmarks only. It never becomes shared training data.
- *Donate corrections* (opt-in): exports a landmark file (no video) with a plain consent note. The person
  sends it themselves. It enters training only after a reviewer checks it.
- *Updates:* the service worker checks the bundle manifest once a day when online. It downloads a new model
  in the background and switches on the next visit. A bundle with an unsupported feature version is
  refused.

**4.4 "Info" from the internet.** Only from licensed linguistic sources:
- **ASL-LEX 2.0** (CC BY-NC 4.0; 2,723 signs; phonological coding, frequency and iconicity ratings, reference
  clips) maps English words to signs, gives "how it is signed" facts written by linguists (handshape,
  location, movement), and orders the vocabulary roadmap by frequency;
- **WordNet** gives English synonyms for the type-to-sign map (check its licence and add a ledger entry).

No language model writes sign descriptions.

---

## 5. Stages

Every stage ends with:
- all tests green (`python tools/run_all_tests.py --smoke`, `cd web && npm test`);
- a report in `reports/`, `docs/CONTEXT.md` updated and a handoff in `docs/handoffs/`;
- small commits on `v4/asl` and a preview build on the pull request.

Then **stop** and list my [ME] steps. If your workspace cannot download or train, put the step in a GitHub
Actions workflow or a Kaggle notebook ("Run all"), with click-by-click steps and the expected output of
each cell. Never estimate a number that should be measured.

### Stage 0: Archive PSL, freeze ASL, clean the house
1. Tag `main` as `psl-v3-final`. Publish a GitHub Release with the PSL bundle, its reports and the offline zip,
   so nothing is lost.
2. Create `v4/asl` and add constitution section 10.
3. Remove PSL (the "what goes" list in §0). Keep `baseline/v1-site/` frozen: it is the ASL baseline, and
   its PSL demo files stay inside the frozen copy.
4. Mark ledger entries `retired` (not deleted). Update the licence check.
5. Re-point the product engine (`recognition/engine.js`) at the ASL model:
   - turn the face tracker back on, because the ASL model reads face points, but at a measured lower rate;
   - keep one pass per frame, light mode and the GPU→CPU switch;
   - keep `baseline_v1_outputs.json` matching.
6. Rebuild the guided tour on **GISLR rerun-set landmark recordings** (CC0, redistributable): the same
   "works with no camera" demo, now in ASL.
7. Extend the Kaggle evaluation notebook so it writes **per-sign results and the full confusion matrix**
   (today's JSON has totals only). Add `tools/asl_results.py`, which builds `shared_data/asl_results.json`
   with an add-up check, like `psl_results.py` did.
8. Reproduce the baseline with test-time mirroring (average of the sign and its mirror). It is expected to
   close the 4.5-point left/right gap. Report it; do not assume it.
- **Gate:**
  - no PSL left in the shipped site;
  - every test green;
  - baseline outputs unchanged;
  - the ASL camera works end to end on the preview build;
  - `reports/v4_stage0.md` with the mirrored-baseline numbers.

### Stage 1: Data (learning loop, part 1)
Ledger entries, consent evidence, intake workflows and signer-disjoint splits for every source in §9 the
owner approves. Build the frozen test sets (§5.1) first, then the training pool. Write a data card per source.
- **Gate:**
  - a test checks every training file against the ledger;
  - zero signer overlap between train and test (checked by signer ID, or by a documented proxy, labelled
    "weaker");
  - `reports/asl_data_v1.md` with real counts.

#### 5.1 Frozen test sets (never trained on; versioned; one-handed and two-handed reported separately)

| Set | Use |
|---|---|
| GISLR rerun set (39,443 signs, 250 classes, CC0) | baseline comparison; regression gate |
| PopSign v1.0 test signers (paper split: 8 signers) | second 250-sign check, phone camera |
| ASL Citizen test split (signers unseen in training) | the large-vocabulary score, if the licence allows it for this project [ME] |
| FSboard / fingerspelling held-out signers | fingerspelling character error rate |
| A SignMate live set: ≥ 5 consenting Deaf ASL signers on a laptop and a phone, landmarks only [ME] | the real-world number; weekly retrains never touch it |

### Stage 2: Models (learning loop, part 2)
Train in a notebook the owner runs with "Run all" (Kaggle free GPU), or in Actions where a CPU is enough. The
user never trains anything (8.1).
1. **Isolated signs v2.**
   - Start from the 1st-place recipe: 1D convolution + transformer over landmarks, the same 543-point input.
   - Vocabulary: first the 250 baseline signs (must beat 85.3 % browser top-1 on the rerun set), then
     **1,000 → 2,000+** signs ordered by ASL-LEX frequency.
   - Training tricks: heavy augmentation, mirroring, landmark dropout, label smoothing, EMA, class balance, an
     explicit "not a sign / rest" class, temperature calibration.
   - Distil a **student small enough for phones** (target ≤ 4 MB int8, ≤ 1 point loss).
2. **Fingerspelling.**
   - A CTC model trained on FSboard (CC BY 4.0) and, if its licence is confirmed, the Kaggle ASL Fingerspelling
     competition data.
   - Start from the 1st-place code (Apache-2.0; no published weights, so we train it).
   - Report the character error rate on held-out signers.
3. **Router.** Sign / fingerspelling / rest, from hand motion and shape over a 0.5 s window. This decides
   which model reads the window.
4. **Streaming.**
   - Score overlapping windows (for example 32 frames, stride 4) while the hands are still up.
   - Commit a word as soon as the top answer is stable for k windows and above the accept threshold; do not
     wait for 8 empty frames.
   - Measure the gain in latency and the cost in accuracy, and choose k from the measurement.
5. **Export:** int8 and fp16 TFLite for LiteRT.js. Versioned bundle: weights, manifest (classes, feature
   version, metrics, licence IDs, SHA-256).
- **Gate:**
  - side-by-side table vs the baseline on every frozen set: top-1, top-5, one- and two-handed, left- and
    right-dominant, calibration error, ms per sign in the browser worker;
  - the baseline stays the default unless the new model wins on all of them.

### Stage 3: New UI shell + Sign → Text
- The minimal UI of section 8 replaces the current app shell: three tabs, one primary action per screen.
- Sign → Text:
  - camera full-bleed;
  - a large live caption strip;
  - unsure words underlined; tap one for the top-3 alternatives;
  - a transcript drawer with copy and share (local only);
  - a speak toggle, with auto-speak only above the measured ≤ 1 %-wrong threshold.
- Tracking moves into a worker. Frames go in as `VideoFrame` or `ImageBitmap`, and no canvas reads happen on
  the main thread.
- Try the MediaPipe **Holistic Landmarker**, which the web Tasks API now offers, against three separate tasks
  plus face throttling. Keep the faster option at equal accuracy.
- Try the WebGPU delegate for LiteRT.js and MediaPipe, detect it at start, and fall back automatically.
- **Gate:**
  - end of sign → word ≤ 150 ms on the named laptop and ≤ 300 ms on the named phone [ME measures], or the
    measured number plus the plan to get there;
  - no main-thread task over 50 ms during recognition.

### Stage 4: Type → Sign
- Normaliser and English→gloss map:
  - model labels + ASL-LEX English translations + WordNet synonyms;
  - multi-word signs (for example "thank you") matched first;
  - numbers and dates fingerspelled or signed by rule.
- Player order per word: licensed **video clip** (PopSign v1.0, CC BY 4.0; ASL Citizen only with written
  permission) ▸ **landmark animation** of a redistributable recording (for example the GISLR rerun set, CC0),
  drawn as a clean 2D skeleton ▸ **fingerspelling** from real letter recordings (FSboard, CC BY 4.0) ▸ "no sign
  yet".
- One timeline; 0.5× and 1× speed; repeat; tap a word to replay it.
- Captions on every clip: English (and Urdu if kept, §10).
- Speech input through the browser, labelled "may send audio to your browser's speech service".
- **Gate:**
  - every shown sign traces back to a ledger entry (test);
  - coverage report: share of the 1,000 most frequent English words with a real sign, with fingerspelling, or
    with nothing.

### Stage 5: Learning loop, part 3 (automation and on-device)
- The weekly discovery and retrain workflows (§4.1–4.2), with automatic promotion pull requests.
- Personal adaptation, "Add your own sign", "Donate corrections" and model auto-update in the service worker
  (§4.3).
- **Gate:**
  - one full automatic cycle on the preview branch, from discovery to a promotion PR with numbers;
  - `reports/autopilot_v2.md` with accuracy before and after 20 confirmations, on the live set.

### Stage 6: Speed, size and reliability
Meet section 7:
- code-split each tab; preload only the first screen;
- int8 models; compile-cache warm-up after consent;
- service-worker caching versioned by SHA-256; data-saver respected.
- Error states: camera denied, no WebGPU, weak phone (automatic light mode), offline, low light (the camera
  check).
- Playwright tests for each state (fake camera), an offline test, and Lighthouse on every PR for both pages.
- **Gate:** every budget in §7 met on the named laptop and phone, or reported with the measured number and
  the next step.

### Stage 7: Project page, exhibition kit, final report
- Rebuild `web/index.html` for ASL with the same generator pattern:
  - library from the labels file;
  - results and the confusion matrix from `shared_data/asl_results.json`;
  - the speed table from the reports;
  - Type → Sign and Sign → Text demos;
  - the validation plan with ASL Deaf reviewers;
  - team (placeholders until filled).
- Update the exhibition kit, demo script and 60-second shot list for ASL.
- `reports/final_v4.md`: baseline vs new on every frozen set; vocabulary; fingerspelling CER; latency;
  Lighthouse. Every number has its dataset, split, device and date.
- **Gate:** I read `reports/final_v4.md` and reply "release".

### Stage 8: Release
- Bring the `v4/asl` pull request up to date with `main` and put every stage's numbers in its description.
- Checks green; **I merge [ME]**.
- Then check the **live** site: every mode on a laptop and a phone, offline after the first visit,
  `/ci/status.json`, and Lighthouse on both pages.
- Tag `v4.0.0` with the offline zip.
- Write `reports/release_v4.md`. If anything is broken and cannot be fixed quickly, revert the merge and tell
  me.

---

## 6. Accuracy targets (aims, not claims)

| Metric | Baseline today | Target |
|---|---|---|
| Top-1, 250 signs, GISLR rerun set (browser path) | 85.3 % | ≥ 88 %, never below 85.3 % |
| Top-5, same | 95.4 % (native length) | ≥ 97 % |
| Left- vs right-dominant gap | 4.5 points | ≤ 2 points |
| Vocabulary at ≥ 80 % top-1 on unseen signers | 250 signs | 2,000+ signs |
| Wrong word spoken aloud | 1.7 % at 0.70 | ≤ 1 % (threshold set from the measurement) |
| Fingerspelling character error rate, unseen signers | none | measured, then ≤ 20 % |
| Calibration error (ECE) | not reported for ASL | ≤ 0.03 |
| False words per minute of resting hands | not measured | < 1 |
| SignMate live set (Deaf signers, laptop and phone) | not measured | reported for every release |

If a target is missed, report the number and the next step. Do not lower the bar silently.

## 7. Performance budgets

| Metric | Laptop (Chrome) | Mid-range Android (Chrome) |
|---|---|---|
| Project page LCP | ≤ 1.0 s | ≤ 2.0 s (slow 4G) |
| App LCP / interactive | ≤ 1.5 s | ≤ 2.5 s (today 3.5 s, preview run 45940644364) |
| Repeat visit → camera ready | ≤ 1.0 s | ≤ 2.0 s |
| Tracking | ≥ 30 fps | ≥ 24 fps |
| First caption word while signing | ≤ 400 ms after the sign starts | ≤ 600 ms |
| End of sign → word committed | ≤ 150 ms | ≤ 300 ms (today 638–846 ms on a slow VM) |
| Main-thread long tasks during recognition | none > 50 ms | none > 50 ms |
| First-run download before the camera starts | ≤ 15 MB | ≤ 15 MB (int8 models, lazy face) |
| Lighthouse (performance / accessibility / best practices / SEO), both pages | ≥ 95 / 100 / 100 / 100 | ≥ 95 / 100 / 100 / 100 |
| Works offline after the first visit | yes | yes |

## 8. UI: simple, minimal, modern

**Principles.**
- One thing per screen, one primary button.
- Content first: the camera and the words.
- No gradients, glass, emoji or decoration.
- Colour only where it means something.
- Every state has words, not only colour.
- Motion ≤ 200 ms, and none with reduced motion.

**Tokens** (one file, light and dark; start from the project page's identity):

| Token | Dark | Light |
|---|---|---|
| Background / surface | `#0d0b1c` / `#16132b` | `#fafaf9` / `#ffffff` |
| Text / secondary | `#f4f1ff` / `#b9b6d3` | `#111018` / `#55536a` |
| Accent (one only) | `#3ddc97`, dark text on it | `#0b7a50`, white text on it (check ≥ 4.5 : 1) |
| Unsure word | dotted underline + "?" chip | same |

- Type: the system UI stack (or self-hosted Inter, ≤ 30 KB subset). Scale 14 / 16 / 20 / 28 / 40 / 56.
  Captions 28–40 px.
- Spacing on a 4-px grid; radius 12 / 20; 1-px borders, no shadows.
- Icons: one set, 1.75-px stroke.

**Screens.**
1. **Sign** (home):
   - full-bleed camera, small status dot (tracking / reading / paused);
   - caption strip at the bottom (2 lines, large);
   - transcript drawer above the tab bar;
   - one button: start or stop.
2. **Type:**
   - one text field with a mic button;
   - the sign player above it;
   - word chips under the player (real sign / fingerspelled / none).
3. **Learn:** search, the sign grid, and a detail sheet (video, ASL-LEX facts with source, practise with live
   feedback).
4. **Settings** (a sheet, not a page):
   - speak on/off, auto-speak threshold, large text, theme;
   - light mode for weak devices;
   - personal data (forget), offline save, credits.

**Accessibility.**
- WCAG 2.2 AA; Lighthouse accessibility 100 on both pages.
- Full keyboard use; visible focus; 44-px targets.
- `prefers-reduced-motion`; a high-contrast mode.
- Captions on every video; nothing conveyed by sound alone; large-text mode.
- Deaf-centred: camera framing guidance in words and shape, no audio-only cues.

## 9. Data and model sources (verify each licence again before use; ledger first)

| Source | What | Licence / terms | Planned use |
|---|---|---|---|
| GISLR competition data (Google, DPAN) | 250 signs, 21 Deaf signers, about 94,477 landmark sequences | CC BY 4.0 + competition rules (raw redistribution reportedly forbidden; re-read) | train / pretrain; not redistributed |
| GISLR rerun set | 39,443 landmark sequences | CC0 | frozen test; guided-tour recordings; landmark animations |
| PopSign ASL v1.0 (Georgia Tech, DPAN) | 250 signs, 47 Deaf adults, 200,686 videos | CC BY 4.0 | train; reference clips for Type → Sign |
| ASL Citizen (Microsoft) | 83,399 videos, 2,731 signs, 52 signers, collected with consent under IRB approval | non-commercial, non-revenue-generating research use only | large-vocabulary experiments and test; shipped weights or clips only with Microsoft's written permission [ME] |
| FSboard (Google, DPAN) | 3.2 M fingerspelled characters, 266 h, 147 paid, consenting Deaf signers | CC BY 4.0 | fingerspelling model; letter recordings for Type → Sign |
| Kaggle ASL Fingerspelling competition data | over 3 M characters, 100+ Deaf signers | not yet checked | extra fingerspelling data if the licence allows |
| ASL-LEX 2.0 | 2,723 signs: phonological coding, frequency, iconicity, reference clips | CC BY-NC 4.0 | English↔gloss map, "how it is signed" facts, vocabulary order |
| Sem-Lex Benchmark | 84k+ videos from consenting, paid Deaf signers | CC BY-NC-SA 4.0 | experiments; share-alike needs a decision before shipped weights |
| ISLR 1st-place model (Hoyeol Sohn) | 250-sign TFLite | MIT | the baseline |
| ASL Fingerspelling 1st-place code (Henkel) | training code, no weights | Apache-2.0 | starting point for the fingerspelling model |
| WLASL, MS-ASL, OpenASL, YouTube-ASL | scraped web video | consent not collected | **not used** (constitution 10.2) |

## 10. Decisions for the owner before Stage 0 [ME]

1. **Positioning.**
   - Recommended: "SignMate: ASL ↔ English, built in Pakistan". Keep the name and the address; the
     `signmate-pk` organisation stays.
   - Say plainly on the project page why ASL: data from consenting Deaf signers exists at scale, and the
     measured accuracy is far higher.
2. **Urdu.**
   - Keep Urdu as an optional *output* language (captions and speech) for signs with a reviewed translation?
     Recommended: yes, with an Urdu editor's review.
   - Or English only.
3. **Non-commercial status.** Confirm that SignMate is free and non-commercial, so the CC BY-NC sources
   (ASL-LEX, Sem-Lex) and ASL Citizen's research terms can be used. Approve the drafted permission email to
   Microsoft about shipping ASL Citizen-derived weights and clips.
4. **Deaf ASL reviewers.** Who can sign off signs and test the app (remote is fine)? Participants are paid; the
   consent form is drafted for you.
5. **Timing.** Keep the current PSL site live through the exhibition. The ASL release goes live only at
   Stage 8, so this rebuild never disturbs judging. Give the date after which the switch is OK.
6. **Devices** for the budgets: name the laptop and the Android phone that measurements must use.

## 11. Working with me
- I am a beginner on Windows. After each stage, tell me in plain words what changed, how to try it, and the
  preview link.
- Complete files, never fragments. Small commits that say what and why. No data, keys or model weights
  without LFS in git; use Actions secrets for API keys.
- Steps that need me (accounts, permissions, emails, "Run all", measuring on my devices, merging) are
  marked **[ME]**, fully prepared, and listed at the end of each stage.
- Never invent a number, a licence, a sign or a description. If something cannot be done, say so at once and
  give the best alternative.

**Sources checked on 2026-11-27:**
- ASL Citizen licence: <https://www.microsoft.com/en-us/research/project/asl-citizen/dataset-license/>
- ASL Citizen paper: <https://arxiv.org/abs/2304.05934>
- FSboard: <https://arxiv.org/abs/2407.15806>, dataset <https://www.kaggle.com/datasets/googleai/fsboard>
- ASL-LEX: <https://www.sign-lang.uni-hamburg.de/lr/compendium/lex/asllex.html>
- Sem-Lex: <https://www.sign-lang.uni-hamburg.de/lrec/data/semlexbenchmark.html>
- MediaPipe Holistic Landmarker for web: <https://ai.google.dev/edge/mediapipe/solutions/vision/holistic_landmarker>

Everything else comes from `data/LICENSES.yaml` (checked 2026-11-18) and the reports named in section 0.
