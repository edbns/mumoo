# Daily Screens: staging visual review

Daily Screens includes five original messaging-style lyric surfaces informed
by the locally provided Messages, WhatsApp, Telegram, Messenger and Instagram
references, plus three React/CSS Daily Screens 2.0 designs: Dating match,
Ride, and Food delivery. Screenshots, platform logos, personal names and
photos are not shipped. A neutral avatar and redacted contact label are drawn
as vectors or CSS shapes. Approved words appear as timed messages; each
interface is rendered afresh on every frame rather than placed over a
screenshot. It is available only for Lyric Video in staging. Existing visuals
remain available.

The approved WhisperX cue timestamps are clip-relative milliseconds. The first
visible frame is `ceil(startMs * 30 / 1000)`, capped at frame 449 for cues
starting during the final fractional frame; a message enters over five frames.
Messages derive entirely from approved cue text. The same drawing function is
used by the interactive preview and the MP4 exporter for the five Canvas
designs. The three DOM designs preview as live React/CSS and export through
`html2canvas` into the existing Mediabunny encoder (`paintDailyScreen`). The
original selected audio is used for preview and export. Font metrics are
loaded before export. The actual local creation time is captured once when the
screen opens and stored with the selected variant in the composition, so the
preview and export use the same clock. The clock advances with the 15-second
frame time. The one-at-a-time export queue can create one MP4 or a ZIP of all
eight; ZIP packing uses the MIT-licensed `fflate` library and keeps files in
browser memory.

All screens share simulated iOS-style status details: a captured local clock and
seeded variations of battery, signal, network and device shape. Each screen has
its own deterministic profile for a creation. Battery and signal are decorative,
not the user's device readings. The seed is saved with each exported composition.
Future screen layouts should reuse the status treatment, and any notification
badges must match actual simulated items rather than showing invented counts.

The local browser export test uses synthetic audio and mocked services. It
checks 450 frames, 1080 × 1920, H.264/AAC, selected-audio markers and an actual
preview/export frame comparison for Canvas designs. DOM designs are covered by
a dedicated browser export test. These do not prove live WhisperX, live Brain,
commercial visual quality or staging availability. A real hosted lyric and
download test, and product-owner review, are required separately.

Long unbroken text wraps to the available width; the newest messages are kept
within the screen's safe area. Automatic transcription, invented conversations,
interaction editing and non-lyric use are outside this first design.

Reference-fidelity work in progress: the four other Canvas screens retain
simplified, original vector icons and wallpaper. WhatsApp's broadcast-screen
notice and Telegram's centered contact header follow the supplied references,
but layouts, wallpaper and typography are not pixel-identical. They require
product-owner visual review and further refinement. Reference screenshots are
never shipped. Dating/ride/food React layouts are original reconstructions
pending owner Gummble-reference QA.
