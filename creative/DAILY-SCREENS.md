# Daily Screens: staging visual review

The first Daily Screens design is an original messaging-style lyric surface,
informed by the proportions, spacing and interface hierarchy of the locally
provided Messages reference. The screenshot, platform logos and names are not
shipped. Approved words appear as timed messages; the interface is rendered
afresh on every frame rather than placed over a screenshot. It is available
only for Lyric Video in staging. Existing visuals remain available.

The approved WhisperX cue timestamps are clip-relative milliseconds. The first
visible frame is `ceil(startMs * 30 / 1000)`, capped at frame 449 for cues
starting during the final fractional frame; a message enters over five frames.
Messages derive entirely from approved cue text. The same drawing function is
used by the interactive preview and the MP4 exporter. The original selected
audio is used for preview and export. Font metrics are loaded before export.

The local browser export test uses synthetic audio and mocked services. It
checks 450 frames, 1080 × 1920, H.264/AAC, selected-audio markers and an actual
preview/export frame comparison. It does not prove live WhisperX, live Brain,
commercial visual quality or staging availability. A real hosted lyric and
download test, and product-owner review, are required separately.

Long unbroken text wraps to the available width; the newest messages are kept
within the screen's safe area. Automatic transcription, invented conversations,
interaction editing and non-lyric use are outside this first design.
