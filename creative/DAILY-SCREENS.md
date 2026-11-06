# Daily Screens: staging visual review

Daily Screens includes five original messaging-style lyric surfaces informed
by the locally provided Messages, WhatsApp, Telegram, Messenger and Instagram
references; three Daily Screens 2.0 surfaces (Dating match, Ride, Food
delivery); and ten scene layouts spanning logistics, banking, device chrome and
social feeds. Screenshots, platform logos, personal names and photos are not
shipped. Neutral avatars and redacted labels are drawn as vectors. Approved
words appear as timed lines; each interface is rendered afresh on every frame
rather than placed over a screenshot. It is available only for Lyric Video in
staging. Existing visuals remain available.

Scene catalog:

- Logistics / commerce: Package tracking, Banking alert, Order update
- Personal / device: Lock screen, Missed call
- Social / public: Comment thread, Search, Notifications, Story reply, Social post

The approved WhisperX cue timestamps are clip-relative milliseconds. Words group
into short chat lines (punctuation, pause, or ~line length) and appear on
`floor(startMs * 30 / 1000)` (same as the audio playhead), capped at frame 449.
Scene and 2.0 layouts keep the newest lines in the message well so later lyrics
are never clipped off-screen. Preview paints from a live audio playhead ref on
every animation frame so React re-renders cannot lag lyrics behind the song.
Preview and MP4 export both use `paintDailyScreen` (Canvas for all eighteen
designs); the canvas remounts on every template switch so a stale bitmap cannot
stick black. The original selected audio is used for preview and export. Font
metrics are loaded before export. The actual local creation time is captured
once when the screen opens and stored with the selected variant in the
composition, so the preview and export use the same clock. The clock advances
with the 15-second frame time. The one-at-a-time export queue can create one
MP4 or a ZIP of all screens; ZIP packing uses the MIT-licensed `fflate` library
and keeps files in browser memory.

All screens share simulated iOS-style retention chrome: a live system clock,
Dynamic Island, cellular bars, a Wi‑Fi icon (or 4G/5G label), red/green battery
fill, optional charging mark, and a seeded notification badge. Each screen has
its own deterministic profile for a creation. Battery and signal are decorative,
not the user's device readings. The seed is saved with each exported
composition. Future screen layouts should reuse `drawDeviceStatus`, and
notification badges must stay tied to that seeded session rather than inventing
chat people. Tracking IDs, order numbers and balances are deterministic from the
device seed — never copied from a real shipment or bank account.

The local browser export test uses synthetic audio and mocked services. It
checks 450 frames, 1080 × 1920, H.264/AAC, selected-audio markers and an actual
preview/export frame comparison for Canvas designs. DOM/scene designs are
covered by dedicated browser export tests. These do not prove live WhisperX,
live Brain, commercial visual quality or staging availability. A real hosted
lyric and download test, and product-owner review, are required separately.

Long unbroken text wraps to the available width; the newest messages are kept
within the screen's safe area. Automatic transcription, invented conversations,
interaction editing and non-lyric use are outside this first design.

Reference-fidelity work in progress: messaging Canvas screens retain simplified,
original vector icons and wallpaper. Scene layouts are original reconstructions
informed by public UI patterns (no logos). Product-owner visual review and
further refinement remain required. Reference screenshots are never shipped.
