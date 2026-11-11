import unittest

import numpy as np

from voice_detection import decide


def stretches(*female):
    return [{"atSeconds": index * 2.0, "female": value} for index, value in enumerate(female)]


VOICED = np.full(200, 220.0)  # four seconds of followed pitch


class DecideTests(unittest.TestCase):
    """The windows below are what the timbre reader returned for real clips (a pop man, two old-time men, a woman, a pair)."""

    def test_a_woman_is_female(self):
        read = decide(VOICED, 0.44, stretches(0.999, 0.999, 0.999, 0.999, 0.999, 0.999))
        self.assertEqual((read["value"], read["reason"]), ("female", None))

    def test_a_man_with_one_stray_stretch_is_male(self):
        read = decide(VOICED, 0.34, stretches(0.001, 0.001, 0.001, 0.004, 0.741, 0.999))
        self.assertEqual(read["value"], "male")

    def test_two_men_taking_turns_are_male(self):
        read = decide(VOICED, 0.72, stretches(0.984, 0.001, 0.001, 0.001))
        self.assertEqual(read["value"], "male")

    def test_voices_that_strongly_disagree_are_both(self):
        read = decide(VOICED, 0.67, stretches(0.99, 0.009, 0.892, 0.999, 0.001, 0.292))
        self.assertEqual(read["value"], "both")

    def test_a_split_without_strong_voices_is_not_guessed(self):
        read = decide(VOICED, 0.5, stretches(0.6, 0.4, 0.55, 0.45))
        self.assertEqual((read["value"], read["reason"]), (None, "voices_disagree"))

    def test_one_strong_stretch_each_side_is_not_enough_for_both(self):
        read = decide(VOICED, 0.5, stretches(0.99, 0.01, 0.6, 0.4))
        self.assertIsNone(read["value"])

    def test_an_instrumental_has_no_singer(self):
        read = decide(np.array([]), 0.001, [])
        self.assertEqual((read["value"], read["reason"]), (None, "no_singing"))

    def test_a_quiet_voice_stem_is_no_singer_whatever_the_reader_says(self):
        read = decide(VOICED, 0.004, stretches(0.999, 0.999, 0.999))
        self.assertEqual((read["value"], read["reason"]), (None, "no_singing"))

    def test_under_two_seconds_of_voice_is_no_singer(self):
        read = decide(np.full(80, 220.0), 0.5, stretches(0.999, 0.999))
        self.assertEqual((read["value"], read["reason"]), (None, "no_singing"))

    def test_one_stretch_is_too_little_to_vote(self):
        read = decide(VOICED, 0.5, stretches(0.999))
        self.assertEqual((read["value"], read["reason"]), (None, "too_little_singing"))


if __name__ == "__main__":
    unittest.main()
