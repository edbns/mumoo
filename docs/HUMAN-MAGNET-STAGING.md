# Human Magnet: staging research

Human Magnet uses the existing authenticated staging media gateway, private Brain,
Pixabay adapter, clip-bound music analysis, PixiJS director renderer and browser
MP4 exporter. Visual mode does not request lyric alignment. Lyric mode passes
only already approved local word cues to the renderer; lyrics and audio are not
sent to the Brain.

The Brain returns three video sources and a frame-accurate plan. The browser
samples up to three source positions in each selected video. It sends bounded
numeric pixel-change observations and, where the optional browser FaceDetector
is available and succeeds, normalized face centers. No frames are uploaded.
The private Brain returns the refined source ranges and framing. The preview and
export consume that same validated plan. A face detector can miss people;
pixel differences measure change, not whether the change is a human action.
Provider tags are not proof of human content, visual suitability, or rights.

This is a controlled staging experiment. Live-provider clips are not approved
for production advertising or release, and do not become Core assets. Pixabay
source and license records are retained in the response; the source links are
shown in the preview. Provider accessibility is not a model/property release.
The existing provider cache and quota remain in effect. The authenticated media
gateway is limited to 25 requests per IP per minute; a full new treatment
requires five requests. Music and lyric endpoints have separate protections.

The four styles use different human-action queries and edit pacing. The user
must review the resulting footage and its creative suitability; neither the
metadata ranking nor optional face detection proves subject continuity or
originality. Candidate search can return too few suitable videos. Exact tag
duplicates are filtered; visual near-duplicate detection is not implemented.
No new model, AI service or rendering engine is introduced.
