import os
from pathlib import Path
import struct
import tempfile
import unittest
import wave

from align import apply_alignment, extract, timing_errors, word_records


class AlignmentTests(unittest.TestCase):
    def test_preserves_punctuation_arabic_and_unaligned_symbols(self):
        records = word_records("Olá,  صباح! 🎵", set("oláصباح"))
        apply_alignment(records, {"word_segments": [
            {"word": "olá", "start": 0.201, "end": 0.8, "score": 0.8},
            {"word": "صباح", "start": 0.9, "end": 1.5},
        ]})
        words = [word for word, _ in records]
        self.assertEqual([word["text"] for word in words], ["Olá,", "صباح!", "🎵"])
        self.assertEqual(words[0]["startMs"], 201)
        self.assertEqual(words[0]["unsupportedCharacters"], [","])
        self.assertEqual(words[1]["reason"], "missing_acoustic_match")
        self.assertEqual(words[2]["reason"], "unsupported_characters")
        self.assertNotIn("startMs", words[1])

    def test_never_assigns_timestamps_after_output_mismatch(self):
        records = word_records("rain rain", set("rain"))
        apply_alignment(records, {"word_segments": [{"word": "rain", "start": 0, "end": 1, "score": 1}]})
        self.assertTrue(all(word["reason"] == "alignment_output_mismatch" for word, _ in records))

    def test_error_metrics_exclude_unaligned_words(self):
        words = [{"text": "one", "status": "aligned", "startMs": 110, "endMs": 280},
                 {"text": "two", "status": "unaligned"}]
        ref = [{"text": "one", "startMs": 100, "endMs": 300},
               {"text": "two", "startMs": 400, "endMs": 700}]
        self.assertEqual(timing_errors(words, ref)["endMs"], {
            "count": 1, "medianAbsoluteErrorMs": 20, "p90AbsoluteErrorMs": 20,
        })

    @unittest.skipUnless(os.environ.get("MUMOO_FFMPEG"), "set MUMOO_FFMPEG to run extraction test")
    def test_extracts_exact_nonzero_offset_and_rejects_short_range(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "fixture.wav"
            with wave.open(str(path), "wb") as fixture:
                fixture.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
                samples = bytearray(16000 * 17 * 2)
                struct.pack_into("<h", samples, 16 * 1001 * 2, 16384)
                fixture.writeframes(samples)
            ffmpeg = os.environ["MUMOO_FFMPEG"]
            result = extract(ffmpeg, path, 1001)
            self.assertEqual(len(result), 960000)
            self.assertEqual(struct.unpack_from("<f", result)[0], 0.5)
            with self.assertRaisesRegex(ValueError, "full 15 seconds"):
                extract(ffmpeg, path, 2001)


if __name__ == "__main__":
    unittest.main()
