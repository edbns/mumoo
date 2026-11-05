# Daily Screens: staging visual review

Daily Screens includes five original messaging-style lyric surfaces informed
by the locally provided Messages, WhatsApp, Telegram, Messenger and Instagram
references. Screenshots, platform logos, personal names and photos are not
shipped. A neutral avatar and redacted contact label are drawn as vectors.
Approved words appear as timed messages; each interface is rendered afresh on
every frame rather than placed over a screenshot. It is available only for
Lyric Video in staging. Existing visuals remain available.

The approved WhisperX cue timestamps are clip-relative milliseconds. The first
visible frame is `ceil(startMs * 30 / 1000)`, capped at frame 449 for cues
starting during the final fractional frame; a message enters over five frames.
Messages derive entirely from approved cue text. The same drawing function is
used by the interactive preview and the MP4 exporter. The original selected
audio is used for preview and export. Font metrics are loaded before export.
The actual local creation time is captured once when the screen opens and
stored with the selected variant in the composition, so the preview and
export use the same clock. The clock advances with the 15-second frame time.
The one-at-a-time export queue can create one MP4 or a ZIP of all five; ZIP
packing uses the MIT-licensed `fflate` library and keeps files in browser memory.

The local browser export test uses synthetic audio and mocked services. It
checks 450 frames, 1080 × 1920, H.264/AAC, selected-audio markers and an actual
preview/export frame comparison. It does not prove live WhisperX, live Brain,
commercial visual quality or staging availability. A real hosted lyric and
download test, and product-owner review, are required separately.

Long unbroken text wraps to the available width; the newest messages are kept
within the screen's safe area. Automatic transcription, invented conversations,
interaction editing and non-lyric use are outside this first design.
