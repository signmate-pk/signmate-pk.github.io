# SignMate developer guide (v3: desktop app, local server, data and training)

> Moved from the top-level README on 2026-11-26 when the product README replaced it. Parts that describe the
> website UI (Translate screen, Gesture demo, Exhibition view) are out of date: see ../README.md. The desktop app,
> local server, data collection, training and test instructions below still apply.

It is a sign language translator which will help deaf people to communicate.

**Try it in a browser:** <https://signmate-pk.github.io/> (camera needed; nothing leaves your device).
SignMate was called SignBridge until 2026-11-21. This is its only website: the old address
(`shaafrajput06-tech.github.io/SignBridge/`) was switched off ([docs/DOMAIN.md](docs/DOMAIN.md)). How the website is built and what works there:
[docs/WEBSITE.md](docs/WEBSITE.md). Setting up on another computer: [docs/SETUP_NEW_LAPTOP.md](docs/SETUP_NEW_LAPTOP.md).

SignMate is a Pakistan Sign Language (PSL) ↔ Urdu/English translator that runs on your own device.
It is being built on a **fast track** ([docs/prompts/fast-track.md](docs/prompts/fast-track.md)): nobody has
to record, label or train signs for it to work.

**Where the project stands (Stage 2 of 7):**

| Part | State |
|---|---|
| Tracking | Both hands, shoulders and face at once (capture v2), left and right assigned by the F12 rules and the pose wrists. Same numbers in Python and JavaScript (parity tests). |
| PSL recognition (main language) | **Not installed yet.** Stage 3 trains it from public PSL data. Until it passes its test on signers it has never seen, the app does not guess PSL signs. |
| ASL mode (separate, clearly labelled) | Works today: 250 everyday ASL words with Google's ISLR 1st-place model (MIT), in the browser and on the local server. Accuracy not measured yet ([reports/asl_mode_v1.md](reports/asl_mode_v1.md)). |
| Vocabulary | 64 phrases in English, Urdu script and Roman Urdu, with speech. |
| Gesture demo | The Phase 0 hand-shape rules, **off unless you turn it on**, and never called PSL. |
| Personal signs (Tier C) | Optional extra in the desktop app: teach your own signs. Never a required step. |
| Licences | Every model and dataset is in [data/LICENSES.yaml](data/LICENSES.yaml); a checker blocks anything not allowed. |

The proposal's 90% figure is treated as a target. SignMate reports measured model results only when a real dataset supports a validation split, and it names the validation method.

## Start the exhibition

### Connected web, desktop API, and phone app

On Windows, double-click `start_signbridge.bat`. On its first run it creates a local Python environment, installs missing Python and web dependencies, starts the FastAPI service and responsive React website, opens the website, and prints local Wi-Fi addresses. Initial setup requires internet access. After setup, the demo and bundled hand model work offline.

Copy `.env.example` to `.env` before launch if you want to change the API port, website port, database URL, or trusted HTTPS certificate paths. Add firewall access for ports 8000 and 5173 if phones will connect over the exhibition Wi-Fi.

### Desktop camera demo

To run only the OpenCV desktop interface after installing requirements:

```bat
python main.py
```

It opens in **AI Demo Mode** by default. The included `models/hand_landmarker.task` is the official MediaPipe model, so a fresh project does not need to download it. If the file is removed, the app downloads it with a progress message and explains how to recover if the download fails.

```bat
python main.py --camera 1 --lang ur
python main.py --no-voice --roman-urdu
python main.py --demo
python main.py --trained
python main.py --threshold 0.72 --hold 8
```

`--camera` selects a camera index. `--threshold` applies to a calibrated trained model, while `--hold` controls consecutive stable frames. Without a usable model, the app stays in demo mode. Missing cameras, voices, fonts, and uncertain poses leave vocabulary and text display available.

## Modes and demo gestures

- **AI Demo Mode / Demo Recognition Mode:** MediaPipe provides AI hand tracking; fixed landmark geometry maps a small set of held poses. The app does not call this a trained SignMate model.
- **AI Trained Mode / Trained Model Mode:** scikit-learn predictions are used for classes with enough collected examples. A model can only be created by running the training step below.
- Vocabulary items without a demo gesture can still be searched, selected, displayed, and spoken. They are labeled “Vocabulary Mode — training data required for camera recognition.”

| Pose held steadily in view | Demo phrase |
|---|---|
| Spread, open palm | Hello |
| Flat hand with close fingers | Stop |
| Closed fist | No |
| Thumb up / thumb down | Yes / Bad |
| V sign | Please |
| Index finger upright | Wait |
| OK thumb-index circle | Good |
| Call-me thumb and little finger | Phone |
| Three fingers | Thank you |
| Four fingers with thumb folded | Water |
| Five fingers held close | Emergency |
| Index pointing horizontally | Help |
| Move the hand away | Clear the result after a short delay |

The open-palm, stop, four-finger, and five-finger labels use an exhibition convention based on finger extension and spread. Still geometry cannot distinguish hand signs that use the same pose, and this app does not interpret movement, facial expression, body posture, grammar, or two-handed signs.

## Vocabulary

The 64 English–Urdu entries live in `vocabulary.json`. Each entry includes a stable ID, English, Urdu, Roman Urdu, category, optional gesture hint, demo-availability flag, gesture ID, and audio text. Edit only this root file, then run `python tools/sync_vocabulary.py` to update the copies in `shared_data/` and `mobile/assets/`; the tests fail if the copies drift. The website copies the root file into its offline static assets when it starts.

## Install manually

Python 3.10 through 3.14 and Node.js 22.12 or newer with npm are needed for the connected system. The current MediaPipe Python package does not list Python 3.15 as supported. From this folder:

```bat
python -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
cd web
npm install
cd ..
```

PostgreSQL support is optional: add `-r requirements-postgres.txt` only if `SIGNBRIDGE_DATABASE_URL` points at PostgreSQL.

Cached-audio playback uses `pygame-ce`, which is imported as `pygame`. If you upgrade an older `.venv` that already has the original `pygame` package, run `python -m pip uninstall pygame` first; the two packages must not be installed together. The original `pygame` has no prebuilt package for Python 3.14, which is why it was replaced.

If an earlier setup attempt created `.venv` with Python 3.15, remove that project-local `.venv` folder before running the launcher again; it will rebuild the environment with Python 3.14 when the Python launcher is installed.

Then run `start_signbridge.bat`. To start individual pieces, use `start_backend.bat`, `start_web.bat`, `python main.py`, or the Flutter commands under `mobile/README.md`.

## Website and phone-browser camera

The React website is responsive for phone, tablet, laptop, and desktop screens. It detects hands locally in the browser using the bundled MediaPipe task model and local WASM files. English/Urdu switching, vocabulary search, category filters, phrase speech, local settings, exhibition view, training consent, and model reports use the same API vocabulary IDs.

Modern browsers allow camera access on `localhost` and on trusted HTTPS origins. Phone browsers block camera access on ordinary HTTP Wi-Fi addresses. For phone-browser camera use, configure a certificate trusted by that phone with `SIGNBRIDGE_TLS_CERT` and `SIGNBRIDGE_TLS_KEY` in `.env`; the Vite server then serves HTTPS. A certificate that the phone does not trust is insufficient. The Flutter app uses the native camera and local API instead.

Browser speech uses installed system voices. Urdu script uses the browser's right-to-left shaping; Roman Urdu is available as a fallback. Voice availability depends on the device.

## Flutter mobile app

See `mobile/README.md`. Install Flutter, run `mobile\prepare_mobile.bat` once, then run `flutter run` in the mobile folder. Enter the exhibition computer's local API address on the phone. The app bundles the vocabulary and stores preferences and offline training uploads locally.

Camera recognition remains off until the user confirms the privacy notice. During an active mobile recognition session, the app sends occasional individual JPEG frames over the local Wi-Fi to the configured SignMate server for MediaPipe processing. The server processes each frame in memory and never stores image files or video. This mobile route requires the local server; mobile vocabulary browsing and text remain available without it.

## Data collection

Run:

```bat
python collect_data.py
```

The collector asks for a vocabulary item through search, category filtering, and pagination. Press Enter at the participant prompt for anonymous data. It records 63 normalized landmarks plus vocabulary ID, participant, session ID, timestamp, frame number, image dimensions, and handedness. It does not save camera images or video.

Camera-window controls:

- `Space` — begin a countdown and recording session
- `P` — pause or resume
- `S` — save the current session and stop
- `D` — discard the current unsaved session
- `Z` — undo the most recently saved session
- `Q` — quit, with a save prompt for unsaved examples

The per-session frame target defaults to 100 and can be changed or disabled. There is no total limit on saved examples, participants, vocabulary items, or sessions. Examples are appended to `data/sign_data.csv`; an invalid header or malformed row is handled with an explanation instead of silently replacing data.

For example, `python collect_data.py --participant guest --target 0 --every 1 --camera 1` records without a session target until stopped.

## Merge and train

Merge any number of CSV files without deleting the originals:

```bat
python merge_data.py data\another_session.csv data\second_computer.csv
```

This writes a timestamped merged file under `data/`, removes exact duplicates, validates the schema, and prints examples by participant and vocabulary item. To replace the active dataset, add `--update-main`; the script asks before changing it.

Train after recording multiple vocabulary classes:

```bat
python train_model.py
```

The training command warns about vocabulary with no data and excludes classes below the default minimum of five examples from the trained model. It compares an SVM and Random Forest. Validation holds out participants when possible, otherwise whole sessions. A frame-level split is labeled weaker. If the data cannot support defensible validation, the report says that no accuracy was measured. Augmentation is applied only within training folds and final model fitting.

Outputs:

- `models/sign_classifier.joblib`
- `models/model_metadata.json`
- `reports/training_report.txt`
- `reports/confusion_matrix.csv`

Classes without sufficient examples remain demo-only or vocabulary-only. Train mode becomes available only when a model has been saved. Desktop users start it with `python main.py --trained` or press `M` while the app is running; the web and mobile clients can switch modes when the server reports a trained model.

## Backend and synchronization

The FastAPI service documents its REST routes at `http://localhost:8000/docs`. It serves vocabulary and categories, settings, consented landmark uploads, recognition history, reports, classifier status, prediction, and transient mobile-camera frame recognition. SQLite is the local default. Persistent models and route handlers are separated in `backend/storage.py`; set `SIGNBRIDGE_DATABASE_URL` to a SQLAlchemy URL such as `postgresql+psycopg://user:password@host/signbridge` and install `requirements-postgres.txt` to move to PostgreSQL later.

The website can use the bundled vocabulary and local MediaPipe assets when the backend is offline. The mobile app uses bundled vocabulary without a server; camera recognition and synchronization need the local server. SignMate does not send images to Google or use hosted translation, speech, storage, or recognition services. MediaPipe Tasks may send aggregate performance and usage metrics to Google while online; see [MediaPipe's privacy notice](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/vision/README.md#privacy-notice).

## Speech and Urdu fonts

English desktop speech uses `pyttsx3` and an installed operating-system voice. Urdu uses an installed Urdu voice when available, then tries cached speech from `audio_cache/`. Text and Roman Urdu remain available when neither speech path works.

Before the exhibition, while internet is available, run:

```bat
python speech.py
```

This pre-caches English and Urdu speech for all vocabulary items with gTTS and pygame-ce. It requires a working connection during setup; cached files play offline afterward. Browser and Flutter speech depend on local platform voices.

For desktop Urdu script, put a font with Urdu glyphs into `fonts/`, such as Noto Naskh Arabic, then install the shaping dependencies from `requirements.txt`. If shaping is unavailable, the desktop displays Roman Urdu. The website and Flutter app use native right-to-left text layout.

## Keyboard controls

- `E` English · `U` Urdu · `L` switch language
- `R` repeat the current phrase · `V` voice on/off
- `M` switch between demo and available trained model
- `B` open the vocabulary browser · `H` help
- `Q` quit
- In the desktop vocabulary browser, letters are search text: type to search, `Tab` cycles category, arrows browse, `Enter` selects and speaks, `Backspace` edits the search, and `Escape` closes it. Press `Q` to quit after closing the browser.

## Testing

Run the automated checks with:

```bat
run_tests.bat
```

`run_tests.bat` runs `tools/run_all_tests.py`, which works on any operating system (`python tools/run_all_tests.py`). It runs:

- the Python tests: vocabulary schema and copy sync, Urdu/Roman fallback, feature normalisation, demo rules, left/right mirror consistency, the v1 parity fixture, CSV round trip, training and merge smoke tests, API routes, model-loading fallback, cached speech, and missing-camera handling;
- the browser parity tests (`npm test` in `web/`), which check that the JavaScript features and demo rules match Python on the same fixture (`tests/golden/v1_hands.json`). They need Node.js and `npm install` in `web/`.

Add `--smoke` to also run the fake-camera browser test (`npm run test:smoke` in `web/`). It needs Playwright once: `npm install --no-save playwright` and `npx playwright install chromium` in `web/`. The summary lists anything that was skipped. The v2 Node tests need no npm packages; the v1 browser parity tests need `npm install` in `web/`. Flutter unit tests (`mobile/test/`) run when the Flutter SDK is installed.

`docs/BASELINE.md` records the versions and results of the last full verification.

## SignMate v2 work in progress

v2 is planned in phases; the rules and prompts are in `CLAUDE.md` and `docs/prompts/`, and the current state is in `docs/CONTEXT.md`. Phase 1 added holistic capture and the v2 data contract (details in `docs/PHASE1_CAPTURE.md`):

- `ml_engine/capture_v2.py` and `web/src/capture_v2.js`: both hands, upper-body pose and a face subset per frame, using MediaPipe's Pose, Hand and Face landmarkers. The pose and face models download once into `models/`: `python -c "from ml_engine.capture_v2 import ensure_capture_model as e; e('pose'); e('face')"`.
- `shared_data/feature_spec_v2.json`, `ml_engine/features_v2.py`, `web/src/features_v2.js`: 971 features per frame, identical in Python and JavaScript.
- `ml_engine/recording_v2.py`: one landmark-only `.npz` file per sign instance; `tools/convert_v1_to_v2.py` converts v1 CSV rows.
- `web/bench.html` (open `/bench.html` on the dev server): measures capture frames per second on your computer.
- `tools/check_mirroring_f12.py`: checks mirrored and unmirrored camera input on real clips.

The existing apps still use v1 features and the demo rules. No v2 model exists yet.

The fast track (`docs/prompts/fast-track.md`) now replaces the Phase 2-8 plan: pretrained models and
public datasets instead of recording signers. Stage 1 added:

- `data/LICENSES.yaml`: the licence ledger, one entry per dataset, model and clip collection, with what
  each licence allows. `python tools/check_licenses.py` checks it and every asset file in `models/`,
  `data/`, `fonts/`, `web/public/models/` and `mobile/assets/` (`--list` prints the table, `--release`
  adds the store-release rules). The test runner runs it too.
- `reports/fast_track_assets.md`: what each public PSL and ASL asset allows and how the 64 vocabulary
  entries map to them (`reports/fast_track_vocab_map.csv`).
- `docs/HOW_TO_RUN_PHASE1_CHECKS.md`: beginner steps for `phase1_checks.bat` on Windows.
- `docs/permission_requests.md`: draft emails asking dataset owners for permission.

## Privacy

Desktop and browser hand images are processed on the device and are not saved or sent to Google. The web and desktop clients disclose MediaPipe's aggregate performance and usage metrics and ask before camera recognition starts. The mobile app asks before starting a camera stream and sends transient individual frames to the configured local server; the server never writes them to disk. MediaPipe Tasks may send aggregate performance and usage metrics to Google while online; its input images are not sent. Training landmarks are uploaded or saved only after explicit consent. Participant names are optional. Recognition history contains only the selected vocabulary ID, language, source, and timestamp in the local database.

## Exhibition checklist

See [EXHIBITION_CHECKLIST.md](EXHIBITION_CHECKLIST.md) and run [DEMO_SCRIPT.md](DEMO_SCRIPT.md) before presenting. Also test the phone and exhibition computer on the same Wi-Fi, verify firewall rules, and prepare a trusted HTTPS certificate if phone-browser camera access is needed.

## Known limits and next steps

This prototype recognizes held poses, not complete sign languages. The demo mappings are a small rule-based exhibition set. It is not evidence that all 64 phrases can already be recognized from camera input. Performance depends on lighting, camera view, hand orientation, and how distinct the poses are. Urdu speech depends on the local voice installed or audio cached in advance.

Known issues found in the Phase 0 audit (details in `docs/BASELINE.md`):

- Phase 0 found that the Flutter app sent camera frames without rotating them for the sensor, so on a phone held upright demo answers changed (for example Wait read as Help). Phase 1 rotates frames before they are sent, but the fix has not yet been run on a real phone. Keep recording training samples on the desktop or website until it has been checked on Android and iOS.
- In trained mode, low-confidence predictions are rejected only on the desktop and only when the SVM was selected. The website, phone app and API show every guess.

Future work could add motion sequences, two-hand signs, broader user evaluation, signed model distribution, and language review by Deaf Urdu sign-language users.
