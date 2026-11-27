"""CPU-only async Creatives Pack MP4 render for MUMOO Staging.

Exact-match architecture (the browser never renders or encodes):

  submit  POST  multipart {audio: 10-15 s mono 32k WAV, meta: JSON, photo?, cutout?, motion?}  ->  {"id": "fc-..."}   (instant)
  status  GET   ?id=fc-...                                       ->  202 running | 200 MP4 | 4xx/5xx

The job renders the SAME Pixi scene the user previewed (same worlds, fonts, baked
Shaders looks) inside headless Chromium (software WebGL, no GPU). The frames (450 for 15 s)
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
import os
import re
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlparse

from fastapi import HTTPException, Request, Response
import modal

from clip_wav import clip_ms, max_bytes

APP = "mumoo-creatives-encode-staging"
# The site whose render page draws the frames: each Modal environment's mumoo-music-bridge secret names its own (live: mumoo.app).
STAGING_SITE = "https://mumoo-staging.netlify.app"
FPS = 30
CHUNK_FRAMES = 45
# A whole video's chunks are in by then or the job fails (and the queue tries it again); one takes about a minute, more under load.
CHUNKS_DEADLINE_S = 480
SAMPLE_RATE = 32000
PHOTO_LIMIT = 3_000_000
CUTOUT_LIMIT = 1_000_000
MOTION_LIMIT = 40_000_000
META_LIMIT = 400_000
MEDIA_PATHS = {"photo": "/own-photo.jpg", "cutout": "/own-cutout.png", "motion": "/own-motion.mp4"}
MEDIA_TYPES = {"photo": "image/jpeg", "cutout": "image/png", "motion": "video/mp4"}
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,80}$")
CALL_RE = re.compile(r"^fc-[A-Za-z0-9]{8,48}$")
OPT_KEYS = {
    # The card's length; the job sets it from the audio it is sent, whatever the browser said.
    "durationMs",
    "style", "font", "fontSecondary", "layout",
    "cues", "music", "fallbackText", "plateId", "typeStyle", "typeFinish", "typeAccent", "typeEmphasis", "grade", "lyrics", "colors", "effectId",
    "motionShots", "reel", "cutSeed", "look", "inkSet", "windowMode", "windowPalette", "windowAllowed", "windowShape",
    "treatment", "treatmentVariant", "preset", "presetTake", "clock",
}
HEX_RE = re.compile(r"^#[0-9a-f]{6}$")
# A Director's reel: two to twelve library pictures or clips the page fetches itself, from links the site made for them (private bucket, signed, short-lived).
REEL_MAX = 12
REEL_HOST_SUFFIX = ".r2.cloudflarestorage.com"
# The kinds of creative the page draws, the Riso ink sets and the Window screens and faces it knows (creative/src/ad-punch.ts, riso-look.ts, window-look.ts, window-deal.ts; a test keeps these in step).
# The live looks drawn on a picture of Our photography (creative/src/live-look-deal.ts; a test keeps these in step).
LIVE_LOOKS = {"thermal", "arctic", "night", "whitehot", "blackhot", "rainbow", "lava", "crimson", "amber", "gold", "ultraviolet", "acid", "vapor", "candy", "dusk", "lagoon", "aurora", "cyanotype", "halftone", "halftonebw", "halftonenews", "halftoneblue", "halftonered", "halftonepink", "halftoneteal", "halftonepop", "halftoneneon", "halftoneinvert", "halftonegold", "halftonecmyk", "halftoneriso", "halftoneblueprint", "halftonesepia", "halftonemanga", "halftonesubway", "halftonesunset", "halftonematcha", "halftonecandy", "halftonetarot", "halftoneacid", "halftonesilver", "halftonephosphor", "halftoneuv", "halftonecopper", "halftoneengrave", "halftonehatch", "halftoneled", "halftonebenday", "dithermac", "ditherinvert", "dithergameboy", "dithercga", "dithercgagreen", "ditherega", "ditherc64", "ditherapple2", "ditherpico8", "ditheramiga", "ditherreceipt", "ditherblueprint", "ditheramber", "dithersunset", "dithervapor", "ditherforest", "dithernews", "ditherneon", "dithergold", "ditherown", "asciigreen", "asciiamber", "asciiwhite", "asciitype", "asciicolour", "asciicyan", "asciipink", "asciiblueprint", "asciimatrix", "asciired", "asciigold", "asciiice", "asciinews", "asciisunset", "asciibinary", "asciiblocks", "asciislash", "asciimumoo"}
STYLES = {"pulise", "dust", "filter", "riso", "window", "treatment"}
# Video treatments over the Director's reel (creative/src/treatment-deal.ts; a test keeps these in step).
TREATMENTS = {
    "triptych": {"narrow", "medium", "wide", "breathing"},
    "fisheye": {"subtle", "medium", "strong", "extreme"},
    "collage": {"editorial", "scatter", "stack", "offset"},
    "frame": {"slim", "bold", "accent", "ink"},
    "bento": {"hero-left", "hero-top", "mosaic", "strip"},
    "grain": {"fine", "classic", "heavy", "halation"},
    "double": {"blend", "screen", "offset-cut", "offset-far"},
    "sideways": {"pillar"},
    "typewriter": {"newsprint", "letter", "faded", "yellowed", "red-ink", "yellow-ink", "purple-ink"},
    "broken": {"shatter", "corner", "spider", "pixels"},
    "screenshot": {"light-black", "light-white", "dark-white", "screen"},
    "stutter": {"bar", "beat", "roll", "flash"},
}
# Screenshot's phone clock: the time the person made the card, "HH:MM" on 24 hours.
CLOCK_RE = re.compile(r"^([01][0-9]|2[0-3]):[0-5][0-9]$")
# Edit presets over Directed and its treatments, with their takes (creative/src/edit-presets.ts; a test keeps these in step).
PRESETS = {
    "kodak": {"portra-drift", "vision-push", "portra-push", "vision-drift"},
    "vhs": {"rec", "clean"},
    "strobe": {"neon-white", "mono-black", "neon-black", "mono-white"},
    "y2k": {"whip", "zoom"},
    "dreamy": {"pastel", "golden"},
    "mono": {"grit", "punch", "ghost", "cctv"},
    "golden": {"amber", "live", "bloom", "haze"},
    "baile": {"whip", "fisheye", "neon", "street"},
    "afterhours": {"cyan", "magenta", "drag"},
    "super8": {"porch", "road", "dust"},
}
RISO_INK_SETS = {"pink-blue", "orange-teal", "violet-coral", "red-green"}
# Pulse's colour sets (creative/src/pack-pulise.ts).
PULISE_SETS = {"red", "green"}
INK_SETS = {"riso": RISO_INK_SETS, "pulise": PULISE_SETS}
WINDOW_PALETTES = {"black", "off-white", "red", "plum", "pink", "green"}
# Staatliches and Bangers are no longer dealt; cards made with them still render.
WINDOW_FACES = {"Anton", "Big Shoulders Display", "Barlow Condensed", "League Gothic", "Staatliches", "Bangers"}
# What a Window card shows its picture through (a Director's reel, our approved photo, or a photo or clip of the library or the person):
# the lyric word (`plain`, on black or white), or the still figure of a person (`silhouette`, on red, black or white).
WINDOW_MODES = {"plain", "silhouette"}
WINDOW_SCREENS = {"plain": {"black", "off-white", "plum"}, "silhouette": {"red", "black", "off-white", "plum", "pink", "green"}}
# The figures of creative/public/silhouettes (creative/src/silhouette.ts).
WINDOW_SHAPES = {"art-locs", "art-hood", "art-cap", "art-beard", "art-headphones", "art-afro", "art-profile", "art-braids", "art-bun", "art-lying", "art-shades", "art-embrace", "art-skull", "man-cap", "woman-hair", "man-wide", "woman-wide", "woman-curls", "man-hood", "woman-head", "man-head"}
WINDOW_KEYS = ("windowMode", "windowPalette", "windowAllowed")
# Lyric type styles and display fonts the page knows (creative/src/pack-type.ts, font-catalog.ts; a test keeps these in step).
TYPE_STYLES = {
    "typewriter", "karaoke", "stack", "minimal", "editorial", "outline", "swap", "poem",
    "bounce", "wave", "glitch", "rotate", "stretch", "split", "wipe", "flicker",
    "zoom", "scatter", "jitter", "echo", "slide", "tilt", "rise", "glow", "drift",
    "clean", "brat", "subtitle", "impact", "hollow", "inked", "inked-red", "elegant", "scramble", "blur",
}
# How a card's lyric letters are finished (creative/src/type-finish.ts; a test keeps these in step).
# How a card sets the line's key word apart (creative/src/type-finish.ts; a test keeps these in step).
TYPE_EMPHASES = {
    "tone", "serif",
}
TYPE_FINISHES = {
    "solid", "gradient", "box", "sticker", "glass", "print",
}
FONTS = {
    "Anton", "Bebas Neue", "Archivo Black", "Dela Gothic One", "Big Shoulders Display", "League Gothic", "Staatliches",
    "Bowlby One", "Alfa Slab One", "Black Ops One", "Barlow Condensed", "Oswald", "Teko", "Shrikhand", "Chango", "Bangers",
    "Righteous", "Bungee", "Rubik Spray Paint", "Sedgwick Ave Display", "Permanent Marker", "Caveat Brush", "Pacifico",
    "Lobster", "Kaushan Script", "Fredoka", "Baloo 2", "Nunito", "Abril Fatface", "DM Serif Display", "Bodoni Moda",
    "Gloock", "Rozha One", "Fraunces", "UnifrakturCook", "Pirata One", "Metal Mania", "Audiowide", "Rubik Mono One",
    "Orbitron", "Oxanium", "Chakra Petch", "Zen Dots", "Wallpoet", "Rubik Glitch", "Press Start 2P", "Silkscreen",
    "Syne", "Unbounded", "Krona One",
}
# What the lyrics do to colour and beat hits: five numbers, each inside the range the app can produce.
GRADE_RANGES = {"saturation": (0.55, 1.15), "warmth": (-1, 1), "brightness": (0.8, 1), "contrast": (1, 1.1), "calm": (0, 1)}

# One image for the whole app (the module imports fastapi at top level).
image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg", "chromium", "fonts-liberation")
    .pip_install("fastapi==0.115.12", "python-multipart==0.0.20", "playwright==1.52.0")
    .add_local_python_source("clip_wav")
)
app = modal.App(APP)
secret = modal.Secret.from_name("mumoo-music-bridge")


def authorized(request: Request) -> None:
    import os

    auth = request.headers.get("authorization") or ""
    bridge = os.environ.get("MUMOO_MUSIC_BRIDGE_SECRET") or ""
    if len(bridge) < 32 or auth != f"Bearer {bridge}":
        raise HTTPException(401, "Unauthorized.")


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
    # Many chunks ask storage for the same clips at once: a passing failure is tried again rather than failing the whole video.
    retries=modal.Retries(max_retries=2, initial_delay=1.0, backoff_coefficient=2.0),
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
                page.goto(f"{os.environ.get('MUMOO_SITE') or STAGING_SITE}/render.html", wait_until="load", timeout=60_000)
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
    # The chunks' deadline plus joining them; the queue gives up on a job it has not heard back from after 12 minutes.
    timeout=600,
    # A reclaimed container would start the whole video again.
    nonpreemptible=True,
)
def render_job(audio: bytes, opts: dict, media: dict[str, bytes]) -> bytes:
    """Fan the frame ranges out in parallel, then concat + mux audio. The clip's length (10 to 15 s) is the video's."""
    import time

    duration_ms = clip_ms(audio, SAMPLE_RATE)
    frames = duration_ms * FPS // 1000
    opts = {**opts, "durationMs": duration_ms}
    ranges = [(i, min(i + CHUNK_FRAMES, frames)) for i in range(0, frames, CHUNK_FRAMES)]
    # Each chunk is its own call, fetched on its own: one result lost on the way (a dropped connection) is rendered again,
    # where one `map` stream that broke left the whole job waiting until it timed out.
    calls = [render_chunk.spawn(opts, media, start, end) for start, end in ranges]
    deadline = time.monotonic() + CHUNKS_DEADLINE_S
    segments: list[bytes] = []
    for (start, end), call in zip(ranges, calls):
        try:
            segments.append(call.get(timeout=max(1, deadline - time.monotonic())))
        except TimeoutError:
            raise RuntimeError("Rendering took too long.") from None
        except Exception:  # noqa: BLE001 - the chunk failed or its result was lost: one more try
            segments.append(render_chunk.spawn(opts, media, start, end).get(timeout=max(1, deadline - time.monotonic())))
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
            "-t", str(duration_ms / 1000), "-movflags", "+faststart", "out.mp4",
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
    # Riso is drawn from a seed (where the words fall, how the paper is stained), its inks by id, and nothing else.
    # Pulse may name its colour set (red when it does not); no other style has inks.
    if "inkSet" in opts and opts["inkSet"] not in INK_SETS.get(opts["style"], set()):
        raise ValueError("inkSet")
    if opts["style"] == "riso" and "inkSet" not in opts:
        raise ValueError("inkSet")
    if opts["style"] == "riso" and "seed" not in layout:
        raise ValueError("layout")
    # Window is drawn from a seed (the screen flips), a kind of picture, the screen it opens on and the screens it may flip to, in one of its condensed faces.
    if opts["style"] == "window":
        allowed = opts.get("windowAllowed")
        if not all(key in opts for key in WINDOW_KEYS) or "seed" not in layout or opts["windowMode"] not in WINDOW_MODES:
            raise ValueError("window")
        if not isinstance(allowed, list) or not 0 < len(allowed) <= len(WINDOW_PALETTES) or len(set(allowed)) != len(allowed):
            raise ValueError("windowAllowed")
        if not all(isinstance(id_, str) and id_ in WINDOW_SCREENS[opts["windowMode"]] for id_ in allowed) or opts["windowPalette"] not in allowed:
            raise ValueError("windowPalette")
        if (opts["windowMode"] == "silhouette") != ("windowShape" in opts) or ("windowShape" in opts and opts["windowShape"] not in WINDOW_SHAPES):
            raise ValueError("windowShape")
        if opts["font"] not in WINDOW_FACES:
            raise ValueError("font")
    elif any(key in opts for key in (*WINDOW_KEYS, "windowShape")):
        raise ValueError("window")
    # A video treatment finishes the Director's reel with one known pass and variant; preview and encode share the same options.
    if opts["style"] == "treatment":
        treatment = opts.get("treatment")
        variant = opts.get("treatmentVariant")
        if treatment not in TREATMENTS or not isinstance(variant, str) or variant not in TREATMENTS[treatment]:
            raise ValueError("treatment")
        if any(key in opts for key in ("look", "effectId", "inkSet", *WINDOW_KEYS)):
            raise ValueError("treatment")
    elif "treatment" in opts or "treatmentVariant" in opts:
        raise ValueError("treatment")
    if (opts.get("treatment") == "screenshot") != ("clock" in opts) or ("clock" in opts and (not isinstance(opts["clock"], str) or not CLOCK_RE.match(opts["clock"]))):
        raise ValueError("clock")
    # An edit preset goes over Directed or a treatment, in one of its takes; over a live look or Riso only its cut is used.
    if "preset" in opts or "presetTake" in opts:
        preset = opts.get("preset")
        take = opts.get("presetTake")
        if preset not in PRESETS or not isinstance(take, str) or take not in PRESETS[preset]:
            raise ValueError("preset")
        if opts["style"] not in ("filter", "treatment", "riso") or any(key in opts for key in ("effectId", "plateId")):
            raise ValueError("preset")
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
    if "reel" in opts:
        reel = opts["reel"]
        # Our photography (with a live look), treatments, Riso and Window draw a reel, alone: it is the card's only picture.
        if opts["style"] not in ("filter", "riso", "treatment", "window") or any(key in opts for key in ("plateId", "effectId")):
            raise ValueError("reel")
        if not isinstance(reel, list) or not 2 <= len(reel) <= REEL_MAX:
            raise ValueError("reel")
        for entry in reel:
            if not isinstance(entry, dict) or not {"kind", "url"} <= set(entry) <= {"kind", "url", "shots"} or entry["kind"] not in ("photo", "clip"):
                raise ValueError("reel")
            link = urlparse(entry["url"]) if isinstance(entry["url"], str) and len(entry["url"]) <= 3000 else None
            if link is None or link.scheme != "https" or link.username or link.password or link.port or not (link.hostname or "").endswith(REEL_HOST_SUFFIX):
                raise ValueError("reel")
            if "shots" in entry:
                shots = entry["shots"]
                if entry["kind"] != "clip" or not isinstance(shots, list) or not 0 < len(shots) <= 40:
                    raise ValueError("reel")
                for shot in shots:
                    ok = isinstance(shot, list) and len(shot) == 2 and all(type(edge) is int for edge in shot)
                    if not ok or not 0 <= shot[0] < shot[1] <= 60_000:
                        raise ValueError("reel")
    if "typeStyle" in opts and opts["typeStyle"] not in TYPE_STYLES:
        raise ValueError("typeStyle")
    if "typeFinish" in opts and ("typeStyle" not in opts or opts["typeFinish"] not in TYPE_FINISHES):
        raise ValueError("typeFinish")
    if "typeAccent" in opts and ("typeStyle" not in opts or not isinstance(opts["typeAccent"], str) or not HEX_RE.match(opts["typeAccent"])):
        raise ValueError("typeAccent")
    if "typeEmphasis" in opts and ("typeStyle" not in opts or opts["typeEmphasis"] not in TYPE_EMPHASES):
        raise ValueError("typeEmphasis")
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
    """The media a Window card takes: none when it is drawn from our approved photo (`plateId`); else one photo or one clip, as it is."""
    named = {key for key in ("plateId", "effectId") if key in opts}
    if named == {"plateId"}:
        return set()
    if named:
        raise ValueError("media")
    return {"photo"} if "photo" in media else {"motion"}


def check_media(opts: dict, media: dict[str, bytes]) -> None:
    """Riso is drawn from an approved photo (`plateId`) and Our photography (style "filter") from that photo (`plateId`, with a live look) or one baked effect on it
    (`effectId`); the page loads either from the site itself. Both can instead be drawn from the person's own picture:
    Riso a photo with its cut-out or a clip (whole-frame print), Our photography a photo or a clip.
    Window has its own rules (`window_media`). Dust and Pulse are the lyrics alone. Nothing else takes a picture. A reel takes no media at all:
    the page fetches its pictures itself. Raises ValueError when the media sent is not exactly what the card needs."""
    if opts["style"] in ("dust", "pulise") and ({"plateId", "effectId", "reel"} & set(opts) or media):
        raise ValueError("media")
    if "reel" in opts:
        if media:
            raise ValueError("media")
        return
    if opts["style"] == "window":
        wanted = window_media(opts, media)
    else:
        named = {key for key in ("plateId", "effectId") if key in opts}
        wanted = set()
        if opts["style"] in ("filter", "treatment"):
            # One of our own pictures (our photo, or one baked effect on it), or the person's or the library's photo or clip.
            # Treatments never take a baked effect or a cut-out.
            if opts["style"] == "treatment" and named:
                raise ValueError("media")
            if len(named) > 1:
                raise ValueError("media")
            if not named:
                wanted = {"photo"} if "photo" in media else {"motion"}
        else:
            # Dust is the lyrics alone: no picture of any kind. Riso is our approved photo, or the person's photo and cut-out, or a clip.
            approved = {"riso": "plateId"}.get(opts["style"])
            if approved and approved not in named:
                if opts["style"] == "riso" and "motion" in media:
                    wanted = {"motion"}
                else:
                    wanted = {"photo", "cutout"}
            if named - {approved}:
                raise ValueError("media")
    if set(media) != wanted:
        raise ValueError("media")


@app.function(image=image, secrets=[secret], timeout=30, scaledown_window=10, nonpreemptible=True)
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
        if len(audio) > max_bytes(SAMPLE_RATE) or clip_ms(audio, SAMPLE_RATE) is None:
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
        raise HTTPException(400, "Expected a 10 to 15 s mono 32kHz WAV and valid render metadata.") from None

    call = await render_job.spawn.aio(audio, opts, media)
    return {"id": call.object_id}


@app.function(image=image, secrets=[secret], timeout=30, scaledown_window=10, nonpreemptible=True)
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
        # A 4xx: the job has ended and failed (the queue tries it again). A 5xx would read as this endpoint not answering.
        raise HTTPException(422, "The render failed. Try again.") from None
    return Response(
        content=mp4,
        media_type="video/mp4",
        headers={"Cache-Control": "no-store", "X-Mumoo-Encode": "modal-pixi-v3"},
    )
