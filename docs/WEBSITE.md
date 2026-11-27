# SignMate website (GitHub Pages)

> **PSL version (master v3), kept for history.** SignMate is now ASL only and a website only (master v4, CLAUDE.md
> section 10). This guide is rewritten for ASL in master-v4 Stage 7; until then, do not follow its PSL, offline-copy
> or app steps.

**Address:** <https://signmate-pk.github.io/> (set in `shared_data/site.json`).

This is the only address. The old one (`https://shaafrajput06-tech.github.io/SignBridge/`) was switched
off on 2026-11-21 and shows GitHub's 404 page ([DOMAIN.md](DOMAIN.md)).

Open it on any phone, tablet or computer with a camera, in Chrome, Edge or Safari. It is served over
HTTPS, so browsers allow the camera. The website is built and published automatically by
`.github/workflows/website.yml` every time something is pushed to the `main` branch.

## Two pages (since 2026-11-27)

| Address | What it is | Source |
|---|---|---|
| <https://signmate-pk.github.io/> | **Project page**: what SignMate is, how it works, the live demo, all 69 signs, technology, results and limitations, validation plan, team. Every section is plain HTML in the shipped file, so it reads fully with JavaScript off (crawlers, AI reviewers, slow phones). | `web/index.html`, `web/src/landing/`, `web/scripts/landing-content.mjs` |
| <https://signmate-pk.github.io/app.html> | **The app** (unchanged): camera, confirm, speak; sentences; reply; guided tour (`app.html#/tour`). | `web/app.html`, `web/src/main.jsx` and the rest of `web/src/` |

Old links into the app (`/#/tour`, `/#/words`, `/?debug=1`) forward to `app.html` with the same route, so QR
codes and printed links keep working. The installed app (PWA) opens `app.html#/words`.

## One-time setting [ME]

GitHub only publishes the site after this is switched on once:

1. Open the repository's **Settings > Pages** (signed in to GitHub): after the move
   <https://github.com/signmate-pk/signmate-pk.github.io/settings/pages>.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**. There is no Save button; the
   choice is stored straight away.
3. Open the **Actions** tab, click **Website and checks**, then **Run workflow** > **Run workflow**.
   After about 5-10 minutes the run turns green and the address above works.

## What works on the website

| Feature | Website | Laptop with `start_signbridge.bat` |
|---|---|---|
| PSL screen: both hands, shoulders and face tracked; PSL recognition not installed yet (Stage 3) | yes | yes |
| Gesture demo (Phase 0 hand shapes, off by default, not PSL) | yes | yes |
| Vocabulary in English and Urdu, with speech | yes | yes |
| ASL mode (250 ASL words) | yes, in the browser (LiteRT.js, signs resampled to 32 frames) | yes, through the local server (each sign's real length) |
| Teach a sign (optional personal signs, Tier C), its report and CSV | no (needs the server) | yes |

The header says **"Website version"** when there is no server. Everything runs on the device:
camera frames never leave the browser, and the website has no server that could receive them.

## The first visit downloads the models

The landmark and ASL models are about 29 MB together (hand 7.8 MB, pose 5.8 MB, face 3.8 MB, ASL
11.2 MB), plus the browser runtimes. On a phone, open the site on Wi-Fi the first time. The browser
caches the files after that.

## Check results

Each build runs every test and a real-browser ASL check, and publishes the results with the site:

- <https://signmate-pk.github.io/ci/status.json>: pass or fail for each check, the
  commit and a link to the run;
- `ci/tests.txt`, `ci/licences-release.txt`, `ci/asl-selftest.json`: the full output.

A failing check does not stop the website from being published; it shows up here instead.

## If something goes wrong

| Problem | What to do |
|---|---|
| 404 at the address | Do the one-time setting above, then run the workflow again. |
| The Actions run is red | Open it, click the red step and send a screenshot of the error. |
| "Camera permission was declined" | Allow the camera for the site in the browser's settings, then reload. |
| ASL mode says the model file was not found | The build could not download it; run the workflow again. |

## Project page: how its content is built

Nothing on the project page is typed by hand where a committed file already holds the fact.

| Part of the page | Comes from | Written by |
|---|---|---|
| Sign library (69 cards, Urdu, Roman Urdu, hands, per-sign test result, reference links) | `models/psl/manifest.json` (the model's labels file), `web/src/ui/signs.js` (Roman Urdu, groups), `public/psl_clips.json` and `public/psl_dictionary.json` (licensed videos, written by `npm run assets`) | `web/scripts/landing-content.mjs` at build time (Vite plugin `landingContent`) |
| Results table, confusion matrix, every wrong answer, per-sign table, one-new-signer table, confidence levels | `shared_data/psl_results.json` | `python tools/psl_results.py`, which rebuilds the 70×70 confusion matrix from `reports/psl_v3_measurements.json` (run 44884632047) and refuses to write unless every row adds up and the overall top-1 matches the report |
| Model size, parameters, version, hand-tracker size | `models/psl/manifest.json`, `models/hand_landmarker.task` | same plugin |
| Speed rows | `reports/performance_v3.json` (generated rows) and `reports/perf_audit_2026-11-26.md` (rows typed into `index.html`, each naming its source) | plugin / by hand |
| Credits | `shared_data/site_pages.json` (from `data/LICENSES.yaml`) | plugin |
| Screenshots and the hero clip (`web/public/media/`) | the app's guided tour, replaying the SignSpeak recording of GOODBYE; the answer shown is the shipped model's saved answer for that recording (the page says so) | captured with Playwright on 2026-11-27 |

Markers in `web/index.html` look like `<!--@block:sign-library-->` and `<!--@fact:fair-top1-->`. The build
fails if a marker is unknown or left over. To look at the generated page without Vite:
`cd web && node scripts/landing-content.mjs --out /tmp/page.html`.

**After a new model or a new evaluation:** run `python tools/psl_results.py`, then build. The page follows.

**JavaScript only enhances:** the mobile menu, sign search and filters ("Show all"), the sign-video dialog
(with English and Urdu captions), the hero clip starting by itself (never with reduced motion), and the live
demo. The demo first checks the camera (secure page, camera API, permission, a camera present). If the camera
is blocked or missing it shows why, how to allow it, and the guided tour and video. Otherwise it opens the
real app inline on wide screens (an iframe with `allow="camera"`) or full screen on phones. The recogniser and
models load only then; the project page itself never requests a model, tracker or runtime.

**Large text:** the demo's "Large text" switch opens `app.html?large=1`; the app also has a **Large text**
switch in Settings.

## Project page checks

- `web/tests/landing.test.mjs` (part of `npm test`): one h1 and no skipped heading levels; every section and
  menu link; the library equals the model's signs; the shown results equal `psl_results.json`; alt text on
  every image; English and Urdu caption tracks on every video; `dir="rtl"` on all Urdu; unique ids; title,
  description, Open Graph image and canonical address; the visible `[TODO]` placeholders; the app's
  no-JavaScript fallback and the forwarding of old links; the camera check.
- `tests/test_psl_results.py` (part of `python tools/run_all_tests.py`): the results file is up to date and
  the confusion matrix adds up.
- The preview workflow runs Lighthouse (performance, accessibility, best practices, SEO) on both `/` and
  `/app.html`, mobile and desktop. Budgets: mobile performance ≥ 90, accessibility 100, best practices ≥ 95,
  SEO 100.

Checked by hand in Claude's workspace on 2026-11-27 (headless Chrome, a local build with esbuild because Vite
could not be installed there): no horizontal scrolling at 360, 820, 1366 and 1920 px; no interactive target
under 24 × 24 px apart from links inside sentences; no text under 13 px outside the matrix labels; every text
colour pair at or above WCAG AA; complete with JavaScript off; first tab stop is "Skip to main content"; menu
opens, closes with Escape and returns focus; search works in English, Urdu and Roman Urdu; the video dialog
returns focus; camera blocked and camera missing both show the fallback; the inline demo opens the app with
large text; on a phone the demo opens full screen; with the service worker installed, the project page
(with images) and the app open offline. Simulated slow phone (4× CPU, 1.6 Mbps, 150 ms, no compression):
first and largest contentful paint 0.96 s, layout shift 0, no long tasks. Lighthouse itself was **not** run
there; the preview workflow runs it.

## Colours (WCAG 2.2 contrast, computed)

| Pair | Ratio | Use |
|---|---|---|
| `#f4f1ff` on `#0d0b1c` | 17.4 : 1 | body text |
| `#b9b6d3` on `#0d0b1c` / on `#1b1836` | 9.9 / 8.6 : 1 | secondary text |
| `#3ddc97` on `#0d0b1c` | 11.0 : 1 | links, accent, focus ring |
| `#0d0b1c` on `#3ddc97` | 11.0 : 1 | primary buttons, active filters |
| `#ffb547` on `#0d0b1c` | 11.0 : 1 | "weaker" and limitation markers, placeholders |

Colour never carries meaning alone: right answers in the matrix are squares and wrong ones diamonds, and
every number is also in a table.

## 60-second demo video: shot list

Film in landscape, 1080p, 30 fps. Use a phone on a stand for the app (screen recording) and a second camera
for the people. **Everything said must also be on screen** in English and Urdu (burned-in captions, or
`demo-60s.en.vtt` and `demo-60s.ur.vtt`). Get written consent from everyone filmed. Ideally the signer is a
Deaf PSL signer who has agreed to appear. If a team member signs instead, the end card says so. Rehearse
with the signs that work best for that signer, and never cut away from a wrong answer to fake a right one.

| Time | Shot | On screen / captions |
|---|---|---|
| 0:00–0:05 | A Deaf signer and a hearing pharmacist at a counter, unable to understand each other. | “Talk face to face.” / “آمنے سامنے بات کیجیے۔” |
| 0:05–0:12 | Phone on a stand: open signmate-pk.github.io, tap **Try the live demo**, the privacy notice, **Allow** camera. | “No app to install. No account. The video never leaves the phone.” |
| 0:12–0:22 | Split screen: the signer signs HELP; the phone shows **Help · مدد** with its confidence ring; a finger taps **Yes, speak it**; the phone says “مدد”. | “1 · Show  2 · Confirm  3 · Speak” and the spoken word in Urdu and English |
| 0:22–0:32 | Sentences tab: three signs join the tray (for example EXCUSE ME, DOCTOR, NEED), then **Speak**. | The sentence in Urdu and English |
| 0:32–0:39 | A sign SignMate is unsure about: “Which one did you sign?” with three choices; the signer picks the right one. | “When it isn't sure, it asks. Nothing unconfirmed is spoken.” |
| 0:39–0:47 | Reply tab: the pharmacist types “The doctor is coming”; it appears in large type and the PSL video for *doctor* plays. | “The reply comes back in large type, with real PSL videos.” |
| 0:47–0:53 | Swipe on airplane mode; sign again; it still works. | “Works offline after the first visit.” |
| 0:53–1:00 | End card: logo, address, QR code, and the honest status. | “69 signs today · 1 new signer: right first time on 5 of 14 · next: testing with Deaf signers” |

Export `web/public/media/demo-60s.mp4` (H.264, about 1280 × 720) and a poster `demo-60s-poster.webp`, write the
two caption files, then replace the `[TODO: 60-second demo video]` box in `web/index.html` with the video
element already prepared in a comment beside it.
