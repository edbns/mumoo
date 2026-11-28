import unittest

from modal_prepare_media_staging import (
    BOARD_SCENES, LOOKS, READER_ASK, SEEN_WORDS, asked, boards_from, looks_from, opening_dark_ms, reading_from, seen_from, shots_from,
    size_from, strength,
)


def luma_log(levels, step_ms=100):
    """What ffmpeg's metadata=print writes for signalstats, one frame per level."""
    return "".join(
        f"[Parsed_metadata_2 @ 0x1] frame:{i}    pts:{i * 3}       pts_time:{i * step_ms / 1000}\n"
        f"[Parsed_metadata_2 @ 0x1] lavfi.signalstats.YAVG={y}\n"
        for i, y in enumerate(levels)
    )


def scene_log(*seconds):
    return "".join(f"[Parsed_showinfo_4 @ 0x2] n:{i} pts:{i} pts_time:{t} duration:1\n" for i, t in enumerate(seconds))


class DarkOpening(unittest.TestCase):
    def test_black_then_picture(self):
        self.assertEqual(opening_dark_ms(luma_log([16, 16, 16, 16, 110, 120, 118, 121, 119, 120])), 400)

    def test_fade_in_ends_when_half_as_bright_as_the_clip(self):
        self.assertEqual(opening_dark_ms(luma_log([16, 30, 45, 60, 80, 100, 120, 120, 120, 120])), 300)

    def test_a_lit_opening_and_a_dark_scene_skip_nothing(self):
        self.assertEqual(opening_dark_ms(luma_log([100] * 10)), 0)
        self.assertEqual(opening_dark_ms(luma_log([18, 19, 20, 21, 19, 20, 18, 22, 21, 20])), 0)
        self.assertEqual(opening_dark_ms(""), 0)

    def test_never_more_than_two_seconds(self):
        self.assertEqual(opening_dark_ms(luma_log([16] * 25 + [120] * 5)), 2000)


class FirstShot(unittest.TestCase):
    def test_first_shot_starts_after_the_dark(self):
        self.assertEqual(shots_from(scene_log(0, 3.0), 6000, 400), [[400, 3000], [3000, 6000]])

    def test_too_little_left_and_the_next_shot_opens(self):
        self.assertEqual(shots_from(scene_log(0, 1.2), 5000, 900), [[1200, 5000]])

    def test_one_shot_keeps_its_picture(self):
        self.assertEqual(shots_from(scene_log(0), 900, 800), [[700, 900]])
        self.assertEqual(shots_from(scene_log(0), 5000, 0), [[0, 5000]])


class Size(unittest.TestCase):
    def test_plain_and_with_side_data(self):
        self.assertEqual(size_from("1080x1920\n"), [1080, 1920])
        self.assertEqual(size_from("1080x1920x\n"), [1080, 1920], "an iPhone HDR clip carries side data")


class Seeing(unittest.TestCase):
    def test_strength_is_read_on_a_log_scale(self):
        self.assertEqual(strength(0.001), 0)
        self.assertEqual(strength(0.3), 1)
        self.assertEqual(strength(0.9), 1)
        self.assertAlmostEqual(strength(0.03), 0.5, places=2)

    def test_a_look_is_its_best_phrasing_and_unseen_looks_are_left_out(self):
        odds = {phrase: 0.001 for phrases in LOOKS.values() for phrase in phrases}
        odds["a sports car"] = 0.3
        odds["a car"] = 0.01
        self.assertEqual(looks_from(odds), {"cars": 1.0})

    def test_suggestions_are_the_clear_words_most_likely_first(self):
        odds = {word: 0.001 for word in SEEN_WORDS}
        odds.update({"heels": 0.5, "designer bag": 0.05, "car": 0.019})
        self.assertEqual(seen_from(odds), ["heels", "designer bag"])

    def test_a_board_is_its_best_phrase_and_unlike_boards_are_left_out(self):
        odds = {phrase: 0.001 for _, phrases in BOARD_SCENES.values() for phrase in phrases}
        odds["a beach at sunset"] = 0.3
        self.assertEqual(boards_from(odds), {"sunset-coast": 1.0})

    def test_every_phrase_is_asked_once_by_its_own_key(self):
        keys = asked()
        self.assertEqual(keys["__board:a beach at sunset"], "a beach at sunset")
        self.assertEqual(keys["__car"], "car")
        self.assertEqual(keys["a sports car"], "a sports car")


class Reading(unittest.TestCase):
    def test_the_answer_is_read_from_its_json_even_with_words_around_it(self):
        answer = 'Sure! {"description": "A woman  dancing under a bridge on a beach at sunset.", "boards": ["sunset-coast"], "sure": true}'
        self.assertEqual(reading_from(answer), {"description": "A woman dancing under a bridge on a beach at sunset.", "boards": ["sunset-coast"], "also": [], "sure": True})

    def test_only_known_boards_at_most_two_and_sure_only_when_said(self):
        answer = '{"description": "A pole dancer in red light.", "boards": ["intimate-velvet", "nightclub", "intimate-velvet", "rave-warehouse", "luxury-flex"]}'
        self.assertEqual(reading_from(answer), {"description": "A pole dancer in red light.", "boards": ["intimate-velvet", "rave-warehouse"], "also": [], "sure": False})

    def test_also_is_other_known_boards_at_most_three(self):
        answer = '{"description": "A neon arcade.", "boards": ["night-neon"], "also": ["night-neon", "intimate-velvet", "disco", "intimate-velvet", "rave-warehouse", "main-stage", "horizon-soul", "pop-studio"]}'
        self.assertEqual(reading_from(answer)["also"], ["intimate-velvet", "rave-warehouse", "horizon-soul"])

    def test_nothing_usable_is_none(self):
        self.assertIsNone(reading_from("I cannot tell."))
        self.assertIsNone(reading_from('{"boards": "rave-warehouse"'))
        self.assertIsNone(reading_from('{"boards": ["nightclub"]}'))

    def test_the_reader_is_told_every_board(self):
        for board, (scene, _) in BOARD_SCENES.items():
            self.assertIn(f"- {board}: {scene}", READER_ASK)


if __name__ == "__main__":
    unittest.main()
