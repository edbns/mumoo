# Daily Screens: staging visual review

Daily Screens includes five original messaging-style lyric surfaces (Messages,
WhatsApp, Telegram, Messenger, Instagram); three Daily Screens 2.0 surfaces
(Dating match, Ride, Food delivery); and four scene layouts: Banking alert,
Lock screen, Missed call, and Search. Screenshots, platform logos, personal
names and photos are not shipped. Neutral avatars and redacted labels are drawn
as vectors. Approved words appear as timed lines; each interface is rendered
afresh on every frame. Available only for Lyric Video in staging.

Scene notes:

- **Banking alert** — fantasy balances and alert copy are seeded per creation
  (including occasional $1M / $2M balances). Not a real account.
- **Lock screen** — dark frosted notification banners, rose clock/date, lock
  controls; informed by iOS lock-screen notification references (no logos).
- **Missed call** — iOS Recents → Missed dark list with red primary rows, blue
  info controls, and tab bar; lyric lines fill the red title row.
- **Search** — trending/autocomplete rows with lyric query lines.

The approved WhisperX cue timestamps are clip-relative milliseconds. Words group
into short chat lines and appear on `floor(startMs * 30 / 1000)`. Preview paints
from a live audio playhead on every animation frame. Preview and MP4 export both
use `paintDailyScreen`. All screens share simulated iOS-style retention chrome
via `drawDeviceStatus`. The device seed is saved with each exported composition.

Reference screenshots are never shipped. Product-owner visual review remains
required for commercial fidelity.
