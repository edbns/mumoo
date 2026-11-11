"""CPU-only async Creatives Pack MP4 render for MUMOO Staging.

Exact-match architecture (the browser never renders or encodes):

  submit  POST  multipart {audio: 15s mono 32k WAV, meta: JSON, photo?, cutout?, motion?}  ->  {"id": "fc-..."}   (instant)
  status  GET   ?id=fc-...                                       ->  202 running | 200 MP4 | 4xx/5xx

The job renders the SAME Pixi scene the user previewed (same worlds, fonts, baked
Shaders looks) inside headless Chromium (software WebGL, no GPU). The 450 frames
are split into ranges rendered in parallel containers; ffmpeg encodes each range,
then concatenates the ranges and muxes the audio.

The browser sends only data (style, colours, cues, music). The worker loads the page and the
baked look backgrounds from the staging site; no URLs come from clients. A person's own picture
(Dust, Riso, Window, Our photography) arrives as fields (Dust and Riso: a photo and its cut-out mask; Our photography: a photo or a prepared clip; Window: either), sent by our
server after it read them from that person's storage, and is handed to the page when it asks.
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
CUTOUT_LIMIT = 1_000_000
MOTION_LIMIT = 40_000_000
META_LIMIT = 400_000
MEDIA_PATHS = {"photo": "/own-photo.jpg", "cutout": "/own-cutout.png", "motion": "/own-motion.mp4"}
MEDIA_TYPES = {"photo": "image/jpeg", "cutout": "image/png", "motion": "video/mp4"}
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,80}$")
CALL_RE = re.compile(r"^fc-[A-Za-z0-9]{8,48}$")
OPT_KEYS = {
    "style", "font", "fontSecondary", "layout",
    "cues", "music", "fallbackText", "bankId", "plateId", "typeStyle", "grade", "lyrics", "colors", "effectId",
    "motionShots", "cutSeed", "look", "inkSet", "sprayPalette", "windowMode", "windowPalette", "windowAllowed",
    "doodleId", "doodlePaper", "doodleMood",
}
HEX_RE = re.compile(r"^#[0-9a-f]{6}$")
# The kinds of creative the page draws, the Riso ink sets, the Spray walls and the Window screens and faces it knows (creative/src/ad-punch.ts, riso-look.ts, spray-look.ts, window-look.ts, window-deal.ts; a test keeps these in step).
# The live looks drawn on a picture of Our photography (creative/src/live-look-deal.ts; a test keeps these in step).
LIVE_LOOKS = {"thermal", "arctic", "night", "whitehot", "blackhot", "rainbow", "lava", "crimson", "amber", "gold", "ultraviolet", "acid", "vapor", "candy", "dusk", "lagoon", "aurora", "cyanotype", "halftone", "halftonebw", "halftonenews", "halftoneblue", "halftonered", "halftonepink", "halftoneteal", "halftonepop", "halftoneneon", "halftoneinvert", "halftonegold", "halftonecmyk", "halftoneriso", "halftoneblueprint", "halftonesepia", "halftonemanga", "halftonesubway", "halftonesunset", "halftonematcha", "halftonecandy", "halftonetarot", "halftoneacid", "halftonesilver", "halftonephosphor", "halftoneuv", "halftonecopper", "halftoneengrave", "halftonehatch", "halftoneled", "halftonebenday", "dithermac", "ditherinvert", "dithergameboy", "dithercga", "dithercgagreen", "ditherega", "ditherc64", "ditherapple2", "ditherpico8", "ditheramiga", "ditherreceipt", "ditherblueprint", "ditheramber", "dithersunset", "dithervapor", "ditherforest", "dithernews", "ditherneon", "dithergold", "ditherown", "glowbloom", "glowpink", "glowcyan", "glowsplit", "glowamber", "glowgold", "glowuv", "glowtoxic", "glowred", "glowpeach", "glowice", "glowprism", "glowdream", "glownoir", "glowclub", "glowmist", "glowlilac", "glowrose"}
STYLES = {"bank", "pulise", "dust", "filter", "riso", "spray", "window", "doodle"}
RISO_INK_SETS = {"pink-blue", "orange-teal", "violet-coral", "red-green"}
SPRAY_PALETTES = {"neon-night", "neon-plum", "neon-navy", "bold-offwhite", "bold-grey", "bold-pastel"}
WINDOW_PALETTES = {
    "black", "off-white", "sand", "hot-red", "orange", "sun-yellow", "acid-yellow", "lime",
    "green", "deep-green", "teal", "cyan", "cobalt", "violet", "magenta", "hot-pink",
}
WINDOW_FACES = {"Anton", "Big Shoulders Display", "Staatliches", "Bangers", "Barlow Condensed"}
# What a Window card shows through its word: our approved photo (a person stands in front of the word, or not), one baked effect, one baked background, or the person's own photo or clip.
WINDOW_MODES = {"person", "plain", "effect", "bank"}
# Doodle draws a singer (named by an id of one or two singers: creative/src/doodle-cast.ts), on a paper, feeling a mood, writing in one of two hands (a test keeps these in step).
DOODLE_ID_RE = re.compile(r"^[a-z0-9]+(\.[a-z0-9]+){2,3}(\+[a-z0-9]+(\.[a-z0-9]+){2,3})?$")
DOODLE_PAPERS = {"white", "ruled", "graph", "kraft"}
DOODLE_MOODS = {"joyful", "flirty", "angry", "sad", "boastful"}
DOODLE_FACES = {"Caveat Brush", "Permanent Marker"}
DOODLE_KEYS = ("doodleId", "doodlePaper", "doodleMood")
WINDOW_KEYS = ("windowMode", "windowPalette", "windowAllowed")
# Styles drawn from a person cut out of a photo: an approved plate (`plateId`) or the person's own photo and cut-out mask.
CUT_OUT_STYLES = {"dust", "riso"}
# Lyric type styles and display fonts the page knows (creative/src/pack-type.ts, font-catalog.ts; a test keeps these in step).
TYPE_STYLES = {
    "typewriter", "karaoke", "stack", "minimal", "editorial", "outline",
    "bounce", "wave", "glitch", "rotate", "stretch", "split", "wipe", "flicker",
    "zoom", "scatter", "jitter", "echo", "slide", "tilt",
}
FONTS = {
    "Anton", "Bebas Neue", "Archivo Black", "Dela Gothic One", "Big Shoulders Display", "League Gothic", "Staatliches",
    "Bowlby One", "Alfa Slab One", "Black Ops One", "Barlow Condensed", "Oswald", "Teko", "Shrikhand", "Chango", "Bangers",
    "Righteous", "Bungee", "Rubik Spray Paint", "Sedgwick Ave Display", "Permanent Marker", "Caveat Brush", "Pacifico",
    "Lobster", "Kaushan Script", "Fredoka", "Baloo 2", "Nunito", "Abril Fatface", "DM Serif Display", "Bodoni Moda",
    "Gloock", "Rozha One", "Fraunces", "UnifrakturCook", "Pirata One", "Metal Mania", "Audiowide", "Rubik Mono One",
    "Orbitron", "Oxanium", "Chakra Petch", "Zen Dots", "Wallpoet", "Rubik Glitch", "Press Start 2P", "Silkscreen",
}
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


def handing(body: bytes, content_type: str):
    """A route handler that serves one file. (Playwright passes extra arguments to any handler with defaults, so it is a closure.)"""
    return lambda route: route.fulfill(body=body, content_type=content_type)


@app.function(
    image=image,
    cpu=4,
    memory=4096,
    min_containers=0,
    max_containers=60,
    scaledown_window=10,
    timeout=270,
)
def render_chunk(opts: dict, media: dict[str, bytes], start: int, end: int) -> bytes:
    """Render frames [start, end) of the real Pixi scene to a silent H.264 segment."""
    from playwright.sync_api import sync_playwright

    opts = {**opts, **{f"{name}Url": MEDIA_PATHS[name] for name in media}}
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
                for name in media:
                    page.route(f"**{MEDIA_PATHS[name]}", handing(media[name], MEDIA_TYPES[name]))
                page.goto(f"{SITE}/render.html", wait_until="load", timeout=60_000)
                page.wait_for_function("window.mumooPack", timeout=60_000)
                problems: list[str] = []
                page.on("console", lambda message: problems.append(message.text[:200]) if message.type == "error" else None)
                page.on("pageerror", lambda error: problems.append(str(error)[:200]))
                try:
                    page.evaluate(
                        "o => Promise.race([window.mumooPack.prepare(o), new Promise((_, stop) => setTimeout(() => stop(new Error('prepare stalled')), 90000))])",
                        opts,
                    )
                except Exception as stalled:
                    raise RuntimeError(f"Scene could not start: {str(stalled)[:200]} {problems[-3:]}") from None
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
    max_containers=30,
    scaledown_window=10,
    timeout=900,
)
def render_job(audio: bytes, opts: dict, media: dict[str, bytes]) -> bytes:
    """Fan the frame ranges out in parallel, then concat + mux audio."""
    ranges = [(i, min(i + CHUNK_FRAMES, FRAMES)) for i in range(0, FRAMES, CHUNK_FRAMES)]
    segments = list(render_chunk.map(
        [opts] * len(ranges), [media] * len(ranges),
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
    if opts["style"] not in STYLES:
        raise ValueError("style")
    if opts["font"] not in FONTS or opts["fontSecondary"] not in FONTS:
        raise ValueError("font")
    layout = opts.get("layout")
    if not isinstance(layout, dict) or not {"rotate", "scaleBias", "cut"} <= set(layout) <= {"rotate", "scaleBias", "cut", "seed"}:
        raise ValueError("layout")
    if not all(type(layout[key]) in (int, float) for key in ("rotate", "scaleBias", "cut")) or ("seed" in layout and type(layout["seed"]) is not int):
        raise ValueError("layout")
    # Riso and Spray are drawn from a seed (where the words fall, how the paper is stained), their inks or wall by id, and nothing else.
    for style, key, known in (("riso", "inkSet", RISO_INK_SETS), ("spray", "sprayPalette", SPRAY_PALETTES)):
        if (opts["style"] == style) != (key in opts) or (key in opts and opts[key] not in known):
            raise ValueError(key)
        if opts["style"] == style and "seed" not in layout:
            raise ValueError("layout")
    # Window is drawn from a seed (the screen flips), a kind of picture, the screen it opens on and the screens it may flip to, in one of its condensed faces.
    if opts["style"] == "window":
        allowed = opts.get("windowAllowed")
        if not all(key in opts for key in WINDOW_KEYS) or "seed" not in layout or opts["windowMode"] not in WINDOW_MODES:
            raise ValueError("window")
        if not isinstance(allowed, list) or not 0 < len(allowed) <= len(WINDOW_PALETTES) or len(set(allowed)) != len(allowed):
            raise ValueError("windowAllowed")
        if not all(isinstance(id_, str) and id_ in WINDOW_PALETTES for id_ in allowed) or opts["windowPalette"] not in allowed:
            raise ValueError("windowPalette")
        if opts["font"] not in WINDOW_FACES:
            raise ValueError("font")
    elif any(key in opts for key in WINDOW_KEYS):
        raise ValueError("window")
    # Doodle is drawn from a seed (where the strokes wander), a singer, a paper and a mood, in its own hands, and nothing else.
    if opts["style"] == "doodle":
        if not all(key in opts for key in DOODLE_KEYS) or "seed" not in layout:
            raise ValueError("doodle")
        if not isinstance(opts["doodleId"], str) or len(opts["doodleId"]) > 120 or not DOODLE_ID_RE.match(opts["doodleId"]):
            raise ValueError("doodleId")
        if opts["doodlePaper"] not in DOODLE_PAPERS or opts["doodleMood"] not in DOODLE_MOODS:
            raise ValueError("doodle")
        if opts["font"] not in DOODLE_FACES:
            raise ValueError("font")
    elif any(key in opts for key in DOODLE_KEYS):
        raise ValueError("doodle")
    if "bankId" in opts and (not isinstance(opts["bankId"], str) or not ID_RE.match(opts["bankId"])):
        raise ValueError("bankId")
    for key in ("plateId", "effectId"):
        if key in opts and (not isinstance(opts[key], str) or not ID_RE.match(opts[key])):
            raise ValueError(key)
    # A live look is drawn on a picture of Our photography (a library picture or the person's own), never on a baked effect, which is already a look.
    if "look" in opts and (opts["look"] not in LIVE_LOOKS or opts["style"] != "filter" or "effectId" in opts):
        raise ValueError("look")
    if "cutSeed" in opts and (type(opts["cutSeed"]) is not int or not 0 <= opts["cutSeed"] < 1_000_000):
        raise ValueError("cutSeed")
    if "motionShots" in opts:
        shots = opts["motionShots"]
        if not isinstance(shots, list) or not 0 < len(shots) <= 40:
            raise ValueError("motionShots")
        for shot in shots:
            ok = isinstance(shot, list) and len(shot) == 2 and all(type(edge) is int for edge in shot)
            if not ok or not 0 <= shot[0] < shot[1] <= 60_000:
                raise ValueError("motionShots")
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


def window_media(opts: dict, media: dict[str, bytes]) -> set[str]:
    """The media a Window card takes: none when it is drawn from one of our pictures (the one its mode names); else, for `person` and `plain`,
    the person's own photo with its cut-out mask (the mask is used only by `person`) or, for `plain`, their own clip."""
    mode = opts["windowMode"]
    ours = {"person": "plateId", "plain": "plateId", "effect": "effectId", "bank": "bankId"}[mode]
    named = {key for key in ("plateId", "effectId", "bankId") if key in opts}
    if named == {ours}:
        return set()
    if named or mode not in ("person", "plain") or (mode == "person" and "motion" in media):
        raise ValueError("media")
    return {"photo", "cutout"} if "photo" in media else {"motion"}


def check_media(opts: dict, media: dict[str, bytes]) -> None:
    """Dust and Riso are drawn from an approved photo (`plateId`) and Our photography (style "filter") from that photo (`plateId`, with a live look) or one baked effect on it
    (`effectId`); the page loads either from the site itself. All three can instead be drawn from the person's own picture:
    Dust and Riso a photo with its cut-out mask, Our photography a photo or a clip. Window has its own rules (`window_media`).
    Nothing else takes a picture (Spray takes none). Raises ValueError when the media sent is not exactly what the card needs."""
    if opts["style"] == "window":
        wanted = window_media(opts, media)
    else:
        named = {key for key in ("plateId", "effectId") if key in opts}
        wanted = set()
        if opts["style"] == "filter":
            # One of our own pictures (our photo, or one baked effect on it), or the person's or the library's photo or clip.
            if len(named) > 1:
                raise ValueError("media")
            if not named:
                wanted = {"photo"} if "photo" in media else {"motion"}
        else:
            approved = {"dust": "plateId", "riso": "plateId"}.get(opts["style"])
            if approved and approved not in named:
                wanted = {"photo", "cutout"}
            if named - {approved}:
                raise ValueError("media")
    if set(media) != wanted:
        raise ValueError("media")


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
        media: dict[str, bytes] = {}
        for name, limit in (("photo", PHOTO_LIMIT), ("cutout", CUTOUT_LIMIT), ("motion", MOTION_LIMIT)):
            field = form.get(name)
            if field is not None:
                media[name] = await field.read()
                if len(media[name]) > limit:
                    raise ValueError(name)
        if "photo" in media and media["photo"][:3] != b"\xff\xd8\xff":
            raise ValueError("photo")
        check_media(opts, media)
    except (TypeError, ValueError, binascii.Error, json.JSONDecodeError, AttributeError):
        raise HTTPException(400, "Expected a 15s mono 32kHz WAV and valid render metadata.") from None

    call = await render_job.spawn.aio(audio, opts, media)
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
