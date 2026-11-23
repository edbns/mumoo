import unittest

from clip_wav import clip_ms, header, max_bytes


def wav(rate, ms):
    return header(rate, ms) + b"\0" * (rate * ms // 1000 * 2)


class ClipWavTests(unittest.TestCase):
    def test_a_clip_is_10_to_15_seconds_in_whole_tenths(self):
        for rate in (16_000, 32_000, 48_000):
            self.assertEqual(clip_ms(wav(rate, 15_000), rate), 15_000)
            self.assertEqual(clip_ms(wav(rate, 10_000), rate), 10_000)
            self.assertEqual(clip_ms(wav(rate, 12_300), rate), 12_300)
            self.assertEqual(len(wav(rate, 15_000)), max_bytes(rate))
            self.assertIsNone(clip_ms(wav(rate, 9_900), rate))
            self.assertIsNone(clip_ms(wav(rate, 15_100), rate))

    def test_anything_else_is_not_a_clip(self):
        self.assertIsNone(clip_ms(wav(16_000, 12_000), 48_000), "another rate")
        self.assertIsNone(clip_ms(wav(16_000, 12_000)[:-2], 16_000), "a header that does not match the length")
        self.assertIsNone(clip_ms(header(16_000, 12_050) + b"\0" * (16_000 * 12_050 // 1000 * 2), 16_000), "not whole tenths")
        self.assertIsNone(clip_ms(b"RIFF", 16_000))


if __name__ == "__main__":
    unittest.main()
