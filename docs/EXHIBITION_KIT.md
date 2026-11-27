# SignMate exhibition kit (master-v3 Stage 6)

> **PSL version (master v3), kept for history.** SignMate is now ASL only and a website only (master v4, CLAUDE.md
> section 10). This guide is rewritten for ASL in master-v4 Stage 7; until then, do not follow its PSL, offline-copy
> or app steps.

Everything here matches what the app really does on 2026-11-21. The numbers come from the project's
reports: the "How well it works" page shows the same numbers, each with its dataset, test and date.

## 1. Two-minute pitch

> In Pakistan, most hearing people don't know Pakistan Sign Language, and most Deaf people meet that wall
> every day: at the doctor, at a shop counter, at school. SignMate is a translator that runs **on your own
> phone or laptop**. The camera follows **both hands, the shoulders and the face**, entirely on the
> device; no video leaves it.
>
> You sign a PSL word, lower your hands, and SignMate suggests the word in English and Urdu. You confirm
> it, and it speaks. Confirmed words build a sentence. The hearing person types a reply, and SignMate
> shows it in large text and plays the PSL dictionary video for each word it knows. One tap speaks an
> emergency phrase.
>
> We are honest about what it can do. Every PSL answer is a suggestion you confirm. We publish exactly how
> well it works, on which test, and why no sign is marked "Recognised" yet: that needs a test on new
> signers and approval by Deaf signers. Every dataset and video is licensed and credited. A separate ASL
> mode exists, clearly labelled, and is never mixed with PSL.
>
> SignMate works offline after one visit, in Urdu and English, and it learns from your own confirmations
> without uploading anything.

## 2. Five-minute technical walkthrough

1. **Camera → landmarks (on the device).** MediaPipe finds 21 points per hand, 33 body points and the face
   in each frame. Hands are assigned to the signer's left and right by the pose wrists, so left-handed
   signers and crossed hands work.
2. **Landmarks → sign.** A sign is cut out when the hands come up and go down (the baseline's segmenter),
   then resampled to 32 frames in the same 543-point layout the ASL model uses.
3. **PSL model.** A small 1D-convolution and transformer model (the ISLR 1st-place recipe, made smaller).
   It reads the hand shapes, positions, motion and hand-to-hand distances, which it computes inside the
   model, so the browser, Python and phone clients cannot drift apart. It is int8, about 1.9 MB, and runs in
   LiteRT.js in a Web Worker. It was trained on SignSpeak (Apache-2.0) recordings from laptops and webcams
   and tested on that dataset's phone recordings, which it never saw.
4. **Honest output.** Calibrated probabilities. Every PSL sign is Tier B ("Suggested — please confirm"),
   and nothing is spoken until the person confirms. A "not a sign" class and the confidence thresholds
   reject unclear input.
5. **AI helpers** (one switch turns them all off):
   - a five-second camera check of light, distance and framing;
   - personal adaptation from your confirmations, stored only in the browser;
   - the sentence builder, which reorders and punctuates but never adds a word;
   - an offline helper that answers only from the app's own data.
6. **Two-way.** Typed replies are matched to the vocabulary and dictionary in English, Urdu or Roman Urdu,
   and the matching PSL dictionary videos play in order.
7. **Trust.** Licence ledger (`data/LICENSES.yaml`): nothing is trained or shipped without an entry that
   allows it. Internet videos are logged before download. YouTube is never downloaded.

### Diagram

```
camera ──► MediaPipe (hands + pose + face, on device)
       ──► both hands assigned left/right (pose wrists)
       ──► sign cut out (hands up → hands down) ──► 32 frames × 543 points
       ──► PSL model in a Web Worker (features inside the model)
       ──► calibrated top-5 + "not a sign"
       ──► Tier B suggestion ──► person confirms
       ──► English / Urdu word ──► sentence builder ──► speech
reply (typed or spoken) ──► known words ──► PSL dictionary videos, in order
```

## 3. Tri-fold poster text

**Left panel: the problem.**
- Over 5 % of the world's population, 430 million people, need help for disabling hearing loss, and nearly
  80 % of them live in low- and middle-income countries (WHO, 2025).
- In Pakistan, fewer than 5 % of deaf school-age children attend school (Deaf Reach, reported by the
  Express Tribune, 2024).
- Most hearing people cannot sign.

**Middle panel: what SignMate does.**
- Sign a PSL word, see it in English and Urdu, confirm it, hear it.
- Write back: big text plus PSL dictionary videos.
- Quick and emergency phrases, one tap.
- Runs on your phone or laptop and works offline. No video leaves the device.

**Right panel: honest AI.**
- Every number measured and published, with its test and date.
- Every PSL answer is a suggestion until Deaf signers validate the signs.
- A licence ledger for every dataset and video.
- ASL is a separate, labelled mode, never mixed with PSL.

## 4. Twenty likely judge questions, honest answers

1. **How accurate is it?** On phone recordings the model never saw, it got the PSL word right the share
   of times shown on "How well it works". That test is "weaker": the dataset has no signer names, so the
   same people may appear in training and test.
2. **Why is nothing "Recognised" (Tier A)?** Tier A needs a test on signers the model has never seen and a
   Deaf validator's approval. Neither is possible with this data yet, so we don't claim it.
3. **How many signs does it know?** The PSL camera knows the words listed on "How well it works". The
   vocabulary has 64 phrases. The dictionary page shows 788 dictionary signs, which the camera does not
   recognise.
4. **Does it understand sentences?** It recognises one sign at a time, with a pause between signs.
   Confirmed signs then become a sentence by simple rules. Continuous signing is future work.
5. **Is my video uploaded?** No. Recognition runs in the browser; only landmark numbers are used, and
   nothing is stored unless you choose.
6. **Does it work without internet?** Yes, after the first visit and "Save for offline use". The
   dictionary videos not stored with the site need internet.
7. **Why did you train on hands only?** The licensed PSL dataset we could train on contains hand
   landmarks only. The face and body are still tracked and will be used when licensed data with them exists.
8. **What about left-handed signers?** Training mirrors signs, and the shipped model averages a sign with
   its mirror image. The measured left/right gap is on "How well it works".
9. **Two-handed signs?** Both hands are tracked at all times, and two-handed accuracy is reported
   separately.
10. **Where does the data come from?** SignSpeak (Apache-2.0) for training, and the SLT community
    dictionary (CC BY 4.0) for videos and an independent check. Both are listed on "Credits and licences".
11. **Did you scrape the internet?** No. Every video source is checked and logged in the licence ledger
    before download. Of 33 web videos found, none was PSL, and none was used.
12. **Why an ASL mode?** It is a measured, ready-made model (85.3 % top-1 in the browser on ASL signers it
    never saw), shown as a separate language. ASL labels never go into PSL.
13. **How does it learn without training by users?** The model ships ready to use. It also adjusts lightly
    to your confirmations, stored only in your browser. Nobody has to record or label anything.
14. **Can the AI make up signs?** No. It never generates sign descriptions or videos. If no licensed video
    exists, it says so.
15. **What did Deaf people contribute?** The datasets were recorded with PSL signers. We have no Deaf
    validator yet; permission and validation requests are drafted. Until then the app says "not yet
    validated".
16. **What happens when it's unsure?** It says "Not sure", offers choices, or asks you to try again. It
    never speaks a guess.
17. **How fast is it?** See the speed table on "How well it works"; each entry names its device.
18. **What does it cost?** Nothing. It runs on GitHub Pages and on your device.
19. **Biggest limitation?** No test on new signers or Deaf validation yet, a limited vocabulary, and no
    finger-spelling in this release.
20. **What's next?** Deaf validators, finger-spelling from the licensed Urdu-alphabet data (UAlpha40),
    continuous signing, and data with face and body points.

## 5. Limitations slide

- PSL signs are all **Tier B**: suggestions, not validated by Deaf signers.
- PSL accuracy is measured on new **recordings**, not new **signers**: the dataset has no signer names.
- One sign at a time; no finger-spelling yet.
- The PSL model reads the hands only (the licensed dataset has no face or body points).
- Replies are a word-by-word aid with dictionary videos, not signed translation.
- The dataset's phone recordings of "toothbrush" and "toothpaste" disagree with its other recordings; the
  report says how this was handled.

## 6. Social impact, with sources

- **430 million people** (over 5 % of the world's population) need rehabilitation for disabling hearing
  loss, including 34 million children. By 2050 this may pass 700 million. Nearly 80 % live in low- and
  middle-income countries. Source: WHO fact sheet "Deafness and hearing loss", 26 February 2025,
  https://www.who.int/news-room/fact-sheets/detail/deafness-and-hearing-loss
- **Fewer than 5 % of deaf school-age children in Pakistan attend school.** Source: Express Tribune,
  2 December 2024, reporting Deaf Reach, https://tribune.com.pk/story/2513179/entertainment
- **About 70 million deaf people worldwide; 80 % have no access to education** (World Federation of the
  Deaf, as reported in the same article).
- **Pakistan's own numbers vary widely.**
  - The 1998 census counted 244,254 people as "deaf and dumb" (Pakistan Bureau of Statistics yearbook,
    https://www.pbs.gov.pk/sites/default/files/other/yearbooks//yearbook2014/19.12.pdf).
  - An audiology society estimates 9 million people with some hearing loss (Daily Times,
    https://dailytimes.com.pk/345922/hearing-the-deaf/).
  - Geo.tv cites over four million deaf people, attributed to the Pakistan Bureau of Statistics
    (https://www.geo.tv/latest/565533-making-signs-of-pakistans-struggling-deaf-community-heard).
  - Say this honestly: the counts disagree, and the census is old.

## 7. Backup plan (bad light, no Wi-Fi, dead laptop)

- **No Wi-Fi:** press "Save for offline use" at home the day before; the whole site then works offline.
  The offline copy (Start SignMate.bat) also runs from a USB stick.
- **Bad light:** the camera check will say so. Stand facing the window or a lamp; avoid a bright window
  behind you.
- **Dead laptop:** open the site on a phone (it works in the phone browser), or show your recorded demo
  video ([ME]: record one with your phone the day before).
- **Model won't load:** the vocabulary, dictionary videos, reply panel and quick phrases still work without
  the camera.

## 8. Checklist for the day

- [ ] Laptop charged, charger packed; phone charged as a second screen.
- [ ] Site opened once and "Save for offline use" pressed (on the laptop and the phone).
- [ ] Offline copy on a USB stick.
- [ ] Try three signs at the stand: hello, thank you, water.
- [ ] "How well it works" open in a second tab for questions about accuracy.
- [ ] [ME] A 1-minute demo video recorded with your phone, kept on the laptop and the phone.
