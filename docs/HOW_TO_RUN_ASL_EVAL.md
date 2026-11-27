# How to measure the ASL model on Kaggle [ME]

This runs `notebooks/asl_mode_eval.ipynb` on Kaggle's free computers. It **trains nothing**: it runs SignMate's
ready-made ASL model on the competition's hidden test signers (the GISLR rerun set, 39,443 signs) and writes down
how often it is right. You click a few buttons, wait, and send me two files.

The master-v4 version (2026-11-27) measures more than the 2026-11-20 run:
- every sign's result and the full confusion matrix (which sign gets taken for which), for the project page;
- the website's 32-frame path on **every** sign, not every 5th;
- **test-time mirroring**: each sign is also read as its left/right mirror image and the two answers are averaged.
  This should narrow the 4.5-point gap between left- and right-handed signers; the run measures whether it does;
- calibration error (how well "90 % sure" matches being right 90 % of the time);
- six clear recordings for the website's guided tour, re-checked against the model.

- **Time:** about 10 minutes of clicking, then 45-120 minutes of waiting (you can close the browser).
- **Cost:** free.

---

## Step 1. Download the notebook

1. Open <https://github.com/signmate-pk/signmate-pk.github.io/blob/v4/asl/notebooks/asl_mode_eval.ipynb>.
2. Click the **Download raw file** button (a down-arrow, top right of the file view). It saves
   `asl_mode_eval.ipynb` in your Downloads folder.

## Step 2. Open it on Kaggle

1. On <https://www.kaggle.com>, click **+ Create** (top left), then **New Notebook**.
2. Click **File > Import Notebook**, then **Browse Files**, choose **`asl_mode_eval.ipynb`** and click **Import**.
   The first cell should start with "SignMate (ASL): accuracy on signers the model never saw".

## Step 3. Add the test data

1. In the right-hand panel, find **Input** and click **+ Add Input**.
2. Search **ASL Isolated Sign Recognition Rerun Set**.
3. Click the result by *sohier* (about 14 GB, licence CC0) and click the **+** next to it.

## Step 4. Add the model

Your Kaggle account cannot download from the internet inside a notebook, so the model goes in as a file.

- **If you uploaded it for the 2026-11-20 run:** in **+ Add Input**, open **Your Work** (or **Datasets → Your
  Datasets**), find **signbridge-asl-model** and click **+**.
- **Otherwise:** in **+ Add Input** choose **Upload → New Dataset**. Drag in these two files from your computer:
  - `D:\sigmbridge\SignMate\models\asl\model.tflite` (about 11 MB)
  - `D:\sigmbridge\SignMate\models\asl\sign_to_prediction_index_map.json`

  Name it `signmate-asl-model`, keep it **Private** and click **Create**.

The notebook checks the model by its SHA-256, so it refuses a different file.

## Step 5. Run it in the background

1. Click **Save Version** (top right).
2. Choose **Save & Run All (Commit)** and click **Save**.
3. You can close the tab. Kaggle tells you when it has finished.

## Step 6. Send me the two files

1. Open the notebook again (**Code → Your Work**) and click the finished version.
2. Open the **Output** tab and download both files:
   - **`asl_eval_results.json`** (a few hundred KB to about 2 MB: numbers only)
   - **`asl_tour_recordings.json`** (about 0.5-1 MB: hand, face and arm points of six signs from the CC0 dataset)
3. Attach both files in this chat. Neither holds video or anything about you.

## What the notebook prints (so you know it is working)

| Cell | You should see |
|---|---|
| Model | `Using the attached model.tflite ...`, then `Model ready: ... input [-1 543 3]` |
| Data | `Samples: 39443 | signs: 250 | signers: not given` |
| Layout | `Row order checked on 5 files: face, left_hand, pose, right_hand` |
| Run | a line every 1,000 samples, such as `3000/39443 samples, 520 s, top-1 so far 0.86...` |
| Results | a block of numbers with `"paths"` (native, native_tta, fixed_32, fixed_32_tta ...), then `Saved /kaggle/working/asl_eval_results.json` |
| Guided-tour recordings | six lines such as `hello: 31 frames, right-dominant, rows 151, change from storage 1.2e-06, website path says ['hello', 0.99]`, then `Saved ... asl_tour_recordings.json with 6 recordings` |

## If something goes wrong

| Message | What to do |
|---|---|
| `No label table ... was found` | The rerun dataset is not attached: do Step 3 again. |
| `needs Internet switched on` or a download error | The model is not attached: do Step 4. |
| `is not the pinned file` | The uploaded model is a different file. Use the two files from `D:\sigmbridge\SignMate\models\asl`. |
| The run stops after 12 hours | In the first code cell change `MAX_SAMPLES = None` to `MAX_SAMPLES = 10000`, then save a new version. The report will say it used a subset. |
| Fewer than six tour recordings | Fine: the notebook only keeps signs it reads right with at least 90 % on both paths. |
| Anything else | Send me a screenshot of the red error text. |
