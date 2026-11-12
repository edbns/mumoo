import unittest

from modal_prepare_media_staging import opening_dark_ms, shots_from, size_from


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


if __name__ == "__main__":
    unittest.main()
