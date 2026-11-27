# How to archive PSL: tag `psl-v3-final` and its GitHub Release [ME]

Master v4, Stage 0 step 1. This keeps the whole PSL project safe on a tag before PSL is removed from the work
branch. The live website does **not** change. It takes about 5 minutes in your browser.

Claude's workspace cannot push tags or create releases (GitHub answered HTTP 403 on 2026-11-27), so you do
these two clicks-only steps.

## What the release will hold

- **Source code (zip and tar.gz):** GitHub adds these to every release automatically. At this tag they contain
  everything: the PSL app and project page, the PSL v3 model (`models/psl/`), every report, the PSL tools, the
  Flutter phone app (`mobile/`) and the licence ledger.
- **The offline copy for Windows**, which you attach by hand (step 1). It was built by the checks of PR #9
  (run 45940644364, all passed) from exactly the same files as the live site, commit `c90d4df`: both have git
  tree `ad5e4764`. GitHub keeps that file until 25 Feb 2027, so do this before then.

## 1. Download the offline copy

1. Open <https://github.com/signmate-pk/signmate-pk.github.io/actions/runs/45940644364>.
2. Scroll down to **Artifacts** and click **shared-copy** (about 60 MB). Your browser downloads `shared-copy.zip`.
3. In File Explorer, right-click `shared-copy.zip` → **Extract All…** → **Extract**. Inside is
   `SignMate-shared-copy.zip`.
4. Rename that file to `SignMate-PSL-shared-copy-v3-final.zip` (right-click → **Rename**).

## 2. Create the tag and the release

1. Open <https://github.com/signmate-pk/signmate-pk.github.io/releases/new>.
2. Click **Choose a tag**, type `psl-v3-final`, then click **+ Create new tag: psl-v3-final on publish**.
3. Click **Target** (next to the tag box), open **Recent commits** and pick
   **c90d4df — Project page at /, app at /app.html (exhibition fixes) (#9)**. While `main`'s newest commit is
   still c90d4df, choosing `main` is the same thing.
4. **Release title:** `SignMate PSL v3 — final, archived`
5. **Description:** paste the text in the box below.
6. Drag `SignMate-PSL-shared-copy-v3-final.zip` into **"Attach binaries by dropping them here"** and wait for the
   upload to finish.
7. Untick **Set as the latest release** (the ASL release takes that place later). Leave **Set as a pre-release**
   unticked.
8. Click **Publish release**.

```
The last version of SignMate built for Pakistan Sign Language (PSL), archived on 2026-11-27 before the
project moved to American Sign Language (master v4, CLAUDE.md section 10).

This tag is the live site of 27 Nov 2026 (commit c90d4df, PR #9): the project page, the PSL app, the
Flutter phone app (mobile/), the PSL training and data tools, the PSL v3 model (models/psl/) and every
report. All of it is in "Source code" below.

Attached: SignMate-PSL-shared-copy-v3-final.zip, the offline copy for Windows (unzip, then double-click
"Start SignMate.bat"), built by the checks of PR #9 (run 45940644364) from the same files.

Measured accuracy (reports/psl_v3.md): one new, independent signer 35.7 % first-time (14 clips);
the 98.6 % phone-test number is a weaker, same-signers test. No sign was validated by Deaf signers.
```

## 3. Tell Claude

Reply "archived". Claude then checks that the tag points at c90d4df and that the file is on the release.
