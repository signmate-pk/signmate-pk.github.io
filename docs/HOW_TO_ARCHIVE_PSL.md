# How to archive PSL: tag `psl-v3-final` and its GitHub Release [ME]

Master v4, Stage 0 step 1. This keeps the whole PSL project safe on a tag before PSL is removed from the work
branch. The live website does **not** change. It takes about 3 minutes in your browser.

Claude's workspace cannot push tags or create releases (GitHub answered HTTP 403 on 2026-11-27), so you do
this one step.

Nothing needs to be downloaded or attached. GitHub adds **Source code (zip and tar.gz)** to every release by
itself, and at this tag it contains everything: the PSL website, the PSL v3 model (`models/psl/`), every report,
the PSL tools, the Flutter phone app (`mobile/`), the old desktop app and the licence ledger. (The owner decided
on 2026-11-27 that SignMate is a website only, so no offline copy is attached.)

## Create the tag and the release

1. Open <https://github.com/signmate-pk/signmate-pk.github.io/releases/new>.
2. Click **Choose a tag**, type `psl-v3-final`, then click **+ Create new tag: psl-v3-final on publish**.
3. Click **Target** (next to the tag box), open **Recent commits** and pick
   **c90d4df — Project page at /, app at /app.html (exhibition fixes) (#9)**. While `main`'s newest commit is
   still c90d4df, choosing `main` is the same thing.
4. **Release title:** `SignMate PSL v3 — final, archived`
5. **Description:** paste the text in the box below.
6. Untick **Set as the latest release** (the ASL release takes that place later). Leave **Set as a
   pre-release** unticked.
7. Click **Publish release**.

```
The last version of SignMate built for Pakistan Sign Language (PSL), archived on 2026-11-27 before the
project moved to American Sign Language (master v4, CLAUDE.md section 10).

This tag is the live site of 27 Nov 2026 (commit c90d4df, PR #9): the project page, the PSL web app, the
Flutter phone app (mobile/), the desktop app, the PSL training and data tools, the PSL v3 model
(models/psl/) and every report. All of it is in "Source code" below.

Measured accuracy (reports/psl_v3.md): one new, independent signer 35.7 % first-time (14 clips);
the 98.6 % phone-test number is a weaker, same-signers test. No sign was validated by Deaf signers.
```

## Tell Claude

Reply "archived". Claude then checks that the tag points at c90d4df.
