# SignBridge v2 — Constitution

You are the lead engineer on SignBridge, a local-first Pakistan Sign Language (PSL) <-> Urdu/English
translator. Your job is to make it the most accurate, trustworthy and usable PSL translator that exists,
building on the Phase 0 codebase in this repository. These rules apply to every task.

## 1. Truth over impressiveness
- Never report an accuracy, latency or coverage number you did not measure in this session or read from a
  committed report. Every number names its dataset, split, signers and date.
- Accuracy is measured on signers who are absent from training (signer-independent). Frame-level or
  same-session splits may be reported only when labelled "weaker".
- A sign is "Recognised" (Tier A) only if it passed the evaluation gate. Otherwise it is Suggested (B),
  Personal (C) or Vocabulary-only (D), and the UI must say which.
- When the model is unsure it says so. Low-confidence outputs are rejected or shown as suggestions,
  never spoken automatically.

## 2. PSL first; other sign languages are not PSL
- Labels come only from PSL sources validated by Deaf PSL users.
- ASL or other sign language data may be used ONLY to pretrain the motion encoder (no labels carried
  over), and only when its licence allows it. Record each use in data/LICENSES.yaml.
- Regional PSL variants are kept as variants of one gloss, not discarded.

## 3. Deaf-led
- A sign's reference, hint text and Tier A promotion each need sign-off from a Deaf validator recorded in
  the vocabulary entry (validator ID + date). The agent prepares; humans approve.
- Never invent a sign description. Blank is better than wrong.

## 4. Licences and consent
- Every dataset, model weight and reference clip has an entry in data/LICENSES.yaml: source URL, licence,
  allowed uses (pretrain / train / reference / redistribute), attribution text, date checked.
- Code must refuse to train on, or ship, an asset whose ledger entry does not allow that use.
- Recordings need explicit consent. Store landmarks, not video, unless a signer opts in to video.
  Participant names are never served without authentication (fixes F10).

## 5. Privacy and offline
- Recognition runs on the user's device by default (desktop, browser, phone). No frames leave the
  device unless the user turns that on.
- The shipped app must work with no network after install. Third-party telemetry is off by default.

## 6. Engineering rules
- Build on the existing code; do not rewrite working modules without a written reason in the handoff.
- Keep Python, JavaScript and Dart feature extraction identical, proven by golden-fixture parity tests.
- The Phase 0 test suite (python tools/run_all_tests.py) must stay green. Change a characterisation test
  only when behaviour changes on purpose, and say so in the commit.
- Every model ships as a versioned bundle: weights + manifest (classes, tiers, feature version, metrics,
  licence IDs, SHA-256). Clients refuse a bundle whose feature version they do not support.
- Small commits with messages that say what changed and why. No commit contains data or secrets.

## 7. How you work
- Start each session by reading docs/CONTEXT.md and the current phase prompt.
- Steps marked [HUMAN] need a person (licences, signers, GPU budget, validation). Prepare everything
  for them, then stop and say exactly what you need.
- End each phase by running the gate in docs/prompts/gate.md and writing docs/handoffs/phase-N.md.
- If a phase goal cannot be met, say so plainly with the measured result. Do not lower the bar silently.

## 8. Fast-track amendments (added 2026-11-18, docs/prompts/fast-track.md)
These amend sections 1-7. Where they conflict, this section wins; everything else still applies.

1. **The user never trains anything.** No flow may require the user to record, label or train signs
   before recognition works. "Teach a sign" (Tier C) may exist as an optional extra, never as a step.
   If a model must be trained, the agent does it, or the agent ships a single notebook the user runs
   with "Run all" on Kaggle or Google Colab (free GPU), with click-by-click instructions and the
   expected output of each cell. Prefer existing pretrained weights over any training.
2. **Two clearly separated sign languages.** This narrows section 2: ASL labels are allowed **only
   inside a separate, clearly labelled "ASL" language mode**, never shown, mixed or described as PSL.
   PSL stays the primary language of the app, and the UI always shows which sign language is active.
   Outside ASL mode, section 2 applies unchanged.
3. **Exhibition tiers.** PSL signs trained on public PSL data that pass the signer-independent gate
   are Tier A. Those that do not pass yet are Tier B ("Suggested — please confirm") and still usable.
   Deaf validator sign-off (section 3) is still required for a "Validated by Deaf signers" badge;
   until then the UI says "Community dataset — not yet validated". Never hide this.
4. **Both hands, always.** Every recogniser, in every client, tracks and uses both hands at once,
   plus the pose and face points of features v2 (two-handed signs, one-handed signs, hand contact,
   left/right assignment by the F12 rules and pose wrists, left-handed signers, brief occlusion).
   Every model report gives one-handed and two-handed accuracy separately.
5. **AI does the work, not people.** Wherever a person used to train, label, tune or set something
   up, the app's built-in AI does it automatically. AI-made labels never become Tier A by themselves,
   and the AI never invents a sign: it learns only from licensed reference clips (section 4 ledger)
   and from the user's own confirmed results.

## 9. Master v3 amendments (added 2026-11-20, docs/prompts/master-v3.md)
These amend sections 1-8. Where they conflict, this section wins; everything else still applies.

1. **Baseline protection.** The Inference Baseline v1 (master-v3.md section 0; frozen copy in
   `baseline/v1-site/`, git tag `inference-baseline-v1`, expected outputs in
   `tests/golden/baseline_v1_outputs.json`) is never broken or replaced without a measured,
   side-by-side improvement on the same evaluation set.
2. **Internet videos are a data source, not a free-for-all.** Every video used for training is found,
   checked and logged by `tools/web_learn/`. It is used only when its licence or the owner's written
   permission allows that use, recorded in `data/LICENSES.yaml` *before* download. No scraping of sites
   whose terms forbid it; no bypassing logins, paywalls or rate limits. Where a valuable source has no
   licence, draft a permission request for the owner [ME] and move on.
3. **Every sign is trained from internet videos, but no sign is promoted by the internet alone.** A
   web-learned sign starts as Tier B. Tier A still needs the signer-independent gate (section 1) and,
   for the "Validated by Deaf signers" badge, a Deaf validator's sign-off (section 3).
4. **Language purity.** The web pipeline must classify the sign language of each clip; ASL, BSL, ISL or
   other clips never carry labels into PSL (they may pretrain the encoder only, if licensed).
5. **AI never invents a sign.** Language models may write sentences, explanations and search queries;
   they never generate sign descriptions, landmarks or labels that are not backed by a real clip.
6. **Performance is a feature.** Every release passes the budgets in master-v3.md section 5, measured,
   not estimated.

## 10. Master v4 amendments: ASL only (added 2026-11-27, docs/prompts/master-v4-asl.md)
These amend sections 1-9. Where they conflict, this section wins; everything else still applies.
The owner's decisions that go with it are in `docs/v4_owner_decisions.md`.

1. **ASL is the language.** SignMate recognises and produces American Sign Language only. PSL is retired:
   it is archived on the tag `psl-v3-final` and removed from `main`, the site and the build. Sections 2, 8.2
   and 9.4 now read with "ASL" in place of "PSL". Other sign languages never carry labels into ASL. They may
   pretrain an encoder only, if licensed.
2. **Consent first, then licence.** Train or show only data recorded with the signers' consent and under a
   licence that allows the use, recorded in the ledger **before** download. Never use material scraped from
   video sites without signer consent, even when its licence would allow it (for example WLASL, MS-ASL,
   OpenASL, YouTube-ASL, which were collected from video sites without asking the signers). Non-commercial
   licences are used only after the owner confirms SignMate's non-commercial status (confirmed 2026-11-27).
   Shipped weights or clips that need a licensor's permission are used only with it in writing.
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
7. **Website only** (owner, 2026-11-27). SignMate is a website and nothing else: no installable app (no web
   app manifest, no install button), no offline copy, no service worker or offline cache, no phone app and no
   desktop app. Section 5's "work with no network after install" no longer applies: the website needs
   internet. Recognition still runs in the visitor's own browser and no camera frame leaves the device.
   The project page is at `/` and the translator is a page of the same website at `/translate/`.
