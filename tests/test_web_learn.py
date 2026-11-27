"""Web-learning pipeline (master-v3 Stage 1, CLAUDE.md 9.2-9.5): licences decide, nothing is downloaded
without a ledger entry, YouTube is never downloaded, non-PSL clips never carry PSL labels, and every
manifest entry is checked against the ledger. No network: every site is replaced by a fake."""

from __future__ import annotations

import copy
import gzip
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from data_engine.ledger import LEDGER_PATH, load_ledger, validate_ledger  # noqa: E402
from tools.web_learn import extract, licences, match, pipeline, sources, words  # noqa: E402
from tools.web_learn import ledger as web_ledger  # noqa: E402
from tools.web_learn.sources import Candidate  # noqa: E402

FIXTURE = json.loads(gzip.decompress((ROOT / "tests" / "golden" / "v2_holistic.json.gz").read_bytes()))


def candidate(**overrides) -> Candidate:
    base = dict(source="commons", source_id="File:PSL hello.webm", page_url="https://commons.wikimedia.org/wiki/File:PSL_hello.webm",
                media_url="https://upload.wikimedia.org/x/PSL_hello.webm", title="PSL hello (Pakistan Sign Language)", uploader="Example",
                licence_raw="CC BY 4.0", licence_id="CC-BY-4.0", gloss="hello", label_evidence="PSL hello", language="PSL")
    base.update(overrides)
    return Candidate(**base)



PSL_RETIRED = ("PSL is retired (master v4, CLAUDE.md 10.1): the PSL vocabulary and PSL dictionary sources this test used are gone. "
               "tools/web_learn is rebuilt for ASL in master-v4 Stage 1.")

class LicenceTests(unittest.TestCase):
    def test_normalising_platform_licence_text(self):
        cases = {"CC BY-SA 4.0": "CC-BY-SA-4.0", "https://creativecommons.org/licenses/by/4.0/": "CC-BY-4.0",
                 "http://creativecommons.org/publicdomain/zero/1.0/": "CC0-1.0", "Public domain": "PDM-1.0",
                 "CC BY 2.5": "CC-BY", "cc-by-nc-sa 3.0": "CC-BY-NC", "https://creativecommons.org/licenses/by-nd/4.0/": "CC-BY-ND",
                 "All rights reserved": "UNKNOWN", "": "UNKNOWN", None: "UNKNOWN"}
        for text, expected in cases.items():
            self.assertEqual(licences.normalise(text), expected, text)

    def test_only_open_licences_are_trainable(self):
        for licence in ("CC0-1.0", "PDM-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "CC-BY"):
            self.assertTrue(licences.trainable(licence), licence)
        for licence in ("CC-BY-NC", "CC-BY-ND", "UNKNOWN", "YOUTUBE-CC-BY", "something-else"):
            self.assertFalse(licences.trainable(licence), licence)
        self.assertFalse(licences.allowed_uses("CC-BY-SA-4.0")["redistribute_weights"])
        self.assertTrue(licences.allowed_uses("CC-BY-ND")["reference_clip"])
        self.assertTrue(licences.needs_permission("CC-BY-NC") and licences.needs_permission("UNKNOWN"))

    def test_youtube_is_never_downloadable(self):
        self.assertEqual(licences.normalise("Creative Commons", "youtube"), "YOUTUBE-CC-BY")
        video = candidate(source="youtube", media_url=None, licence_id="YOUTUBE-CC-BY")
        self.assertFalse(video.download_allowed)
        # Even a mistaken media URL does not make it downloadable.
        self.assertFalse(candidate(source="youtube", media_url="https://x", licence_id="CC-BY-4.0").download_allowed)


@unittest.skip(PSL_RETIRED)
class WordAndQueryTests(unittest.TestCase):
    def test_vocabulary_words_have_three_scripts(self):
        vocab = words.vocabulary_words()
        self.assertEqual(len(vocab), 64)
        hello = next(w for w in vocab if w.english.lower() == "hello")
        found = words.queries(hello)
        self.assertIn("Pakistan Sign Language Hello", found)
        self.assertTrue(any("اشارہ" in q for q in found))
        self.assertEqual(len(found), len({q.lower() for q in found}))

    def test_dictionary_labels_fold_into_vocabulary_words(self):
        vocab = words.vocabulary_words()
        english = vocab[0].english.lower()
        merged = words.slt_label_words([f"{english}.extra_meaning", "zebra-crossing"], vocab)
        self.assertIn("extra meaning", merged[0].synonyms)
        self.assertEqual(merged[-1].gloss, "slt:zebra-crossing")
        self.assertFalse(merged[-1].in_vocabulary)


class FakeWeb:
    """Answers API URLs with canned JSON, and records every URL asked for."""

    def __init__(self, routes: dict[str, object]):
        self.routes, self.asked = routes, []

    def __call__(self, url: str) -> bytes:
        self.asked.append(url)
        for prefix, answer in self.routes.items():
            if url.startswith(prefix):
                return json.dumps(answer).encode()
        return json.dumps({}).encode()


@unittest.skip(PSL_RETIRED)
class SourceTests(unittest.TestCase):
    def setUp(self):
        self.hello = next(w for w in words.vocabulary_words() if w.english.lower() == "hello")

    def test_commons_reads_licence_and_language_from_metadata(self):
        web = FakeWeb({
            "https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search": {"query": {"search": [{"title": "File:Hello in Pakistan Sign Language.webm"}]}},
            "https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo": {"query": {"pages": {"1": {
                "title": "File:Hello in Pakistan Sign Language.webm",
                "imageinfo": [{"mime": "video/webm", "url": "https://upload.wikimedia.org/hello.webm", "descriptionurl": "https://commons.wikimedia.org/wiki/File:Hello",
                               "size": 1000, "extmetadata": {"LicenseUrl": {"value": "https://creativecommons.org/licenses/by-sa/4.0"},
                                                             "Artist": {"value": "<a href='x'>Signer</a>"}, "ImageDescription": {"value": "Hello"}}}]}}}},
        })
        found = sources.commons_search(self.hello, fetch=web)
        self.assertEqual(len(found), 1)
        clip = found[0]
        self.assertEqual((clip.licence_id, clip.language, clip.uploader), ("CC-BY-SA-4.0", "PSL", "Signer"))
        self.assertTrue(clip.label_evidence)
        self.assertTrue(clip.download_allowed)

    def test_youtube_results_are_listed_never_downloaded(self):
        web = FakeWeb({"https://www.googleapis.com/youtube/v3/search": {"items": [{"id": {"videoId": "abc"}, "snippet": {"title": "Hello in American Sign Language", "channelTitle": "Someone"}}]}})
        found = sources.youtube_search(self.hello, "KEY", fetch=web)
        self.assertEqual(found[0].media_url, None)
        self.assertEqual(found[0].language, "ASL")
        self.assertFalse(found[0].download_allowed)

    def test_language_hints(self):
        self.assertEqual(sources.language_hint("Hello in Pakistan Sign Language"), "PSL")
        self.assertEqual(sources.language_hint("ASL hello"), "ASL")
        self.assertEqual(sources.language_hint("hello"), "unknown")
        self.assertEqual(sources.language_hint("Pakistan Sign Language and American Sign Language compared"), "mixed")
        self.assertEqual(sources.language_hint("WIKITONGUES- Mónica signing Spanish Sign Language"), "other")

    def test_false_matches_from_the_first_run_are_not_psl_or_not_sign_videos(self):
        # Real titles the first live search (2026-11-20) wrongly took for PSL: a party called PSL, and
        # Persian text in the same script as Urdu. None of them is a sign-language video.
        for title in ("Join the PSL Today!", "EDUARDO BOLSONARO DESABAFA APÓS DEPUTADOS FORJAREM GOLPE DENTRO DO PSL",
                      "محمد یعقوبی و تجربه زیستن در مهاجرت", "President Obama on Death of Osama bin Laden", "Character Studies (1927)"):
            self.assertFalse(sources.is_sign_language_video(title), title)
            self.assertNotEqual(sources.language_hint(title), "PSL", title)
        self.assertTrue(sources.is_sign_language_video("WIKITONGUES- Mónica signing Spanish Sign Language"))

    def test_dictionary_mapping_file_matches_vocabulary_words_without_guessing(self):
        vocab = words.vocabulary_words()
        labels = {"papa", "house", "what", "hello.greeting"}
        mapping = {"urdu": {"والد": "papa", "گھر": ["house"]}, "english": [{"word": "hello", "label": "pk-hfad-1_hello.greeting"}]}
        pairs = sources.mapping_pairs(mapping, labels)
        self.assertIn(("والد", "papa"), pairs)
        self.assertIn(("گھر", "house"), pairs)
        mapped = sources.vocabulary_labels(vocab, pairs, labels)
        self.assertEqual(mapped["papa"][0], "father")
        self.assertEqual(mapped["house"][0], "home")
        self.assertEqual(mapped["what"][0], "what")           # 'What?' equals the label 'what' once punctuation goes
        self.assertIn(("hello", "hello.greeting"), pairs)      # sibling values in one record pair up
        self.assertFalse(any(token == "label" for token, _ in pairs))   # field names are not words

    def test_dictionary_clips_map_to_vocabulary_glosses(self):
        vocab = words.vocabulary_words()
        clips = [{"label": f"{self.hello.english.lower()}", "url": "https://github.com/x/pk-hfad-1_hello.mp4", "size": 10},
                 {"label": "zebra", "url": "https://github.com/x/pk-hfad-1_zebra.mp4", "size": 10}]
        found = sources.slt_candidates(words.slt_label_words([c["label"] for c in clips], vocab), clips)
        self.assertEqual(found[0].gloss, self.hello.gloss)
        self.assertEqual(found[1].gloss, "slt:zebra")
        self.assertTrue(all(c.ledger_id == "psl-slt-dictionary" and c.language == "PSL" for c in found))


class LedgerGateTests(unittest.TestCase):
    def setUp(self):
        self.ledger = load_ledger()

    def with_entries(self, *candidates):
        ledger = copy.deepcopy(self.ledger)
        ledger["assets"].extend(web_ledger.entries_to_add(candidates, ledger))
        self.assertEqual(validate_ledger(ledger), [])
        return ledger

    def test_draft_entries_are_valid_and_keep_language_purity(self):
        psl, asl, nc = candidate(), candidate(source_id="b", language="ASL"), candidate(source_id="c", licence_id="CC-BY-NC")
        ledger = self.with_entries(psl, asl, nc)
        by_id = {a["id"]: a for a in ledger["assets"]}
        self.assertTrue(by_id[web_ledger.entry_id(psl)]["allowed_uses"]["train_labels"])
        self.assertFalse(by_id[web_ledger.entry_id(asl)]["allowed_uses"]["train_labels"])
        self.assertEqual(by_id[web_ledger.entry_id(asl)]["label_scope"], "none")
        self.assertEqual(by_id[web_ledger.entry_id(nc)]["status"], "permission_needed")
        self.assertEqual(by_id[web_ledger.entry_id(nc)]["files"], [])

    def test_nothing_is_downloaded_before_its_ledger_entry_exists(self):
        clip = candidate()
        self.assertIn("no ledger entry", web_ledger.fetch_refusal(clip, self.ledger))
        self.assertIsNone(web_ledger.fetch_refusal(clip, self.with_entries(clip)))
        self.assertIn("platform terms", web_ledger.fetch_refusal(candidate(source="youtube", media_url=None), self.ledger))

    def test_retired_psl_dictionary_clips_are_refused(self):
        # Before master v4 the PSL dictionary's entry covered these clips; it is retired now, so nothing is fetched.
        clip = candidate(source="slt", ledger_id="psl-slt-dictionary")
        self.assertIn("retired", web_ledger.fetch_refusal(clip, self.ledger))
        self.assertEqual(web_ledger.entries_to_add([clip], self.ledger), [])

    def test_manifest_check_catches_labels_the_ledger_does_not_allow(self):
        asl = candidate(source_id="b", language="ASL")
        ledger = self.with_entries(asl)
        manifest = {"clips": [{"clip_id": "x", "ledger_id": web_ledger.entry_id(asl), "label_status": "single_source"},
                              {"clip_id": "y", "ledger_id": "not-in-ledger", "label_status": "pretrain_only"}]}
        problems = web_ledger.manifest_problems(manifest, ledger)
        self.assertEqual(len(problems), 2)
        self.assertIn("PSL label", problems[0])

    def test_appending_to_the_ledger_file_round_trips(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "LICENSES.yaml"
            shutil.copy(LEDGER_PATH, path)
            before = len(load_ledger(path)["assets"])
            added = web_ledger.append_entries(path, web_ledger.entries_to_add([candidate()], load_ledger(path)))
            self.assertEqual(added, 1)
            self.assertEqual(len(load_ledger(path)["assets"]), before + 1)
            self.assertEqual(validate_ledger(load_ledger(path)), [])

    def test_every_committed_manifest_is_allowed(self):
        self.assertEqual(pipeline.check_all(), [])


class QualityAndMatchTests(unittest.TestCase):
    def test_trimming_and_rejections(self):
        presence = [False] * 5 + [True] * 12 + [False] * 20 + [True] * 3
        self.assertEqual(extract.trim_to_sign(presence), [3, 18])
        self.assertEqual(extract.trim_to_sign([True] * 3 + [False] * 10), [])
        quality = extract.Quality(frames=40, hand_frames=5, pose_frames=0, cuts=4, shoulder_width_median=0.05, sharpness_median=3)
        reasons = " | ".join(extract.rejection_reasons(quality))
        for words_ in ("no hands in most frames", "no sign found", "heavy editing", "too small", "wrong framing", "blurred"):
            self.assertIn(words_, reasons)
        good = extract.Quality(frames=40, hand_frames=36, pose_frames=40, segment=[2, 30], shoulder_width_median=0.3, sharpness_median=80)
        self.assertEqual(extract.rejection_reasons(good), [])

    def test_trajectories_dedupe_and_cross_check(self):
        sequences = [s["frames"] for s in FIXTURE["sequences"] if len(s["frames"]) >= 10][:3]
        a, b, c = (match.trajectory(frames) for frames in sequences)
        self.assertAlmostEqual(match.dtw(a, a), 0.0, places=6)
        clips = [{"clip_id": "1", "video_sha256": "s", "trajectory": a}, {"clip_id": "2", "video_sha256": "s", "trajectory": b},
                 {"clip_id": "3", "video_sha256": "t", "trajectory": a + 1e-6}, {"clip_id": "4", "video_sha256": "u", "trajectory": c}]
        kept, duplicates = match.deduplicate(clips)
        self.assertEqual([k["clip_id"] for k in kept], ["1", "4"])
        self.assertEqual({d["duplicate_of"] for d in duplicates}, {"1"})
        few = match.choose_threshold([{"gloss": "g", "source_group": "x", "trajectory": a}, {"gloss": "g", "source_group": "y", "trajectory": a}])
        self.assertIsNone(few["threshold"])
        status = match.cross_check([{"clip_id": "p", "gloss": "g", "source_group": "x", "trajectory": a},
                                    {"clip_id": "q", "gloss": "g", "source_group": "y", "trajectory": a},
                                    {"clip_id": "r", "gloss": "g", "source_group": "y", "trajectory": c},
                                    {"clip_id": "s", "gloss": "h", "source_group": "x", "trajectory": c}], threshold=0.01)
        self.assertEqual(status, {"p": "accepted", "q": "accepted", "r": "rejected", "s": "single_source"})
        self.assertEqual(match.cross_check([{"clip_id": "p", "gloss": "g", "source_group": "x", "trajectory": a},
                                            {"clip_id": "q", "gloss": "g", "source_group": "y", "trajectory": a}], None),
                         {"p": "single_source", "q": "single_source"})


@unittest.skip(PSL_RETIRED)
class PipelineTests(unittest.TestCase):
    """search output -> fetch with a fake downloader and extractor -> manifest + report, in a temp folder."""

    def test_fetch_keeps_only_allowed_good_psl_clips_and_reports_numbers(self):
        frames = [s for s in FIXTURE["sequences"] if len(s["frames"]) >= 20][0]["frames"]
        good = extract.Quality(frames=len(frames), hand_frames=len(frames), two_hand_frames=len(frames), pose_frames=len(frames),
                               segment=[0, len(frames) - 1], shoulder_width_median=0.3, sharpness_median=80, width=720, height=1280)
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            slt = candidate(source="slt", source_id="pk-hfad-1_hello", ledger_id="psl-slt-dictionary", media_url="https://github.com/x.mp4", uploader="SLT")
            web_unlisted = candidate(source_id="unlisted")              # no ledger entry yet -> not downloaded
            youtube = candidate(source="youtube", source_id="yt", media_url=None, licence_id="YOUTUBE-CC-BY")
            asl = candidate(source="slt", source_id="pk-hfad-1_asl", ledger_id="psl-slt-dictionary", language="ASL", media_url="https://github.com/y.mp4")
            payload = {"version": 9, "searched_on": "2026-11-20", "problems": [], "sources_searched": ["slt", "commons", "archive"],
                       "words": {"vocabulary": 64, "dictionary_labels": 2, "total": 65, "web_searched": ["hello"]},
                       "candidates": [c.to_dict() for c in (slt, web_unlisted, youtube, asl)]}
            with mock.patch.object(pipeline, "META_DIR", tmp / "meta"), mock.patch.object(pipeline, "DATA_DIR", tmp / "data"), \
                    mock.patch.object(pipeline, "REPORTS", tmp / "reports"):
                (tmp / "meta").mkdir()
                pipeline.candidates_path(9).write_text(json.dumps(payload))
                downloaded = []

                def fake_download(url, target):
                    downloaded.append(url)
                    target.write_bytes(url.encode())
                    return f"sha-{url}"

                manifest = pipeline.run_fetch(9, extractor=lambda path: ([{}] * len(frames), frames, good), downloader=fake_download, log=lambda _: None)
                report = (tmp / "reports" / "web_learn_v9.md").read_text()
                npz_files = list((tmp / "data" / "v9").glob("*.npz"))
        self.assertEqual(sorted(downloaded), ["https://github.com/x.mp4", "https://github.com/y.mp4"])  # never YouTube, never unlisted
        self.assertEqual([c["source_id"] for c in manifest["clips"]], ["pk-hfad-1_hello"])
        self.assertEqual(manifest["clips"][0]["label_status"], "single_source")
        self.assertIn("not shown to be PSL", manifest["rejected"][0]["reasons"][-1])
        self.assertEqual(len(npz_files), 1)
        self.assertIn("Threshold not chosen", report)
        self.assertIn("| slt | 2 | 2 | 1 |", report)


class LicensedClipRecordingTests(unittest.TestCase):
    def test_licensed_clips_use_the_ledger_not_consent(self):
        from ml_engine.recording_v2 import RecordingError, base_meta, training_use_refusal, validate_meta

        meta = base_meta(source="licensed_clip", gloss_id="hello", signer_id="abc123", session_id="s1", device="web-video",
                         camera_orientation_degrees=None, input_mirrored=False, image_width=10, image_height=10, fps=None,
                         frame_count=1, consent_id="psl-slt-dictionary", consent_recorded=False, signer_id_reliable=False)
        validate_meta(meta)
        self.assertIsNone(training_use_refusal(meta))
        with self.assertRaises(RecordingError):
            validate_meta({**meta, "video_stored": True})
        with self.assertRaises(RecordingError):
            validate_meta({**meta, "consent_id": "not a ledger id!"})


if __name__ == "__main__":
    unittest.main()
