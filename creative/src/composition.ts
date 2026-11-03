export const WIDTH = 1080;
export const HEIGHT = 1920;
export const FPS = 30;
export const DURATION_MS = 15_000;
export const FRAMES = FPS * DURATION_MS / 1000;

export const PRESETS = [
  { id: 'scribble', name: 'Scribble', description: 'Hand-drawn underline' },
  { id: 'elastic', name: 'Elastic', description: 'Stretch and rebound' },
  { id: 'glitch', name: 'Glitch', description: 'Split-color jitter' },
] as const;

export interface LyricCue { text: string; startMs: number; endMs: number }

interface CompositionBase {
  template: typeof PRESETS[number]['id'];
  sourceSha256: string;
  clipStartMs: number;
}

export type Composition = CompositionBase & (
  { version: 1; lyric: LyricCue } | { version: 2; cues: LyricCue[] }
);

export function lyricsFor(composition: Composition) {
  return composition.version === 1 ? [composition.lyric] : composition.cues;
}

export function lyricText(composition: Composition) {
  return lyricsFor(composition).map(cue => cue.text).join(' ');
}

function isTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function validate(value: unknown, sourceDurationMs: number): asserts value is Composition {
  if (!Number.isFinite(sourceDurationMs) || sourceDurationMs < DURATION_MS) {
    throw new Error('Choose a WAV at least 15 seconds long.');
  }
  if (!value || typeof value !== 'object') throw new Error('Invalid composition.');
  const candidate = value as Composition;
  const { version, template, sourceSha256, clipStartMs } = candidate;
  if ((version !== 1 && version !== 2) || !PRESETS.some(preset => preset.id === template)) throw new Error('Unsupported composition.');
  if (typeof sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sourceSha256)) {
    throw new Error('Invalid source audio identity.');
  }
  if (!isTime(clipStartMs) || clipStartMs > sourceDurationMs - DURATION_MS) {
    throw new Error('Select a 15-second range inside the song using whole milliseconds.');
  }
  const cues = lyricsFor(candidate);
  if (!Array.isArray(cues) || cues.length > 120) throw new Error('Use up to 120 lyric cues.');
  let previousEnd = 0;
  for (const cue of cues) {
    if (!cue || typeof cue.text !== 'string' || [...cue.text].length > 48 ||
        (version === 2 && !cue.text.trim()) || !isTime(cue.startMs) || !isTime(cue.endMs) ||
        cue.startMs < previousEnd || cue.startMs >= cue.endMs || cue.endMs > DURATION_MS) {
      throw new Error('Enter lyric text and use ascending, non-overlapping times inside the clip.');
    }
    previousEnd = cue.endMs;
  }
}

// Playback selects the frame at or before the playhead.
// Each cue boundary takes effect on the first frame at or after that timestamp.
export function playheadFrame(ms: number) {
  return Math.min(FRAMES - 1, Math.max(0, Math.floor(ms * FPS / 1000)));
}

export function evaluate(composition: Composition, frame: number) {
  for (const cue of lyricsFor(composition)) {
    const start = Math.ceil(cue.startMs * FPS / 1000);
    const end = Math.ceil(cue.endMs * FPS / 1000);
    if (frame >= start && frame < end) return { text: cue.text, phase: (frame - start) / FPS };
  }
  return { text: '', phase: 0 };
}
