"""A song's sound print: what LAION's CLAP music model hears in the selected 15 seconds, as 512 numbers.

Songs that sound alike have prints that point the same way, so the style creators pick for their songs can teach which
style an unknown song is (genre learning). Made the same way by the cloud worker (`modal_sound_print_staging.py`) and
by a script on a computer (seeding with labelled songs), so both are comparable.

Measured on 23 of the owner's songs (2026-11-13): two clips of one song are about 0.87 alike, two different songs 0.58.
A 16 kHz clip moves a print about as far as another part of the song does, so prints are made from 48 kHz audio.
"""
import numpy as np

SAMPLE_RATE = 48_000
CLIP_SAMPLES = 15 * SAMPLE_RATE
WINDOW = 10 * SAMPLE_RATE
# The model hears 10 seconds: the clip is heard as its first and last 10 (they overlap by 5).
WINDOW_STARTS = (0, 5 * SAMPLE_RATE)
# About -60 dBFS: a clip this quiet has nothing to print.
SILENT_RMS = 0.001
MODEL = "laion-clap music_audioset_epoch_15_esc_90.14"
CHECKPOINT_SHA256 = "fae3e9c087f2909c28a09dc31c8dfcdacbc42ba44c70e972b58c1bd1caf6dedd"


def sound_print(embed, samples):
    """The print of 15 s of mono 48 kHz audio (floats, -1..1), or None when it is silent.

    `embed` is the model's `get_audio_embedding_from_data` (10 s windows in, one row each out). As LAION's recipe does,
    the audio goes through 16-bit and back first; the windows' prints are averaged and the result is of length 1.
    """
    samples = np.asarray(samples, dtype=np.float32)
    if samples.shape != (CLIP_SAMPLES,):
        raise ValueError("expected 15 seconds of mono 48 kHz audio")
    if float(np.sqrt(np.mean(samples.astype(np.float64) ** 2))) < SILENT_RMS:
        return None
    windows = np.stack([samples[start:start + WINDOW] for start in WINDOW_STARTS])
    windows = (np.clip(windows, -1, 1) * 32767).astype(np.int16).astype(np.float32) / 32767
    rows = np.asarray(embed(x=windows, use_tensor=False), dtype=np.float64)
    rows = rows / np.linalg.norm(rows, axis=1, keepdims=True)
    mean = rows.mean(axis=0)
    return [round(float(value), 5) for value in mean / np.linalg.norm(mean)]
