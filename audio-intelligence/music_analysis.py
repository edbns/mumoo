"""Analyze exactly 15 seconds of the original mix with Beat This! and librosa."""
import argparse
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
    if not 240 <= median <= 2000:
        return result
    support = sum(abs(interval - median) <= median * 0.12 for interval in intervals) / len(intervals)
    result["supportFraction"] = round(support, 3)
    if support < 0.75:
        return result
    grid = 60_000 / median
    alternatives = [round(rate, 2) for rate in (grid / 2, grid * 2) if 45 <= rate <= 240]
    return dict(result, status="ambiguous" if alternatives else "estimated",
                bpm=None if alternatives else round(grid, 2), gridBpm=round(grid, 2),
                alternativesBpm=alternatives)


def features(audio):
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
    return {"sampleRateHz": SAMPLE_RATE, "windowSamples": WINDOW, "hopSamples": HOP,
            "frameTime": "center", "frames": frames,
            "transientsMs": event_times(peaks * HOP / SAMPLE_RATE)}


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


def analyze(args):
    import numpy as np

    start = time.perf_counter()
    cpu = time.process_time()
    child_start = resource.getrusage(resource.RUSAGE_CHILDREN)
    clip_properties = inspect_clip(args.clip, args.ffprobe)
    audio = np.frombuffer(decode_clip(args.clip, args.ffmpeg), dtype="<f4").copy()
    decode_seconds = time.perf_counter() - start
    feature_result = features(audio)
    feature_seconds = time.perf_counter() - start - decode_seconds
    beats, downbeats = [], []
    status = "unavailable"
    reason = "no_rhythmic_evidence"
    model_info = None
    load_seconds = None
    inference_seconds = []
    if feature_result["transientsMs"] and args.checkpoint:
        load_start = time.perf_counter()
        model, model_info = load_beat_model(args.checkpoint, args.threads)
        load_seconds = round(time.perf_counter() - load_start, 6)
        for _ in range(args.runs):
            inference_start = time.perf_counter()
            beat_seconds, downbeat_seconds = model(audio, SAMPLE_RATE)
            inference_seconds.append(round(time.perf_counter() - inference_start, 6))
        beats, downbeats = event_times(beat_seconds), event_times(downbeat_seconds)
        status, reason = ("detected", None) if beats else ("unavailable", "no_beats_detected")
    elif feature_result["transientsMs"]:
        reason = "checkpoint_not_provided"

    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    children = resource.getrusage(resource.RUSAGE_CHILDREN)
    return {
        "version": 1, "method": "beat_this_librosa",
        "source": {"sha256": args.source_sha256} if args.source_sha256 else None,
        "clip": {"offsetMs": args.offset_ms, "durationMs": DURATION_MS,
                 "sha256": sha256_file(args.clip), "receivedAudio": clip_properties},
        "rhythm": {"status": status, "reason": reason, "beatsMs": beats,
                   "downbeatsMs": downbeats, "tempo": tempo(beats)},
        "features": feature_result,
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
