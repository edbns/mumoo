# CLAP genre research

This is an isolated, staging-only research tool. It uses the Apache-2.0 LAION music checkpoint revision a0b4534a14f58e20944452dff00a22a06ce629d1. The checkpoint SHA-256 is verified before loading. To build the image, the approved checkpoint snapshot must be present at the path defined in worker.py. Weights and private audio are never committed.

The browser decodes the original locally and uploads exactly 15 seconds of mono 16 kHz PCM WAV. The worker validates the exact size and header, resamples in memory, and runs two fixed 10-second windows at 0–10 and 5–15 seconds. It writes no audio files. Similarities are cosine scores. The combined ranking is the arithmetic mean of both windows, not a confidence value. Candidate text is fixed as prompt version 1. Window disagreement and all raw scores remain visible.

Access codes are expiry and HMAC signatures scoped to mumoo-genre-research, with a separate rate counter. The shared secret is stored in the existing Modal staging secret. The gateway validates access before dispatch, caps uploads, and allows three analyses per minute and 30 per day. Netlify adds a per-IP limit. Worker and gateway scale to zero. No browser results or music are stored by the application. Scores, model results, and audio are not logged.

Initial synthetic-only hosted validation on 2026-11-04 returned cold 18.18 s and warm 3.44 s end to end. Model processing took 5.208 s cold and 0.884 s warm. Peak process RSS was 1,736,232,960 bytes. The synthetic clip is not evidence of genre accuracy.
