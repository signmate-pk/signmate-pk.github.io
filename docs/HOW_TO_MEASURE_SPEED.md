# How to measure SignBridge's speed on your laptop and phone [ME]

Stage 0 needs real numbers from **your** devices (master-v3.md section 3, Stage 0). Each test takes
2-5 minutes. Nothing is uploaded: the self-test page uses made-up landmark data, not your camera.

Write down the **laptop model** (sticker underneath or Settings > System > About) and the **phone
model** (Settings > About phone). Send everything to Claude in this chat.

## A. Laptop: the v3 preview (the new code, with the background-worker fix)

1. Open <https://github.com/shaafrajput06-tech/SignBridge/actions/workflows/preview.yml> (signed in).
2. Click the newest run with a green tick. Scroll to **Artifacts** at the bottom and click
   **shared-copy**. A zip downloads.
3. Right-click the zip > **Extract All...** > **Extract**. Inside, open the folder, then extract
   `SignMate-shared-copy.zip` the same way, and open the `SignBridge` folder.
4. Double-click **Start SignMate.bat** (if Windows warns: **More info** > **Run anyway**).
   Chrome or Edge opens SignBridge.
5. In the address bar, change the address to `http://localhost:8765/asl-selftest.html` and press Enter.
6. Wait until the top line starts with **Done.** (10-60 seconds).
7. Press **Ctrl+A**, then **Ctrl+C**. Open **Notepad**, press **Ctrl+V**, and save the file as
   `laptop-v3-selftest.txt`. Attach it in the chat.
8. **Camera check (the Stage 0 gate):** go back to `http://localhost:8765/app.html`, click **ASL** at the
   top, then **Start ASL camera**, and allow the camera. Sign any ASL word you know (if you know
   none, watch a video of an everyday ASL word such as "hello" or "thank you" in an online ASL
   dictionary first). Lower your hands when you finish. Take a screenshot (**Windows key + Shift + S**)
   showing the word SignBridge wrote, and attach it. Close the black window to stop SignBridge.

## B. Laptop: the frozen baseline (for the side-by-side comparison)

1. Extract the `SignBridge.zip` you already have (the shared copy of 2026-11-19), open the folder and
   double-click **Start SignMate.bat**.
2. Do steps A5-A7 again and save the file as `laptop-baseline-selftest.txt`.

## C. Phone: the live website

1. On your phone (Chrome on Android), open
   <https://shaafrajput06-tech.github.io/SignBridge/asl-selftest.html>
   (after the move in `DOMAIN.md`: <https://signmate-pk.github.io/asl-selftest.html>). Use Wi-Fi:
   the first visit downloads about 40 MB.
2. Wait until the top line starts with **Done.**
3. Take screenshots of the page from the top down to the end of the `"signs"` part (about 3-4
   screenshots), and attach them.

The live website still runs the old build (the v3 work goes live only in Stage 7), so this measures
the model on your phone through the page-thread fallback. That is labelled as such in the report.

## What Claude does with the numbers

Fills in `reports/v3_stage0_baseline.md` and `reports/asl_mode_v1.md`: time per sign (median), whether
the model ran in the background worker, the browser and the device, all with today's date. Nothing is
estimated; a number you did not measure stays "pending".
