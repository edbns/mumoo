"""CPU-only async lyrics transcription + word timing for MUMOO Staging (all languages).

  submit  POST  multipart {audio: 15s mono 16k WAV, meta: JSON}  ->  {"id": "fc-..."}  (instant)
  status  GET   ?id=fc-...                                       ->  202 running | 200 JSON result

meta = {"lines": [[token, ...], ...] | null, "language": "xx" | null}

Two modes, one model stack:
  * lines == null  -> TRANSCRIBE: Whisper (large-v3-turbo, int8) detects the language and writes the words,
                      then the multilingual forced aligner tightens each word's timing.
  * lines supplied -> SYNC: the user's (possibly corrected) text is force-aligned to the audio. No ASR is run,
                      so "sync again" after an edit is fast and always respects what the user typed.

Forced alignment is torchaudio MMS_FA (wav2vec2 trained on 1100+ languages). Non-Latin text is romanised
with uroman first, so Arabic, Hindi, Chinese, Korean, Russian... all work through the same path.
Words that cannot be aligned (digits, emoji, model failure) are never dropped: they are interpolated
between their neighbours and flagged "estimated" so the UI can say so.
"""
from __future__ import annotations

import json
import os
import re
import struct
import time
import unicodedata

from fastapi import HTTPException, Request, Response
import modal

APP = "mumoo-lyrics-v2-staging"
DURATION_MS = 15_000
SAMPLE_RATE = 16_000
WAV_DATA = SAMPLE_RATE * 15 * 2
WAV_BYTES = 44 + WAV_DATA
META_LIMIT = 60_000
MAX_TOKENS = 120
MAX_LINES = 60
MAX_TOKEN_CHARS = 48
CALL_RE = re.compile(r"^fc-[A-Za-z0-9]{8,48}$")
LANG_RE = re.compile(r"^[a-z]{2,3}$")
WHISPER_REPO = "deepdml/faster-whisper-large-v3-turbo-ct2"
WHISPER_DIR = "/models/whisper"
TORCH_HOME = "/models/torch"

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("torch==2.5.1", "torchaudio==2.5.1", index_url="https://download.pytorch.org/whl/cpu")
    .pip_install(
        "numpy==1.26.4", "faster-whisper==1.1.1", "uroman==1.3.1.1",
        "fastapi==0.115.12", "python-multipart==0.0.20", "huggingface-hub", "requests",
    )
    .env({"TORCH_HOME": TORCH_HOME})
    .run_commands(
        f"python -c \"from huggingface_hub import snapshot_download; "
        f"snapshot_download('{WHISPER_REPO}', local_dir='{WHISPER_DIR}')\"",
        "python -c \"import torchaudio; torchaudio.pipelines.MMS_FA.get_model(with_star=False)\"",
    )
)
app = modal.App(APP)
secret = modal.Secret.from_name("mumoo-music-bridge")

_models: dict = {}


def authorized(request: Request) -> None:
    auth = request.headers.get("authorization") or ""
    bridge = os.environ.get("MUMOO_MUSIC_BRIDGE_SECRET") or ""
    if len(bridge) < 32 or auth != f"Bearer {bridge}":
        raise HTTPException(401, "Unauthorized.")


def wav_header_ok(audio: bytes) -> bool:
    if len(audio) != WAV_BYTES:
        return False
    expected = struct.pack(
        "<4sI4s4sIHHIIHH4sI", b"RIFF", WAV_BYTES - 8, b"WAVE", b"fmt ", 16, 1, 1,
        SAMPLE_RATE, SAMPLE_RATE * 2, 2, 16, b"data", WAV_DATA,
    )
    return audio[:44] == expected


def parse_meta(raw: str) -> tuple[list[list[str]] | None, str | None]:
    meta = json.loads(raw)
    if not isinstance(meta, dict) or not set(meta) <= {"lines", "language"}:
        raise ValueError("meta")
    language = meta.get("language")
    if language is not None and (not isinstance(language, str) or not LANG_RE.match(language)):
        raise ValueError("language")
    lines = meta.get("lines")
    if lines is None:
        return None, language
    if not isinstance(lines, list) or not 1 <= len(lines) <= MAX_LINES:
        raise ValueError("lines")
    total = 0
    clean: list[list[str]] = []
    for line in lines:
        if not isinstance(line, list):
            raise ValueError("line")
        tokens = []
        for token in line:
            if not isinstance(token, str) or not token.strip() or len(token) > MAX_TOKEN_CHARS:
                raise ValueError("token")
            tokens.append(token.strip())
        total += len(tokens)
        if tokens:
            clean.append(tokens)
    if not 1 <= total <= MAX_TOKENS:
        raise ValueError("tokens")
    return clean, language


# ---------------------------------------------------------------- models


def whisper_model():
    if "whisper" not in _models:
        from faster_whisper import WhisperModel

        _models["whisper"] = WhisperModel(WHISPER_DIR, device="cpu", compute_type="int8", cpu_threads=4)
    return _models["whisper"]


def aligner_models():
    if "mms" not in _models:
        import torch
        import torchaudio
        import uroman

        torch.set_num_threads(4)
        bundle = torchaudio.pipelines.MMS_FA
        model = bundle.get_model(with_star=False).eval()
        _models["mms"] = (model, bundle.get_tokenizer(), bundle.get_aligner(), uroman.Uroman())
    return _models["mms"]


# ---------------------------------------------------------------- text


def romanize(token: str, uroman) -> str:
    """Letters the aligner knows (a-z and apostrophe). Empty means "cannot be aligned"."""
    text = unicodedata.normalize("NFKC", token)
    if not text.isascii():
        try:
            text = uroman.romanize_string(text)
        except Exception:  # noqa: BLE001 - one bad word must not sink the job
            text = ""
    text = unicodedata.normalize("NFKD", text).lower()
    return re.sub(r"[^a-z']", "", text)


# ---------------------------------------------------------------- transcription


def transcribe(samples, language):
    """Whisper → ({language, probability}, [(line_index, text, start_s, end_s)])."""
    model = whisper_model()
    segments, info = model.transcribe(
        samples, language=language, task="transcribe", beam_size=5, temperature=0.0,
        word_timestamps=True, condition_on_previous_text=False, vad_filter=False,
    )
    words: list[tuple[int, str, float, float]] = []
    line = 0
    for segment in segments:
        # Music makes Whisper invent text over silence/instrumentals; drop those segments.
        if segment.no_speech_prob > 0.85 and segment.avg_logprob < -1.0:
            continue
        if segment.compression_ratio > 2.4:
            continue
        added = False
        for word in segment.words or []:
            text = word.word.strip()
            if not text:
                continue
            words.append((line, text, float(word.start), float(word.end)))
            added = True
        if added:
            line += 1
    alternatives = [
        {"language": code, "probability": round(float(prob), 3)}
        for code, prob in (getattr(info, "all_language_probs", None) or [])[:3]
    ]
    return {
        "language": info.language, "probability": round(float(info.language_probability), 3),
        "alternatives": alternatives,
    }, words[:MAX_TOKENS]


# ---------------------------------------------------------------- alignment


def force_align(samples, tokens: list[str]):
    """Return {token_index: (start_s, end_s, score)} for tokens the aligner could place."""
    import torch

    model, tokenizer, aligner, uroman = aligner_models()
    romanized = [(i, romanize(token, uroman)) for i, token in enumerate(tokens)]
    usable = [(i, r) for i, r in romanized if r]
    if not usable:
        return {}
    waveform = torch.from_numpy(samples).unsqueeze(0)
    with torch.inference_mode():
        emission, _ = model(waveform)
    ratio = waveform.size(1) / emission.size(1) / SAMPLE_RATE
    spans = aligner(emission[0], tokenizer([r for _, r in usable]))
    placed = {}
    for (index, _), word in zip(usable, spans):
        if not word:
            continue
        weight = sum(len(part) for part in word) or 1
        score = sum(part.score * len(part) for part in word) / weight if hasattr(word[0], "score") else 0.0
        placed[index] = (word[0].start * ratio, word[-1].end * ratio, float(score))
    return placed


def finalize(texts, lines, timings, source_status):
    """Make timings monotonic, integer ms, inside the clip; interpolate anything missing."""
    n = len(texts)
    start = [None] * n
    end = [None] * n
    score = [0.0] * n
    status = ["estimated"] * n
    for index, (s, e, sc) in timings.items():
        start[index], end[index], score[index] = int(round(s * 1000)), int(round(e * 1000)), sc
        status[index] = source_status
    # Place words the aligner could not time next to their neighbours, at a sung-word pace.
    # (Never stretch them across instrumental gaps or the rest of the clip.)
    pace = 420
    index = 0
    while index < n:
        if start[index] is not None:
            index += 1
            continue
        run_end = index
        while run_end < n and start[run_end] is None:
            run_end += 1
        count = run_end - index
        left = end[index - 1] if index > 0 else None
        right = start[run_end] if run_end < n else None
        if left is None and right is None:
            left, right = 0, DURATION_MS
        if left is None:
            # Leading run: end at the first known word.
            step = min(pace, right / count)
            for k in range(index, run_end):
                end[k] = int(round(right - step * (run_end - k - 1)))
                start[k] = int(round(right - step * (run_end - k)))
        else:
            room = (right if right is not None else DURATION_MS) - left
            step = min(pace, max(1.0, room / count))
            for k in range(index, run_end):
                start[k] = int(round(left + step * (k - index)))
                end[k] = int(round(left + step * (k - index + 1)))
        index = run_end
    out = []
    cursor = 0
    for i in range(n):
        s = max(cursor, min(start[i], DURATION_MS - 40))
        e = max(s + 40, min(end[i], DURATION_MS))
        if e > DURATION_MS:
            s, e = DURATION_MS - 40, DURATION_MS
        cursor = e
        out.append({
            "text": texts[i], "line": lines[i], "startMs": s, "endMs": e,
            "score": round(score[i], 3), "status": status[i],
        })
    return out


@app.function(
    image=image, cpu=4, memory=8192, min_containers=0, max_containers=4,
    scaledown_window=60, timeout=280,
)
def lyrics_job(audio: bytes, lines: list[list[str]] | None, language: str | None) -> dict:
    import numpy as np

    started = time.perf_counter()
    samples = np.frombuffer(audio[44:], dtype="<i2").astype(np.float32) / 32768.0
    result: dict = {"version": 2, "source": "supplied" if lines else "transcribed"}
    metrics: dict = {}

    if lines is None:
        begin = time.perf_counter()
        info, heard = transcribe(samples, language)
        metrics["whisperSeconds"] = round(time.perf_counter() - begin, 2)
        result["language"] = info["language"]
        result["languageProbability"] = info["probability"]
        result["languageAlternatives"] = info["alternatives"]
        if not heard:
            result.update(words=[], metrics=metrics)
            return result
        line_ids = [h[0] for h in heard]
        texts = [h[1] for h in heard]
        fallback = {i: (h[2], h[3], float(0)) for i, h in enumerate(heard)}
    else:
        line_ids = [i for i, line in enumerate(lines) for _ in line]
        texts = [token for line in lines for token in line]
        fallback = {}
        result["language"] = language

    begin = time.perf_counter()
    try:
        timings = force_align(samples, texts)
        aligned_by = "aligned"
    except Exception:  # noqa: BLE001 - fall back rather than fail the user's job
        timings, aligned_by = {}, "estimated"
    metrics["alignSeconds"] = round(time.perf_counter() - begin, 2)
    # Whisper's own word times are the safety net for anything the aligner missed.
    for index, value in fallback.items():
        timings.setdefault(index, value)
    metrics["alignedWords"] = sum(1 for i in timings if i in timings and aligned_by == "aligned")
    metrics["totalSeconds"] = round(time.perf_counter() - started, 2)
    result["words"] = finalize(texts, line_ids, timings, "aligned" if aligned_by == "aligned" else "estimated")
    result["metrics"] = metrics
    return result


@app.function(image=image, secrets=[secret], timeout=30, scaledown_window=10)
@modal.fastapi_endpoint(method="POST", docs=False)
async def submit(request: Request):
    authorized(request)
    try:
        form = await request.form()
        audio_file = form.get("audio")
        meta_raw = form.get("meta")
        if audio_file is None or meta_raw is None or len(str(meta_raw)) > META_LIMIT:
            raise ValueError("fields")
        audio = await audio_file.read()
        if not wav_header_ok(audio):
            raise ValueError("audio")
        lines, language = parse_meta(str(meta_raw))
    except (TypeError, ValueError, json.JSONDecodeError, AttributeError):
        raise HTTPException(400, "Expected a 15 second mono 16 kHz WAV and valid lyric metadata.") from None
    call = await lyrics_job.spawn.aio(audio, lines, language)
    return {"id": call.object_id}


@app.function(image=image, secrets=[secret], timeout=30, scaledown_window=10)
@modal.fastapi_endpoint(method="GET", docs=False)
async def status(request: Request, id: str = ""):
    authorized(request)
    if not CALL_RE.match(id):
        raise HTTPException(400, "Invalid job id.")
    call = modal.FunctionCall.from_id(id)
    try:
        result = await call.get.aio(timeout=0)
    except TimeoutError:
        return Response(content=json.dumps({"status": "running"}), status_code=202,
                        media_type="application/json", headers={"Cache-Control": "no-store"})
    except modal.exception.OutputExpiredError:
        raise HTTPException(410, "This result expired. Start it again.") from None
    except Exception:  # noqa: BLE001
        raise HTTPException(502, "The lyrics job failed. Try again.") from None
    return Response(content=json.dumps(result), media_type="application/json",
                    headers={"Cache-Control": "no-store"})
