"""Freesound's CC0 loops for genre seeding: what to search, which results to try, and which prints to keep.

Only sounds under CC0 1.0, tagged as music (a loop, beat, song, riff or groove), 6 to 60 s, most downloaded first. A name
that says it is a sound effect, or a loop taken from another site (a re-upload is not the uploader's to give away), is
skipped. Freesound's text search is loose ("metal" finds chains), so a sound is kept only when CLAP hears it as its
style: the style's lane is among the three its print is closest to. The key is FREESOUND_API_KEY, from the environment
or `creative/.env.local`; it is never written out.
"""
import json
import os
from pathlib import Path
import re
import ssl
import time
import urllib.parse
import urllib.request

import numpy as np

HERE = Path(__file__).resolve().parent
PLAN = Path(os.environ.get("MUMOO_FREESOUND_PLAN", HERE / "genre-evaluation" / "freesound.json"))
ANCHORS = Path(os.environ.get("MUMOO_GENRE_ANCHORS", HERE.parent / "creative" / "netlify" / "lib" / "genre-anchors.mjs"))
SEARCH = "https://freesound.org/apiv2/search/text/"
FILTER = 'license:"Creative Commons 0" duration:[6 TO 60] (tag:loop OR tag:music OR tag:beat OR tag:song OR tag:riff OR tag:groove)'
CC0 = "http://creativecommons.org/publicdomain/zero/1.0/"
SKIPPED = re.compile(r"looperman|splice|sample ?pack|sfx|sound ?effect|siren|alarm|ringtone|notification|foley|ambience|field recording|noise", re.I)
CLOSEST = 3
# Freesound allows 60 requests a minute.
PAUSE_S = 1.1


def tls() -> ssl.SSLContext:
    """Python from python.org on macOS has no certificates of its own until its installer's step is run; certifi's do."""
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def api_key() -> str:
    key = os.environ.get("FREESOUND_API_KEY", "").strip()
    if not key:
        env = HERE.parent / "creative" / ".env.local"
        for line in env.read_text().splitlines() if env.exists() else []:
            if line.startswith("FREESOUND_API_KEY="):
                key = line.split("=", 1)[1].strip()
    if not key:
        raise SystemExit("FREESOUND_API_KEY is not set (creative/.env.local)")
    return key


def lanes() -> list[dict]:
    text = ANCHORS.read_text()
    return json.loads(text[text.index("{"):text.rindex("}") + 1])["lanes"]


def usable(sound: dict) -> bool:
    licence = (sound.get("license") or "").replace("https://", "http://").rstrip("/") + "/"
    return licence == CC0 and not SKIPPED.search(sound.get("name", "")) \
        and bool((sound.get("previews") or {}).get("preview-hq-mp3"))


def search(key: str, query: str, pages: int = 2) -> list[dict]:
    found = []
    for page in range(1, pages + 1):
        params = urllib.parse.urlencode({"query": query, "filter": FILTER, "sort": "downloads_desc", "page_size": 50, "page": page,
                                         "fields": "id,name,username,license,duration,num_downloads,previews", "token": key})
        with urllib.request.urlopen(f"{SEARCH}?{params}", timeout=30, context=tls()) as response:
            body = json.load(response)
        found += body.get("results", [])
        time.sleep(PAUSE_S)
        if not body.get("next"):
            break
    return found


def download(key: str, sound: dict, to: Path) -> Path:
    request = urllib.request.Request(sound["previews"]["preview-hq-mp3"], headers={"Authorization": f"Token {key}"})
    path = to / f"{sound['id']}.mp3"
    with urllib.request.urlopen(request, timeout=60, context=tls()) as response:
        path.write_bytes(response.read())
    time.sleep(PAUSE_S)
    return path


def hears_as(values: list[list[float]], lane: str, anchors: list[dict], closest: int = CLOSEST) -> bool:
    """True when the file's prints, averaged, are closest to `lane` or nearly so (among the `closest` lanes)."""
    mean = np.mean(np.asarray(values, dtype=np.float64), axis=0)
    mean = mean / np.linalg.norm(mean)
    alike = [(float(np.dot(mean, item["vector"])), item["id"]) for item in anchors]
    return lane in [lane_id for _, lane_id in sorted(alike, reverse=True)[:closest]]


def attribution(sound: dict) -> str:
    return f"CC0 1.0, Freesound sound {sound['id']} by {sound['username']}"
