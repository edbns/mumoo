# Audio intelligence

Cloud workers for the Creative Studio. Each runs on Modal (CPU only) and is called through a Netlify function.

| Worker | File | Job |
|---|---|---|
| Lyrics | `modal_lyrics_v2_staging.py` | Transcribe (faster-whisper) and time every word (MMS forced alignment), in any language. Also times lyrics the user typed. |
| Lyric meaning | `modal_lyric_meaning_staging.py` | What the approved words mean (attitude, sadness, intensity), read by Qwen3-8B (Apache 2.0) that we host ourselves on a GPU. Lyrics stay in memory for the request: no third party, no storage, no training. Under 12 words it answers "neutral" without asking the model. The first call after a quiet spell takes about a minute to wake the GPU. |
| Singer voice | `modal_voice_staging.py` (`voice_detection.py`) | Who sings in the selected 15 seconds: female, male, both, or nobody. Demucs separates the voice from the music, pYIN finds where it sings, a wav2vec2 timbre reader (Apache 2.0) votes on each 4 second stretch. Answers `null` rather than guess (instrumental, too little singing, voices that disagree). About 10–30 s of 4 CPU cores per clip; async submit/status like lyrics. Pitch alone was tried and rejected: it called a male pop singer female. The reader was trained on speech, so it is weaker on high operatic voices. |
| Music analysis | `modal_music_staging.py` | Beats, tempo and energy for a selected 15 seconds (`music_analysis.py`). |
| Creatives encode | `modal_creatives_encode_staging.py` | Encodes the creatives pack to MP4. |

Deploy one worker: `python3 -m modal deploy <file>.py -e mumoo-staging`.

## Music Analysis v1

The analyzer accepts an **already-selected 15-second file**, a clip offset, and an optional original source SHA-256. It never opens the original full song. ffprobe inspects the received clip and FFmpeg decodes it to 22,050 Hz mono float PCM for analysis. The browser reads the song's own title and artist tags before decoding, and these do not feed into playback, export, or the lyric worker.

```sh
python music_analysis.py selected.wav --offset-ms 10272 --source-sha256 ORIGINAL_SHA256 \
  --checkpoint /path/to/final0.ckpt --ffmpeg /path/to/ffmpeg --ffprobe /path/to/ffprobe
python benchmark_music_analysis.py --checkpoint /path/to/final0.ckpt \
  --ffmpeg /path/to/ffmpeg --ffprobe /path/to/ffprobe
```

`music-analysis-v1.schema.json` defines the independent result. Analysis needs no lyric result, including on instrumentals. The current hosted worker and renderer do not import this module.

All event and frame timestamps are integers relative to the selection, in the half-open interval [0, 15000). Beat and downbeat times come directly from Beat This! with default minimal postprocessing. The beat grid estimate uses the median interval, requires at least four intervals, and requires 75% of intervals to be within 12% of the median. Octave alternatives in 45–240 BPM are reported as ambiguous. Ambiguous results expose the detected grid rate and leave the single BPM unset. Silence and too little or inconsistent beat evidence leave BPM unset. The baseline does not resolve metrical level from downbeat or onset evidence.

RMS is linear amplitude relative to digital full scale. Onset strength is positive spectral flux on the dB-scaled mel spectrogram, a relative measure rather than sound pressure. Transients are librosa onset-peak candidates. Centroid, bandwidth, and 85% rolloff are in Hz. Features use centered 1,024-sample windows and 220-sample hops. No surrounding audio is used.

### Verified local CPU dependencies and licenses

The tested overlay is `requirements-music.lock`, hash-pinned to CPython 3.12 Intel macOS wheels. It reuses the installed base runtime (Torch and torchaudio 2.2.2, SciPy 1.16.1, einops 0.8.1 and SoundFile 0.13.1). It is an overlay for this machine, not a portable Linux deploy lock. The overlay passed `pip check`. Before installation, the wheel licenses were inspected. Beat This!, rotary-embedding-torch, narwhals and platformdirs use MIT. librosa uses ISC. NumPy, Numba, llvmlite, audioread, decorator, joblib, lazy-loader, msgpack, pooch, scikit-learn, cloudpickle and threadpoolctl ship permissive MIT or BSD terms and, where applicable, separate bundled notices. The soxr wheel bundles LGPL-2.1-or-later libsoxr. The pre-existing local FFmpeg and ffprobe binaries report GPL-3.0-or-later. A hosted image needs its own dependency and binary review.

[CPJKU](https://github.com/CPJKU/beat_this#license) publishes the Beat This! code and its official weights under MIT and calls out separate restrictions on some training material. The reviewed `final0.ckpt` came from the publisher's [checkpoint server](https://cloud.cp.jku.at/public.php/dav/files/7ik4RrBKTS273gp/final0.ckpt), is 81,058,141 bytes, and has SHA-256 `8c328b45f59d8dd3dff219253ff6a8d6482be57d0133a29140e2febbf8eb8331`. The CLI requires a local matching checkpoint and the upstream loader uses weights-only deserialization. No model file is committed.

A native crash was observed when reusing a Numba cache across processes on the Intel environment. The benchmark uses a fresh cache per fixture subprocess. Disabling JIT failed inside librosa and is not a supported workaround. Recheck cold startup, cache behavior, and dependencies on Linux before hosting.

### Local CPU benchmark

Intel macOS, Python 3.12, two Torch CPU threads, three Beat This! inference passes per rhythmic fixture. Each row is a fresh process with a fresh Numba cache. Wall time starts after importing NumPy and includes decode, first feature extraction, model imports and loading, and all three inference passes. The reported CPU seconds add Python and FFmpeg/ffprobe child CPU. Warm columns time only Beat This! inference with its model already loaded. A concurrent validation run can affect wall time.

| Fixture | Detected grid | Beats matched / emitted / reference | Downbeats matched / emitted / reference | Wall (s) | CPU (s) | Peak Python RSS (bytes) | Warm Beat This! runs (s) |
| --- | ---: | --- | --- | ---: | ---: | ---: | --- |
| Programmed 120 BPM | 120.00 | 30 / 31 / 30 | 8 / 25 / 8 | 33.957765 | 33.415864 | 578,199,552 | 0.654587, 0.654734 |
| Programmed 90 BPM | 90.91 | 22 / 24 / 23 | 6 / 19 / 6 | 28.457525 | 30.810715 | 464,613,376 | 1.273701, 1.726060 |
| Silence | Unavailable | 0 / 0 / 0 | 0 / 0 / 0 | 44.116755 | 35.809456 | 227,332,096 | — |

Event matches use a one-to-one 70 ms tolerance. Median matched beat and downbeat errors were 30 ms for both rhythmic fixtures. Beat precision/recall were 96.77%/100% and 91.67%/95.65%. Downbeat precision was 32.00% and 31.58%, with 100% recall in both. Both grids retained half-/double-time alternatives. Beat This! overpredicted downbeats on these programmed fixtures. These tests establish actual model output on controlled reference grids. They do not establish accuracy on annotated commercial recordings, tempo changes, or uncommon meters.

### Modal staging validation

The one-core, 2 GiB Linux worker failed to start because the deployment module imports FastAPI and only the gateway image contained it. The gateway exhausted its separate 53 s timeout waiting for the worker. Both images now include the pinned dependency. The worker timeout remains 45 s. The worker image precompiles the exercised librosa paths with a generic Numba cache and limits the numerical libraries and Torch to one thread.

| Hosted fixture | Beat grid | Beats matched / emitted / reference | Median beat error | Downbeats matched / emitted / reference | Warm analysis |
| --- | ---: | --- | ---: | --- | ---: |
| 120 BPM | 120.00 | 30 / 30 / 30 | 30 ms | 8 / 24 / 8 | 1.264 s |
| 90 BPM | 90.91 | 22 / 22 / 23 | 23 ms | 6 / 19 / 6 | 1.235 s |
| Silence | Unavailable | 0 / 0 / 0 | — | 0 / 0 / 0 | 0.312 s |

Both rhythmic results exposed half-/double-time alternatives. Event matches use the same 70 ms tolerance as the local benchmark. Downbeat precision was 33.33% and 31.58%, so the browser displays them as raw candidates.

The first instrumented worker input took 9.55 s from input entry to serialization. Its measured stages are below. Peak RSS is cumulative for the Python process. It excludes FFmpeg and gateway memory.

| First input stage | Time (s) | Peak Python RSS (MiB) |
| --- | ---: | ---: |
| Python analysis module | 0.0064 | 74 |
| NumPy import | 0.1793 | 127 |
| Decode and probe | 0.7503 | 129 |
| librosa features | 2.6668 | 397 |
| Beat This! import and checkpoint load | 4.9183 | 1,042 |
| Beat and downbeat inference | 1.0240 | 1,097 |
| BPM calculation | 0.0001 | 1,097 |
| JSON serialization | 0.0025 | 1,097 |

Warm rhythmic inputs took 1.21–1.24 CPU seconds including decode subprocesses. Maximum observed Python RSS was 1.07 GiB. The direct test rejected missing or forged access codes, oversized uploads and a fourth analysis within one minute.

If the whole-clip tempo check is unavailable, the estimator can recover a grid from at least eight consecutive intervals spanning at least four seconds. The run must fit one phase and at least 85% of the surrounding markers and intervals must fit its grid or half-beat subdivisions. `supportFraction` still describes the original whole-clip check. The supplied ATREVIMENTO beat markers recover a 130.43 BPM grid with a 65.22 BPM alternative.
