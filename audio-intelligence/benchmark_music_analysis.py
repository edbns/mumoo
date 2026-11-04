"""Run measured CPU analysis and score it against programmed fixture events."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

from test_music_analysis import fixture, score_events


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--ffprobe", default="ffprobe")
    args = parser.parse_args()
    directory = Path(__file__).resolve().parent
    manifest = json.loads((directory / "fixtures/music-analysis/manifest.json").read_text())
    with tempfile.TemporaryDirectory() as folder:
        for entry in manifest["fixtures"]:
            clip = Path(folder) / f"{entry['id']}.wav"
            beats, downbeats = fixture(clip, entry["bpm"], entry.get("firstBeatMs", 250),
                                       entry.get("beatsPerBar", 4))
            result = json.loads(subprocess.check_output([
                sys.executable, str(directory / "music_analysis.py"), str(clip),
                "--offset-ms", str(entry["sourceOffsetMs"]), "--checkpoint", args.checkpoint,
                "--ffmpeg", args.ffmpeg, "--ffprobe", args.ffprobe, "--runs", "3",
            ], env={**os.environ, "NUMBA_CACHE_DIR": str(clip.with_suffix(".numba"))}))
            rhythm = result["rhythm"]
            reference_bpm = entry["bpm"]
            grid = rhythm["tempo"]["gridBpm"]
            print(json.dumps({"fixture": entry["id"], "tempo": rhythm["tempo"],
                              "referenceBpm": reference_bpm,
                              "gridErrorBpm": abs(grid - reference_bpm) if grid and reference_bpm else None,
                              "beats": score_events(rhythm["beatsMs"], beats),
                              "downbeats": score_events(rhythm["downbeatsMs"], downbeats),
                              "metrics": result["metrics"]}), flush=True)


if __name__ == "__main__":
    main()
