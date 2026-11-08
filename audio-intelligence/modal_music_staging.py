"""Isolated Music Analysis v1 staging app."""
import hashlib
import hmac
import json
import resource
import os
from pathlib import Path
import re
import struct
import tempfile
import time
from types import SimpleNamespace

from fastapi import HTTPException, Request
import modal

HERE = Path(__file__).parent
app = modal.App("mumoo-music-analysis-staging")
WAV_SIZE = 44 + 15 * 16_000 * 2
WAV_HEADER = struct.pack("<4sI4s4sIHHIIHH4sI", b"RIFF", WAV_SIZE - 8, b"WAVE", b"fmt ",
                         16, 1, 1, 16000, 32000, 2, 16, b"data", WAV_SIZE - 44)
CHECKPOINT = Path("/models/final0.ckpt")
gateway_image = modal.Image.debian_slim(python_version="3.12").pip_install("fastapi==0.115.12")
worker_image = (
    modal.Image.debian_slim(python_version="3.12").apt_install("ffmpeg", "curl")
    .pip_install("fastapi==0.115.12")
    .pip_install("torch==2.6.0", "torchaudio==2.6.0", index_url="https://download.pytorch.org/whl/cpu")
    .pip_install("beat-this==1.1.0", "librosa==0.11.0", "numpy==1.26.4", "scipy==1.16.1",
                 "numba==0.61.2", "rotary-embedding-torch==0.8.6", "einops==0.8.1", "soxr==0.5.0.post1")
    .run_commands(
        "mkdir -p /models",
        "curl -fLsS --retry 2 https://cloud.cp.jku.at/public.php/dav/files/7ik4RrBKTS273gp/final0.ckpt -o /models/final0.ckpt",
        "echo '8c328b45f59d8dd3dff219253ff6a8d6482be57d0133a29140e2febbf8eb8331  /models/final0.ckpt' | sha256sum -c -",
    )
    .add_local_file(HERE / "music_analysis.py", "/root/music_analysis.py", copy=True)
    .add_local_file(HERE / "audio_source.py", "/root/audio_source.py", copy=True)
    .env({"NUMBA_CPU_NAME": "generic", "NUMBA_CACHE_DIR": "/opt/mumoo-numba",
          "OMP_NUM_THREADS": "1", "OPENBLAS_NUM_THREADS": "1", "MKL_NUM_THREADS": "1",
          "NUMBA_NUM_THREADS": "1"})
    .run_commands(
        "cd /root && python -c \"import numpy as np; from music_analysis import features; "
        "clip = np.zeros(330750, dtype=np.float32); clip[2000::11025] = 1; features(clip)\"",
    )
)
rate_state = modal.Dict.from_name("mumoo-music-staging-rate-v2", create_if_missing=True)
DAILY_LIMIT = 120
PER_MINUTE_LIMIT = 8
has_processed = False


def log_stage(stage, event, started=None):
    print(json.dumps({"stage": stage, "event": event, "unixSeconds": time.time(),
                      "elapsedSeconds": None if started is None else time.perf_counter() - started,
                      "peakRssBytes": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024}),
          flush=True)



@app.function(image=worker_image, cpu=(1, 1), memory=(2048, 2048), min_containers=0,
              max_containers=1, scaledown_window=8, timeout=45)
def analyze_selected(audio: bytes):
    log_stage("worker_input", "start")
    started = time.perf_counter()
    from music_analysis import analyze
    log_stage("python_import", "end", started)

    global has_processed
    cold = not has_processed
    with tempfile.TemporaryDirectory(prefix="mumoo-music-") as directory:
        clip = Path(directory) / "selected.wav"
        clip.write_bytes(audio)
        result = analyze(SimpleNamespace(clip=clip, offset_ms=0, source_sha256=None,
                         checkpoint=CHECKPOINT, ffmpeg="ffmpeg", ffprobe="ffprobe", threads=1, runs=1), trace=log_stage)
    has_processed = True
    result["metrics"]["firstInContainer"] = cold
    print({key: result["metrics"][key] for key in ("firstInContainer", "wallSeconds",
          "pythonCpuSeconds", "peakPythonRssBytes")})
    started = time.perf_counter()
    payload = json.dumps(result, allow_nan=False)
    log_stage("response_serialization", "end", started)
    return payload


def music_authorized(access, supplied, signing_key, bridge, now=None):
    now = time.time() if now is None else now
    bridged = len(bridge) >= 32 and hmac.compare_digest(supplied, "Bearer " + bridge)
    legacy = False
    if signing_key and re.fullmatch(r"[0-9]{10}\.[a-f0-9]{64}", access):
        expiry, signature = access.split(".")
        expected = hmac.new(signing_key.encode(), f"mumoo-music-staging:{expiry}".encode(), hashlib.sha256).hexdigest()
        legacy = int(expiry) > now and hmac.compare_digest(signature, expected)
    return bridged or legacy


@app.function(image=gateway_image, cpu=0.125, memory=128, min_containers=0, max_containers=1,
              scaledown_window=5, timeout=53, secrets=[modal.Secret.from_name("mumoo-music-staging-access"), modal.Secret.from_name("mumoo-music-bridge")])
@modal.fastapi_endpoint(method="POST", docs=False)
async def analyze_clip(request: Request):
    from fastapi import Response

    if not music_authorized(request.headers.get("x-mumoo-analysis-access", ""),
                            request.headers.get("authorization", ""),
                            os.environ.get("MUMOO_MUSIC_SIGNING_KEY", ""),
                            os.environ.get("MUMOO_MUSIC_BRIDGE_SECRET", "")):
        raise HTTPException(401, "Staging music-analysis access is invalid or expired.")
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > WAV_SIZE:
            raise HTTPException(413, "Send only the selected 15-second audio clip.")
        body.extend(chunk)
    if len(body) != WAV_SIZE or body[:44] != WAV_HEADER:
        raise HTTPException(400, "Expected exactly 15 seconds of mono PCM WAV.")
    now = time.time()
    recent = [stamp for stamp in await rate_state.get.aio("requests", []) if now - stamp < 86400]
    if len(recent) >= DAILY_LIMIT or sum(now - stamp < 60 for stamp in recent) >= PER_MINUTE_LIMIT:
        raise HTTPException(429, "The shared staging music-analysis limit was reached.")
    await rate_state.put.aio("requests", [*recent, now])
    try:
        log_stage("worker_dispatch", "start")
        payload = await analyze_selected.remote.aio(bytes(body))
        if request.headers.get("x-mumoo-music-features") != "temporal-v1":
            legacy_payload = json.loads(payload)
            legacy_payload.pop("temporalV1", None)
            payload = json.dumps(legacy_payload, allow_nan=False)
        log_stage("worker_dispatch", "end")
        return Response(content=payload, media_type="application/json")
    except Exception as error:
        print(f"Music analysis failed: {type(error).__name__}")
        raise HTTPException(502, "The staging worker could not analyze this clip.") from None
