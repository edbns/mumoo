"""Prepares a person's uploads for MUMOO Staging, on CPU, in our own cloud (nothing goes to a third party).

  photo   a JPEG  ->  a cut-out mask of the subject (PNG), made by a self-hosted U2-Net model (run straight
          on onnxruntime: the rembg package alone took over a minute to import on a cold container)
  motion  a video or GIF  ->  a small H.264 copy (the whole video, muted, at most 720x1280), a poster still and
          the list of its shots, so a creative can cut and arrange them on the beat

  submit  POST  JSON {kind, source, puts}  ->  {"id": "fc-..."}   (instant)
  status  GET   ?id=fc-...                 ->  202 running | 200 JSON result | 4xx/5xx

Only our own server calls this (bridge secret). It hands over links that already expire: one to read the
upload and one per output to write. The worker never holds storage credentials.
"""
from __future__ import annotations

import functools
import io
import json
import re
import subprocess
import tempfile
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

from fastapi import HTTPException, Request, Response
import modal

APP = "mumoo-prepare-media-staging"
CALL_RE = re.compile(r"^fc-[A-Za-z0-9]{8,48}$")
STORAGE_HOST = re.compile(r"^[0-9a-f]{32}\.r2\.cloudflarestorage\.com$")
SOURCE_LIMIT = 150_000_000
MAX_SECONDS = 60
CLIP_MAX_BYTES = 38_000_000
SCENE_THRESHOLD = 0.32
MIN_SHOT_MS = 800
MAX_SHOTS = 40
# Dust reads the mask at 180x320, and U2-Net itself looks at 320x320, so a larger mask only costs time.
MASK_SIDE = 640
MODEL_PATH = "/models/u2net.onnx"
MODEL_URL = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx"
MODEL_MD5 = "60024c5c889badc19c04ad937298a77b"
OUTPUTS = {"photo": {"cutout"}, "motion": {"motion", "poster"}}

# One image for the whole app (the module imports fastapi at top level). The model is baked in,
# so a job never waits on a download.
image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg")
    .pip_install("fastapi==0.115.12", "onnxruntime==1.20.1", "pillow==11.1.0", "numpy==2.2.6")
    .run_commands(
        "mkdir -p /models",
        # GitHub's release host now and then answers 5xx; the checksum below proves the file is whole.
        f"for try in 1 2 3 4 5; do python -c \"import urllib.request; urllib.request.urlretrieve('{MODEL_URL}', '{MODEL_PATH}')\" && break; sleep 5; done",
        f"echo '{MODEL_MD5}  {MODEL_PATH}' | md5sum -c -",
    )
)
app = modal.App(APP)
secret = modal.Secret.from_name("mumoo-music-bridge")


def authorized(request: Request) -> None:
    import os

    bridge = os.environ.get("MUMOO_MUSIC_BRIDGE_SECRET") or ""
    if len(bridge) < 32 or (request.headers.get("authorization") or "") != f"Bearer {bridge}":
        raise HTTPException(401, "Unauthorized.")


def storage_link(value: object) -> str:
    link = urlparse(str(value))
    if link.scheme != "https" or not STORAGE_HOST.match(link.hostname or ""):
        raise ValueError("link")
    return link.geturl()


def download(link: str, destination: Path) -> None:
    request = urllib.request.Request(link)
    size = 0
    with urllib.request.urlopen(request, timeout=120) as response, destination.open("wb") as out:
        while chunk := response.read(1 << 20):
            size += len(chunk)
            if size > SOURCE_LIMIT:
                raise PrepareError("That file is too large.")
            out.write(chunk)


def upload(link: str, data: bytes, content_type: str) -> None:
    request = urllib.request.Request(link, data=data, method="PUT", headers={"Content-Type": content_type})
    with urllib.request.urlopen(request, timeout=120):
        pass


class PrepareError(Exception):
    """A problem with the person's file, in words they can read."""


def run(cmd: list[str], timeout: int, stream: str = "stdout") -> str:
    try:
        done = subprocess.run(cmd, check=True, capture_output=True, timeout=timeout)
    except subprocess.CalledProcessError:
        raise PrepareError("That file could not be read as a photo, video or GIF.") from None
    except subprocess.TimeoutExpired:
        raise PrepareError("That file took too long to prepare.") from None
    return (done.stderr if stream == "stderr" else done.stdout).decode("utf-8", errors="replace")


@functools.lru_cache(maxsize=1)
def segmenter():
    import onnxruntime

    return onnxruntime.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])


def cutout(source: Path) -> bytes:
    """U2-Net's saliency map of the photo, as the mask PNG (white where the subject is)."""
    import numpy
    from PIL import Image

    picture = Image.open(source).convert("RGB")
    size = picture.size
    scaled = numpy.asarray(picture.resize((320, 320), Image.Resampling.LANCZOS), dtype=numpy.float32)
    scaled = scaled / max(float(scaled.max()), 1e-6)
    scaled = (scaled - (0.485, 0.456, 0.406)) / (0.229, 0.224, 0.225)
    session = segmenter()
    saliency = session.run(None, {session.get_inputs()[0].name: scaled.transpose(2, 0, 1)[None].astype(numpy.float32)})[0][0, 0]
    low, high = float(saliency.min()), float(saliency.max())
    mask = Image.fromarray(((saliency - low) / max(high - low, 1e-6) * 255).astype(numpy.uint8)).resize(size, Image.Resampling.LANCZOS)
    mask.thumbnail((MASK_SIDE, MASK_SIDE))
    out = io.BytesIO()
    mask.save(out, format="PNG")
    return out.getvalue()


def shots_from(log: str, milliseconds: int) -> list[list[int]]:
    """The video's shots as [start, end] in ms, from the scene changes ffmpeg reported. Shots under 0.8 s join their neighbour."""
    cuts = sorted({round(float(t) * 1000) for t in re.findall(r"pts_time:([0-9.]+)", log)})
    edges = [0, *[cut for cut in cuts if 0 < cut < milliseconds], milliseconds]
    out: list[list[int]] = []
    for start, end in zip(edges, edges[1:]):
        if out and end - start < MIN_SHOT_MS:
            out[-1][1] = end
        else:
            out.append([start, end])
    if len(out) > 1 and out[0][1] - out[0][0] < MIN_SHOT_MS:
        out[1][0] = 0
        out.pop(0)
    return out[:MAX_SHOTS]


def seconds_of(path: Path) -> float:
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)], 60).strip() or 0)


def motion(source: Path, directory: Path) -> tuple[bytes, bytes, list[list[int]]]:
    seconds = seconds_of(source)
    # GIFs sometimes report no duration; only a clearly long clip is refused.
    if seconds > MAX_SECONDS:
        raise PrepareError(f"Videos can be up to {MAX_SECONDS} seconds long.")
    clip = directory / "clip.mp4"
    # One pass over the source: the picture is decoded once and goes to the small H.264 copy and, scaled down, to the scene detector.
    log = run([
        "ffmpeg", "-y", "-hide_banner", "-i", str(source), "-t", str(MAX_SECONDS), "-an",
        "-filter_complex",
        "[0:v]fps=30,split=2[full][look];"
        "[full]scale=720:1280:force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p[small];"
        # The first frame is always kept (it is at 0, which is no cut): a video of one shot has no scene change, and an output that receives no frame makes ffmpeg fail.
        f"[look]scale=-2:160,select='gt(scene,{SCENE_THRESHOLD})+eq(n,0)',showinfo[scenes]",
        "-map", "[small]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-maxrate", "4M", "-bufsize", "8M",
        "-g", "10", "-bf", "0", "-movflags", "+faststart", str(clip),
        "-map", "[scenes]", "-f", "null", "-",
    ], 300, stream="stderr")
    if not clip.exists() or clip.stat().st_size < 1000:
        raise PrepareError("That video has nothing to show.")
    if clip.stat().st_size > CLIP_MAX_BYTES:
        raise PrepareError("That video is too detailed to prepare. Try a shorter one.")
    milliseconds = round(seconds_of(clip) * 1000)
    if milliseconds < 500:
        raise PrepareError("That video is too short to use.")
    poster = directory / "poster.jpg"
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-ss", str(min(1.0, seconds / 2)), "-i", str(clip),
        "-frames:v", "1", "-q:v", "3", str(poster),
    ], 60)
    return clip.read_bytes(), poster.read_bytes(), shots_from(log, milliseconds)


@app.function(image=image, cpu=4, memory=4096, min_containers=0, max_containers=6, scaledown_window=60, timeout=600)
def prepare(kind: str, source: str, puts: dict[str, str]) -> dict:
    """Returns {"ok": True, "bytes": {output: size}, "shots": [[start_ms, end_ms], ...] (video or GIF only)} or {"ok": False, "error": words for the person}."""
    with tempfile.TemporaryDirectory(prefix="mumoo-prepare-") as name:
        directory = Path(name)
        file = directory / "source"
        try:
            download(source, file)
            if kind == "photo":
                made = {"cutout": (cutout(file), "image/png")}
            else:
                clip, poster, found = motion(file, directory)
                made = {"motion": (clip, "video/mp4"), "poster": (poster, "image/jpeg")}
            for output, (data, content_type) in made.items():
                upload(puts[output], data, content_type)
            return {"ok": True, "bytes": {output: len(data) for output, (data, _) in made.items()}, **({"shots": found} if kind == "motion" else {})}
        except PrepareError as problem:
            return {"ok": False, "error": str(problem)}
        except Exception:  # noqa: BLE001 - anything else is ours, not the person's
            return {"ok": False, "error": "We could not prepare that file. Try another."}


@app.function(image=image, secrets=[secret], timeout=30, scaledown_window=10)
@modal.fastapi_endpoint(method="POST", docs=False)
async def submit(request: Request):
    authorized(request)
    try:
        body = await request.json()
        kind = body["kind"]
        if kind not in OUTPUTS or set(body["puts"]) != OUTPUTS[kind]:
            raise ValueError("kind")
        source = storage_link(body["source"])
        puts = {output: storage_link(link) for output, link in body["puts"].items()}
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        raise HTTPException(400, "Expected a kind, a source link and output links.") from None
    call = await prepare.spawn.aio(kind, source, puts)
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
        return Response(content=json.dumps({"status": "running"}), status_code=202, media_type="application/json")
    except modal.exception.OutputExpiredError:
        raise HTTPException(410, "This job expired.") from None
    except Exception:  # noqa: BLE001
        raise HTTPException(502, "Preparing failed.") from None
    return result
