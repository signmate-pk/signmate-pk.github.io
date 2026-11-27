# Handoff: project page and exhibition fixes (2026-11-27)

A judge scored the site 1/5 for Design & UX, Functionality, Technical Merit and Polish, and 2/5 for
Innovation. They saw a page with only a heading and "SignMate needs JavaScript…", because `web/index.html`
held nothing but the app shell. This change gives the site a real front page and leaves the recogniser alone.

## What changed, mapped to each criticism

| Criticism | What the site does now |
|---|---|
| **Empty without JavaScript** (the root cause) | `/` is a project page whose every section is plain HTML in the shipped file. The sign library, results, confusion matrix, speed and credits are written in at build time. With JavaScript off, the page is complete (checked at 360 px). The app moved, unchanged, to `/app.html`; its `<noscript>` now explains what SignMate does, how to turn JavaScript on, and links to the project page. |
| **Sparse, unstyled page** (Design & UX, Polish) | New identity: an SVG logo (hand in a speech bubble), the existing `#0d0b1c` ink plus one mint accent (`#3ddc97`), a fluid type scale from 360 px phones to a 1920 px projector, Noto Nastaliq Urdu for Urdu. Also a favicon set, a 1200×630 Open Graph image, title, description and canonical address. The hero has the headline “Talk face to face.”, both buttons, and a muted looping clip of a sign being recognised. |
| **No navigation** | Sticky menu with eight sections, a hamburger on phones (Escape closes it and returns focus), a skip link, and the current section highlighted. A plain wrapped menu is shown with JavaScript off. |
| **No demo** (Functionality) | A *Live demo* section explains the camera permission and privacy, then starts the real recogniser: inline on wide screens, full screen on phones. The model loads only at that point. If the camera is blocked, missing or unsupported, the page says why and how to fix it, and offers the guided tour (no camera). The hero clip and the How-it-works screenshots come from the app's guided tour. The 60-second video has a slot and a shot list. There is a Large-text option for the demo (`?large=1`, and a Settings switch in the app). |
| **No technical detail** (Technical Merit) | A six-stage pipeline diagram (camera → MediaPipe landmarks → features → classifier → confirmation → Urdu/English speech), the stack, why it runs on the device, model facts (int8 islr_lite, 1.85 MB, 1,653,574 parameters, 70 classes, temperature 0.55) and a measured speed table that names where and when. |
| **No validation information** | *Results & limitations* puts the 98.6 % fair-test number (labelled weaker) next to the 35.7 % one-new-signer number. It adds a full results table, a 65×65 confusion matrix rebuilt from the real run (`tools/psl_results.py`), every wrong answer, all 14 independent-signer clips, per-sign results, confidence levels, devices tested and seven honest limitations. *Validation & roadmap* gives the current status (0 signs validated by Deaf signers, no partners yet) and a five-step plan with Deaf signers and PSL teachers. It also has a feedback slot and dated milestones, labelled as targets. |
| **No team information** | A *Team* section with visible placeholders. Nothing is invented. |
| Innovation (2/5) | The page now shows what is new and why: on-device PSL to Urdu speech, the confirm-before-speak safety design, honest uncertainty, offline use, and a sign library generated from the model itself. |

## Files

New:
- `web/index.html`: the project page (markers filled at build time).
- `web/app.html`: the app shell, moved from `index.html`, with a real `<noscript>` fallback.
- `web/src/landing/landing.css`, `landing.js`, `camera.js`: page styles and progressive enhancement.
- `web/scripts/landing-content.mjs`: build-time generator and Vite plugin (`node scripts/landing-content.mjs --out x.html` to preview).
- `tools/psl_results.py`, `shared_data/psl_results.json`, `tests/test_psl_results.py`: results and confusion matrix from the committed measurements, with a consistency check.
- `web/tests/landing.test.mjs`: page tests (no browser needed).
- `web/public/`: `media/` (3 screenshots in two sizes, poster, 5.4 s clip, English and Urdu captions), `og-image.png`, `favicon.ico`, `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `robots.txt`, `sitemap.xml`.

Changed:
- `web/vite.config.js`: `app.html` input, landing plugin, and the offline shell now also holds `app.html`, the page media and the PSL manifest.
- `web/public/sw.js`: offline fallback picks `app.html` or `index.html`, ignoring the query string.
- `web/public/manifest.webmanifest`: start URL `app.html#/words`, `id` kept as `./` so installed apps stay the same app, PNG icons, dark theme colour.
- `web/public/icon.svg`, `icon-maskable.svg`, `web/src/ui/Icon.jsx` (`BrandMark`): the new logo.
- `web/src/App.jsx`, `web/src/ui/MoreScreen.jsx`, `web/src/styles.css`: Large-text mode (setting and `?large=1`). Presentation only; recognition code untouched.
- `web/tests/camera-smoke.mjs`, `web/tests/asl-selftest-run.mjs`: open `app.html`.
- `web/scripts/build-shared.mjs`: `app.html` is a required file of the offline copy.
- `.github/workflows/preview.yml`: Lighthouse adds SEO and measures `/` and `/app.html`. `.github/workflows/website.yml` checks that both pages exist and that the sign grid is in the HTML.
- `README.md`, `EXHIBITION_CHECKLIST.md`, `docs/HOW_TO_MEASURE_SPEED.md`, `docs/WEBSITE.md`: new addresses. `docs/WEBSITE.md` also has how the page is built, the checks, the colour ratios and the 60-second shot list.

Not changed: everything under `web/src/recognition/`, the PSL and ASL clients, feature code, models, the
baseline. The QR code still points at the site root, which is now the project page with **Try the live demo**
at the top.

## Placeholders still on the page (`[TODO: …]`)

1. `#demo-video`: **60-second demo video** (shot list in `docs/WEBSITE.md`).
2. `#speed` table: **real phone and exhibition-laptop timings**, and **which phone, laptop and browser** (`docs/HOW_TO_MEASURE_SPEED.md`).
3. `#devices`: **results on a real Android phone, an iPhone and the exhibition laptop**, with model names.
4. `#validation`: **feedback form link** (a GitHub issues link is there meanwhile).
5. `#team`: **school name, city, class/grade, supervising teacher**.
6. `#team`: **photo**, **name** and **role** for each member (three cards; add or remove as needed).
7. Footer: **contact email**.

## Not visible, but open

- An Urdu editor should review the new Urdu text: hero line, clip captions, video caption tracks. The earlier UI strings and Roman Urdu labels are still drafts too.
- Lighthouse was not run in this workspace. The preview workflow's Lighthouse summary (`check-results` artifact) is the real check against the budgets.
- Noto Nastaliq Urdu is used from the device (built into Android, iOS and macOS). On Windows the stack falls back to Urdu Typesetting. Self-hosting a subset `woff2` with a ledger entry is still open.
- The repository has no licence file for the code itself.
- Screenshots come from the guided tour (a recorded sign, hand points only). Screenshots of a consenting Deaf signer using the live camera would be stronger.
- To re-measure the PSL model on its test set, use `.github/workflows/psl-train.yml`. This workspace has neither the SignSpeak data nor a TFLite runtime, so the page uses run 44884632047's committed measurements.
