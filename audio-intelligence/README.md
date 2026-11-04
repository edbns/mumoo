# Local supplied-lyrics alignment

This proof of concept runs separately from the editor and renderer. FFmpeg decodes exactly 15 seconds of original mixed audio starting at a positive integer millisecond offset. WhisperX aligns the supplied words against CTC acoustic emissions. The CLI calls only WhisperX alignment and does not load a Whisper checkpoint or invoke transcription.

## Reproduce the Intel macOS baseline

Use Python 3.12 and an FFmpeg executable on PATH or pass its path with `--ffmpeg`. In a fresh virtual environment:

```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip install numpy==1.26.4 pandas==2.2.3 torch==2.2.2 torchaudio==2.2.2 transformers==4.49.0 nltk==3.9.1
python -m pip install --no-deps whisperx==3.4.2
```

The Intel benchmark uses an alignment-only dependency subset. This is outside the full WhisperX distribution's declared Torch and NumPy requirements. It is a measured local compatibility baseline, not a supported installation of the full package. Use the exact environment when comparing the recorded measurements. Avoid installing the full package's unrelated transcription and diarization dependencies for this POC.

Supply a local reviewed Wav2Vec2 processor and model directory with configuration, vocabulary and `model.safetensors`. The CLI does not download checkpoints and does not load pickle weights. Model cards list Apache-2.0 for each of these candidate revisions:

| Language | Reviewed checkpoint | Revision | Availability |
|---|---|---|---|
| en | [facebook/wav2vec2-base-960h](https://huggingface.co/facebook/wav2vec2-base-960h) | `22aad52d435eb6dbaf354bdad9b0da84ce7d6156` | Safetensors available and benchmarked |
| pt | [jonatasgrosman/wav2vec2-large-xlsr-53-portuguese](https://huggingface.co/jonatasgrosman/wav2vec2-large-xlsr-53-portuguese) | `634ac655299bcdc46c83bc01da9bab52d2987e4f` | Reviewed revision publishes pickle weights. No safe checkpoint provisioned. |
| ar | [jonatasgrosman/wav2vec2-large-xlsr-53-arabic](https://huggingface.co/jonatasgrosman/wav2vec2-large-xlsr-53-arabic) | `af46c2d8531b8dcbb5e23b952f739b372c2e5d2d` | Reviewed revision publishes pickle weights. No safe checkpoint provisioned. |

Model directory provenance is supplied by the operator. The JSON records the expected language model and revision alongside the SHA-256 of the actual local checkpoint.

```sh
HF_HUB_OFFLINE=1 python align.py source.wav --offset-ms 24000 \
  --lyrics section.txt --language en --model-dir /path/to/checkpoint --runs 3
MUMOO_FFMPEG=/path/to/ffmpeg python -m unittest discover -s . -v
```

The CLI writes JSON to stdout and diagnostics to stderr. The document preserves original UTF-8 lyrics and whitespace, original token text and character spans, model-excluded characters, and explicit unaligned reasons. Word timings are rounded to integer milliseconds relative to the clip. Punctuation may be omitted from the acoustic transcript while remaining in the output. Unsupported non-punctuation characters can leave a token unaligned. A `confirmed` result means every token has an in-bounds, positive-score acoustic alignment returned by WhisperX. It is not an independent accuracy guarantee. `partial` means only some do. `unavailable` covers no matching words or no provisioned model. Unaligned words have no fabricated times. WhisperX interpolation is disabled.

For independent timing evaluation, pass `--reference reference.json`. Use an array of objects with `text`, `startMs`, and `endMs`, in exactly the same order as the whitespace-delimited lyric tokens. The CLI reports median and nearest-rank p90 absolute start/end errors over matched words and reports coverage separately.

## Benchmark

Measured on Intel Core i5 macOS 15.8.2, Python 3.12.5, two Torch CPU threads, and FFmpeg `N-92718-g092cb17983-tessus`. One process per row. Cold is time from CLI analysis entry through the first inference, with weights already on disk. Warm is subsequent inference with the model loaded. RSS is the peak of the Python process and excludes FFmpeg. The English checkpoint was 377,607,901 bytes and all six downloaded files totaled 377,610,195 bytes. Its SHA-256 is `8aa76ab2243c81747a1f832954586bc566090c83a0ac167df6f31f0fa917d74a`.

| Fixture | Coverage | Cold (s) | Warm runs (s) | Peak RSS (bytes) |
|---|---:|---:|---|---:|
| English a cappella | 9/10 (partial) | 9.139995 | 1.952356, 1.977423 | 1,166,548,992 |
| English, electronically processed derivative | 9/10 (partial) | 9.018801 | 1.974272, 1.976477 | 1,166,626,816 |

Fixture source is [Cary Bass-Deschênes, “Singin’ in the Rain”](https://commons.wikimedia.org/wiki/File:Singin%27_in_the_Rain.mp3), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Source MP3 SHA-256 is `d8cf0f6b6a948539c0508b238783be8e25684a6c0394915508798353bfd53613`. The processed version uses the following FFmpeg filter chain. Neither recording is bundled.

```sh
ffmpeg -i singing.mp3 -af 'highpass=f=260,lowpass=f=3200,tremolo=f=12:d=0.65,aecho=0.8:0.75:45:0.35' singing-processed.wav
```

Both smoke runs used offset 100 ms and the supplied opening two phrases. The recording continues past those phrases within the 15-second analysis window. The final supplied word was rejected in both runs. These are exploratory coverage measurements, not timing-accuracy benchmarks. The fixture has no independent word-level annotation, so median and p90 timing errors are unavailable. Portuguese and Arabic model cards were checked. Their published pickle checkpoints (1,262,122,456 bytes and 1,262,142,936 bytes respectively) were not downloaded or executed on the Intel baseline. Multilingual singing and annotated timing validation remain open.

Four automated tests passed, including sample-exact extraction at a 1,001 ms offset, rejection of a short range, original text preservation, withholding invalid timing, and independent-reference metric calculations.

### Independent word timing benchmark

[Rxbyn, “Bad Side”](https://www.jamendo.com/track/1556580/bad-side), listed as CC BY in [JamendoLyrics metadata](https://huggingface.co/datasets/jamendolyrics/jamendolyrics), provided the English mixed-vocal benchmark and the independent annotations. The source is `subsets/en/mp3/Rxbyn_-_Bad_Side.mp3` (SHA-256 `24090af9ca4886bb0551f7c1896c249af3311cce1c585092054ed5c428834d44`). Select annotations whose rounded start and end fit inside 10,272–25,272 ms, subtract 10,272 ms, and join the resulting 23 tokens as supplied lyrics. Apply the filter chain above to reproduce the electronically processed derivative (SHA-256 `07546852d00b186cfbcc5d98067e4577efb2d4900114f16f251409f040aaf06f`). The derivative is a controlled stress test on the same song, not a second artist or a native electronic production.

| Fixture | Coverage | Start median / p90 (ms) | End median / p90 (ms) | Cold (s) | Warm runs (s) | Peak RSS (bytes) |
|---|---:|---:|---:|---:|---:|---:|
| Original mixed vocal | 21/23 (91.30%) | 109 / 659 | 71 / 847 | 17.565431 | 2.007512, 2.011442 | 1,166,520,320 |
| Electronically processed mix | 21/23 (91.30%) | 135 / 462 | 58 / 616 | 13.143498 | 2.024711, 2.034199 | 1,156,034,560 |

Errors are absolute and scored over the 21 aligned tokens per run. JamendoLyrics word ends include derived boundaries for some interior words, so interpret end error against that reference convention. Both runs returned partial status. The original mix's 659 ms p90 start error shows why coverage alone is insufficient for approving this pipeline for release.

## Music Analysis v1

The analyzer accepts an **already-selected 15-second file**, a clip offset, and an optional original source SHA-256. It never opens the original full song. ffprobe inspects the received clip and FFmpeg decodes it to 22,050 Hz mono float PCM for analysis. Original WAV metadata is read in the browser before Web Audio resamples the file. RIFF format fields and INFO title/artist tags are read where present. Tags stored in other WAV metadata formats may remain absent. Source details do not feed into playback, export, or the lyric worker.

```sh
python music_analysis.py selected.wav --offset-ms 10272 --source-sha256 ORIGINAL_SHA256 \
  --checkpoint /path/to/final0.ckpt --ffmpeg /path/to/ffmpeg --ffprobe /path/to/ffprobe
python benchmark_music_analysis.py --checkpoint /path/to/final0.ckpt \
  --ffmpeg /path/to/ffmpeg --ffprobe /path/to/ffprobe
```

`music-analysis-v1.schema.json` defines the independent result. The local WhisperX CLI can join by original source SHA-256, selection offset, and duration. The hosted WhisperX worker reports the prepared clip's hash and a local offset of zero. A future browser adapter should attach the original selection identity to that response and reject stale results when the selection changes. It can additionally compare prepared clip hashes when both requests used the exact same bytes. Analysis needs no lyric result, including on instrumentals. The current hosted worker and renderer do not import this module.

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

### Staging proposal

Use a separate one-core, 2 GiB, scale-to-zero CPU function in the existing Modal staging environment, with an independent request cap. Keep the WhisperX worker separate. Browser requests contain only the selected PCM clip and its selection identity. Render original metadata locally and analysis-file properties separately. Test Linux startup and warm full-request latency before enabling the endpoint in the browser. At [Modal list rates](https://modal.com/pricing), mapping the observed 28.46–44.12 s local wall times onto that reservation yields approximately $0.00050–$0.00077 of compute per run before credits, cold-container overhead, and idle retention. No Modal music-analysis runs or charges were measured.
