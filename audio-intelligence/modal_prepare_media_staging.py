"""Prepares a person's uploads for MUMOO Staging, on CPU, in our own cloud (nothing goes to a third party).

  photo   a JPEG  ->  a cut-out mask of the subject (PNG), made by a self-hosted U2-Net model (run straight
          on onnxruntime: the rembg package alone took over a minute to import on a cold container)
  motion  a video or GIF  ->  a small H.264 copy (the whole video, muted, at most 720x1280), a poster still and
          the list of its shots, so a creative can cut and arrange them on the beat
  describe  a library photo or prepared clip  ->  what it is seen to show (`LOOKS`, each 0..1) and tags to suggest
          (`SEEN_WORDS`), by a self-hosted SigLIP 2 model (Apache 2.0). Nothing is generated; it only describes.

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
# A clip's opening is dark until a frame is half as bright as the clip gets (and above near-black, 24 of 255; video black is 16).
DARK_SCAN_SECONDS = 3
DARK_Y = 24
LIT_SHARE = 0.5
MOST_DARK_MS = 2000
# Dust reads the mask at 180x320, and U2-Net itself looks at 320x320, so a larger mask only costs time.
MASK_SIDE = 640
MODEL_PATH = "/models/u2net.onnx"
MODEL_URL = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx"
MODEL_MD5 = "60024c5c889badc19c04ad937298a77b"
OUTPUTS = {"photo": {"cutout"}, "motion": {"motion", "poster"}, "describe": set()}

SEER = "google/siglip2-base-patch16-224"
# What the brain can ask a picture to show: the song themes (SONG_THEMES in creative/src/song-themes.ts) and the genre looks
# (THEME_TAGS in creative/src/genre-guide.ts); a test keeps the keys the same. A look is the best of its phrasings.
LOOKS = {
    "party": ["people partying", "a party", "a festival crowd"],
    "dancing": ["people dancing", "a dancer", "breakdancing"],
    "nightlife": ["a night out", "neon lights at night", "a nightclub"],
    "seduction": ["a sexy woman", "a beautiful woman", "legs in high heels"],
    "romance": ["a romantic couple", "a couple kissing"],
    "heartbreak": ["a lonely, sad person", "tears"],
    "money": ["money", "cash", "a luxury lifestyle", "champagne", "jewelry", "a designer bag"],
    "cars": ["a car", "a sports car", "driving a car"],
    "street": ["an urban street", "graffiti"],
    "city": ["a city", "a city skyline at night"],
    "summer": ["a beach", "summer", "a swimming pool"],
    "nature": ["nature", "a forest", "a landscape"],
    "freedom": ["an open road", "travel"],
    "faith": ["a church", "people praying"],
    "friends": ["a group of friends", "friends laughing together"],
    "fame": ["a performer on stage", "a concert", "a DJ"],
    "club": ["a nightclub", "a club with lights"],
    "abstract": ["abstract shapes"],
    "geometric": ["geometric shapes"],
    "architecture": ["architecture"],
    "neon": ["neon lights"],
    "retro": ["a retro, vintage look"],
    "beach": ["a beach"],
    "tropical": ["palm trees"],
    "sunset": ["a sunset"],
    "space": ["outer space"],
    "underwater": ["underwater"],
    "rain": ["rain"],
    "smoke": ["smoke"],
    "fire": ["fire"],
    "mountains": ["mountains"],
    "road": ["a road"],
    "crowd": ["a crowd of people"],
    "fashion": ["fashion", "high heels", "a designer outfit"],
    "luxury": ["luxury", "a luxury lifestyle"],
    "robots": ["a robot"],
    "dark": ["a dark, moody scene"],
    "glitch": ["a glitch effect"],
    "surreal": ["a surreal scene"],
    "futuristic": ["a futuristic scene"],
    "fantasy": ["a fantasy world"],
    "cozy": ["a cozy room"],
    "collage": ["a collage"],
    "instruments": ["musical instruments"],
    "studio": ["a music studio"],
    "stage": ["a stage"],
    "industrial": ["an industrial setting"],
}
# Tags the admin may be offered, as they would type them (each a tag the server accepts).
SEEN_WORDS = [
    "car", "sports car", "motorbike", "driving", "road", "girl", "girls", "guy", "guys", "woman", "man", "couple",
    "crowd", "dancer", "dancing", "dj", "singer", "friends", "club", "bar", "festival", "concert", "stage", "studio",
    "street", "city", "skyline", "rooftop", "beach", "pool", "sea", "desert", "yacht", "jet", "champagne", "drinks",
    "money", "jewelry", "watch", "sunglasses", "designer bag", "heels", "dress", "suit", "fashion", "luxury", "neon",
    "lights", "laser", "smoke", "fire", "fireworks", "confetti", "sunset", "night", "rain", "snow", "palm trees",
    "flowers", "close up", "face", "hands", "legs", "silhouette", "black and white", "selfie", "walking", "kiss",
    "microphone", "turntables", "guitar", "piano", "phone", "graffiti", "skating", "surfing", "gym", "hotel",
]
# SigLIP's own odds are small and spread: a clear look scores about 0.2 to 0.7, a faint one 0.01. Strength is read on a log scale between these.
FAINT = 0.003
CLEAR = 0.3
SEEN_AT = 0.02
MOST_SEEN = 8
FRAMES = 6

# One image for the whole app (the module imports fastapi at top level). The model is baked in,
# so a job never waits on a download.
image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg")
    .pip_install("fastapi==0.115.12", "onnxruntime==1.20.1", "pillow==11.1.0", "numpy==2.2.6")
    .pip_install("torch==2.6.0", index_url="https://download.pytorch.org/whl/cpu")
    .pip_install("transformers==4.56.2", "sentencepiece==0.2.0", "protobuf==5.29.3")
    .run_commands(
        f"python -c \"from transformers import AutoModel, AutoProcessor; AutoModel.from_pretrained('{SEER}'); AutoProcessor.from_pretrained('{SEER}')\"",
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


def strength(odds: float) -> float:
    """SigLIP's odds for a phrase as 0 (not seen) to 1 (clearly seen), on a log scale from FAINT to CLEAR."""
    import math

    if odds <= FAINT:
        return 0.0
    return round(min(1.0, math.log(odds / FAINT) / math.log(CLEAR / FAINT)), 2)


def looks_from(odds: dict[str, float]) -> dict[str, float]:
    """Each look's strength, from the best odds of its phrasings; looks not seen at all are left out."""
    found = {look: strength(max(odds[phrase] for phrase in phrases)) for look, phrases in LOOKS.items()}
    return {look: value for look, value in found.items() if value > 0}


def seen_from(odds: dict[str, float]) -> list[str]:
    """The suggested tags: the words seen clearly enough, most likely first."""
    ranked = sorted(((odds[word], word) for word in SEEN_WORDS if odds[word] >= SEEN_AT), reverse=True)
    return [word for _, word in ranked[:MOST_SEEN]]


@functools.lru_cache(maxsize=1)
def seer():
    """The model and every phrase it is asked about, read once per container."""
    import torch
    from transformers import AutoModel, AutoProcessor

    model = AutoModel.from_pretrained(SEER).eval()
    processor = AutoProcessor.from_pretrained(SEER)
    phrases = sorted({phrase for phrases in LOOKS.values() for phrase in phrases} | {f"__{word}" for word in SEEN_WORDS})
    texts = [f"This is a photo of {phrase.removeprefix('__')}." for phrase in phrases]
    with torch.no_grad():
        encoded = processor(text=texts, padding="max_length", max_length=64, return_tensors="pt")
        text = model.get_text_features(**encoded)
    return model, processor, phrases, text / text.norm(dim=-1, keepdim=True)


def frames_of(file: Path, directory: Path) -> list:
    """The picture itself, or FRAMES stills spread across a clip."""
    from PIL import Image, UnidentifiedImageError

    try:
        return [Image.open(file).convert("RGB")]
    except UnidentifiedImageError:
        pass
    seconds = seconds_of(file) or 1.0
    frames = []
    for index in range(FRAMES):
        still = directory / f"frame{index}.jpg"
        run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-ss", f"{seconds * (index + 0.5) / FRAMES:.3f}", "-i", str(file), "-frames:v", "1", str(still)], 60)
        if still.exists():
            frames.append(Image.open(still).convert("RGB"))
    if not frames:
        raise PrepareError("That file could not be read as a photo, video or GIF.")
    return frames


def describe(file: Path, directory: Path) -> dict:
    """What the picture is seen to show anywhere in it (the best frame for each phrase)."""
    import torch

    model, processor, phrases, text = seer()
    with torch.no_grad():
        pixels = processor(images=frames_of(file, directory), return_tensors="pt")
        image = model.get_image_features(**pixels)
        image = image / image.norm(dim=-1, keepdim=True)
        odds = torch.sigmoid(image @ text.T * model.logit_scale.exp() + model.logit_bias).max(dim=0).values.tolist()
    by_phrase = dict(zip(phrases, odds))
    return {"looks": looks_from(by_phrase), "seen": seen_from({word: by_phrase[f"__{word}"] for word in SEEN_WORDS})}


def shots_from(log: str, milliseconds: int, dark_ms: int = 0) -> list[list[int]]:
    """The video's shots as [start, end] in ms, from the scene changes ffmpeg reported. Shots under 0.8 s join their neighbour.
    The first shot starts after the dark opening (`opening_dark_ms`); when too little of it is left, the next shot opens the clip."""
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
    if dark_ms > 0:
        if out[0][1] - dark_ms >= MIN_SHOT_MS // 2 or len(out) == 1:
            out[0][0] = min(dark_ms, out[0][1] - 200)
        else:
            out.pop(0)
    return out[:MAX_SHOTS]


def opening_dark_ms(log: str) -> int:
    """How long a clip opens on black or fades in, in ms, from the brightness of its first frames (signalstats YAVG, 0-255).
    A clip that is dark all the way through (a night scene) is not dark at its opening: nothing is skipped."""
    frames = [(round(float(t) * 1000), float(y)) for t, y in re.findall(r"pts_time:([0-9.]+)[^\n]*\n[^\n]*?lavfi\.signalstats\.YAVG=([0-9.]+)", log)]
    if not frames:
        return 0
    levels = sorted(y for _, y in frames)
    lit = levels[int(len(levels) * 0.9)]
    if lit < DARK_Y:
        return 0
    bar = max(DARK_Y, lit * LIT_SHARE)
    first_lit = next(t for t, y in frames if y >= bar)
    return min(first_lit, MOST_DARK_MS)


def dark_opening(clip: Path) -> int:
    """`opening_dark_ms` of the prepared clip; a clip whose opening cannot be read is played from its start, as before."""
    try:
        log = run([
            "ffmpeg", "-hide_banner", "-t", str(DARK_SCAN_SECONDS), "-i", str(clip), "-an",
            "-vf", "scale=-2:90,signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-f", "null", "-",
        ], 60, stream="stderr")
    except PrepareError:
        return 0
    return opening_dark_ms(log)


def seconds_of(path: Path) -> float:
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)], 60).strip() or 0)


def encode(source: Path, clip: Path) -> str:
    """The small H.264 copy and the scene detector's log, from one pass over `source`."""
    # One pass over the source: the picture is decoded once and goes to the small H.264 copy and, scaled down, to the scene detector.
    return run([
        "ffmpeg", "-y", "-hide_banner", "-i", str(source), "-t", str(MAX_SECONDS), "-an",
        "-filter_complex",
        "[0:v]fps=30,split=2[full][look];"
        # Full HD at most (never enlarged): the cloud render is 1080x1920, and a clip kept at 720 wide came out soft.
        "[full]scale='min(1080,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p[small];"
        # The first frame is always kept (it is at 0, which is no cut): a video of one shot has no scene change, and an output that receives no frame makes ffmpeg fail.
        f"[look]scale=-2:160,select='gt(scene,{SCENE_THRESHOLD})+eq(n,0)',showinfo[scenes]",
        "-map", "[small]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-maxrate", "8M", "-bufsize", "16M",
        "-g", "10", "-bf", "0", "-movflags", "+faststart", str(clip),
        "-map", "[scenes]", "-f", "null", "-",
    ], 300, stream="stderr")


# Some cameras and editors write a video's colour space as "reserved", which ffmpeg then refuses ("Invalid color space"). The picture itself is fine:
# the same video is copied (no re-encode) with the usual colours written in.
COLOUR_TAGS = {
    "h264": "h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1",
    "hevc": "hevc_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1",
}


def with_colours(source: Path, directory: Path) -> Path | None:
    """`source` copied with its colour space written in, or None when that is not the problem we know how to mend (another codec)."""
    codec = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name", "-of", "default=nw=1:nk=1", str(source)], 60).strip()
    tag = COLOUR_TAGS.get(codec)
    if not tag:
        return None
    fixed = directory / "tagged.mp4"
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(source), "-map", "0:v:0", "-c", "copy", "-bsf:v", tag, str(fixed)], 120)
    return fixed


def size_from(answer: str) -> list[int]:
    """[width, height] from ffprobe's csv answer. A stream with side data (iPhone HDR) gets extra empty fields: "1080x1920x"."""
    found = re.match(r"\s*(\d+)x(\d+)", answer)
    if not found:
        raise PrepareError("That file could not be read as a photo, video or GIF.")
    return [int(found[1]), int(found[2])]


def size_of(path: Path) -> list[int]:
    """[width, height] of the first video stream, as ffmpeg decodes it (a phone video turned sideways is already turned)."""
    return size_from(run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", str(path)], 60))


def motion(source: Path, directory: Path) -> tuple[bytes, bytes, list[list[int]], list[int]]:
    seconds = seconds_of(source)
    # GIFs sometimes report no duration; only a clearly long clip is refused.
    if seconds > MAX_SECONDS:
        raise PrepareError(f"Videos can be up to {MAX_SECONDS} seconds long.")
    clip = directory / "clip.mp4"
    try:
        log = encode(source, clip)
    except PrepareError:
        fixed = with_colours(source, directory)
        if fixed is None:
            raise
        log = encode(fixed, clip)
    if not clip.exists() or clip.stat().st_size < 1000:
        raise PrepareError("That video has nothing to show.")
    if clip.stat().st_size > CLIP_MAX_BYTES:
        raise PrepareError("That video is too detailed to prepare. Try a shorter one.")
    milliseconds = round(seconds_of(clip) * 1000)
    if milliseconds < 500:
        raise PrepareError("That video is too short to use.")
    dark = dark_opening(clip) / 1000
    poster = directory / "poster.jpg"
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-ss", str(min(dark + 1.0, max(dark, seconds / 2))), "-i", str(clip),
        "-frames:v", "1", "-q:v", "3", str(poster),
    ], 60)
    # The clip is never enlarged, so its size is the source's (up to full HD): what the person's pictures are really made of.
    return clip.read_bytes(), poster.read_bytes(), shots_from(log, milliseconds, round(dark * 1000)), size_of(clip)


@app.function(image=image, cpu=4, memory=4096, min_containers=0, max_containers=6, scaledown_window=60, timeout=600)
def prepare(kind: str, source: str, puts: dict[str, str]) -> dict:
    """Returns {"ok": True, "bytes": {output: size}, "shots": [[start_ms, end_ms], ...], "width", "height" (video or GIF only)},
    for `describe` {"ok": True, "looks": {look: 0..1}, "seen": [tag, ...]}, or {"ok": False, "error": words for the person}."""
    with tempfile.TemporaryDirectory(prefix="mumoo-prepare-") as name:
        directory = Path(name)
        file = directory / "source"
        try:
            download(source, file)
            if kind == "describe":
                return {"ok": True, **describe(file, directory)}
            if kind == "photo":
                made = {"cutout": (cutout(file), "image/png")}
            else:
                clip, poster, found, size = motion(file, directory)
                made = {"motion": (clip, "video/mp4"), "poster": (poster, "image/jpeg")}
            for output, (data, content_type) in made.items():
                upload(puts[output], data, content_type)
            return {"ok": True, "bytes": {output: len(data) for output, (data, _) in made.items()}, **({"shots": found, "width": size[0], "height": size[1]} if kind == "motion" else {})}
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
