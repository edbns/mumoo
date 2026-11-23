"""Sound prints of labelled audio, for genre learning.

Songs: the owner's, each named "<title> - <style>.<ext>" (the style as the owner would type it in the search box).
Loops: CC0 or owned producer loops and stems, in a folder per style ("<folder>/<style>/<file>"), with the licence they are
under; at most `--most` files a style, so one pack cannot speak for a whole genre.
This computer only cuts the clips (`seed_clips.py`; macOS `afconvert` makes them mono 16-bit 48 kHz, as the site sends a
creator's clip); the sound print worker prints them and keeps nothing. Written out: only the style typed, the file's hash,
where each clip starts, its print and, for loops, the licence. No name, no audio. `creative/scripts/seed-style-prints.mjs`
then keeps them as `seeded`.

    python3 -m modal run -e mumoo-staging seed_style_prints.py::seed --folder "<folder>" --out <out.json>
    python3 -m modal run -e mumoo-staging seed_style_prints.py::seed_loops --folder "<folder>" --licence "CC0 1.0" --out <out.json> [--most 20]
"""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import wave

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


def printed(files: list[tuple[str, Path]], loops: bool, extra: dict) -> list[dict]:
    prints = []
    for number, (typed, path) in enumerate(files, 1):
        hash_ = sha256(path)
        cut = clips(samples_of(path), loops=loops)
        results = list(print_selected.map([audio for _, audio in cut])) if cut else []
        for (offset_ms, _), result in zip(cut, results):
            if result.get("status") == "ready" and result.get("model") == MODEL:
                prints.append({"typed": typed, "sourceSha256": hash_, "offsetMs": offset_ms, "model": MODEL, "values": result["values"], **extra})
        print(f"{number}/{len(files)} {typed}: {sum(r.get('status') == 'ready' for r in results)} of {len(cut)} clips", flush=True)
    return prints


@app.local_entrypoint()
def seed(folder: str, out: str):
    songs = sorted(p for p in Path(folder).iterdir() if p.suffix.lower() in AUDIO and " - " in p.stem)
    prints = printed([(song.stem.rsplit(" - ", 1)[1].strip(), song) for song in songs], False, {})
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
    prints = printed(files, True, {"licence": licence})
    Path(out).write_text(json.dumps({"version": 1, "prints": prints}))
    print(f"{len(prints)} prints from {len(files)} files -> {out}")
