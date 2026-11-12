"""Run the music analysis tests and the reference clips in the cloud worker's own image, without deploying anything.

  python3 -m modal run audio-intelligence/calibrate_music.py -e mumoo-staging

Reads creative/scripts/fixtures/analysis/<kind>-clip.wav (made by creative/scripts/analyze-songs.py) and writes
<kind>.json next to them with the analysis as the worker now returns it, so the brain can be checked against real songs.
"""
import json
from pathlib import Path

import modal

from modal_music_staging import CHECKPOINT, worker_image

HERE = Path(__file__).parent
FIXTURES = HERE.parent / "creative/scripts/fixtures/analysis"
app = modal.App("mumoo-music-calibration")
image = (worker_image.add_local_file(HERE / "test_music_analysis.py", "/root/test_music_analysis.py")
         .add_local_file(HERE / "modal_music_staging.py", "/root/modal_music_staging.py"))


@app.function(image=image, cpu=2, memory=4096, timeout=600)
def run(clips: dict[str, bytes]) -> tuple[str, dict[str, str]]:
    import io
    import tempfile
    import unittest
    from types import SimpleNamespace

    from music_analysis import analyze

    report = io.StringIO()
    suite = unittest.defaultTestLoader.loadTestsFromName("test_music_analysis")
    unittest.TextTestRunner(stream=report, verbosity=1).run(suite)
    results = {}
    with tempfile.TemporaryDirectory() as directory:
        for name, audio in clips.items():
            clip = Path(directory) / f"{name}.wav"
            clip.write_bytes(audio)
            results[name] = json.dumps(analyze(SimpleNamespace(clip=clip, offset_ms=0, source_sha256=None, checkpoint=CHECKPOINT,
                                                               ffmpeg="ffmpeg", ffprobe="ffprobe", threads=2, runs=1)))
    return report.getvalue(), results


@app.local_entrypoint()
def main():
    clips = {path.name.removesuffix("-clip.wav"): path.read_bytes() for path in sorted(FIXTURES.glob("*-clip.wav"))}
    report, results = run.remote(clips)
    print(report)
    for name, text in results.items():
        previous = FIXTURES / f"{name}.json"
        pick = json.loads(previous.read_text()).get("_pick") if previous.exists() else None
        result = json.loads(text)
        if pick:
            result["_pick"] = pick
        previous.write_text(json.dumps(result))
        tonality, timbre = result.get("tonalityV1", {}), result.get("timbreV1", {})
        print(f"{name:10s} key {tonality.get('key')} {tonality.get('mode')} (margin {tonality.get('majorMinorMargin')})  flatness {timbre.get('flatnessMean')}")
