"""Inspect and decode a local, already-selected analysis clip."""
import hashlib
import json
from pathlib import Path
import subprocess

DURATION_MS = 15_000
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
    if not 14.85 <= duration <= 15.15:
        raise ValueError("Submit only the selected 15-second clip.")
    return {"durationMs": round(duration * 1000), "codec": stream["codec_name"],
            "sampleRateHz": int(stream["sample_rate"]), "channels": stream["channels"]}


def decode_clip(path, ffmpeg="ffmpeg"):
    result = subprocess.run(
        [ffmpeg, "-nostdin", "-v", "error", "-xerror", "-protocol_whitelist", "file,pipe",
         "-i", str(path.resolve()), "-map", "0:a:0", "-t", "15.05", "-ac", "1",
         "-ar", str(SAMPLE_RATE), "-c:a", "pcm_f32le", "-f", "f32le", "pipe:1"],
        check=True, capture_output=True, timeout=30,
    )
    if len(result.stdout) != SAMPLE_RATE * 15 * 4:
        raise ValueError("Decoded clip must contain exactly 15 seconds of audio.")
    return result.stdout
