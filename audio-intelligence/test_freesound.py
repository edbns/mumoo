import unittest

import numpy as np

import freesound


def sound(**over):
    return {"id": 1, "name": "punk rock groove.wav", "username": "someone", "license": "https://creativecommons.org/publicdomain/zero/1.0/",
            "previews": {"preview-hq-mp3": "https://cdn.freesound.org/1.mp3"}, **over}


class FreesoundTests(unittest.TestCase):
    def test_only_cc0_music_with_a_preview_is_tried(self):
        self.assertTrue(freesound.usable(sound()))
        self.assertTrue(freesound.usable(sound(license="http://creativecommons.org/publicdomain/zero/1.0/")))
        self.assertFalse(freesound.usable(sound(license="http://creativecommons.org/licenses/by/4.0/")))
        self.assertFalse(freesound.usable(sound(license="http://creativecommons.org/licenses/by-nc/4.0/")))
        for name in ["looperman-l-123-uk-drill-drums.wav", "Emergency Siren", "[SFX] eerie glow", "forest ambience"]:
            self.assertFalse(freesound.usable(sound(name=name)), name)
        self.assertFalse(freesound.usable(sound(previews={})))

    def test_a_sound_is_kept_only_when_it_is_heard_as_its_style(self):
        anchors = [{"id": "punk", "vector": [1.0, 0, 0, 0]}, {"id": "rock", "vector": [0, 1.0, 0, 0]},
                   {"id": "metal", "vector": [0, 0, 1.0, 0]}, {"id": "jazz", "vector": [0, 0, 0, 1.0]}]
        punkish = [[0.9, 0.3, 0.1, 0.0], [0.8, 0.4, 0.2, 0.0]]
        self.assertTrue(freesound.hears_as(punkish, "punk", anchors))
        self.assertTrue(freesound.hears_as(punkish, "metal", anchors), "third closest is near enough")
        self.assertFalse(freesound.hears_as(punkish, "jazz", anchors))

    def test_its_licence_names_the_sound_and_uploader(self):
        self.assertEqual(freesound.attribution(sound(id=42)), "CC0 1.0, Freesound sound 42 by someone")

    def test_the_real_anchors_are_read(self):
        lanes = freesound.lanes()
        self.assertIn("lo-fi", [lane["id"] for lane in lanes])
        self.assertAlmostEqual(float(np.linalg.norm(lanes[0]["vector"])), 1.0, places=3)


if __name__ == "__main__":
    unittest.main()
