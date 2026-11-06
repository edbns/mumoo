# Lyric Impact staging family

Lyric Impact is a lyric-only family. It groups the creator-approved word cues
into short phrases by punctuation, gaps and a five-word limit. This is a
deterministic layout heuristic, not a claim that the application can identify
the most emotionally significant lyric. It does not invent or transcribe text.

Poster, Punch, Editorial and Echo share one frame renderer for preview and
export. Punch follows individual cue intervals; other treatments display the
current phrase only during its approved interval. Cue boundaries use the first
30 fps frame at or after the timestamp; starts in the final partial frame are
clamped to frame 449. Beat positions and RMS energy from the clip-bound Music
Analysis v1 result influence restrained motion when available; no beat is
invented when analysis is unavailable. The composition carries the selected
style and the sampled analysis for reproducible export. Downbeats are not used.

Exports run sequentially and use the existing H.264/AAC browser exporter. A
single style downloads as MP4; all styles are packaged in a ZIP in browser
memory. The original audio stays local. Existing Daily Screens remain available.

The local real-song test uses the owner's previously approved test file with
mocked alignment and music-analysis responses. It verifies rendering and audio
selection, not the accuracy of lyric timing on that song. Live staging lyric
alignment, creator review and commercial creative quality must be checked
separately; a technical export alone is not acceptance.
