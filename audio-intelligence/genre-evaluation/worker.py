"""Isolated, authenticated staging research worker for fixed-window CLAP evaluation."""
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import resource
import struct
import time
import modal
from fastapi import HTTPException, Request

app = modal.App("mumoo-genre-research")
snapshot = Path("/tmp/mumoo-clap-benchmark/hf/hub/models--laion--larger_clap_music/snapshots/a0b4534a14f58e20944452dff00a22a06ce629d1")
image = (modal.Image.debian_slim(python_version="3.11")
         .pip_install("torch==2.6.0", index_url="https://download.pytorch.org/whl/cpu")
         .pip_install("fastapi==0.115.12", "transformers==4.55.4", "numpy==1.26.4", "librosa==0.11.0", "soundfile==0.13.1")
         .add_local_dir(snapshot, "/model", copy=True)
         .env({"OMP_NUM_THREADS":"1", "MKL_NUM_THREADS":"1", "OPENBLAS_NUM_THREADS":"1",
               "CUDA_VISIBLE_DEVICES":"", "HF_HUB_OFFLINE":"1", "TRANSFORMERS_OFFLINE":"1"}))
gateway_image = modal.Image.debian_slim(python_version="3.11").pip_install("fastapi==0.115.12")
rate = modal.Dict.from_name("mumoo-genre-research-rate", create_if_missing=True)
SIZE = 480044
HEADER = struct.pack("<4sI4s4sIHHIIHH4sI", b"RIFF", SIZE-8, b"WAVE", b"fmt ", 16, 1, 1, 16000, 32000, 2, 16, b"data", SIZE-44)
PROMPTS = {
 "Broad genres": ["house", "techno", "Brazilian funk", "reggaeton", "amapiano", "hip hop", "pop", "rock", "classical", "jazz"],
 "Subgenres": ["slap house", "G-house", "deep house", "Afro house", "organic house", "Latin house", "tribal house", "melodic techno", "hard techno", "Brazilian funk mandelão", "Brazilian funk automotivo", "Brazilian montagem", "dub electronica"],
 "Sonic character": ["dark", "bright", "warm", "cold", "aggressive", "restrained", "hypnotic", "energetic", "sparse", "dense", "atmospheric", "percussive"],
 "Production": ["prominent vocals", "no vocals", "electronic instruments", "acoustic instruments", "distorted sounds", "clean sounds", "rolling bass", "no prominent bass", "prominent percussion", "little percussion", "syncopated rhythm", "steady rhythm"],
}
model = processor = text_features = None

@app.function(image=image, cpu=(1,1), memory=(4096,4096), timeout=40, max_containers=1, min_containers=0, scaledown_window=8)
def analyze(audio: bytes):
    global model, processor, text_features
    import numpy as np
    import torch
    from scipy.signal import resample_poly
    from transformers import ClapModel, ClapProcessor
    torch.set_num_threads(1)
    started=time.monotonic()
    cold=model is None
    load_seconds=0
    if cold:
        t=time.monotonic()
        with open("/model/pytorch_model.bin","rb") as f:
            digest=hashlib.file_digest(f,"sha256").hexdigest()
        if digest != "5c289311f4a030d768af7ffbfdecd01b008aa64824211899a4e59f4f9d154fd1":
            raise ValueError("Invalid checkpoint")
        processor=ClapProcessor.from_pretrained("/model",local_files_only=True)
        model=ClapModel.from_pretrained("/model",local_files_only=True).eval()
        descriptions=[f"A recording of {x} music." if group in ("Broad genres","Subgenres") else f"The music has {x}." for group, values in PROMPTS.items() for x in values]
        with torch.inference_mode():
            text_features=model.get_text_features(**processor(text=descriptions,padding=True,return_tensors="pt"))
            text_features=text_features / text_features.norm(dim=-1,keepdim=True)
        load_seconds=time.monotonic()-t
    samples=np.frombuffer(audio, dtype="<i2", offset=44).astype(np.float32)/32768
    samples=resample_poly(samples,3,1).astype(np.float32)
    all_scores=[]
    window_seconds=[]
    for start in (0,240000):
        t=time.monotonic()
        clip=samples[start:start+480000]
        if len(clip)!=480000:
            raise ValueError("Invalid audio length")
        inputs=processor(audios=clip,sampling_rate=48000,return_tensors="pt")
        with torch.inference_mode():
            features=model.get_audio_features(**inputs)
            features=features/features.norm(dim=-1,keepdim=True)
            all_scores.append((features @ text_features.T).squeeze(0).tolist())
        window_seconds.append(round(time.monotonic()-t,3))
    groups={}
    index=0
    for group, labels in PROMPTS.items():
        rows=[]
        for label in labels:
            a,b=all_scores[0][index],all_scores[1][index]
            rows.append({"label":label,"windowA":round(a,5),"windowB":round(b,5),"combined":round((a+b)/2,5)})
            index+=1
        groups[group]=sorted(rows,key=lambda x:x["combined"],reverse=True)
    response={"version":1,"promptsVersion":"1","groups":groups,
              "metrics":{"cold":cold,"initializationSeconds":round(load_seconds,3),
                         "windowSeconds":window_seconds,"processingSeconds":round(time.monotonic()-started,3),
                         "peakRssBytes":resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024}}
    print(json.dumps({"event":"genre_research_complete",**response["metrics"]}),flush=True)
    return response

@app.function(image=gateway_image, cpu=0.125, memory=128, timeout=52, min_containers=0, max_containers=1,
              scaledown_window=5, secrets=[modal.Secret.from_name("mumoo-music-staging-access")])
@modal.fastapi_endpoint(method="POST", docs=False)
async def evaluate(request: Request):
    token=request.headers.get("x-mumoo-genre-access","")
    if not re.fullmatch(r"[0-9]{10}\.[a-f0-9]{64}", token):
        raise HTTPException(401,"Enter a valid tester code.")
    expiry, signature=token.split(".")
    expected=hmac.new(os.environ["MUMOO_MUSIC_SIGNING_KEY"].encode(),f"mumoo-genre-research:{expiry}".encode(),hashlib.sha256).hexdigest()
    if int(expiry)<=time.time() or not hmac.compare_digest(signature,expected):
        raise HTTPException(401,"Tester code is invalid or expired.")
    body=bytearray()
    async for chunk in request.stream():
        if len(body)+len(chunk)>SIZE:
            raise HTTPException(413,"Audio clip is too large.")
        body.extend(chunk)
    if len(body)!=SIZE or body[:44]!=HEADER:
        raise HTTPException(400,"Expected exactly 15 seconds of mono PCM audio.")
    now=time.time()
    recent=[t for t in await rate.get.aio("requests",[]) if now-t<86400]
    if len(recent)>=30 or sum(now-t<60 for t in recent)>=3:
        raise HTTPException(429,"Research limit reached. Try again later.")
    await rate.put.aio("requests",[*recent,now])
    try:
        return await analyze.remote.aio(bytes(body))
    except Exception:
        raise HTTPException(502,"Genre analysis could not complete. Try again.") from None
