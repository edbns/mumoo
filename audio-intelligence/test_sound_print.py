import unittest

import numpy as np

from sound_print import CLIP_SAMPLES, SAMPLE_RATE, WINDOW, sound_print


class FakeModel:
    """Answers each window with its loudness and the clip's place, so the averaging can be checked."""

    def __init__(self):
        self.windows = None

    def embed(self, x, use_tensor):
        self.windows = x
        return np.stack([[float(np.abs(window).mean()), 1.0, 0.0] for window in x])


class SoundPrintTests(unittest.TestCase):
    def test_the_clip_is_heard_as_two_overlapping_windows_and_averaged_to_length_one(self):
        model = FakeModel()
        t = np.arange(CLIP_SAMPLES) / SAMPLE_RATE
        values = sound_print(model.embed, 0.5 * np.sin(2 * np.pi * 440 * t))
        self.assertEqual(model.windows.shape, (2, WINDOW))
        self.assertAlmostEqual(float(np.linalg.norm(values)), 1.0, places=4)
        self.assertTrue(all(isinstance(value, float) for value in values))

    def test_a_10_second_clip_is_one_window_and_a_12_second_clip_its_first_and_last_10(self):
        model = FakeModel()
        sound_print(model.embed, np.full(WINDOW, 0.5, dtype=np.float32))
        self.assertEqual(model.windows.shape, (1, WINDOW))
        clip = np.concatenate([np.full(2 * SAMPLE_RATE, 0.1), np.full(8 * SAMPLE_RATE, 0.5), np.full(2 * SAMPLE_RATE, 0.9)]).astype(np.float32)
        sound_print(model.embed, clip)
        self.assertEqual(model.windows.shape, (2, WINDOW))
        self.assertAlmostEqual(float(model.windows[0, 0]), 0.1, places=4)
        self.assertAlmostEqual(float(model.windows[1, -1]), 0.9, places=4)

    def test_audio_goes_through_16_bit_first(self):
        model = FakeModel()
        sound_print(model.embed, np.full(CLIP_SAMPLES, 0.123456, dtype=np.float32))
        self.assertAlmostEqual(float(model.windows[0, 0]), round(0.123456 * 32767) / 32767, places=7)

    def test_a_silent_clip_has_no_print(self):
        model = FakeModel()
        self.assertIsNone(sound_print(model.embed, np.zeros(CLIP_SAMPLES)))
        self.assertIsNone(model.windows, "the model is not asked")

    def test_only_10_to_15_seconds_of_48_khz_are_printed(self):
        for samples in (15 * 16_000, WINDOW - 1, CLIP_SAMPLES + 1):
            with self.assertRaises(ValueError):
                sound_print(FakeModel().embed, np.zeros(samples))


if __name__ == "__main__":
    unittest.main()
