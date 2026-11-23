"""Inspect and decode a local, already-selected analysis clip."""
import hashlib
import json
from pathlib import Path
import subprocess

# The clip is 15 s; a shorter song is sent whole, down to 10 s (`clip_wav.py`).
MIN_MS = 10_000
MAX_MS = 15_000
SAMPLE_RATE = 22_050


def sha256_file(path):
    with Path(path).open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def inspect_clip(path, ffprobe="ffprobe"):
    result = subprocess.run(
        [ffprobe, "-v", "error", "-protocol_whitelist", "file,pipe", "-select_streams", "a:0",
         "-show_entries", "stream=codec_name,sample_rate,channels:format=duration",
         "-of", "json", str(path.resolve())],
        check=True, capture_output=True, timeout=15,
    )
    report = json.loads(result.stdout)
    if not report.get("streams"):
        raise ValueError("The analysis clip has no audio stream.")
    stream = report["streams"][0]
    duration = float(report.get("format", {}).get("duration", "nan"))
    if not MIN_MS - 150 <= duration * 1000 <= MAX_MS + 150:
        raise ValueError("Submit only the selected clip, 10 to 15 seconds.")
    return {"durationMs": round(duration * 1000), "codec": stream["codec_name"],
            "sampleRateHz": int(stream["sample_rate"]), "channels": stream["channels"]}


def clip_length_ms(received):
    """The selected clip's length, in whole tenths of a second, from what `inspect_clip` measured."""
    return min(MAX_MS, max(MIN_MS, round(received["durationMs"] / 100) * 100))


def decode_clip(path, ffmpeg="ffmpeg", duration_ms=MAX_MS):
    result = subprocess.run(
        [ffmpeg, "-nostdin", "-v", "error", "-xerror", "-protocol_whitelist", "file,pipe",
         "-i", str(path.resolve()), "-map", "0:a:0", "-t", f"{duration_ms / 1000 + 0.05:.2f}", "-ac", "1",
         "-ar", str(SAMPLE_RATE), "-c:a", "pcm_f32le", "-f", "f32le", "pipe:1"],
        check=True, capture_output=True, timeout=30,
    )
    if len(result.stdout) != SAMPLE_RATE * duration_ms // 1000 * 4:
        raise ValueError(f"Decoded clip must contain exactly {duration_ms / 1000:g} seconds of audio.")
    return result.stdout
