"""Offline FFmpeg → WhisperX alignment of artist-supplied lyrics."""

import argparse
from contextlib import redirect_stdout
import hashlib
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
import unicodedata

DURATION_MS = 15_000
SAMPLE_RATE = 16_000
MODELS = {
    "en": ("facebook/wav2vec2-base-960h", "22aad52d435eb6dbaf354bdad9b0da84ce7d6156"),
    "pt": ("jonatasgrosman/wav2vec2-large-xlsr-53-portuguese", "634ac655299bcdc46c83bc01da9bab52d2987e4f"),
    "ar": ("jonatasgrosman/wav2vec2-large-xlsr-53-arabic", "af46c2d8531b8dcbb5e23b952f739b372c2e5d2d"),
}


def extract(ffmpeg, source, offset_ms):
    if offset_ms <= 0:
        raise ValueError("Clip offset must be a positive integer in milliseconds.")
    result = subprocess.run(
        [ffmpeg, "-nostdin", "-v", "error", "-xerror", "-i", str(source),
         "-ss", f"{offset_ms // 1000}.{offset_ms % 1000:03d}", "-t", "15",
         "-map", "0:a:0", "-ac", "1", "-ar", str(SAMPLE_RATE),
         "-c:a", "pcm_f32le", "-f", "f32le", "pipe:1"],
        capture_output=True, check=True, timeout=120,
    )
    if len(result.stdout) != SAMPLE_RATE * 15 * 4:
        raise ValueError("Source does not contain a full 15 seconds at this offset.")
    return result.stdout


def word_records(lyrics, dictionary):
    words = []
    for match in re.finditer(r"\S+", lyrics):
        original = match.group()
        normalized = unicodedata.normalize("NFC", original).lower()
        unsupported = sorted(set(char for char in normalized if char not in dictionary))
        spoken = "".join(char for char in normalized if char in dictionary)
        word = {"text": original, "textStart": match.start(), "textEnd": match.end(),
                "unsupportedCharacters": unsupported, "status": "unaligned"}
        if not spoken or any(not unicodedata.category(char).startswith("P") for char in unsupported):
            word["reason"] = "unsupported_characters"
            spoken = ""
        words.append((word, spoken))
    return words


def apply_alignment(records, result):
    candidates = result["word_segments"]
    expected = [spoken for _, spoken in records if spoken]
    # The output is derived from the supplied words. A structural mismatch
    # would make positional association unsafe, especially for repeated words.
    if [word["word"] for word in candidates] != expected:
        for word, spoken in records:
            if spoken:
                word["reason"] = "alignment_output_mismatch"
        return
    aligned = iter(candidates)
    previous_end = 0
    for word, spoken in records:
        if not spoken:
            continue
        candidate = next(aligned)
        values = [candidate.get(key) for key in ("start", "end", "score")]
        if any(not isinstance(value, (int, float)) or not math.isfinite(value) for value in values):
            word["reason"] = "missing_acoustic_match"
            continue
        start, end, score = values
        start_ms, end_ms = round(start * 1000), round(end * 1000)
        if score <= 0 or not previous_end <= start_ms < end_ms <= DURATION_MS:
            word["reason"] = "invalid_acoustic_match"
            continue
        word.update(status="aligned", startMs=start_ms, endMs=end_ms, alignmentScore=score)
        previous_end = end_ms


def timing_errors(words, reference):
    if not isinstance(reference, list) or [item["text"] for item in reference] != [item["text"] for item in words]:
        raise ValueError("Reference words must match the supplied lyric tokens exactly.")
    for item in reference:
        if not all(type(item[key]) is int for key in ("startMs", "endMs")) or not (
            0 <= item["startMs"] < item["endMs"] <= DURATION_MS
        ):
            raise ValueError("Reference boundaries must be integer milliseconds inside the clip.")
    errors = {}
    for boundary in ("startMs", "endMs"):
        distances = sorted(abs(word[boundary] - ref[boundary])
                           for word, ref in zip(words, reference) if word["status"] == "aligned")
        errors[boundary] = {
            "count": len(distances),
            "medianAbsoluteErrorMs": statistics.median(distances) if distances else None,
            "p90AbsoluteErrorMs": distances[math.ceil(0.9 * len(distances)) - 1] if distances else None,
        }
    return errors


def peak_rss_bytes():
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return rss if sys.platform == "darwin" else rss * 1024


def run(args):
    started = time.perf_counter()
    lyrics = args.lyrics.read_bytes().decode("utf-8")
    if not lyrics.strip() or len(lyrics) > 6000:
        raise ValueError("Supply a nonempty UTF-8 lyric file with at most 6000 characters.")
    with args.source.open("rb") as source:
        sha256 = hashlib.file_digest(source, "sha256").hexdigest()
    samples = extract(args.ffmpeg, args.source, args.offset_ms)
    identity = MODELS.get(args.language)
    document = {
        "version": 1, "method": "whisperx_supplied_lyrics",
        "source": {"sha256": sha256, "filename": args.source.name},
        "clip": {"offsetMs": args.offset_ms, "durationMs": DURATION_MS, "analysisSampleRate": SAMPLE_RATE},
        "language": args.language, "lyrics": lyrics, "status": "unavailable",
    }
    if identity:
        document["model"] = {"id": identity[0], "revision": identity[1], "license": "Apache-2.0"}
    weights = args.model_dir / "model.safetensors" if args.model_dir else None
    if not identity or not weights or not weights.is_file():
        reason = "unsupported_language" if not identity else "local_safetensors_model_missing"
        document["words"] = [{"text": token.group(), "textStart": token.start(), "textEnd": token.end(),
                              "status": "unaligned", "reason": reason}
                             for token in re.finditer(r"\S+", lyrics)]
        document["reason"] = reason
        return document

    import numpy as np
    import torch
    from whisperx.alignment import align
    from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

    torch.set_num_threads(args.threads)
    processor = Wav2Vec2Processor.from_pretrained(args.model_dir, local_files_only=True)
    model = Wav2Vec2ForCTC.from_pretrained(args.model_dir, local_files_only=True, use_safetensors=True)
    model.eval()
    dictionary = {token.lower(): index for token, index in processor.tokenizer.get_vocab().items()}
    records = word_records(lyrics, dictionary)
    transcript = " ".join(spoken for _, spoken in records if spoken)
    audio = np.frombuffer(samples, dtype="<f4").copy()
    with weights.open("rb") as checkpoint:
        checkpoint_hash = hashlib.file_digest(checkpoint, "sha256").hexdigest()
    document["model"].update(
        whisperxVersion=version("whisperx"), checkpointBytes=weights.stat().st_size,
        checkpointSha256=checkpoint_hash,
    )
    timings = []
    cold_seconds = None
    for _ in range(args.runs):
        begin = time.perf_counter()
        records = word_records(lyrics, dictionary)
        if transcript:
            with redirect_stdout(sys.stderr):
                result = align(
                    [{"start": 0.0, "end": 15.0, "text": transcript}],
                    model, {"language": args.language, "dictionary": dictionary, "type": "huggingface"},
                    audio, "cpu", interpolate_method="ignore", return_char_alignments=False,
                )
            apply_alignment(records, result)
        timings.append(round(time.perf_counter() - begin, 6))
        if cold_seconds is None:
            cold_seconds = round(time.perf_counter() - started, 6)
    words = [word for word, _ in records]
    count = sum(word["status"] == "aligned" for word in words)
    document.update(
        words=words, status="confirmed" if count == len(words) else "partial" if count else "unavailable",
        coverage=count / len(words), metrics={
            "coldSeconds": cold_seconds,
            "inferenceSeconds": timings, "peakRssBytes": peak_rss_bytes(),
        },
    )
    if args.reference:
        document["metrics"]["timingError"] = timing_errors(words, json.loads(args.reference.read_text(encoding="utf-8")))
    return document


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--offset-ms", type=int, required=True)
    parser.add_argument("--lyrics", type=Path, required=True)
    parser.add_argument("--language", required=True)
    parser.add_argument("--model-dir", type=Path)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--reference", type=Path, help="Independent clip-relative word annotation JSON.")
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--runs", type=int, default=1, help="Repeat inference with the model already loaded.")
    args = parser.parse_args()
    if not 1 <= args.runs <= 10 or not 1 <= args.threads <= 16:
        parser.error("Use 1–10 runs and 1–16 threads.")
    try:
        print(json.dumps(run(args), ensure_ascii=False, allow_nan=False, indent=2))
    except subprocess.CalledProcessError as error:
        parser.exit(1, f"FFmpeg could not decode the source: {error.stderr.decode(errors='replace').strip()}\n")
    except (OSError, ValueError, RuntimeError, ImportError, subprocess.TimeoutExpired) as error:
        parser.exit(1, f"Alignment failed: {error}\n")


if __name__ == "__main__":
    main()
