"""Analyze exactly 15 seconds of the original mix with Beat This! and librosa."""
import argparse
from contextlib import contextmanager
from functools import lru_cache
from importlib.metadata import version
import json
import math
from pathlib import Path
import re
import resource
import statistics
import subprocess
import sys
import time

from audio_source import DURATION_MS, SAMPLE_RATE, decode_clip, inspect_clip, sha256_file

WINDOW = 1024
HOP = 220
CHECKPOINT_SHA256 = "8c328b45f59d8dd3dff219253ff6a8d6482be57d0133a29140e2febbf8eb8331"


def event_times(seconds):
    return sorted({round(float(t) * 1000) for t in seconds
                   if math.isfinite(t) and 0 <= round(float(t) * 1000) < DURATION_MS})


def tempo(beats):
    intervals = [end - start for start, end in zip(beats, beats[1:])]
    result = {"status": "unavailable", "bpm": None, "gridBpm": None,
              "alternativesBpm": [], "intervalCount": len(intervals), "supportFraction": None}
    if len(intervals) < 4:
        return result
    median = statistics.median(intervals)
    if 240 <= median <= 2000:
        support = sum(abs(interval - median) <= median * 0.12 for interval in intervals) / len(intervals)
        result["supportFraction"] = round(support, 3)
        if support >= 0.75:
            return tempo_result(result, median)
    stable = stable_beat_period(beats, intervals)
    return tempo_result(result, stable) if stable is not None else result


def stable_beat_period(beats, intervals):
    """Recover a grid only when a sustained run explains the surrounding markers."""
    longest = 0
    period = None
    for start, seed in enumerate(intervals):
        if not 240 <= seed <= 2000:
            continue
        end = start + 1
        while end < len(intervals) and abs(intervals[end] - seed) <= seed * 0.12:
            end += 1
        span = beats[end] - beats[start]
        if end - start < 8 or span < 4000 or span <= longest:
            continue

        candidate = statistics.median(intervals[start:end])
        if not 240 <= candidate <= 2000 or any(
            abs(interval - candidate) > candidate * 0.12 for interval in intervals[start:end]
        ):
            continue

        if any(abs(beat - beats[start] - index * candidate) > candidate * 0.12
               for index, beat in enumerate(beats[start:end + 1])):
            continue

        # Check both phase and spacing outside the run. Half-beats and skipped
        # beats can fit the grid, while an unrelated passage should fail.
        half = candidate / 2
        outside = beats[:start] + beats[end + 1:]
        outside_intervals = intervals[:start] + intervals[end:]
        phase_matches = sum(abs((beat - beats[start] + half / 2) % half - half / 2)
                            <= candidate * 0.16 for beat in outside)
        spacing_matches = sum(
            1 <= round(interval / half) <= 4
            and abs(interval - round(interval / half) * half) <= half * 0.16
            for interval in outside_intervals
        )
        if phase_matches >= 0.85 * len(outside) and spacing_matches >= 0.85 * len(outside_intervals):
            longest, period = span, candidate
    return period


def tempo_result(result, median):
    grid = 60_000 / median
    alternatives = [round(rate, 2) for rate in (grid / 2, grid * 2) if 45 <= rate <= 240]
    return dict(result, status="ambiguous" if alternatives else "estimated",
                bpm=None if alternatives else round(grid, 2), gridBpm=round(grid, 2),
                alternativesBpm=alternatives)


def features(audio, with_temporal=False):
    import librosa
    import numpy as np

    magnitude = np.abs(librosa.stft(audio, n_fft=WINDOW, hop_length=HOP, center=True))
    mel = librosa.feature.melspectrogram(S=magnitude ** 2, sr=SAMPLE_RATE, n_fft=WINDOW)
    onset = librosa.onset.onset_strength(S=librosa.power_to_db(mel), sr=SAMPLE_RATE,
                                        hop_length=HOP, n_fft=WINDOW)
    peaks = librosa.onset.onset_detect(onset_envelope=onset, sr=SAMPLE_RATE, hop_length=HOP)
    values = [
        librosa.feature.rms(y=audio, frame_length=WINDOW, hop_length=HOP)[0],
        onset,
        librosa.feature.spectral_centroid(S=magnitude, sr=SAMPLE_RATE, n_fft=WINDOW)[0],
        librosa.feature.spectral_bandwidth(S=magnitude, sr=SAMPLE_RATE, n_fft=WINDOW)[0],
        librosa.feature.spectral_rolloff(S=magnitude, sr=SAMPLE_RATE, n_fft=WINDOW)[0],
    ]
    names = ("rms", "onsetStrength", "centroidHz", "bandwidthHz", "rolloffHz")
    frames = []
    for index, sample in enumerate(zip(*values, strict=True)):
        ms = round(index * HOP * 1000 / SAMPLE_RATE)
        if ms < DURATION_MS:
            frames.append({"timeMs": ms, **dict(zip(names, (round(float(v), 6) for v in sample), strict=True))})
    result = {"sampleRateHz": SAMPLE_RATE, "windowSamples": WINDOW, "hopSamples": HOP,
              "frameTime": "center", "frames": frames,
              "transientsMs": event_times(peaks * HOP / SAMPLE_RATE)}
    if not with_temporal:
        return result
    return result, temporal_bins(magnitude, frames, result["transientsMs"]), {"tonalityV1": tonality(audio), "timbreV1": timbre(magnitude)}


KEYS = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
# Krumhansl-Kessler key profiles (major, minor), tonic first.
MAJOR_PROFILE = (6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88)
MINOR_PROFILE = (6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17)
# Below this the two best keys (one major, one minor) explain the notes about equally well.
MODE_MARGIN = 0.03


def tonality(audio):
    """The clip's key and whether it leans major or minor, from its average chroma (Krumhansl-Schmuckler)."""
    import librosa
    import numpy as np

    if not np.any(np.abs(audio) > 1e-4):
        return {"version": 1, "status": "unavailable", "key": None, "mode": None, "correlation": None, "majorMinorMargin": None}
    chroma = librosa.feature.chroma_cqt(y=audio, sr=SAMPLE_RATE, hop_length=512, bins_per_octave=36).mean(axis=1)
    scores = {}
    for mode, profile in (("major", MAJOR_PROFILE), ("minor", MINOR_PROFILE)):
        for tonic in range(12):
            scores[(mode, tonic)] = float(np.corrcoef(chroma, np.roll(profile, tonic))[0, 1])
    (mode, tonic), best = max(scores.items(), key=lambda entry: entry[1])
    margin = max(v for (m, _), v in scores.items() if m == "major") - max(v for (m, _), v in scores.items() if m == "minor")
    return {"version": 1, "status": "available", "key": KEYS[tonic],
            "mode": mode if abs(margin) >= MODE_MARGIN else "ambiguous",
            "correlation": round(best, 4), "majorMinorMargin": round(margin, 4)}


def timbre(magnitude):
    """How noise-like the mix is on average: spectral flatness, 0 pure tones … 1 white noise."""
    import librosa
    import numpy as np

    flatness = librosa.feature.spectral_flatness(S=magnitude)[0]
    return {"version": 1, "flatnessMean": round(float(np.mean(flatness)), 6), "flatnessMedian": round(float(np.median(flatness)), 6)}


def temporal_bins(magnitude, frames, onsets):
    """One-second measured mix spectral shares and clip-relative RMS, not stems."""
    import numpy as np
    power = magnitude ** 2
    freq = np.fft.rfftfreq(WINDOW, 1 / SAMPLE_RATE)
    ranges = {"low": (20, 250), "lowMid": (250, 500), "midHighMid": (500, 4000), "high": (4000, 8000)}
    times = np.arange(power.shape[1]) * HOP / SAMPLE_RATE
    bins = []
    for i in range(15):
        mask = (times >= i) & (times < i + 1)
        totals = {key: float(power[(freq >= lo) & (freq < hi)][:, mask].sum()) for key, (lo, hi) in ranges.items()}
        total = sum(totals.values())
        rms = [f["rms"] for f in frames if i * 1000 <= f["timeMs"] < (i + 1) * 1000]
        bins.append({"startMs": i * 1000, "endMs": (i + 1) * 1000,
                     "rmsMean": sum(rms) / len(rms) if rms else 0.0,
                     "bandShares": {key: round(value / total, 6) if total > 1e-12 else None for key, value in totals.items()},
                     "onsetCount": sum(i * 1000 <= t < (i + 1) * 1000 for t in onsets)})
    peak = max(b["rmsMean"] for b in bins)
    for b in bins:
        b["relativeEnergy"] = round(b.pop("rmsMean") / peak, 6) if peak > 1e-6 else None
    return bins


def temporal_progression(bins, beats):
    """Segment only at sustained relative-energy changes; no inferred drop/build labels."""
    points = []
    for i in range(2, 14):
        previous = [b["relativeEnergy"] for b in bins[i-2:i]]
        following = [b["relativeEnergy"] for b in bins[i:i+2]]
        if None in previous + following: continue
        difference = sum(following) / 2 - sum(previous) / 2
        if abs(difference) >= .22: points.append((abs(difference), i))
    chosen = []
    for _, index in sorted(points, reverse=True):
        if index >= 2 and 15-index >= 2 and all(abs(index-other) >= 2 for other in chosen): chosen.append(index)
        if len(chosen) == 5: break
    edges = [0] + sorted(chosen) + [15]
    segments = []
    for start, end in zip(edges, edges[1:]):
        section = bins[start:end]
        def avg(key):
            vals = [b[key] for b in section if b[key] is not None]
            return round(sum(vals) / len(vals), 6) if vals else None
        bands = {}
        for key in ("low", "lowMid", "midHighMid", "high"):
            vals = [b["bandShares"][key] for b in section if b["bandShares"][key] is not None]
            bands[key] = round(sum(vals) / len(vals), 6) if vals else None
        energy = avg("relativeEnergy")
        prev = segments[-1]["relativeEnergy"] if segments else None
        segments.append({"startMs": start*1000, "endMs": end*1000, "relativeEnergy": energy,
                         "bandShares": bands, "onsetsPerSecond": round(sum(b["onsetCount"] for b in section)/(end-start), 6),
                         "beatCount": sum(start*1000 <= t < end*1000 for t in beats),
                         "energyChange": round(energy-prev, 6) if energy is not None and prev is not None else None})
    return {"version": 1, "status": "available" if any(b["relativeEnergy"] is not None for b in bins) else "unavailable",
            "durationMs": DURATION_MS, "frequencyBandsHz": {"low": [20,250], "lowMid": [250,500], "midHighMid": [500,4000], "high": [4000,8000]},
            "energyNormalization": "rms divided by peak one-second rms; null for silence",
            "bandNormalization": "fraction of STFT squared magnitude between 20 and 8000 Hz; null for silence",
            "changeThreshold": .22, "bins": bins, "segments": segments}



@lru_cache(maxsize=1)
def load_beat_model(checkpoint, threads):
    import torch
    from beat_this.inference import Audio2Beats

    if not checkpoint.is_file():
        raise ValueError("Provide a local reviewed Beat This! checkpoint.")
    checkpoint_hash = sha256_file(checkpoint)
    if checkpoint_hash != CHECKPOINT_SHA256:
        raise ValueError("Checkpoint does not match the reviewed CPJKU final0 artifact.")
    torch.set_num_threads(threads)
    return Audio2Beats(checkpoint_path=str(checkpoint), device="cpu", dbn=False), {
        "name": "Beat This! final0", "version": version("beat-this"), "checkpointSha256": checkpoint_hash,
    }


@contextmanager
def stage(trace, name):
    started = time.perf_counter()
    if trace:
        trace(name, "start")
    try:
        yield
    except Exception:
        if trace:
            trace(name, "error", started)
        raise
    else:
        if trace:
            trace(name, "end", started)


def analyze(args, trace=None):
    with stage(trace, "numpy_import"):
        import numpy as np

    start = time.perf_counter()
    cpu = time.process_time()
    child_start = resource.getrusage(resource.RUSAGE_CHILDREN)
    with stage(trace, "audio_decode"):
        clip_properties = inspect_clip(args.clip, args.ffprobe)
        audio = np.frombuffer(decode_clip(args.clip, args.ffmpeg), dtype="<f4").copy()
    decode_seconds = time.perf_counter() - start
    with stage(trace, "librosa_features"):
        feature_result, bins, summaries = features(audio, with_temporal=True)
    feature_seconds = time.perf_counter() - start - decode_seconds
    beats, downbeats = [], []
    status = "unavailable"
    reason = "no_rhythmic_evidence"
    model_info = None
    load_seconds = None
    inference_seconds = []
    if feature_result["transientsMs"] and args.checkpoint:
        load_start = time.perf_counter()
        with stage(trace, "beat_model_load"):
            model, model_info = load_beat_model(args.checkpoint, args.threads)
        load_seconds = round(time.perf_counter() - load_start, 6)
        for _ in range(args.runs):
            inference_start = time.perf_counter()
            with stage(trace, "beat_inference"):
                beat_seconds, downbeat_seconds = model(audio, SAMPLE_RATE)
            inference_seconds.append(round(time.perf_counter() - inference_start, 6))
        beats, downbeats = event_times(beat_seconds), event_times(downbeat_seconds)
        status, reason = ("detected", None) if beats else ("unavailable", "no_beats_detected")
    elif feature_result["transientsMs"]:
        reason = "checkpoint_not_provided"

    with stage(trace, "bpm"):
        tempo_result = tempo(beats)
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    children = resource.getrusage(resource.RUSAGE_CHILDREN)
    return {
        "version": 1, "method": "beat_this_librosa",
        "source": {"sha256": args.source_sha256} if args.source_sha256 else None,
        "clip": {"offsetMs": args.offset_ms, "durationMs": DURATION_MS,
                 "sha256": sha256_file(args.clip), "receivedAudio": clip_properties},
        "rhythm": {"status": status, "reason": reason, "beatsMs": beats,
                   "downbeatsMs": downbeats, "tempo": tempo_result},
        "features": feature_result,
        "temporalV1": temporal_progression(bins, beats),
        **summaries,
        "provenance": {"beatModel": model_info, "librosaVersion": version("librosa"), "contextMs": 0},
        "metrics": {"wallSeconds": round(time.perf_counter() - start, 6),
                    "pythonCpuSeconds": round(time.process_time() - cpu, 6),
                    "childCpuSeconds": round(children.ru_utime + children.ru_stime - child_start.ru_utime - child_start.ru_stime, 6),
                    "peakPythonRssBytes": rss if sys.platform == "darwin" else rss * 1024,
                    "decodeSeconds": round(decode_seconds, 6), "featureSeconds": round(feature_seconds, 6),
                    "beatLoadSeconds": load_seconds, "beatInferenceSeconds": inference_seconds},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("clip", type=Path, help="An already-selected 15-second audio file")
    parser.add_argument("--source-sha256")
    parser.add_argument("--offset-ms", required=True, type=int)
    parser.add_argument("--checkpoint", type=Path)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--ffprobe", default="ffprobe")
    parser.add_argument("--threads", default=2, type=int)
    parser.add_argument("--runs", default=1, type=int)
    args = parser.parse_args()
    if args.offset_ms < 0 or not 1 <= args.threads <= 16 or not 1 <= args.runs <= 10:
        parser.error("Provide a nonnegative offset, 1–16 threads and 1–10 runs.")
    if args.source_sha256 and not re.fullmatch("[0-9a-f]{64}", args.source_sha256):
        parser.error("Source identity must be a lowercase SHA-256 digest.")
    try:
        print(json.dumps(analyze(args), allow_nan=False))
    except (OSError, ValueError, ImportError, RuntimeError, subprocess.SubprocessError) as error:
        parser.exit(1, f"Music analysis failed: {error}\n")


if __name__ == "__main__":
    main()
