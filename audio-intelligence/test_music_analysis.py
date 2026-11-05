import json
import math
import os
from pathlib import Path
import statistics
import struct
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
import wave

from audio_source import SAMPLE_RATE, decode_clip, inspect_clip
from music_analysis import analyze, event_times, features, tempo, temporal_progression


def fixture(path, bpm, first_beat_ms=250, beats_per_bar=4):
    """Generate a drum-like instrumental and its independent programmed grid."""
    samples = [0.0] * (15 * SAMPLE_RATE)
    beats, downbeats = [], []
    if bpm is not None:
        for index in range(100):
            ms = first_beat_ms + index * 60_000 / bpm
            if ms >= 15_000:
                break
            start = round(ms * SAMPLE_RATE / 1000)
            downbeat = index % beats_per_bar == 0
            beats.append(round(ms))
            if downbeat:
                downbeats.append(round(ms))
            for i in range(min(SAMPLE_RATE // 8, len(samples) - start)):
                t = i / SAMPLE_RATE
                kick = math.sin(2 * math.pi * (56 * t + 1.8 * (1 - math.exp(-36 * t)))) * math.exp(-t * 29)
                hat = math.sin(2 * math.pi * 3020 * t) * math.exp(-t * 100)
                samples[start + i] += (0.85 if downbeat else 0.50) * kick + 0.10 * hat
    with wave.open(str(path), "wb") as wav:
        wav.setparams((1, 2, SAMPLE_RATE, 0, "NONE", "not compressed"))
        wav.writeframes(struct.pack(f"<{len(samples)}h", *(round(x * 32767) for x in samples)))
    return beats, downbeats


def score_events(predicted, expected, tolerance=70):
    remaining = set(expected)
    errors = []
    for event in predicted:
        near = min(remaining, key=lambda ref: abs(ref - event), default=None)
        if near is not None and abs(near - event) <= tolerance:
            remaining.remove(near)
            errors.append(abs(near - event))
    return {"matches": len(errors), "predicted": len(predicted), "reference": len(expected),
            "precision": len(errors) / len(predicted) if predicted else None,
            "recall": len(errors) / len(expected) if expected else None,
            "medianErrorMs": statistics.median(errors) if errors else None}


class MusicAnalysisTests(unittest.TestCase):
    def test_tempo_withholds_guess_and_exposes_octave_alternatives(self):
        self.assertIsNone(tempo([0, 500, 1000])["bpm"])
        self.assertEqual(tempo([0, 300, 1200, 1600, 2800, 4000])["status"], "unavailable")
        result = tempo(list(range(0, 15000, 500)))
        self.assertEqual(result["gridBpm"], 120)
        self.assertEqual(result["alternativesBpm"], [60, 240])
        self.assertIsNone(result["bpm"])
        self.assertEqual(result["status"], "ambiguous")
        self.assertEqual(event_times([0, 0.0001, 1.25, 15, -0.01, float("nan")]), [0, 1250])

    def test_recovers_atrevimento_with_mixed_subdivisions(self):
        beats = [120, 320, 580, 800, 1020, 1260, 1500, 1720, 1980, 2180, 2440,
                 2660, 2900, 3120, 3360, 3580, 3820, 4020, 4300, 4760, 5220,
                 5660, 6140, 6600, 7060, 7520, 7980, 8440, 8900, 9360, 9820,
                 10280, 10740, 11220, 11660, 12120, 12580, 13040, 13500, 13960,
                 14440, 14900]
        result = tempo(beats)
        self.assertEqual(result["gridBpm"], 130.43)
        self.assertEqual(result["alternativesBpm"], [65.22])
        self.assertEqual(result["status"], "ambiguous")
        self.assertIsNone(result["bpm"])

    def test_primary_tempo_and_unavailable_regressions(self):
        self.assertEqual(tempo(list(range(0, 15000, 480)))["gridBpm"], 125)
        self.assertEqual(tempo(list(range(0, 15000, 645)))["gridBpm"], 93.02)
        self.assertEqual(tempo([])["status"], "unavailable")
        unrelated = [0, 300, 640, 950, 1310, 1670, 2010, 2320, 2680, 3010, 3350, 3700]
        self.assertEqual(tempo(unrelated + list(range(4000, 15000, 460)))["status"], "unavailable")
        off_phase = list(range(200, 4000, 230)) + list(range(4000, 15000, 460))
        self.assertEqual(tempo(off_phase)["status"], "unavailable")
        fragment = [0, 310, 820, 1010, 1420, 1590, 2000, 2460, 2920, 3380, 3840,
                    4300, 4480, 4810, 5400, 5660, 6390, 6580]
        self.assertEqual(tempo(fragment)["status"], "unavailable")

    def test_temporal_segments_silence_sparse_and_abrupt_change(self):
        empty = {"low": None, "lowMid": None, "midHighMid": None, "high": None}
        bins = [{"startMs": i*1000, "endMs": (i+1)*1000, "relativeEnergy": None,
                 "bandShares": empty, "onsetCount": 0} for i in range(15)]
        result = temporal_progression(bins, [])
        self.assertEqual(result["status"], "unavailable")
        self.assertEqual(len(result["segments"]), 1)
        for i, item in enumerate(bins):
            item["relativeEnergy"] = .1 if i < 7 else .9
            item["onsetCount"] = int(i in (1, 9))
        result = temporal_progression(bins, [9000])
        self.assertGreater(len(result["segments"]), 1)
        self.assertTrue(any(abs(s["energyChange"] or 0) >= .22 for s in result["segments"][1:]))
        self.assertEqual(sum(s["beatCount"] for s in result["segments"]), 1)
        self.assertEqual(result["segments"][-1]["endMs"], 15000)

    def test_temporal_frequency_band_energy_and_zero_state(self):
        import numpy as np
        t = np.arange(15 * SAMPLE_RATE) / SAMPLE_RATE
        _, low = features((.4*np.sin(2*np.pi*100*t)).astype(np.float32), with_temporal=True)
        _, high = features((.4*np.sin(2*np.pi*6000*t)).astype(np.float32), with_temporal=True)
        self.assertGreater(low[7]["bandShares"]["low"], .9)
        self.assertGreater(high[7]["bandShares"]["high"], .9)
        _, silent = features(np.zeros_like(t,dtype=np.float32), with_temporal=True)
        self.assertTrue(all(x["relativeEnergy"] is None for x in silent))
        self.assertTrue(all(x["bandShares"]["low"] is None for x in silent))

    def test_feature_units_and_silence(self):
        import numpy as np

        t = np.arange(15 * SAMPLE_RATE) / SAMPLE_RATE
        tone = (0.5 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
        middle = features(tone)["frames"][500]
        self.assertAlmostEqual(middle["rms"], 0.5 / math.sqrt(2), delta=0.01)
        self.assertAlmostEqual(middle["centroidHz"], 440, delta=20)
        silence = features(np.zeros_like(tone))
        self.assertEqual(silence["transientsMs"], [])
        self.assertEqual(silence["frames"][500]["rms"], 0)

    @unittest.skipUnless(os.environ.get("MUMOO_FFMPEG") and os.environ.get("MUMOO_FFPROBE"), "provide FFmpeg tools")
    def test_probes_and_decodes_exact_clip(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "selected.wav"
            fixture(path, 120)
            info = inspect_clip(path, os.environ["MUMOO_FFPROBE"])
            self.assertEqual(info, {"durationMs": 15000, "codec": "pcm_s16le",
                                    "sampleRateHz": SAMPLE_RATE, "channels": 1})
            self.assertEqual(len(decode_clip(path, os.environ["MUMOO_FFMPEG"])), 15 * SAMPLE_RATE * 4)
            with wave.open(str(path), "wb") as wav:
                wav.setparams((1, 2, SAMPLE_RATE, 0, "NONE", "not compressed"))
                wav.writeframes(b"\0" * SAMPLE_RATE * 2)
            with self.assertRaisesRegex(ValueError, "15-second"):
                inspect_clip(path, os.environ["MUMOO_FFPROBE"])

    @unittest.skipUnless(os.environ.get("MUMOO_FFMPEG") and os.environ.get("MUMOO_FFPROBE"), "provide FFmpeg tools")
    def test_analysis_contract_without_lyrics_and_compressed_clip(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "selected.wav"
            fixture(path, None)
            ffmpeg, ffprobe = os.environ["MUMOO_FFMPEG"], os.environ["MUMOO_FFPROBE"]
            compressed = path.with_suffix(".mp3")
            subprocess.run([ffmpeg, "-v", "error", "-i", str(path), "-codec:a", "libmp3lame",
                            str(compressed)], check=True, capture_output=True)
            self.assertEqual(inspect_clip(compressed, ffprobe)["codec"], "mp3")
            self.assertEqual(len(decode_clip(compressed, ffmpeg)), 15 * SAMPLE_RATE * 4)
            path.with_suffix(".bad").write_bytes(b"corrupt")
            with self.assertRaises(subprocess.CalledProcessError):
                inspect_clip(path.with_suffix(".bad"), ffprobe)

            identity = {"sha256": "a" * 64}
            result = analyze(SimpleNamespace(clip=path, offset_ms=4200, checkpoint=None,
                             ffmpeg=ffmpeg, ffprobe=ffprobe, source_sha256=identity["sha256"]))
            schema_path = Path(__file__).with_name("music-analysis-v1.schema.json")
            schema = json.loads(schema_path.read_text())
            self.assertTrue(set(schema["required"]).issubset(result))
            self.assertEqual(result["temporalV1"]["status"], "unavailable")
            self.assertEqual(result["rhythm"]["status"], "unavailable")
            self.assertIsNone(result["rhythm"]["tempo"]["bpm"])
            frames = result["features"]["frames"]
            times = [frame["timeMs"] for frame in frames]
            self.assertEqual(times, sorted(set(times)))
            self.assertTrue(all(0 <= ms < 15000 and type(ms) is int for ms in times))
            for status in ("confirmed", "partial", "unavailable"):
                lyrics = {"version": 1, "status": status, "source": identity,
                          "clip": {"offsetMs": 4200, "durationMs": 15000}}
                self.assertEqual(result["source"], lyrics["source"])
                self.assertEqual({key: result["clip"][key] for key in lyrics["clip"]}, lyrics["clip"])
