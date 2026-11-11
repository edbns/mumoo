"""CPU-only async singer-voice detection for MUMOO Staging.

  submit  POST  multipart {audio: 15s mono 16k WAV}  ->  {"id": "fc-..."}  (instant)
  status  GET   ?id=fc-...                          ->  202 running | 200 JSON result

Who sings (female, male or both) is read from the voice alone: Demucs htdemucs (MIT) separates the singing from the music,
librosa pYIN finds where it sings, and a wav2vec2 timbre reader (Apache 2.0) votes on each 4 second stretch (`voice_detection.py`).
The result says `value: null` with a reason whenever the audio does not support an answer, and the Creative Studio then leaves
the singer open instead of guessing.

The clip is the same 15 second mono 16 kHz WAV the lyrics worker takes. It lives in memory for the request: no storage.
Dev only: `python3 -m modal run audio-intelligence/modal_voice_staging.py::try_file --file song.mp3 --start 60`.
"""
from __future__ import annotations

import json
import os
import re
import struct
import time
from pathlib import Path

from fastapi import HTTPException, Request, Response
import modal

APP = "mumoo-voice-staging"
HERE = Path(__file__).parent
SAMPLE_RATE = 16_000
WAV_DATA = SAMPLE_RATE * 15 * 2
WAV_BYTES = 44 + WAV_DATA
CALL_RE = re.compile(r"^fc-[A-Za-z0-9]{8,48}$")
MODELS = "/models"
# Demucs names a weights file after the start of its SHA-256; the full digest is pinned here.
WEIGHTS = "955717e8-8726e21a.th"
WEIGHTS_URL = f"https://dl.fbaipublicfiles.com/demucs/hybrid_transformer/{WEIGHTS}"
WEIGHTS_SHA256 = "8726e21a993978c7ba086d3872e7608d7d5bfca646ca4aca459ffda844faa8b4"
# The timbre reader (Apache 2.0), pinned to the revision that was tested.
GENDER_REPO = "alefiury/wav2vec2-large-xlsr-53-gender-recognition-librispeech"
GENDER_REVISION = "7a28165f33e1dbb37adbce09c0a9afcd6095dd4d"
GENDER_DIR = "/models/gender"

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg", "curl")
    .pip_install("torch==2.5.1", "torchaudio==2.5.1", index_url="https://download.pytorch.org/whl/cpu")
    .pip_install(
        "numpy==1.26.4", "scipy==1.16.1", "numba==0.61.2", "librosa==0.11.0", "soundfile==0.13.1", "soxr==0.5.0.post1",
        "einops==0.8.1", "julius==0.2.8", "pyyaml", "tqdm", "openunmix==1.3.0", "lameenc==1.9.0", "dora-search==0.1.13",
        "fastapi==0.115.12", "python-multipart==0.0.20",
    )
    .pip_install("demucs==4.0.1", extra_options="--no-deps")
    .pip_install("transformers==4.46.3", "huggingface-hub==0.26.2", "safetensors==0.4.5")
    .run_commands(
        f"mkdir -p {MODELS}",
        f"curl -fLsS --retry 2 {WEIGHTS_URL} -o {MODELS}/{WEIGHTS}",
        f"echo '{WEIGHTS_SHA256}  {MODELS}/{WEIGHTS}' | sha256sum -c -",
        f"cp \"$(python -c 'import demucs, os; print(os.path.dirname(demucs.__file__))')/remote/htdemucs.yaml\" {MODELS}/htdemucs.yaml",
        f"python -c \"from huggingface_hub import snapshot_download; snapshot_download('{GENDER_REPO}', revision='{GENDER_REVISION}', "
        f"local_dir='{GENDER_DIR}', allow_patterns=['config.json', 'preprocessor_config.json', 'model.safetensors'])\"",
    )
    .env({"NUMBA_CACHE_DIR": "/opt/mumoo-numba", "NUMBA_CPU_NAME": "generic"})
    .add_local_file(HERE / "voice_detection.py", "/root/voice_detection.py", copy=True)
    .run_commands(
        # Compile the pitch tracker once in the image, so a cold container does not.
        "cd /root && python -c \"import numpy as np; from voice_detection import follow_pitch; "
        "follow_pitch((0.1 * np.sin(2 * np.pi * 220 * np.arange(32000) / 16000)).astype('float32'))\"",
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


def separator():
    if "model" not in _models:
        from voice_detection import load_separator

        _models["model"] = load_separator(MODELS, threads=4)
    return _models["model"]


def timbre():
    if "gender" not in _models:
        from voice_detection import load_gender

        _models["gender"] = load_gender(GENDER_DIR)
    return _models["gender"]


def read(audio: bytes) -> dict:
    import numpy as np

    from voice_detection import detect

    samples = np.frombuffer(audio[44:], dtype="<i2").astype(np.float32) / 32768.0
    began = time.perf_counter()
    result = detect(samples, separator(), timbre())
    return {"version": 1, **result, "metrics": {"seconds": round(time.perf_counter() - began, 2)}}


@app.function(image=image, cpu=4, memory=4096, timeout=180, scaledown_window=10)
def voice_job(audio: bytes) -> dict:
    return read(audio)


@app.function(image=image, secrets=[secret], timeout=30, scaledown_window=10)
@modal.fastapi_endpoint(method="POST", docs=False)
async def submit(request: Request):
    authorized(request)
    try:
        form = await request.form()
        audio_file = form.get("audio")
        if audio_file is None:
            raise ValueError("fields")
        audio = await audio_file.read()
        if not wav_header_ok(audio):
            raise ValueError("audio")
    except (TypeError, ValueError, AttributeError):
        raise HTTPException(400, "Expected a 15 second mono 16 kHz WAV.") from None
    call = await voice_job.spawn.aio(audio)
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
        raise HTTPException(502, "The voice job failed. Try again.") from None
    return Response(content=json.dumps(result), media_type="application/json", headers={"Cache-Control": "no-store"})


@app.function(image=image, cpu=4, memory=4096, timeout=300)
def try_file_remote(data: bytes, suffix: str, start: float) -> dict:
    """Dev only: read the 15 seconds from `start` of any audio file (called by `try_file`, not by the site)."""
    import subprocess
    import tempfile

    import numpy as np

    with tempfile.TemporaryDirectory() as folder:
        source = Path(folder) / f"song{suffix}"
        source.write_bytes(data)
        pcm = subprocess.run(
            ["ffmpeg", "-v", "error", "-ss", str(start), "-t", "15", "-i", str(source), "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "s16le", "-"],
            check=True, capture_output=True,
        ).stdout
    if len(pcm) < WAV_DATA:
        pcm += b"\0" * (WAV_DATA - len(pcm))
    wav = struct.pack("<4sI4s4sIHHIIHH4sI", b"RIFF", WAV_BYTES - 8, b"WAVE", b"fmt ", 16, 1, 1, SAMPLE_RATE, SAMPLE_RATE * 2, 2, 16, b"data", WAV_DATA) + pcm[:WAV_DATA]
    from voice_detection import decide, female_by_window, pitch_frames, vocal_stem

    samples = np.frombuffer(wav[44:], dtype="<i2").astype(np.float32) / 32768.0
    voice, share = vocal_stem(samples, separator())
    f0, voiced, probability = pitch_frames(voice)
    sure = voiced & (probability >= 0.5)
    windows = female_by_window(voice, sure, timbre())
    return {
        "mixRms": round(float(np.sqrt(np.mean(samples ** 2))), 4),
        "stemShare": round(share, 3),
        "windows": windows,
        "decision": decide(f0[sure], share, windows),
    }


@app.local_entrypoint()
def try_file(file: str, start: float = 0.0):
    path = Path(file)
    print(json.dumps(try_file_remote.remote(path.read_bytes(), path.suffix, start)))


@app.local_entrypoint()
def try_files(specs: str):
    """Dev only: several clips in parallel, `file:start,file:start`."""
    jobs = [(Path(spec.rsplit(":", 1)[0]), float(spec.rsplit(":", 1)[1])) for spec in specs.split(",")]
    results = try_file_remote.starmap([(path.read_bytes(), path.suffix, start) for path, start in jobs])
    for (path, start), result in zip(jobs, results):
        decision = result["decision"]
        print(f"== {path.name} @ {start:g}  stem {result['stemShare']}  ->  {decision['value'] or decision['reason']}  (female share {decision['femaleShare']}, median {decision['medianHz']} Hz, voiced {decision['voicedSeconds']}s)")
        print("   female by window:", " ".join(f"{w['atSeconds']:g}s={w['female']}" for w in result["windows"]) or "none")
