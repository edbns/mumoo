"""Sound prints of the owner's labelled songs, for genre learning.

Each song is named "<title> - <style>.<ext>" (the style as the owner would type it in the search box). This computer
only cuts three 15 s clips, a quarter, half and three quarters into the song (macOS `afconvert` makes them mono
16-bit 48 kHz, as the site sends a creator's clip); the sound print worker prints them and keeps nothing.
Written out: only the style typed, the song's file hash (as the site knows it), where each clip starts and its print.
No title, no audio. `creative/scripts/seed-style-prints.mjs` then keeps them as `seeded`.

    python3 -m modal run -e mumoo-staging seed_style_prints.py::seed --folder "<folder>" --out <out.json>
"""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import wave

from modal_sound_print_staging import WAV_HEADER, app, print_selected
from sound_print import CLIP_SAMPLES, MODEL, SAMPLE_RATE

AUDIO = {".wav", ".mp3", ".m4a", ".aac", ".flac", ".aif", ".aiff"}
PLACES = (0.25, 0.5, 0.75)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def clips(song: Path):
    """(start in ms, clip WAV) for each place in the song."""
    with tempfile.TemporaryDirectory() as folder:
        whole = Path(folder) / "song.wav"
        subprocess.run(["afconvert", "-f", "WAVE", "-d", f"LEI16@{SAMPLE_RATE}", "-c", "1", str(song), str(whole)],
                       check=True, capture_output=True)
        with wave.open(str(whole)) as audio:
            frames = audio.getnframes()
            for place in PLACES:
                start = max(0, round(frames / SAMPLE_RATE * place - 7.5))
                if start * SAMPLE_RATE + CLIP_SAMPLES > frames:
                    continue
                audio.setpos(start * SAMPLE_RATE)
                yield start * 1000, WAV_HEADER + audio.readframes(CLIP_SAMPLES)


@app.local_entrypoint()
def seed(folder: str, out: str):
    songs = sorted(p for p in Path(folder).iterdir() if p.suffix.lower() in AUDIO and " - " in p.stem)
    prints = []
    for number, song in enumerate(songs, 1):
        typed = song.stem.rsplit(" - ", 1)[1].strip()
        hash_ = sha256(song)
        cut = list(clips(song))
        results = list(print_selected.map([audio for _, audio in cut]))
        for (offset_ms, _), result in zip(cut, results):
            if result.get("status") == "ready" and result.get("model") == MODEL:
                prints.append({"typed": typed, "sourceSha256": hash_, "offsetMs": offset_ms, "model": MODEL, "values": result["values"]})
        print(f"{number}/{len(songs)} {typed}: {sum(r.get('status') == 'ready' for r in results)} of {len(cut)} clips", flush=True)
    Path(out).write_text(json.dumps({"version": 1, "prints": prints}))
    print(f"{len(prints)} prints from {len(songs)} songs -> {out}")
