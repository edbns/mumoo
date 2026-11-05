# Staging director execution contract

The private Brain's staging `fast-plan` response contains `executionPlan` version 2. Its `clipSha256` identifies the 15-second analysis excerpt. The browser checks it against the current music profile and also checks the composition against the selected full-song identity and offset. A mismatch rejects the plan.

`fps` is 30 and `durationFrames` is 450. Shot and motion intervals are integer frames, start-inclusive and end-exclusive. `sourceInMs` and `sourceOutMs` delimit the requested source interval; its duration must equal the shot duration rounded up to whole milliseconds. For output frame `f`, source time is `sourceInMs + (f - startFrame) * 1000 / 30`. The renderer validates actual decoded duration and never loops a short source.

`cut` has zero duration. A `dissolve` has a duration of 1–30 frames: at its start frame, the outgoing last frame is retained at full opacity and the incoming frame is transparent; incoming opacity rises linearly to full on the frame at start plus duration. This definition does not infer an overlapping outgoing source interval.

`crop.mode` is `cover`; `x` and `y` are normalized focal coordinates from 0 to 1, bounded so the output is fully covered. `motion.intensity` is a normalized 0–1 value: one unit corresponds to a maximum 2% linear zoom across the shot. The seed determines the zoom direction. Motion segments cover all 450 frames. `lyrics.source` selects either no cues or the locally approved synchronized cues; lyric text is never sent to the Brain. Unsupported keys, invalid ranges and contradictory legacy shot diagnostics are rejected.

The automatic staging path uses PixiJS WebGL and the same deterministic evaluator for preview and MP4. Legacy media edits continue using Canvas. Provider metadata and diagnostic explanations are not rendering instructions. Staging Pixabay footage remains research-only and is not cleared for production advertising. The renderer does not claim that provider tags describe actual video content accurately.

## Local hardware verification

On the existing Intel Mac, headed Brave reported ANGLE Metal / Intel Iris Plus Graphics 645. With the same rights-controlled local footage and ATREVIMENTO excerpt, two different plans exported in 8.76 s and 13.74 s. Each output contained 450 frames at 1080×1920 and 30 fps, H.264 video and AAC audio, duration 15.000 s. Ten sampled preview/export frames had mean absolute RGB errors of 2.64/255 and 2.68/255 respectively. A motion-only change produced a 1.47/255 mean RGB difference in a sampled image. Decoded audio correlated 0.9999 with the selected source in both exports. These times are observations for this footage and browser, not a general performance guarantee. The supplied actual music-direction data came from a separately recorded ATREVIMENTO test; byte-identical clip identity with the local benchmark excerpt was not established. Proprietary music and media are not committed.
