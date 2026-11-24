"""The FMA dataset's public-domain songs for genre seeding (https://github.com/mdeff/fma).

Real, finished songs, each with the genre its artist gave it. Only songs under CC0 1.0 or the Public Domain Mark are taken;
"Sound Recording Common Law Protection" is not (old recordings still under state law), nor any CC licence. Each FMA genre
that names one of our lanes maps to it; the rest (experimental, noise, spoken) are left out. At most `most` songs a lane,
most listened first, so one genre cannot outweigh the others.

The audio is the 30 s clips of `fma_large.zip`, read song by song over HTTP ranges, so the 93 GiB zip is never downloaded.

    python3 fma.py <fma_metadata folder> [--most 80]    # writes genre-evaluation/fma-cc0.json
"""
import argparse
import ast
import csv
import io
import json
from pathlib import Path
import sys
import urllib.request

from freesound import tls

HERE = Path(__file__).resolve().parent
PLAN = HERE / "genre-evaluation" / "fma-cc0.json"
ZIP = "https://os.unil.cloud.switch.ch/fma/fma_large.zip"
LICENCES = {"CC0 1.0 Universal": "CC0 1.0", "Public Domain Mark 1.0": "Public Domain Mark 1.0"}
# The first FMA genre of a song found here gives its lane.
LANES = {
    "Metal": "metal", "Industrial": "industrial", "Punk": "punk", "Shoegaze": "rock", "Noise-Rock": "rock", "Rock": "rock",
    "Americana": "folk", "Folk": "folk", "Country": "country",
    "Contemporary Classical": "neoclassical", "Soundtrack": "neoclassical", "20th Century Classical": "classical", "Classical": "classical",
    "Hip-Hop Beats": "boom-bap", "Hip-Hop": "hip-hop", "Rap": "hip-hop",
    "Big Band/Swing": "jazz", "Jazz: Vocal": "jazz", "Jazz": "jazz", "Blues": "jazz", "Gospel": "gospel",
    "Ambient": "ambient", "Synth Pop": "pop", "Pop": "pop",
    "Techno": "techno", "House": "house", "Dubstep": "dubstep", "Drum & Bass": "drum-and-bass", "Electronic": "edm",
}


def build(metadata: Path, most: int) -> list[dict]:
    csv.field_size_limit(sys.maxsize)
    titles = {row["genre_id"]: row["title"] for row in csv.DictReader((metadata / "genres.csv").open())}
    rows = csv.reader((metadata / "tracks.csv").open(encoding="utf-8"))
    columns = {f"{a}.{b}": i for i, (a, b) in enumerate(zip(next(rows), next(rows)))}
    next(rows)
    order = list(LANES)
    by_lane = {}
    for row in rows:
        licence = LICENCES.get(row[columns["track.license"]])
        genres = [titles[str(g)] for g in ast.literal_eval(row[columns["track.genres"]] or "[]")]
        mapped = sorted((order.index(g), g) for g in genres if g in LANES)
        if not licence or not mapped:
            continue
        genre = mapped[0][1]
        by_lane.setdefault(LANES[genre], []).append({
            "id": int(row[0]), "lane": LANES[genre], "fmaGenre": genre, "listens": int(row[columns["track.listens"]] or 0),
            "licence": f"{licence}, FMA track {row[0]} by {row[columns['artist.name']].strip()}"[:200],
        })
    return [song for songs in by_lane.values() for song in sorted(songs, key=lambda s: -s["listens"])[:most]]


class Ranged(io.RawIOBase):
    """A remote file read by HTTP ranges, enough for `zipfile` to find one member without fetching the rest."""

    def __init__(self, url: str):
        self.url, self.at = url, 0
        with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=60, context=tls()) as response:
            self.size = int(response.headers["Content-Length"])

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self.at

    def seek(self, offset, whence=io.SEEK_SET):
        self.at = {io.SEEK_SET: offset, io.SEEK_CUR: self.at + offset, io.SEEK_END: self.size + offset}[whence]
        return self.at

    def readinto(self, buffer):
        if self.at >= self.size or not len(buffer):
            return 0
        end = min(self.at + len(buffer), self.size) - 1
        request = urllib.request.Request(self.url, headers={"Range": f"bytes={self.at}-{end}"})
        for attempt in range(4):
            try:
                with urllib.request.urlopen(request, timeout=120, context=tls()) as response:
                    data = response.read()
                break
            except OSError:
                if attempt == 3:
                    raise
        buffer[:len(data)] = data
        self.at += len(data)
        return len(data)


def member(song_id: int) -> str:
    padded = f"{song_id:06d}"
    return f"fma_large/{padded[:3]}/{padded}.mp3"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("metadata", type=Path)
    parser.add_argument("--most", type=int, default=80)
    args = parser.parse_args()
    songs = build(args.metadata, args.most)
    PLAN.write_text(json.dumps({"version": 1, "songs": songs}, indent=1) + "\n")
    counts = {}
    for song in songs:
        counts[song["lane"]] = counts.get(song["lane"], 0) + 1
    print(f"{len(songs)} songs -> {PLAN}: {counts}")
