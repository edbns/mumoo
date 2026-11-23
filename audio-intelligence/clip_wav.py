"""The selected clip as the site sends it: mono 16-bit PCM WAV, 10 to 15 seconds in whole tenths of a second.

Fifteen seconds is the clip; a song shorter than that (a saved TikTok, a Reel) is used whole, down to ten seconds.
Every worker that takes the clip (music analysis, lyrics, sound print, render) checks it here.
"""
import struct

MIN_MS = 10_000
MAX_MS = 15_000
STEP_MS = 100


def header(rate: int, ms: int) -> bytes:
    data = rate * ms // 1000 * 2
    return struct.pack("<4sI4s4sIHHIIHH4sI", b"RIFF", 36 + data, b"WAVE", b"fmt ", 16, 1, 1,
                       rate, rate * 2, 2, 16, b"data", data)


def max_bytes(rate: int) -> int:
    return 44 + rate * MAX_MS // 1000 * 2


def clip_ms(audio: bytes, rate: int) -> int | None:
    """How long the clip in `audio` is, in ms; None when it is not a clip at `rate`."""
    data = len(audio) - 44
    if data <= 0 or data % 2 or (data // 2 * 1000) % rate:
        return None
    ms = data // 2 * 1000 // rate
    if not MIN_MS <= ms <= MAX_MS or ms % STEP_MS or audio[:44] != header(rate, ms):
        return None
    return ms
