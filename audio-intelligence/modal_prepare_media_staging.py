"""Prepares a person's uploads for MUMOO Staging, on CPU, in our own cloud (nothing goes to a third party).

  photo   a JPEG  ->  a cut-out mask of the subject (PNG), made by a self-hosted U2-Net model
  motion  a video or GIF  ->  a small H.264 copy (the whole video, muted, at most 720x1280), a poster still and
          the list of its shots, so a creative can cut and arrange them on the beat

  submit  POST  JSON {kind, source, puts}  ->  {"id": "fc-..."}   (instant)
  status  GET   ?id=fc-...                 ->  202 running | 200 JSON result | 4xx/5xx

Only our own server calls this (bridge secret). It hands over links that already expire: one to read the
upload and one per output to write. The worker never holds storage credentials.
"""
from __future__ import annotations

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
MASK_SIDE = 1024
OUTPUTS = {"photo": {"cutout"}, "motion": {"motion", "poster"}}

# One image for the whole app (the module imports fastapi at top level). The model is baked in,
# so a job never waits on a download.
image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg")
    .pip_install("fastapi==0.115.12", "rembg==2.0.65", "onnxruntime==1.20.1", "pillow==11.1.0")
    .run_commands("python -c \"from rembg import new_session; new_session('u2net')\"")
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


def run(cmd: list[str], timeout: int) -> str:
    try:
        done = subprocess.run(cmd, check=True, capture_output=True, timeout=timeout)
    except subprocess.CalledProcessError:
        raise PrepareError("That file could not be read as a photo, video or GIF.") from None
    except subprocess.TimeoutExpired:
        raise PrepareError("That file took too long to prepare.") from None
    return done.stdout.decode("utf-8", errors="replace")


def cutout(source: Path) -> bytes:
    from PIL import Image
    from rembg import new_session, remove

    picture = Image.open(source).convert("RGB")
    picture.thumbnail((MASK_SIDE, MASK_SIDE))
    mask = remove(picture, session=new_session("u2net"), only_mask=True)
    out = io.BytesIO()
    mask.save(out, format="PNG")
    return out.getvalue()


def shots(clip: Path, milliseconds: int) -> list[list[int]]:
    """The video's shots as [start, end] in ms. Shots under 0.8 s join their neighbour."""
    try:
        log = subprocess.run(
            ["ffmpeg", "-hide_banner", "-i", str(clip), "-an", "-vf", f"scale=-2:160,select='gt(scene,{SCENE_THRESHOLD})',showinfo", "-f", "null", "-"],
            capture_output=True, timeout=180,
        ).stderr.decode("utf-8", errors="replace")
    except subprocess.TimeoutExpired:
        raise PrepareError("That file took too long to prepare.") from None
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


def motion(source: Path, directory: Path) -> tuple[bytes, bytes, list[list[int]]]:
    seconds = float(run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(source)], 60,
    ).strip() or 0)
    # GIFs sometimes report no duration; only a clearly long clip is refused.
    if seconds > MAX_SECONDS:
        raise PrepareError(f"Videos can be up to {MAX_SECONDS} seconds long.")
    clip = directory / "clip.mp4"
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(source), "-t", str(MAX_SECONDS), "-an",
        "-maxrate", "4M", "-bufsize", "8M",
        "-vf", "fps=30,scale=720:1280:force_original_aspect_ratio=decrease:force_divisible_by=2",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p",
        "-g", "10", "-bf", "0", "-movflags", "+faststart", str(clip),
    ], 300)
    if not clip.exists() or clip.stat().st_size < 1000:
        raise PrepareError("That video has nothing to show.")
    if clip.stat().st_size > CLIP_MAX_BYTES:
        raise PrepareError("That video is too detailed to prepare. Try a shorter one.")
    milliseconds = round(float(run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(clip)], 60,
    ).strip() or 0) * 1000)
    if milliseconds < 500:
        raise PrepareError("That video is too short to use.")
    poster = directory / "poster.jpg"
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-ss", str(min(1.0, seconds / 2)), "-i", str(clip),
        "-frames:v", "1", "-q:v", "3", str(poster),
    ], 60)
    return clip.read_bytes(), poster.read_bytes(), shots(clip, milliseconds)


@app.function(image=image, cpu=4, memory=4096, min_containers=0, max_containers=6, scaledown_window=10, timeout=600)
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
