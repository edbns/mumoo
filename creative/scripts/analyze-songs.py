"""
Cut the loudest 15 seconds of every reference song and run the real cloud music analysis on it.
Songs: scripts/fixtures/<Title>-<kind>.wav (git-ignored). Writes scripts/fixtures/analysis/<kind>.json,
<kind>-clip.wav (exactly what the worker receives) and <kind>-upload.wav (17 s, for the gallery's upload step).

  python3 scripts/analyze-songs.py [kind ...]
"""
import json, struct, subprocess, sys
from pathlib import Path
import numpy as np, modal

ROOT = Path(__file__).resolve().parent.parent
FFMPEG = next((ROOT / 'node_modules/@ffmpeg-installer').glob('*/ffmpeg'))
FIX = ROOT / 'scripts/fixtures'
OUT = FIX / 'analysis'
OUT.mkdir(exist_ok=True)
SR = 16000
WAV_SIZE = 44 + 15 * SR * 2
HEADER = struct.pack("<4sI4s4sIHHIIHH4sI", b"RIFF", WAV_SIZE - 8, b"WAVE", b"fmt ", 16, 1, 1, SR, SR * 2, 2, 16, b"data", WAV_SIZE - 44)

songs = {p.stem.rsplit('-', 1)[1].lower(): p for p in sorted(FIX.glob('*-*.wav')) if p.stem.rsplit('-', 1)[-1].isalpha()}
fn = modal.Function.from_name('mumoo-music-analysis-staging', 'analyze_selected', environment_name='mumoo-staging')


def decode(path, *extra):
    return subprocess.run([str(FFMPEG), '-v', 'error', *extra, '-i', str(path), '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'],
                          capture_output=True, check=True).stdout


for key in sys.argv[1:] or list(songs):
    pcm = np.frombuffer(decode(songs[key]), dtype='<i2')
    total = len(pcm) / SR
    cumulative = np.concatenate([[0], np.cumsum(pcm.astype(np.float64) ** 2)])
    start = max(range(0, int(total) - 17), key=lambda s: cumulative[(s + 15) * SR] - cumulative[s * SR])
    wav = HEADER + pcm[start * SR:(start + 15) * SR].tobytes()
    (OUT / f'{key}-clip.wav').write_bytes(wav)
    (OUT / f'{key}-upload.wav').write_bytes(HEADER[:4] + struct.pack('<I', 36 + 17 * SR * 2) + HEADER[8:40] + struct.pack('<I', 17 * SR * 2) + pcm[start * SR:(start + 17) * SR].tobytes())
    result = json.loads(fn.remote(wav))
    result['_pick'] = {'file': songs[key].name, 'songSeconds': round(total, 1), 'startSeconds': start}
    (OUT / f'{key}.json').write_text(json.dumps(result))
    tempo = result['rhythm']['tempo']
    print(f"{key:10s} {total:6.1f}s start {start:3d}s  grid {tempo['gridBpm']} ({tempo['status']})  beats {len(result['rhythm']['beatsMs'])}", flush=True)
