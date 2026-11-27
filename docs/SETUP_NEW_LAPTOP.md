# Set up SignMate on another laptop (Windows)

> **PSL version (master v3), kept for history.** SignMate is now ASL only and a website only (master v4, CLAUDE.md
> section 10). This guide is rewritten for ASL in master-v4 Stage 7; until then, do not follow its PSL, offline-copy
> or app steps.

SignMate was called SignBridge until 2026-11-21; some file names (`start_signbridge.bat`) keep the old name.

Everything SignMate needs is on GitHub, so any laptop can run and edit it. Nothing has to be copied
from your other computer. Total time: about 20-30 minutes, most of it downloads.

**Which address?** The repository is `signmate-pk/signmate-pk.github.io` (moved there on 2026-11-21,
[DOMAIN.md](DOMAIN.md)); the old address `shaafrajput06-tech/SignBridge` still forwards to it.

**Got a zip from Claude instead?** Unzip it, open the `SignMate` folder inside, and skip step 2: the zip
already holds the code, its full git history and the downloaded model files.

## 1. Install three programs (once per laptop)

Open **Command Prompt** (press the Windows key, type `cmd`, press Enter) and paste these three lines
one at a time. Say **Yes** if Windows asks for permission.

```
winget install --id Git.Git -e
winget install --id Python.Python.3.12 -e
winget install --id OpenJS.NodeJS.LTS -e
```

If `winget` is not found, install them from their websites instead: <https://git-scm.com/download/win>,
<https://www.python.org/downloads/> (tick **Add python.exe to PATH**) and <https://nodejs.org/> (LTS).

**Close Command Prompt and open a new one** so Windows sees the new programs.

## 2. Get the code

In the new Command Prompt:

```
cd %USERPROFILE%\Documents
git clone https://github.com/signmate-pk/signmate-pk.github.io.git SignBridge
cd SignBridge
git checkout v3/master
```

The first time you `git push` from this laptop, a GitHub sign-in window opens: sign in as
`shaafrajput06-tech`.

`v3/master` is the branch where the work happens. `main` is what the live website shows; changes reach
it through pull requests from `v3/master`.

## 3. Set everything up with one double-click

Open the `SignBridge` folder in File Explorer (Documents > SignBridge) and double-click
**`setup_windows.bat`**. It:

1. checks Git, Python and Node.js (and offers to install any that are missing),
2. installs the Python and website packages into this folder,
3. downloads the model files and the frozen Inference Baseline v1, checking each file's SHA-256,
4. runs the quick tests.

Expected end of the window: `All quick tests passed.` then `Done. What next:`. Everything it did is
written to `reports\setup_log.txt`; send that file to Claude if something fails.

## 4. Run SignBridge

Double-click **`start_signbridge.bat`**. Your browser opens SignBridge; allow the camera.
To stop it, close the black windows that opened.

## 5. Every day: get the newest work, save yours

In Command Prompt, inside the SignBridge folder:

| You want to | Type |
|---|---|
| get the newest work (from Claude or your other laptop) | `git pull` |
| see what you changed | `git status` |
| save and upload your changes | `git add -A` then `git commit -m "what I changed"` then `git push` |

Work on one laptop at a time and run `git pull` before you start. If `git pull` ever says
**conflict**, don't guess: send the message to Claude.

## 6. Editing

Any editor works. A good free one: **Visual Studio Code** (`winget install --id Microsoft.VisualStudioCode -e`).
Open the SignBridge folder in it (File > Open Folder).

## Troubleshooting

| Problem | What to do |
|---|---|
| `'git' is not recognized` (or python, node, npm) | Close Command Prompt, open a new one. Still failing: install that program again (step 1). |
| `setup_windows.bat` says pip failed | Open `reports\setup_log.txt`, send the last 30 lines to Claude. |
| Windows says "Windows protected your PC" | Click **More info**, then **Run anyway** (the file came from the internet). |
| The browser does not ask for the camera | Use Chrome or Edge, and open the address that `start_signbridge.bat` printed. |
| `git push` is refused | Run `git pull` first, then `git push` again. |
