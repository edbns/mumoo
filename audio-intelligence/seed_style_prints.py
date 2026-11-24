"""Sound prints of labelled audio, for genre learning.

Songs: the owner's, each named "<title> - <style>.<ext>" (the style as the owner would type it in the search box).
Loops: CC0 or owned producer loops and stems, in a folder per style ("<folder>/<style>/<file>"), with the licence they are
under; at most `--most` files a style, so one pack cannot speak for a whole genre.
Freesound: its CC0 loops for the thin styles of `genre-evaluation/freesound.json` (`freesound.py`), fetched in the cloud
into a folder deleted once the style is printed, and kept only when CLAP hears it as its style; its licence names the sound
and uploader. Each style's prints land in the `mumoo-seed-prints` volume.
This computer only cuts the clips (`seed_clips.py`; macOS `afconvert` makes them mono 16-bit 48 kHz, as the site sends a
creator's clip); the sound print worker prints them and keeps nothing. Written out: only the style typed, the file's hash,
where each clip starts, its print and, for loops, the licence. No name, no audio. `creative/scripts/seed-style-prints.mjs`
then keeps them as `seeded`.

    python3 -m modal run -e mumoo-staging seed_style_prints.py::seed --folder "<folder>" --out <out.json>
    python3 -m modal run -e mumoo-staging seed_style_prints.py::seed_loops --folder "<folder>" --licence "CC0 1.0" --out <out.json> [--most 20]
    python3 -m modal run --detach -e mumoo-staging seed_style_prints.py::seed_freesound --run <name> [--most 20] [--only "techno,gospel"]
    python3 -m modal run --detach -e mumoo-staging seed_style_prints.py::seed_fma --run <name> [--plan fma-by]    # songs of genre-evaluation/<plan>.json (fma.py)
"""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import wave

import modal

from modal_sound_print_staging import app, print_selected
from seed_clips import clips
from sound_print import MODEL, SAMPLE_RATE

AUDIO = {".wav", ".mp3", ".m4a", ".aac", ".flac", ".aif", ".aiff"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def samples_of(path: Path) -> bytes:
    """The whole file as mono 16-bit 48 kHz samples, decoded in a folder that is deleted at once."""
    with tempfile.TemporaryDirectory() as folder:
        whole = Path(folder) / "audio.wav"
        subprocess.run(["afconvert", "-f", "WAVE", "-d", f"LEI16@{SAMPLE_RATE}", "-c", "1", str(path), str(whole)],
                       check=True, capture_output=True)
        with wave.open(str(whole)) as audio:
            return audio.readframes(audio.getnframes())


def printed(files: list[tuple[str, Path]], loops: bool, extra) -> list[list[dict]]:
    """The prints of each file's clips, made in one batch; `extra(i)` adds to the prints of file i."""
    cuts = []
    for _, path in files:
        try:
            cuts.append(clips(samples_of(path), loops=loops))
        except subprocess.CalledProcessError:
            print(f"could not decode {path.name}, skipped", flush=True)
            cuts.append([])
    results = iter(print_selected.map([audio for cut in cuts for _, audio in cut])) if any(cuts) else iter(())
    made = []
    for i, ((typed, path), cut) in enumerate(zip(files, cuts)):
        ready = []
        for offset_ms, _ in cut:
            result = next(results)
            if result.get("status") == "ready" and result.get("model") == MODEL:
                ready.append({"typed": typed, "sourceSha256": sha256(path), "offsetMs": offset_ms, "model": MODEL, "values": result["values"], **extra(i)})
        print(f"{i + 1}/{len(files)} {typed}: {len(ready)} of {len(cut)} clips", flush=True)
        made.append(ready)
    return made


@app.local_entrypoint()
def seed(folder: str, out: str):
    songs = sorted(p for p in Path(folder).iterdir() if p.suffix.lower() in AUDIO and " - " in p.stem)
    prints = [item for made in printed([(song.stem.rsplit(" - ", 1)[1].strip(), song) for song in songs], False, lambda i: {}) for item in made]
    Path(out).write_text(json.dumps({"version": 1, "prints": prints}))
    print(f"{len(prints)} prints from {len(songs)} songs -> {out}")


@app.local_entrypoint()
def seed_loops(folder: str, out: str, licence: str, most: int = 20):
    licence = licence.strip()
    if not 0 < len(licence) <= 200:
        raise SystemExit("--licence names what the files are under, e.g. \"CC0 1.0 (Freesound)\"")
    files = []
    for style in sorted(p for p in Path(folder).iterdir() if p.is_dir()):
        found = sorted(p for p in style.rglob("*") if p.suffix.lower() in AUDIO)
        files += [(style.name.strip(), path) for path in found[:most]]
        print(f"{style.name}: {min(len(found), most)} of {len(found)} files", flush=True)
    prints = [item for made in printed(files, True, lambda i: {"licence": licence}) for item in made]
    Path(out).write_text(json.dumps({"version": 1, "prints": prints}))
    print(f"{len(prints)} prints from {len(files)} files -> {out}")


# Fetching from Freesound runs in the cloud, so the computer can sleep: an idle coordinator downloads (Freesound allows
# about one request a second), the sound print worker prints, and each style is written to a volume as soon as it is done.
HERE = Path(__file__).resolve().parent
seed_volume = modal.Volume.from_name("mumoo-seed-prints", create_if_missing=True)
seed_image = (
    modal.Image.debian_slim(python_version="3.12").apt_install("ffmpeg")
    .pip_install("numpy==1.26.4", "certifi==2025.8.3", "fastapi==0.115.12")
    .env({"MUMOO_FREESOUND_PLAN": "/seed/freesound.json", "MUMOO_GENRE_ANCHORS": "/seed/genre-anchors.mjs"})
    .add_local_file(str(HERE / "genre-evaluation" / "freesound.json"), "/seed/freesound.json")
    .add_local_file(str(HERE.parent / "creative" / "netlify" / "lib" / "genre-anchors.mjs"), "/seed/genre-anchors.mjs")
    .add_local_python_source("freesound", "seed_clips", "clip_wav", "sound_print", "modal_sound_print_staging")
)


def decoded(path: Path) -> bytes:
    return subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "s16le", "-"],
                          check=True, capture_output=True).stdout


@app.function(image=seed_image, secrets=[modal.Secret.from_name("mumoo-freesound")], volumes={"/out": seed_volume},
              cpu=1, memory=2048, timeout=6 * 3600, retries=0)
def fetch_freesound(run: str, most: int, only: list[str]):
    import freesound
    key = freesound.api_key()
    anchors = freesound.lanes()
    plan = [style for style in json.loads(freesound.PLAN.read_text())["styles"] if not only or style["typed"] in only]
    if unknown := [style["lane"] for style in plan if style["lane"] not in {lane["id"] for lane in anchors}]:
        raise SystemExit(f"No lane {unknown}")
    taken = set()
    Path(f"/out/{run}").mkdir(parents=True, exist_ok=True)
    for style in plan:
        candidates = {}
        for query in style["queries"]:
            for sound in freesound.search(key, query):
                if sound["id"] not in taken and freesound.usable(sound):
                    candidates.setdefault(sound["id"], sound)
        ranked = sorted(candidates.values(), key=lambda sound: -sound.get("num_downloads", 0))[:most * 3]
        files = []
        with tempfile.TemporaryDirectory() as folder:
            for sound in ranked:
                try:
                    path = freesound.download(key, sound, Path(folder))
                    files.append((sound, sha256(path), clips(decoded(path), loops=True)))
                except (OSError, subprocess.CalledProcessError):
                    continue
        results = iter(print_selected.map([audio for _, _, cut in files for _, audio in cut])) if files else iter(())
        prints, kept = [], []
        for sound, hash_, cut in files:
            made = []
            for offset_ms, _ in cut:
                result = next(results)
                if result.get("status") == "ready" and result.get("model") == MODEL:
                    made.append({"typed": style["typed"], "sourceSha256": hash_, "offsetMs": offset_ms, "model": MODEL,
                                 "values": result["values"], "licence": freesound.attribution(sound)})
            if len(kept) < most and made and freesound.hears_as([item["values"] for item in made], style["lane"], anchors):
                prints += made
                kept.append({"id": sound["id"], "name": sound["name"], "username": sound["username"]})
                taken.add(sound["id"])
        Path(f"/out/{run}/{style['typed']}.json").write_text(json.dumps({"version": 1, "prints": prints, "kept": kept,
                                                                         "tried": len(files), "found": len(candidates)}))
        seed_volume.commit()
        print(f"== {style['typed']}: kept {len(kept)} of {len(files)} tried ({len(candidates)} found)", flush=True)


fma_image = seed_image.add_local_file(str(HERE / "genre-evaluation" / "fma-cc0.json"), "/seed/fma-cc0.json") \
    .add_local_file(str(HERE / "genre-evaluation" / "fma-by.json"), "/seed/fma-by.json").add_local_python_source("fma")


@app.function(image=fma_image, volumes={"/out": seed_volume}, cpu=1, memory=2048, timeout=6 * 3600, retries=0)
def fetch_fma(run: str, plan: str, only: str):
    """The songs of one lane (each lane runs on its own, at once); `heard` says whether CLAP hears the song as its lane, so whether to
    keep only those can be measured rather than assumed."""
    import io
    import zipfile
    import fma
    import freesound
    anchors = freesound.lanes()
    style_of = {lane["id"]: lane["style"] for lane in anchors}
    songs = json.loads(Path(f"/seed/{plan}.json").read_text())["songs"]
    if unknown := sorted({song["lane"] for song in songs} - set(style_of)):
        raise SystemExit(f"No lane {unknown}")
    archive = zipfile.ZipFile(io.BufferedReader(fma.Ranged(fma.ZIP), buffer_size=1 << 20))
    Path(f"/out/{run}").mkdir(parents=True, exist_ok=True)
    for lane in [only]:
        files = []
        with tempfile.TemporaryDirectory() as folder:
            for song in (song for song in songs if song["lane"] == lane):
                try:
                    path = Path(folder) / f"{song['id']}.mp3"
                    path.write_bytes(archive.read(fma.member(song["id"])))
                    files.append((song, sha256(path), clips(decoded(path))))
                except (KeyError, OSError, zipfile.BadZipFile, subprocess.CalledProcessError):
                    continue
        results = iter(print_selected.map([audio for _, _, cut in files for _, audio in cut])) if files else iter(())
        prints, kept = [], []
        for song, hash_, cut in files:
            made = []
            for offset_ms, _ in cut:
                result = next(results)
                if result.get("status") == "ready" and result.get("model") == MODEL:
                    made.append({"typed": style_of[lane], "lane": lane, "sourceSha256": hash_, "offsetMs": offset_ms,
                                 "model": MODEL, "values": result["values"], "licence": song["licence"]})
            if made:
                heard = freesound.hears_as([item["values"] for item in made], lane, anchors)
                prints += [{**item, "heard": heard} for item in made]
                kept.append({"id": song["id"], "fmaGenre": song["fmaGenre"], "heard": heard})
        Path(f"/out/{run}/{lane}.json").write_text(json.dumps({"version": 1, "prints": prints, "kept": kept, "tried": len(files)}))
        seed_volume.commit()
        print(f"== {lane}: {len(kept)} songs printed, {sum(k['heard'] for k in kept)} heard as {lane}", flush=True)


@app.local_entrypoint()
def seed_fma(run: str, plan: str = "fma-cc0"):
    """Like `seed_freesound`: run with `--detach`, collect from the volume's <run>/<lane>.json."""
    lanes = sorted({song["lane"] for song in json.loads((HERE / "genre-evaluation" / f"{plan}.json").read_text())["songs"]})
    for lane in lanes:
        fetch_fma.spawn(run, plan, lane)
    print(f"started {len(lanes)} lanes: writes to the mumoo-seed-prints volume, {run}/<lane>.json")


@app.local_entrypoint()
def seed_freesound(run: str, most: int = 20, only: str = ""):
    """Starts the cloud fetch and returns at once; with `modal run --detach` it carries on with the computer closed (waiting
    on it here would cancel it when this stops). Collect it with `modal volume get -e mumoo-staging mumoo-seed-prints <run> <folder>`."""
    call = fetch_freesound.spawn(run, most, [name.strip() for name in only.split(",") if name.strip()])
    print(f"started {call.object_id}: writes to the mumoo-seed-prints volume, {run}/<style>.json")
