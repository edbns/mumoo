"""Sound print staging app: the CLAP print of a selected 15-second clip (`sound_print.py`), for genre learning.

LAION's original music checkpoint (CC0) through LAION's own loader. Not the Hugging Face conversion
`laion/larger_clap_music`: it hears silence, noise and drums as one sound (genre-evaluation/README.md).
The clip stays in memory for the request; nothing is written, logged or kept.
"""
import hmac
import json
import os
from pathlib import Path
import re
import struct
import time

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
import modal

from sound_print import CHECKPOINT_SHA256, CLIP_SAMPLES, MODEL, SAMPLE_RATE, sound_print

HERE = Path(__file__).parent
app = modal.App("mumoo-sound-print-staging")
WAV_SIZE = 44 + CLIP_SAMPLES * 2
WAV_HEADER = struct.pack("<4sI4s4sIHHIIHH4sI", b"RIFF", WAV_SIZE - 8, b"WAVE", b"fmt ",
                         16, 1, 1, SAMPLE_RATE, SAMPLE_RATE * 2, 2, 16, b"data", WAV_SIZE - 44)
CALL_RE = re.compile(r"^fc-[A-Za-z0-9]{8,48}$")
CHECKPOINT = "/models/music_audioset_epoch_15_esc_90.14.pt"
gateway_image = modal.Image.debian_slim(python_version="3.12").pip_install("fastapi==0.115.12", "numpy==1.26.4").add_local_python_source("sound_print")
# The versions the prints were measured with on the owner's computer.
worker_image = (
    modal.Image.debian_slim(python_version="3.12").apt_install("curl")
    .pip_install("fastapi==0.115.12")
    .pip_install("torch==2.2.2", "torchvision==0.17.2", index_url="https://download.pytorch.org/whl/cpu")
    .pip_install("laion_clap==1.1.7", "transformers==4.55.4", "tokenizers==0.21.4", "huggingface_hub==0.36.2",
                 "numpy==1.26.4", "librosa==0.11.0", "numba==0.60.0", "llvmlite==0.43.0", "torchlibrosa==0.1.0",
                 "h5py==3.16.0", "ftfy==6.3.1", "braceexpand==0.1.7", "webdataset==1.0.2", "wget==3.2", "progressbar==2.5")
    .run_commands(
        "mkdir -p /models",
        f"curl -fLsS --retry 2 https://huggingface.co/lukewys/laion_clap/resolve/main/music_audioset_epoch_15_esc_90.14.pt -o {CHECKPOINT}",
        f"echo '{CHECKPOINT_SHA256}  {CHECKPOINT}' | sha256sum -c -",
        # The checkpoint also holds its training state (2.35 GB); a container loads only the weights.
        f"python -c \"import torch; c = torch.load('{CHECKPOINT}', map_location='cpu'); torch.save({{'state_dict': c['state_dict']}}, '{CHECKPOINT}')\"",
        # Loading once here also fetches the text half's tokenizer, so a container never reaches the internet.
        f"python -c \"import laion_clap; laion_clap.CLAP_Module(enable_fusion=False, amodel='HTSAT-base').load_ckpt('{CHECKPOINT}', verbose=False)\"",
        f"ls -la {CHECKPOINT}",
    )
    .env({"HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1", "OMP_NUM_THREADS": "1", "MKL_NUM_THREADS": "1",
          "OPENBLAS_NUM_THREADS": "1", "NUMBA_NUM_THREADS": "1", "NUMBA_CACHE_DIR": "/tmp/numba"})
    .add_local_python_source("sound_print")
)
model = None


@app.function(image=worker_image, cpu=(2, 2), memory=(3072, 3072), min_containers=0,
              max_containers=4, scaledown_window=8, timeout=150)
def print_selected(audio: bytes):
    global model
    import numpy as np
    started = time.perf_counter()
    cold = model is None
    if cold:
        import laion_clap
        model = laion_clap.CLAP_Module(enable_fusion=False, amodel="HTSAT-base")
        model.load_ckpt(CHECKPOINT, verbose=False)
    loaded = time.perf_counter()
    samples = np.frombuffer(audio, dtype="<i2", offset=44).astype(np.float32) / 32767
    values = sound_print(model.get_audio_embedding_from_data, samples)
    print(json.dumps({"event": "sound_print", "cold": cold, "loadSeconds": round(loaded - started, 3),
                      "printSeconds": round(time.perf_counter() - loaded, 3), "printed": values is not None}), flush=True)
    if values is None:
        return {"version": 1, "status": "unavailable", "reason": "silent"}
    return {"version": 1, "status": "ready", "model": MODEL, "values": values}


def authorized(request: Request):
    bridge = os.environ.get("MUMOO_MUSIC_BRIDGE_SECRET", "")
    if len(bridge) < 32 or not hmac.compare_digest(request.headers.get("authorization", ""), "Bearer " + bridge):
        raise HTTPException(401, "Sound print access is invalid.")


gateway = dict(image=gateway_image, cpu=0.125, memory=128, min_containers=0, max_containers=4,
               scaledown_window=5, timeout=30, secrets=[modal.Secret.from_name("mumoo-music-bridge")])


# A cold worker takes longer than the site's functions may wait, so the site starts a job and asks for it later.
@app.function(**gateway)
@modal.fastapi_endpoint(method="POST", docs=False)
async def submit(request: Request):
    authorized(request)
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > WAV_SIZE:
            raise HTTPException(413, "Send only the selected 15-second audio clip.")
        body.extend(chunk)
    if len(body) != WAV_SIZE or body[:44] != WAV_HEADER:
        raise HTTPException(400, "Expected exactly 15 seconds of mono 48 kHz PCM WAV.")
    call = await print_selected.spawn.aio(bytes(body))
    return {"id": call.object_id}


@app.function(**gateway)
@modal.fastapi_endpoint(method="GET", docs=False)
async def status(request: Request, id: str = ""):
    authorized(request)
    if not CALL_RE.match(id):
        raise HTTPException(400, "Invalid job id.")
    try:
        result = await modal.FunctionCall.from_id(id).get.aio(timeout=0)
    except TimeoutError:
        return JSONResponse({"status": "running"}, status_code=202, headers={"Cache-Control": "no-store"})
    except modal.exception.OutputExpiredError:
        raise HTTPException(410, "This result expired. Start it again.") from None
    except Exception as error:  # noqa: BLE001
        print(f"Sound print failed: {type(error).__name__}")
        raise HTTPException(502, "The sound print worker could not read this clip.") from None
    return JSONResponse(result, headers={"Cache-Control": "no-store"})


@app.local_entrypoint()
def check():
    """Prints a made-up clip in the cloud: compare with `sound_print` on the same clip on a computer."""
    import numpy as np
    t = np.arange(CLIP_SAMPLES) / SAMPLE_RATE
    clip = 0.3 * np.sin(2 * np.pi * 220 * t) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 2 * t)))
    pcm = (np.clip(clip, -1, 1) * 32767).astype("<i2").tobytes()
    for run in ("cold", "warm"):
        started = time.perf_counter()
        result = print_selected.remote(WAV_HEADER + pcm)
        print(run, round(time.perf_counter() - started, 1), "s", result["status"])
        print(json.dumps(result.get("values", [])[:8]))
