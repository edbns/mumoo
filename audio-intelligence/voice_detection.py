"""Who sings: female, male or both, heard in the selected 15 seconds.

Three steps. The singing is separated from the music (Demucs htdemucs, MIT), so nothing but the voice is read. Its pitch is
followed (librosa pYIN) only to learn whether anyone sings and when. Then each 4 second stretch that holds singing is given to a
timbre reader (wav2vec2 XLS-R 300M fine-tuned for male/female, Apache 2.0) and the stretches vote.

Timbre rather than pitch: women's and men's singing overlap in pitch (a tenor or a pop man in head voice sits where an alto
does), and a followed pitch often lands an octave off. Measured on real clips, pitch called a male pop singer female where the
timbre reader did not. The reader was trained on speech, so it is not trusted on its own: it answers only when most stretches
agree, says "both" only when several stretches strongly say each, and otherwise answers `None` (an instrumental, too little
singing, voices that disagree). The Creative Studio then deals its default singers instead of guessing.
"""
from __future__ import annotations

from pathlib import Path

SAMPLE_RATE = 16_000
SEPARATION_RATE = 44_100
HOP = 320  # 20 ms
FRAME = 1024
# A voice is followed between these pitches (Hz): a bass voice's low end to a soprano's top.
FMIN, FMAX = 65.0, 1000.0
# pYIN has to be this sure a frame is a voice, and the voice stem this loud (against the mix), to count as singing.
MIN_VOICED_PROB = 0.5
MIN_VOICED_SECONDS = 2.0
MIN_STEM_SHARE = 0.015
# Voting: at least this many stretches, this share of them agreeing, and "both" needs this many strongly on each side.
MIN_WINDOWS = 2
MAJORITY = 0.66  # two thirds
STRONG = 0.9
MIN_STRONG_EACH = 2


def decide(f0, stem_share: float, windows) -> dict:
    """What the followed pitch (Hz of every voiced frame) and the stretches' timbre say. Pure arithmetic: tested without audio."""
    import numpy as np

    pitch = np.asarray(f0, dtype=float)
    voiced_seconds = round(len(pitch) * HOP / SAMPLE_RATE, 2)
    female = [float(window["female"]) for window in windows]
    result = {"value": None, "reason": None, "voicedSeconds": voiced_seconds, "stemShare": round(float(stem_share), 4),
              "medianHz": round(float(np.median(pitch)), 1) if len(pitch) else None, "stretches": len(female),
              "femaleShare": None}
    if stem_share < MIN_STEM_SHARE or voiced_seconds < MIN_VOICED_SECONDS:
        result["reason"] = "no_singing"
        return result
    if len(female) < MIN_WINDOWS:
        result["reason"] = "too_little_singing"
        return result
    share = sum(value > 0.5 for value in female) / len(female)
    result["femaleShare"] = round(share, 3)
    if share >= MAJORITY:
        result["value"] = "female"
    elif share <= 1 - MAJORITY:
        result["value"] = "male"
    elif sum(value >= STRONG for value in female) >= MIN_STRONG_EACH and sum(value <= 1 - STRONG for value in female) >= MIN_STRONG_EACH:
        result["value"] = "both"
    else:
        result["reason"] = "voices_disagree"
    return result


def load_separator(repo, name: str = "htdemucs", threads: int = 2):
    import torch
    from demucs.pretrained import get_model

    torch.set_num_threads(threads)
    model = get_model(name, repo=Path(repo))
    model.eval()
    return model


def vocal_stem(audio, model):
    """The singing alone, at 16 kHz mono, and how much of the mix's energy it is (0..1)."""
    import librosa
    import numpy as np
    import torch
    from demucs.apply import apply_model

    wide = librosa.resample(audio, orig_sr=SAMPLE_RATE, target_sr=SEPARATION_RATE)
    stereo = torch.from_numpy(np.stack([wide, wide]))[None]
    with torch.no_grad():
        stems = apply_model(model, stereo, device="cpu", shifts=0, split=True, overlap=0.1, progress=False)[0]
    voice = stems[model.sources.index("vocals")].mean(0).numpy()
    share = float(np.sqrt(np.mean(voice ** 2)) / max(np.sqrt(np.mean(wide ** 2)), 1e-9))
    return librosa.resample(voice, orig_sr=SEPARATION_RATE, target_sr=SAMPLE_RATE), share


def pitch_frames(voice):
    """The pitch of every 20 ms frame of the stem (Hz, NaN when unvoiced), with whether pYIN found a voice and how sure it is."""
    import librosa

    return librosa.pyin(voice, fmin=FMIN, fmax=FMAX, sr=SAMPLE_RATE, frame_length=FRAME, hop_length=HOP, fill_na=None)


def follow_pitch(voice, min_probability: float = MIN_VOICED_PROB):
    """The pitch (Hz) of every frame of the stem that is surely a voice."""
    f0, voiced, probability = pitch_frames(voice)
    return f0[voiced & (probability >= min_probability)]


GENDER_REPO = "alefiury/wav2vec2-large-xlsr-53-gender-recognition-librispeech"
WINDOW_SECONDS, WINDOW_STEP_SECONDS = 4.0, 2.0
MIN_WINDOW_VOICED_SECONDS = 0.6


def load_gender(directory):
    """The timbre reader (wav2vec2 XLS-R 300M fine-tuned on LibriSpeech for male/female, Apache 2.0)."""
    import torch
    from transformers import AutoFeatureExtractor, AutoModelForAudioClassification

    extractor = AutoFeatureExtractor.from_pretrained(directory)
    model = AutoModelForAudioClassification.from_pretrained(directory)
    model.eval()
    labels = {int(index): name for index, name in model.config.id2label.items()}
    return extractor, model, [index for index, name in sorted(labels.items()) if name == "female"][0]


def female_by_window(voice, voiced, gender):
    """For each 4 second stretch of the stem that holds enough singing, how female the timbre sounds (0..1)."""
    import numpy as np
    import torch

    extractor, model, female = gender
    reads = []
    step, size = int(WINDOW_STEP_SECONDS * SAMPLE_RATE), int(WINDOW_SECONDS * SAMPLE_RATE)
    for begin in range(0, max(len(voice) - size, 0) + 1, step):
        frames = voiced[begin // HOP:(begin + size) // HOP]
        if frames.sum() * HOP / SAMPLE_RATE < MIN_WINDOW_VOICED_SECONDS:
            continue
        piece = voice[begin:begin + size]
        inputs = extractor(piece, sampling_rate=SAMPLE_RATE, return_tensors="pt")
        with torch.no_grad():
            probabilities = torch.softmax(model(**inputs).logits, dim=-1)[0]
        reads.append({"atSeconds": begin / SAMPLE_RATE, "female": round(float(probabilities[female]), 3)})
    return reads


def detect(audio, separator, gender) -> dict:
    """`audio`: 15 seconds, mono float32 at 16 kHz. `separator`, `gender`: from `load_separator`, `load_gender`."""
    voice, share = vocal_stem(audio, separator)
    f0, voiced, probability = pitch_frames(voice)
    sure = voiced & (probability >= MIN_VOICED_PROB)
    windows = female_by_window(voice, sure, gender) if sure.sum() * HOP / SAMPLE_RATE >= MIN_VOICED_SECONDS and share >= MIN_STEM_SHARE else []
    return decide(f0[sure], share, windows)


def main():
    import argparse
    import json
    from pathlib import Path

    import librosa
    import soundfile

    parser = argparse.ArgumentParser(description="Read who sings in 15 seconds of an audio file.")
    parser.add_argument("file", type=Path)
    parser.add_argument("--start", type=float, default=0.0, help="seconds into the file")
    parser.add_argument("--models", type=Path, required=True, help="folder holding htdemucs.yaml and its weights")
    parser.add_argument("--gender", type=Path, required=True, help="folder holding the timbre reader")
    args = parser.parse_args()
    samples, rate = soundfile.read(args.file, dtype="float32", always_2d=True)
    mono = samples.mean(1)[int(args.start * rate):int((args.start + 15) * rate)]
    audio = librosa.resample(mono, orig_sr=rate, target_sr=SAMPLE_RATE)
    print(json.dumps(detect(audio, load_separator(args.models), load_gender(args.gender))))


if __name__ == "__main__":
    main()
