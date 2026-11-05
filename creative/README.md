# MUMOO creative engine

This local development slice lives in `creative/`. The prototype at the repository root remains intact.

## Run locally

From this directory, use Node 22.17.1 and run:

```sh
npm ci
npx playwright install chromium --only-shell
npm run dev
```

Open the local Vite URL on desktop. Choose a RIFF WAV and drag the highlighted 15-second window on the waveform. Use the range slider or numeric millisecond field for keyboard and precise adjustments. Audition the selection, add and time lyric lines, and approve them before choosing Scribble, Elastic, or Glitch in Plain Colors. Continue without lyrics for an instrumental. Switching presets preserves the selected clip and lyric timing. The visual preview slider seeks within the selected clip.

Click **Export MP4** to render and download `mumoo.mp4` in the browser. The WAV stays on the device. The export requires WebCodecs H.264 and AAC encoding at the selected profile. The app checks support on the current device before rendering. The browser path uses the shared Canvas renderer, encodes all 450 frames, and caps AAC padding at the 15-second clip boundary when muxing with Mediabunny.

If browser encoding is unavailable, open **Local export fallback**, download the composition JSON, then run:

```sh
npm run export -- /path/to/composition.json /path/to/source.wav /path/to/output.mp4
```

The source must be the WAV used in the editor. The runner verifies its SHA-256 hash and publishes the output only after a successful encode. Use a new output filename. The WAV and composition are processed on the local machine.

## Checks

```sh
npm run build
npm run typecheck
npm run lint
npm test
```

Tests use generated WAV fixtures only. They compare the editor and export canvas at matching cue boundaries and inspect both the browser-downloaded and CLI-encoded MP4s and their decoded audio.

## Composition and rendering decisions

- Version 2 compositions record the source hash, clip start, template, and an ordered list of lyric cues. The renderer also accepts version 1 compositions with a single cue. Clip start and cue times are integer milliseconds. The cue is half-open. An in or out boundary takes effect on the first frame at or after its timestamp, using ceiling division. Browser playback uses the frame at or before the audio playhead, using floor division. The export evaluates frames 0–449.
- The preview and export pages call the same pure evaluator and Canvas 2D drawing code. Both draw on a 1080 × 1920 canvas and wait for bundled Inter Variable before drawing. Its SIL OFL 1.1 notice is included in the build. Parity is verified in pinned Chromium before lossy encoding. Browser or system font fallbacks for uncovered glyphs can differ across environments.
- The browser seeks using the decoded source and a clip-relative audio clock. The CLI renders frame PNGs in pinned headless Chromium and streams them to FFmpeg for H.264 encoding and AAC muxing from the selected WAV interval. The renderer receives a composition and a frame index and has no React dependency.
- The CLI needs local Chromium and a platform supported by the pinned FFmpeg installer packages. The bundled FFmpeg is for this development benchmark. Production encoder version, security and licensing review remain separate decisions. The editor decodes the whole WAV in memory, and this increment has been verified on one OS/browser configuration.

## Benchmark

Baseline on an Intel Core i5 MacBook Pro (8 GB, macOS 15.8.2), using Node 22.17.1, Playwright 1.64.1 / Chromium 156.0.8078.4, FFmpeg 92718-g092cb17983, and ffprobe 20230213-f8d6d0f:

| Check | Result |
| --- | --- |
| Source selection | 18-second mono PCM fixture, selected from 2.000 to 17.000 seconds |
| Export | 18.20 seconds wall time, 118,474 bytes |
| Output profile | H.264/AAC, 1080 × 1920, 30 fps, 450 frames, both streams and container 15.000 seconds |
| Canvas parity | Identical PNG data at four sampled cue-boundary frames in pinned Chromium |
| Decoded audio | Markers at 1.017021, 2.017021, and 14.900021 seconds. Markers outside the source selection were absent. |
| Synchronization | Both video cue transitions followed their audio markers by 16.31 ms, within one 33.33 ms frame |
| Memory | `/usr/bin/time -l` reported 596,271,104 bytes maximum RSS for the test invocation. This is not a process-tree aggregate. |

The initial encode stopped the audio at 13.397 seconds because FFmpeg ended when its explicit video-frame limit was reached. The renderer now closes the frame stream after 450 frames and FFmpeg uses the shared duration limit. The runner probes both tracks and rejects output outside the profile before publishing it.

The dependency audit reports a moderate minimatch advisory through the development lint tooling. The current npm remediation proposes an incompatible ESLint downgrade.

## Experimental paste-and-sync

Paste only the words sung inside the selected 15 seconds and click **Sync lyrics**. A web worker runs the quantized multilingual Xenova Whisper Tiny model via Transformers.js. It matches the pasted words in order to word timestamps recognized from the selected audio. Review by auditioning the clip and watching the current word, then approve and choose a visual. Unmatched words are reported and prevent approval of the sync result. Changing the clip invalidates its timing.

This is a recognition-based matching pilot. It cannot recover the timing of a word the model fails to recognize, and repetitions or heavy accompaniment can reduce accuracy. The first run downloads model files from Hugging Face and the browser must be able to reach that service. Audio is processed locally. Automatic transcript entry, vocal separation, and BPM analysis are separate work.

Model and license: [Xenova/whisper-tiny](https://huggingface.co/Xenova/whisper-tiny).

### Staging media-first creation

The authenticated staging workflow sends only the selected 15-second audio to Music Analysis. A server-side bridge authenticates the existing worker; the original song stays in the browser. The clip-bound result and a sanitized creative profile go to the private Brain through the staging gateway. Audio, filenames, artist metadata and lyrics are excluded. If analysis is unavailable, media recommendations and the automatic edit remain unavailable rather than using invented features.

The private catalog discovers candidates from The Met's structured Open Access API. Candidates remain pending until explicitly reviewed, and source rights are rechecked on approval. Only approved candidates are returned to the creator. The separate staging admin view is available with `?media-admin=1`; the sanitized session diagnostics are available with `?media-debug=1`.

Approved catalog media or multiple creator-supplied images/videos feed the same versioned, 15-second edit timeline. Real beat and onset events inform a small number of cuts and transitions. The same frame evaluator renders preview and browser MP4 export; timed lyrics are an independent layer. Matching is deliberately simple, and user media is kept locally. Batch export and longer durations are not implemented.

The staging zero-input experiment asks the private Brain for a Director Blueprint after clip analysis. It requires at least two explicitly approved Wikimedia Commons video records and real timing events, then loads those public-domain or CC0 videos directly from the permitted CORS-enabled source. The same validated shot plan drives preview and MP4 export. `?media-debug=1` exposes sanitized analysis inputs, the Blueprint and a short in-memory diagnostic trace. The trace excludes audio, lyrics, filenames and credentials and is not sent to a server. The gateway logs random request IDs, status, duration and non-sensitive error categories only. Music-analysis failures can be retried explicitly. Source rights and browser playback must be reviewed per asset; no recommendation is returned if the approved footage or music evidence is insufficient. Matching remains basic and this is not an eight-video catalog. Timing measurements are recorded in `docs/footage-benchmark.md`.
