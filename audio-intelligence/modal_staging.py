"""Rate-limited, CPU-only Modal deployment for MUMOO Staging."""
import base64
import binascii
import json
import logging
from functools import lru_cache
from pathlib import Path
import struct
import subprocess
import tempfile
import time
from types import SimpleNamespace

from fastapi import HTTPException, Request
import modal

APP = "mumoo-lyrics-staging"
ENVIRONMENT = "mumoo-staging"
MODEL = Path("/models/en")
WAV_BYTES = 44 + 15 * 16_000 * 2
BODY_LIMIT = 680_000
RATE_WINDOW = 60
RATE_LIMIT = 3
DAILY_LIMIT = 30

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg")
    .pip_install("torch==2.5.1", "torchaudio==2.5.1", index_url="https://download.pytorch.org/whl/cpu")
    .pip_install("numpy==1.26.4", "pandas==2.2.3", "transformers==4.49.0",
                 "nltk==3.9.1", "fastapi==0.115.12", "huggingface-hub==0.34.4")
    .run_commands(
        "pip install --no-deps whisperx==3.4.2",
        "python -c \"from huggingface_hub import snapshot_download; "
        "snapshot_download('facebook/wav2vec2-base-960h', "
        "revision='22aad52d435eb6dbaf354bdad9b0da84ce7d6156', local_dir='/models/en', "
        "allow_patterns=['config.json','preprocessor_config.json','tokenizer_config.json',"
        "'special_tokens_map.json','vocab.json','model.safetensors'])\"",
        "echo '8aa76ab2243c81747a1f832954586bc566090c83a0ac167df6f31f0fa917d74a  "
        "/models/en/model.safetensors' | sha256sum -c -",
    )
    .pip_install("openai-whisper==20250625")
    .run_commands("python -c \"import whisper; whisper.load_model('small', device='cpu', download_root='/models/whisper')\"")
    .env({"HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1"})
    .add_local_file(Path(__file__).with_name("align.py"), "/root/align.py")
)
app = modal.App(APP)
rate_state = modal.Dict.from_name("mumoo-staging-alignment-rate", create_if_missing=True)


def decode_payload(body):
    try:
        value = json.loads(body)
        if not isinstance(value, dict) or set(value) != {"audio", "lyrics", "language"}:
            raise ValueError
        lyrics = value["lyrics"]
        if value["language"] != "en" or (lyrics is not None and (not isinstance(lyrics, str) or not lyrics.strip() or len(lyrics) > 2000)):
            raise ValueError
        audio = base64.b64decode(value["audio"], validate=True)
        expected_header = struct.pack(
            "<4sI4s4sIHHIIHH4sI", b"RIFF", WAV_BYTES - 8, b"WAVE", b"fmt ", 16,
            1, 1, 16000, 32000, 2, 16, b"data", WAV_BYTES - 44,
        )
        if len(audio) != WAV_BYTES or audio[:44] != expected_header:
            raise ValueError
        return audio, lyrics
    except (TypeError, ValueError, binascii.Error):
        raise HTTPException(400, "Expected English lyrics and exactly 15 seconds of mono PCM WAV.") from None


@lru_cache(maxsize=1)
def transcription_model():
    import torch
    import whisper
    torch.set_num_threads(2)
    return whisper.load_model("/models/whisper/small.pt", device="cpu")


@app.function(image=image, cpu=1, memory=4096, min_containers=0, max_containers=1,
              scaledown_window=5, timeout=55)
@modal.fastapi_endpoint(method="POST", docs=False)
async def sync(request: Request):
    from align import load_checkpoint, peak_rss_bytes, run

    started = time.perf_counter()
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > BODY_LIMIT:
            raise HTTPException(413, "Selected clip payload is too large.")
        body.extend(chunk)
    audio, lyrics = decode_payload(body)

    # One input at a time in one container. Persist the window across scale-to-zero.
    now = time.time()
    daily = [stamp for stamp in rate_state.get("requests", []) if now - stamp < 86_400]
    if len(daily) >= DAILY_LIMIT:
        raise HTTPException(429, "Daily staging sync limit reached.")
    if sum(now - stamp < RATE_WINDOW for stamp in daily) >= RATE_LIMIT:
        raise HTTPException(429, "Staging sync limit reached. Wait a minute and try again.")
    rate_state["requests"] = [*daily, now]
    cold = load_checkpoint.cache_info().currsize == 0
    try:
        with tempfile.TemporaryDirectory(prefix="mumoo-staging-") as directory:
            clip = Path(directory) / "clip.wav"
            clip.write_bytes(audio)
            if lyrics is None:
                from align import extract
                import numpy as np
                samples = np.frombuffer(extract("ffmpeg", clip, 0), dtype="<f4").copy()
                draft = transcription_model().transcribe(samples, language="en", task="transcribe",
                                                         fp16=False, condition_on_previous_text=False)
                lyrics = draft["text"].strip()
                if not lyrics:
                    raise HTTPException(422, "No lyrics detected. Try another section or paste your lyrics.")
            text = Path(directory) / "lyrics.txt"
            text.write_text(lyrics, encoding="utf-8")
            result = run(SimpleNamespace(source=clip, lyrics=text, offset_ms=0,
                         ffmpeg="ffmpeg", language="en", model_dir=MODEL, threads=2,
                         runs=1, reference=None))
    except (OSError, RuntimeError, ValueError, subprocess.SubprocessError) as error:
        logging.error("Alignment failed: %s", type(error).__name__)
        raise HTTPException(422, "The worker could not align the selected clip.") from None
    seconds = time.perf_counter() - started
    result["worker"] = {
        "coldModelLoad": cold, "processingSeconds": round(seconds, 4),
        "peakRssBytes": peak_rss_bytes(), "estimatedComputeUsd": round(seconds * (0.0000131 + 4 * 0.00000222), 8),
    }
    logging.info("Alignment metrics %s", json.dumps(result["worker"]))
    return result
