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
