"""The clips a seeded file is heard as, mono 16-bit 48 kHz WAV as the site sends a creator's clip.

A song, or a loop of 15 s or more, gives three 15 s clips a quarter, half and three quarters in. A shorter loop is heard
whole, and one under 10 s is played round to 10 s, as a producer loops it. Under 2 s it is a one-shot (one hit, a single
note): it sounds like no song and gives no clip.
"""
from clip_wav import header
from sound_print import CLIP_SAMPLES, SAMPLE_RATE, WINDOW

PLACES = (0.25, 0.5, 0.75)
ONE_SHOT_SAMPLES = 2 * SAMPLE_RATE


def clips(pcm: bytes, loops: bool = False) -> list[tuple[int, bytes]]:
    """(start in ms, clip WAV) for 16-bit mono 48 kHz samples; with `loops`, a file under 15 s is heard too."""
    samples = len(pcm) // 2
    if samples >= CLIP_SAMPLES:
        starts = []
        for place in PLACES:
            start = max(0, round(samples / SAMPLE_RATE * place - 7.5))
            if start * SAMPLE_RATE + CLIP_SAMPLES <= samples and start not in starts:
                starts.append(start)
        return [(start * 1000, header(SAMPLE_RATE, 15_000) + pcm[start * SAMPLE_RATE * 2:(start * SAMPLE_RATE + CLIP_SAMPLES) * 2])
                for start in starts]
    if not loops or samples < ONE_SHOT_SAMPLES:
        return []
    if samples >= WINDOW:
        return [(0, header(SAMPLE_RATE, samples * 1000 // SAMPLE_RATE) + pcm[:samples * 2])]
    looped = (pcm[:samples * 2] * (WINDOW // samples + 1))[:WINDOW * 2]
    return [(0, header(SAMPLE_RATE, 10_000) + looped)]
