# SignMate

**Talk face to face in Pakistan Sign Language.** SignMate turns PSL signs into Urdu and English on the phone
or laptop you already have. It always checks with you before it speaks. The hearing person replies in large
type and sees real PSL videos for the words SignMate knows. Free, no account, works offline, and the camera
video never leaves the device.

**Project page:** <https://signmate-pk.github.io/> (what it is, live demo, all 69 signs, results and limits) ·
**Open the app:** <https://signmate-pk.github.io/app.html> · **No camera handy?**
<https://signmate-pk.github.io/app.html#/tour> (one-minute guided tour; old `/#/…` links forward to the app)

> A helper, not an interpreter. For medical, legal or emergency decisions, use a qualified interpreter when
> you can.

## Who it is for
- **Clinics, pharmacies, offices:** a Deaf visitor signs *help*, *doctor*, *where*; staff reply in writing and
  the reply shows in large type.
- **Schools:** hearing classmates and teachers learn signs from the gallery and practise with live feedback.
- **Shops and banks:** short exchanges that today need pen and paper.
- **Families:** hearing relatives who are learning PSL check their signing.

## What it does
| Screen | What happens |
|---|---|
| **Words** | The camera fills the screen. Sign one word and lower your hands; the word appears large with a confidence ring. Tap **Yes, speak it**. Below the camera, a gallery of every sign the camera knows: tap one to see a reference (a real PSL video, a recorded hand movement, or a link to the PSL dictionary) and **Practise this sign** with live feedback. |
| **Sentences** | Sign several words. Each sure sign waits 1.2 s (you can change this) and joins the tray. Tap a word to remove it or swap it for the camera's next guess. Then **Speak**: one confirmation for the whole sentence. **Undo** and **Clear** sit next to it. Quick and emergency phrases are one tap away. |
| **Reply** | The hearing person types or uses voice typing. The reply shows in very large type, can fill the screen and turn 180° for someone across the table, and words with a licensed PSL video play in order. The last sentence the signer spoke is shown on top. |
| **More** | PSL dictionary (788 signs with signer videos), ASL mode (a separate language and model), How well it works (every number measured), Ask SignMate (offline helper), Phrasebook, Settings, Save for offline, Install as an app, About, Credits. |
| **Guided tour** (`#/tour`, also `#/demo`) | Replays real recorded PSL signs through the real model on the device, builds a sentence and speaks it. It needs no camera and no good light; if the model cannot run, it shows the model's saved answers and says so. |

**Always visible:** a language switch with three options (**English**, **اردو** and **Roman Urdu**). It sets
what is shown and spoken; with اردو the interface turns to Urdu and mirrors right to left.

**When SignMate is not sure**, it says so instead of guessing:
- **Sure:** the word is shown large; you confirm it.
- **Not sure:** "Which one did you sign?" with the top three as full-size choices, plus "None of these".
- **Didn't catch:** a gentle hint such as "Not sure — adjust your hand position". No word is shown and nothing
  is spoken.

## Supported signs (PSL camera, 69)
**Everyday talk:** Assalam-o-alaikum, hello, goodbye, good morning, have a good day, thank you, excuse me,
well done, help, water, doctor, hungry, need, want, come, give, bring, where, who, you, we, mine, all, both,
also, absolutely, I have a complaint, don't touch.

**Things and places:** air crash, airplane, arrival, ATM, bald, beach, beard, bed, bench, bicycle, bridge,
light bulb, cartoon, coloured pencils, cupboard, door, face lotion, fan, garden, generator, life jacket,
mobile phone, nail cutter, police car, razor, shampoo, shower, sunglasses, tissue paper, toothbrush,
toothpaste, umbrella.

**Animals:** bear, beak, chimpanzee, cow, crow, deer, dog, elephant, peacock.

Every sign is learned from a public dataset and has not yet been checked by Deaf validators, so every answer
is a suggestion you confirm. The full list with per-sign test results is in `models/psl/manifest.json` and
on the How well it works page.

## How it works (model details)
1. **Track.** MediaPipe Hand Landmarker finds 21 points on each hand, and Pose Landmarker (lite) the
   shoulders and wrists, on the device. Pose decides which hand is left and which is right. The face is not
   tracked on the PSL screens because the PSL model does not use it.
2. **Cut.** A sign starts when a hand appears. It ends 8 frames after the hands drop, with 2 frames kept on
   each side. Signs shorter than 6 hand frames are dropped. A segment that reaches 192 frames means resting
   hands, so it is rejected rather than read.
3. **Read.** `psl_v3.tflite`: an int8 model (1.85 MB, 1.65 M parameters) that reads the whole movement:
   - **Input:** 32 frames × 2 hands. Inside the model, each hand is measured from its wrist and scaled by
     hand size, with wrist motion and hand-to-hand distances added.
   - **Output:** 69 signs plus "Not a sign". Probabilities are calibrated with temperature 0.55
     (calibration error 0.004).
   - **Runtime:** LiteRT.js (WebAssembly + XNNPACK) in a Web Worker.
4. **Decide** (`web/src/recognition/decision.js`; every threshold names its source):
   - **Accept:** top-1 ≥ 0.60 **and** at least 0.15 ahead of the runner-up. *Help* and *where* need 0.75,
     because they were the weakest on their own test (83 % and 80 %).
   - **Check:** top-1 ≥ 0.25. The top three are offered as choices.
   - **Reject:** anything lower, "Not a sign" ranked first, or resting hands.
5. **Speak.** The browser's own voices. Urdu uses an Urdu voice when the device has one. Otherwise SignMate
   says so and reads the Roman Urdu instead. Every spoken line is also shown as a caption.

**Measured** (reports/psl_v3.md, reports/perf_audit_2026-11-26.md):
- **Phone recordings it never saw:** 98.6 % top-1 (2,151 samples). This is a weaker test, because the dataset
  has no signer IDs, so the same people may appear.
- **One completely new signer:** 35.7 % top-1 and 71.4 % top-5 (14 clips). That gap is why SignMate always asks.
- **Speed:** the model takes 7–24 ms per sign in the browser.
- **Fallback:** if the hand tracker is slower on the GPU than the CPU, it switches automatically.

**Speed safeguards on slow phones:**
- **One pass per camera frame** (`requestVideoFrameCallback`).
- **Light mode:** hands only.
- **Skipping frames:** every other frame, with the sign cutter's timing kept the same.
- **Developer panel**, hidden by default: Settings → Developer panel, `?debug=1`, or the **D** key. It shows
  FPS, tracking and model time, sign-to-result time, speech start time, and the backends (WebGL or WASM).

**Swapping in a new model:** the recogniser takes a versioned bundle (`models/psl/manifest.json` + weights).
A new bundle with the same input layout can replace it, including a static-handshape or larger motion model
trained by `notebooks/train_psl_v3.ipynb`. The app refuses bundles whose feature version it does not support.
It replaces the current model only after a measured side-by-side improvement (CLAUDE.md 9.1).

## Privacy
- **The camera picture never leaves the device.** SignMate uses hand points, not video, keeps them only in
  memory, and saves nothing unless you choose to.
- **MediaPipe statistics:** while online, Google's MediaPipe library may send anonymous speed and usage counts,
  never images. The first-visit card says this before the camera turns on.
- **Voice typing** (Reply screen) uses the browser's speech service, which may send audio online. Typing does not.
- **"Learn my signing"** keeps a small adjustment in this browser only. Settings → Forget removes it.

## Run it yourself
**Use the website.** Open <https://signmate-pk.github.io/app.html>, then More → **Save for offline use**. After that
it works with no internet.

**Develop the website** (Node.js 22.12 or newer):
```bash
cd web
npm install
npm run dev          # http://localhost:5173 = project page, /app.html = the app (copies models and runtimes first: npm run assets)
npm test             # 76 unit tests, no browser needed
npm run build        # production build in web/dist (GitHub Pages deploys this from main)
npm run build:shared # offline copy for a USB stick: web/dist-shared/SignMate-shared-copy.zip
```

**Everything else** (desktop app, local server for personal signs, data collection, training, the full test
suite):
- **Windows:** double-click `setup_windows.bat`, then `start_signbridge.bat`.
- **Any system:** `python tools/run_all_tests.py` (add `--smoke` for the fake-camera browser test).
- **Details:** [docs/DEVELOPER_GUIDE_v3.md](docs/DEVELOPER_GUIDE_v3.md) and
  [docs/SETUP_NEW_LAPTOP.md](docs/SETUP_NEW_LAPTOP.md).

**Training data hooks:**
- The shipped model is trained on SignSpeak by `.github/workflows/psl-train.yml`. SignSpeak is the Kaggle
  word-level dynamic PSL dataset and is also on Hugging Face (Apache-2.0).
- The Hugging Face dataset `Bakhtyar12/Pakistani-Sign-Language` (landmarks with pose, MIT per its card) is
  wired into `tools/psl_data/discover.py` and the licence ledger as *unverified*. Code refuses to train on it
  until its signers and consent are confirmed.
- Every dataset and model has an entry in `data/LICENSES.yaml`.

## Presenting SignMate: a 30-second demo
Set up: a phone or laptop on a stand, about an arm's length away, light on your face rather than behind you.
Open the site, More → Settings → **Presentation mode** (optional).

1. **(0–5 s) The promise.** "SignMate lets a Deaf person and a hearing person talk face to face, using the
   phone they already have. Nothing leaves this device."
2. **(5–15 s) One word.** On **Words**, sign **Assalam-o-alaikum** and lower your hands. The word appears
   large; tap **Yes, speak it**. "It always asks before it speaks."
3. **(15–25 s) A sentence.** On **Sentences**, sign **Help**, lower your hands, then sign **Doctor**. The words
   fly into the tray. Tap **Speak**: "Help. Doctor." Switch to **اردو** and speak again.
4. **(25–30 s) The reply.** On **Reply**, tap "The doctor is coming." The reply fills the screen, and the PSL
   video for *doctor* plays. "And when it isn't sure, it says so instead of guessing."

**If the camera or the light fails:** open More → **Guided tour** (or `#/tour`). It runs the same story on
real recorded signs, with the real model, and no camera. The camera error card also offers the tour and a QR
code for visitors' phones.

**Good signs to practise first** (strong on their own test, and useful in conversation): Assalam-o-alaikum,
hello, goodbye, thank you, water, doctor, you, we, well done. Practise each in the Words gallery until it
shows "That matches".

**Hard questions, honest answers:**
- **"How accurate is it?"** 98.6 % on new recordings from the same dataset, and about one in three first-time
  on a completely new signer. That is why it confirms with you, and why it needs Deaf partners and more
  signers.
- **"Is this PSL or ASL?"** PSL. ASL is a separate mode with its own model, and it is never mixed in.

## What comes next
These are aims, not claims. Each ships only when measured.
- **Next:** testing with Deaf PSL users through partner organisations (requests drafted in
  `docs/permission_requests.md`); per-sign confidence; recordings of resting hands so there are fewer false
  signs; an Urdu interface reviewed by an Urdu editor.
- **Then:** 500 signs chosen by need, recorded with consent and checked by Deaf validators; accuracy measured
  on signers the model never saw, in at least three cities.
- **Later:** continuous signing for one setting (clinic or shop); finger-spelling of names (UAlpha40
  converter is written, the model is not trained); an Android app on the same model files.

## Help wanted
- **Deaf PSL signers and organisations:** to validate signs, record new ones with consent, and test the app.
- **An Urdu editor:** the Urdu interface text (`web/src/ui/i18n.js`) and the Roman Urdu labels
  (`web/src/ui/signs.js`) are drafts.

## Credits
- **PSL recogniser:** trained on the Dynamic Word-Level Pakistan Sign Language Dataset by Mohib Ullah Khan
  Sherwani and the SignSpeak team, COMSATS University Islamabad, Abbottabad Campus (Apache-2.0,
  doi:10.57967/hf/8164).
- **PSL dictionary videos:** Sign Language Datasets by Mudassar Iqbal (CC BY 4.0).
- **Hand and pose tracking:** MediaPipe (Apache-2.0).
- **ASL mode:** Google ISLR 1st-place model (MIT).

The full list is in the app (More → Credits & licences) and in `data/LICENSES.yaml`.
