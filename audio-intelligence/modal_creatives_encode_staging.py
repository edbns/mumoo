"""CPU-only async Creatives Pack MP4 render for MUMOO Staging.

Exact-match architecture (the browser never renders or encodes):

  submit  POST  multipart {audio: 15s mono 32k WAV, meta: JSON, image?: JPEG}  ->  {"id": "fc-..."}   (instant)
  status  GET   ?id=fc-...                                       ->  202 running | 200 MP4 | 4xx/5xx

The job renders the SAME Pixi scene the user previewed (same worlds, fonts, baked
Shaders looks) inside headless Chromium (software WebGL, no GPU). The 450 frames
are split into ranges rendered in parallel containers; ffmpeg encodes each range,
then concatenates the ranges and muxes the audio.

The browser sends only data (style, colours, cues, music). The worker loads the page and the
baked look backgrounds from the staging site; no URLs come from clients. A person's own photo
(Dust, Filter) arrives as a JPEG field, sent by our server after it read the photo from that
person's storage, and is handed to the page when it asks for it.
"""
from __future__ import annotations

import base64
import binascii
import json
import re
import struct
import subprocess
import tempfile
from pathlib import Path

from fastapi import HTTPException, Request, Response
import modal

APP = "mumoo-creatives-encode-staging"
SITE = "https://mumoo-staging.netlify.app"
DURATION_S = 15
FPS = 30
FRAMES = DURATION_S * FPS
CHUNK_FRAMES = 45
SAMPLE_RATE = 32000
WAV_DATA = SAMPLE_RATE * DURATION_S * 2
WAV_BYTES = 44 + WAV_DATA
BODY_LIMIT = 2_000_000
PHOTO_LIMIT = 3_000_000
META_LIMIT = 400_000
PHOTO_PATH = "/own-photo.jpg"
FILTERS = {"duotone", "split", "halftone", "glow"}
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,80}$")
CALL_RE = re.compile(r"^fc-[A-Za-z0-9]{8,48}$")
OPT_KEYS = {
    "style", "font", "fontSecondary", "layout",
    "cues", "music", "fallbackText", "bankId", "typeStyle", "grade", "lyrics", "colors", "filter",
}
HEX_RE = re.compile(r"^#[0-9a-f]{6}$")
TYPE_STYLES = {"typewriter", "karaoke", "stack", "minimal", "editorial", "outline"}
# What the lyrics do to colour and beat hits: five numbers, each inside the range the app can produce.
GRADE_RANGES = {"saturation": (0.55, 1.15), "warmth": (-1, 1), "brightness": (0.8, 1), "contrast": (1, 1.1), "calm": (0, 1)}

# One image for the whole app (the module imports fastapi at top level).
image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg", "chromium", "fonts-liberation")
    .pip_install("fastapi==0.115.12", "python-multipart==0.0.20", "playwright==1.52.0")
)
app = modal.App(APP)
secret = modal.Secret.from_name("mumoo-music-bridge")


def authorized(request: Request) -> None:
    import os

    auth = request.headers.get("authorization") or ""
    bridge = os.environ.get("MUMOO_MUSIC_BRIDGE_SECRET") or ""
    if len(bridge) < 32 or auth != f"Bearer {bridge}":
        raise HTTPException(401, "Unauthorized.")


def wav_header_ok(audio: bytes) -> bool:
    if len(audio) != WAV_BYTES:
        return False
    expected = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF", WAV_BYTES - 8, b"WAVE", b"fmt ", 16, 1, 1,
        SAMPLE_RATE, SAMPLE_RATE * 2, 2, 16, b"data", WAV_DATA,
    )
    return audio[:44] == expected


def run(cmd: list[str], cwd: Path, timeout: int) -> None:
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=timeout, cwd=cwd)
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or b"").decode("utf-8", errors="replace")[-300:]
        raise RuntimeError(f"ffmpeg failed. {detail}".strip()) from None


@app.function(
    image=image,
    cpu=4,
    memory=4096,
    min_containers=0,
    max_containers=12,
    scaledown_window=10,
    timeout=270,
)
def render_chunk(opts: dict, photo: bytes | None, start: int, end: int) -> bytes:
    """Render frames [start, end) of the real Pixi scene to a silent H.264 segment."""
    from playwright.sync_api import sync_playwright

    if photo is not None:
        opts = {**opts, "photoUrl": PHOTO_PATH}
    with tempfile.TemporaryDirectory(prefix="mumoo-chunk-") as directory:
        out = Path(directory) / "seg.mp4"
        encoder = subprocess.Popen(
            [
                "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                "-f", "image2pipe", "-framerate", str(FPS), "-c:v", "mjpeg", "-i", "pipe:0",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-maxrate", "14M", "-bufsize", "28M",
                "-pix_fmt", "yuv420p", "-color_range", "tv",
                "-bf", "0", "-g", str(FPS), "-keyint_min", str(FPS),
                "-x264-params", "scenecut=0",
                "-video_track_timescale", "15360",
                str(out),
            ],
            stdin=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        try:
            with sync_playwright() as pw:
                browser = pw.chromium.launch(
                    executable_path="/usr/bin/chromium",
                    headless=True,
                    args=[
                        "--use-gl=angle", "--use-angle=swiftshader",
                        "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
                        "--disable-dev-shm-usage",
                    ],
                )
                page = browser.new_page(viewport={"width": 1080, "height": 1920}, device_scale_factor=1)
                if photo is not None:
                    page.route(
                        f"**{PHOTO_PATH}",
                        lambda route: route.fulfill(body=photo, content_type="image/jpeg"),
                    )
                page.goto(f"{SITE}/render.html", wait_until="load", timeout=60_000)
                page.wait_for_function("window.mumooPack", timeout=60_000)
                page.evaluate("o => window.mumooPack.prepare(o)", opts)
                for frame in range(start, end):
                    data = page.evaluate("n => window.mumooPack.frame(n, true)", frame)
                    assert encoder.stdin is not None
                    encoder.stdin.write(base64.b64decode(data))
                browser.close()
            assert encoder.stdin is not None
            encoder.stdin.close()
            if encoder.wait(timeout=60) != 0:
                err = (encoder.stderr.read() if encoder.stderr else b"")[-300:].decode("utf-8", "replace")
                raise RuntimeError(f"segment encode failed: {err}")
        finally:
            if encoder.poll() is None:
                encoder.kill()
        data = out.read_bytes()
        if len(data) < 1000:
            raise RuntimeError("Segment is empty.")
        return data


@app.function(
    image=image,
    cpu=2,
    memory=2048,
    min_containers=0,
    max_containers=8,
    scaledown_window=10,
    timeout=290,
)
def render_job(audio: bytes, opts: dict, photo: bytes | None) -> bytes:
    """Fan the frame ranges out in parallel, then concat + mux audio."""
    ranges = [(i, min(i + CHUNK_FRAMES, FRAMES)) for i in range(0, FRAMES, CHUNK_FRAMES)]
    segments = list(render_chunk.map(
        [opts] * len(ranges), [photo] * len(ranges),
        [r[0] for r in ranges], [r[1] for r in ranges],
    ))
    with tempfile.TemporaryDirectory(prefix="mumoo-mux-") as directory:
        d = Path(directory)
        lines = []
        for index, segment in enumerate(segments):
            (d / f"s{index:02d}.mp4").write_bytes(segment)
            lines.append(f"file 's{index:02d}.mp4'")
        (d / "list.txt").write_text("\n".join(lines) + "\n")
        (d / "clip.wav").write_bytes(audio)
        run([
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-f", "concat", "-safe", "0", "-i", "list.txt",
            "-i", "clip.wav",
            "-map", "0:v:0", "-map", "1:a:0",
            "-c:v", "copy", "-c:a", "aac", "-ar", "48000", "-b:a", "192k",
            "-t", str(DURATION_S), "-movflags", "+faststart", "out.mp4",
        ], d, 120)
        data = (d / "out.mp4").read_bytes()
    if len(data) < 1000:
        raise RuntimeError("Render produced an empty file.")
    return data


def parse_meta(raw: str) -> dict:
    opts = json.loads(raw).get("opts")
    if not isinstance(opts, dict) or not set(opts) <= OPT_KEYS:
        raise ValueError("opts")
    for key in ("style", "font", "fontSecondary"):
        if not isinstance(opts.get(key), str) or len(opts[key]) > 60:
            raise ValueError(key)
    if "bankId" in opts and (not isinstance(opts["bankId"], str) or not ID_RE.match(opts["bankId"])):
        raise ValueError("bankId")
    if "typeStyle" in opts and opts["typeStyle"] not in TYPE_STYLES:
        raise ValueError("typeStyle")
    grade = opts.get("grade")
    if grade is not None:
        if not isinstance(grade, dict) or set(grade) != set(GRADE_RANGES):
            raise ValueError("grade")
        for key, (low, high) in GRADE_RANGES.items():
            value = grade[key]
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not low <= value <= high:
                raise ValueError("grade")
    if "lyrics" in opts and not isinstance(opts["lyrics"], bool):
        raise ValueError("lyrics")
    colors = opts.get("colors")
    if colors is not None and (
        not isinstance(colors, dict) or set(colors) != {"ground", "dust"}
        or not all(isinstance(v, str) and HEX_RE.match(v) for v in colors.values())
    ):
        raise ValueError("colors")
    if "filter" in opts and opts["filter"] not in FILTERS:
        raise ValueError("filter")
    cues = opts.get("cues")
    if not isinstance(cues, list) or len(cues) > 160:
        raise ValueError("cues")
    for cue in cues:
        if not isinstance(cue, dict) or not isinstance(cue.get("text"), str) or len(cue["text"]) > 200:
            raise ValueError("cue")
    if not isinstance(opts.get("fallbackText"), str) or len(opts["fallbackText"]) > 80:
        raise ValueError("fallbackText")
    # Re-serialise so nothing but plain JSON reaches the page.
    return json.loads(json.dumps(opts))


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
        if len(audio) > BODY_LIMIT or not wav_header_ok(audio):
            raise ValueError("audio")
        opts = parse_meta(str(meta_raw))
        photo_file = form.get("image")
        photo = await photo_file.read() if photo_file is not None else None
        if photo is not None and (len(photo) > PHOTO_LIMIT or photo[:3] != b"\xff\xd8\xff"):
            raise ValueError("photo")
        # Dust and Filter are made of a person's photo; no other style takes one.
        if (opts["style"] in ("dust", "filter")) != (photo is not None):
            raise ValueError("photo")
    except (TypeError, ValueError, binascii.Error, json.JSONDecodeError, AttributeError):
        raise HTTPException(400, "Expected a 15s mono 32kHz WAV and valid render metadata.") from None

    call = await render_job.spawn.aio(audio, opts, photo)
    return {"id": call.object_id}


@app.function(image=image, secrets=[secret], timeout=30, scaledown_window=10)
@modal.fastapi_endpoint(method="GET", docs=False)
async def status(request: Request, id: str = ""):
    authorized(request)
    if not CALL_RE.match(id):
        raise HTTPException(400, "Invalid job id.")
    call = modal.FunctionCall.from_id(id)
    try:
        mp4 = await call.get.aio(timeout=0)
    except TimeoutError:
        # Modal raises the builtin TimeoutError when timeout=0 and the job is still running.
        return Response(
            content=json.dumps({"status": "running"}),
            status_code=202,
            media_type="application/json",
            headers={"Cache-Control": "no-store"},
        )
    except modal.exception.OutputExpiredError:
        raise HTTPException(410, "This render expired. Start it again.") from None
    except Exception:  # noqa: BLE001 - job failures are reported generically
        raise HTTPException(502, "The render failed. Try again.") from None
    return Response(
        content=mp4,
        media_type="video/mp4",
        headers={"Cache-Control": "no-store", "X-Mumoo-Encode": "modal-pixi-v3"},
    )
