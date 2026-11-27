# Master v4: the owner's decisions (section 10 of docs/prompts/master-v4-asl.md)

Answered by the owner in the coding session on 2026-11-27 (Asia/Karachi). These are the owner's words as
chosen; nothing here was decided by the agent.

| # | Question | Answer |
|---|---|---|
| 1 | Positioning | **"SignMate: ASL ↔ English, built in Pakistan."** The name, the address `signmate-pk.github.io` and the `signmate-pk` organisation stay. The project page says plainly why ASL: data from consenting Deaf signers exists at scale, and the measured accuracy is far higher. |
| 2 | Urdu | **Keep Urdu as an optional output language** (captions and speech), only for signs whose translation an Urdu editor has reviewed. English everywhere else. |
| 3 | Non-commercial status | **Confirmed: SignMate is free and non-commercial.** CC BY-NC sources (ASL-LEX 2.0, Sem-Lex) and ASL Citizen's research terms may be used within those terms. The Microsoft permission email (shipping ASL Citizen-derived weights or clips) is drafted by the agent for the owner to approve and send; until Microsoft answers in writing, nothing derived from ASL Citizen ships. |
| 4 | Deaf ASL reviewers | **None yet.** The agent drafts outreach messages and a paid-participant consent form for the owner to send. Until a reviewer signs off, every sign says "Dataset sign — not yet validated by our reviewers". |
| 5 | Timing | **The switch is OK any time after the owner replies "release"** (Stage 7 gate). No fixed date. The PSL site stays live until the Stage 8 merge. |
| 6 | Devices for the budgets | **Owner will name the laptop (with browser) and the Android phone.** Not given yet; needed from Stage 3. |

## Later the same morning (2026-11-27, 10:26)

| # | Question | Answer |
|---|---|---|
| 7 | Apps and offline | **"Remove offline copy. There should be only the website, not an app."** Then, asked about the browser cache: **remove offline use too.** So: no Windows offline copy, no installable web app, no service worker, no Flutter phone app, no desktop app. The site needs internet. (CLAUDE.md 10.7) |
| 8 | Pages | Owner asked for the agent's recommendation. Recommended and adopted: **two plain website pages**: the project page at `/` and the translator at `/translate/`, opened from a "Translate" button. Old `/app.html` links forward to `/translate/`. Reason: the home page stays fast and complete without JavaScript, and the camera code loads only when someone wants to translate. The owner may still choose one page. |

What these change in `docs/prompts/master-v4-asl.md`: every "works offline after the first visit" goal and
budget row (sections 1 and 7, Stage 6 "offline test", Stage 8 "offline after the first visit"), the
service-worker model updates of section 4.3 (a new model now simply arrives with the next deploy), the
"offline save" setting of section 8, and the reuse of `offline.js`, `public/sw.js`, the precache list and
`npm run build:shared` in section 0 no longer apply.

GitHub: the owner allowed this session to push to `signmate-pk/signmate-pk.github.io`, on the branch
`v4/asl` only. Tags and releases cannot be pushed from the agent's workspace (HTTP 403 on 2026-11-27), so
the archive tag and release are owner steps (`docs/HOW_TO_ARCHIVE_PSL.md`).
