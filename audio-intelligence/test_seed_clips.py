import struct
import unittest

from seed_clips import clips
from sound_print import SAMPLE_RATE


def pcm(seconds: float) -> bytes:
    samples = round(seconds * SAMPLE_RATE)
    return struct.pack(f"<{samples}h", *((i % 200) - 100 for i in range(samples)))


def data_seconds(wav: bytes) -> float:
    return struct.unpack("<I", wav[40:44])[0] / 2 / SAMPLE_RATE


class SeedClipsTests(unittest.TestCase):
    def test_a_song_gives_three_15_second_clips_a_quarter_half_and_three_quarters_in(self):
        cut = clips(pcm(60))
        self.assertEqual([start for start, _ in cut], [8000, 22000, 38000])
        self.assertTrue(all(data_seconds(wav) == 15 and len(wav) == 44 + 15 * SAMPLE_RATE * 2 for _, wav in cut))

    def test_a_short_file_is_heard_only_as_a_loop(self):
        self.assertEqual(clips(pcm(12)), [], "a song under 15 s is skipped, as before")
        [(start, wav)] = clips(pcm(12), loops=True)
        self.assertEqual((start, data_seconds(wav)), (0, 12))

    def test_a_loop_under_10_seconds_is_played_round_to_10(self):
        loop = pcm(4)
        [(start, wav)] = clips(loop, loops=True)
        self.assertEqual((start, data_seconds(wav), len(wav)), (0, 10, 44 + 10 * SAMPLE_RATE * 2))
        body = wav[44:]
        self.assertEqual(body[:len(loop)], loop)
        self.assertEqual(body[len(loop):2 * len(loop)], loop, "the loop starts again where it ends")

    def test_a_one_shot_gives_nothing(self):
        self.assertEqual(clips(pcm(1.5), loops=True), [])

    def test_a_file_just_long_enough_is_one_clip(self):
        self.assertEqual(len(clips(pcm(15))), 1)


if __name__ == "__main__":
    unittest.main()
