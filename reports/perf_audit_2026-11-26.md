# Speed and correctness audit: product UI (2026-11-26)

Everything here was measured in Claude's workspace on 2026-11-26. That is a 2-core Linux VM with no real GPU,
running headless Chrome 153 (Chromium 153.0.8010.12). It is much slower than a mid-range phone with a working
GPU, so treat the absolute numbers as a slow-device floor. The owner's phone and laptop have **not** been
measured with this version yet (docs/HOW_TO_MEASURE_SPEED.md).

## Inputs used
- **PSL model:** `models/psl/psl_v3.tflite` (unchanged, SHA-256 72c71f80…). It ran on the six parity cases
  (`tests/golden/psl_parity_cases.json`, SignSpeak recordings).
- **Live camera:** a fake camera playing three SLT PSL dictionary clips (help, who, doctor) with black gaps
  between them, 640 × 480 at 30 fps. The performer is not in SignSpeak, so this is an independent-signer input.
- **Runtimes:** MediaPipe Tasks Vision 1.2.2 and LiteRT.js. These came from the frozen baseline build
  (`baseline/v1-site`), because npm packages cannot be installed in this workspace.

## Before (v3 code, audit)
| What | Result | How |
|---|---|---|
| PSL model, one sign | median 21.0 ms; 6/6 same top-1 as Python | `tools/psl_browser/run.mjs` (Web Worker) |
| Tracking per frame, CPU delegate: hands + pose + face | 129 ms (hands 64.5, pose 36.4, face 28.4) | 60 frames of the "help" clip |
| Same, hands + pose (no face) | 114 ms | same |
| Same, hands only | 65 ms | same |
| Same, GPU delegate on this VM's emulated GPU | 665 ms (hands 407) | same; the GPU path was about 5× slower than CPU here |

The PSL model reads only the two hands (`manifest.json input.parts_read`). The v3 loop still ran the face
tracker on every frame, and it ran on `requestAnimationFrame`, so a 60/120 Hz screen processed each 30 fps
camera frame 2–4 times.

## After (product UI)
| What | Result | How |
|---|---|---|
| Tap "Turn on camera" → camera picture visible | 432–711 ms (4 runs) | `.stage.is-live`, fake camera |
| Hand tracker after the automatic GPU→CPU switch | 76–103 ms per frame (hands 46–64, pose 30–39) | developer panel |
| PSL model per sign, live | 7–24 ms | developer panel |
| Sign end → result on screen | 638–846 ms | developer panel; includes the cutter's wait for lowered hands (8 frames, 4 when frames are skipped) at this VM's 6–8 processed fps |
| Guided tour, real model, 3 recorded signs | GOODBYE, DON'T TOUCH, MOBILE PHONE all recognised and accepted | `#/tour` |
| First contentful paint, 375 px, 4× CPU slowdown, 4G-like (9 Mbps, 60 ms) | 160–248 ms | 3 runs |
| Largest contentful paint, same | 896–1028 ms | 3 runs |
| Camera button ready, same | 1.28–1.39 s | 3 runs |
| Same three measures on a Fast-3G-like link (1.6 Mbps, 150 ms) | FCP 236–260 ms, LCP 2.57–2.58 s, ready 3.4–3.5 s | 3 runs: **misses the 2 s target** |
| Horizontal scroll at 375 px | none on any screen (scrollWidth = 375) | 18 screens checked |
| Text under 14 px | none found | same script |

**The 2 s load target is met on a 4G-like link and missed on Fast 3G.** The JavaScript is about 247 KB
minified (React is most of it). Next steps: preload the PSL manifest and specs, and split the sign gallery
out of the first bundle.

## Correctness on the independent signer (live, 4 runs of the 3 clips)
The model is the same as in v3, so these are behaviour checks, not accuracy numbers.
- **HELP:** accepted correctly in 3 runs.
- **DOCTOR:** offered as "Which one did you sign?". It was first in the list once; in the other runs the list
  was Where / Give / Doctor.
- **GARDEN:** wrongly accepted once (it was not signed). It was shown as a suggestion and not spoken, so the
  confirm step caught it.
- **WHO:** misread as WHERE.

This matches the v3 report: 35.7 % top-1 and 71.4 % top-5 on one new signer. The rules protect the person,
but only more signers in training will fix it.

## Changes that made the difference
1. `requestVideoFrameCallback`: one pass per camera frame.
2. Face tracker off for PSL; pose on every second frame. This restores the per-part skip option of the
   19 Nov baseline build, which the current source had lost.
3. Light mode switches on automatically:
   - **Level 1:** hands only.
   - **Level 2:** every other frame, with the sign cutter's frame counts halved so its timing in seconds
     stays the same.
   - It steps back down after three fast windows.
4. **GPU→CPU tracker switch:** when the GPU hand tracker takes over 120 ms per frame (median of 15 frames,
   after 10 warm-up frames), the tracker is rebuilt on CPU. The old GPU tasks are left open. Closing them
   aborted MediaPipe's shared WASM runtime ("Aborted()") in the first attempt.
5. The hand overlay no longer reads layout every frame (it uses a ResizeObserver).
6. One failed frame no longer shows the "camera needs attention" cover. Only 15 failures in a row do.
