import type { Pace } from './pack-director';

export const WIDTH = 1080;
export const HEIGHT = 1920;
export const FPS = 30;
export const DURATION_MS = 15_000;
export const FRAMES = FPS * DURATION_MS / 1000;

export interface ImpactMusic {
  beatsMs: number[];
  /** The first beat of each bar; the Dust scene breaks up hardest on these. */
  downbeatsMs?: number[];
  energy: { timeMs: number; rms: number }[];
  /** Section changes and sung line starts: the Director cuts on these (`songAccents`). */
  accentsMs?: number[];
  /** How the song wants to be cut, from its vibe. */
  pace?: Pace;
}

/** One timed word (or short phrase) of the lyrics, in milliseconds from the start of the 15-second clip. */
export interface LyricCue { text: string; startMs: number; endMs: number }

/** What the creator chose: which 15 seconds of which song, and the timed lyrics for them. */
export interface Composition {
  sourceSha256: string;
  clipStartMs: number;
  cues: LyricCue[];
}

function isTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function validate(value: unknown, sourceDurationMs: number): asserts value is Composition {
  if (!Number.isFinite(sourceDurationMs) || sourceDurationMs < DURATION_MS) {
    throw new Error(Number.isFinite(sourceDurationMs) && sourceDurationMs > 0
      ? `This song is ${Math.floor(sourceDurationMs / 100) / 10} seconds long. Choose one at least 15 seconds long.`
      : 'Choose a song at least 15 seconds long.');
  }
  if (!value || typeof value !== 'object') throw new Error('Invalid composition.');
  const { sourceSha256, clipStartMs, cues } = value as Composition;
  if (typeof sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sourceSha256)) {
    throw new Error('Invalid source audio identity.');
  }
  if (!isTime(clipStartMs) || clipStartMs > sourceDurationMs - DURATION_MS) {
    throw new Error('Select a 15-second range inside the song using whole milliseconds.');
  }
  if (!Array.isArray(cues) || cues.length > 120) throw new Error('Use up to 120 lyric cues.');
  let previousEnd = 0;
  for (const cue of cues) {
    if (!cue || typeof cue.text !== 'string' || [...cue.text].length > 48 || !cue.text.trim() ||
        !isTime(cue.startMs) || !isTime(cue.endMs) ||
        cue.startMs < previousEnd || cue.startMs >= cue.endMs || cue.endMs > DURATION_MS) {
      throw new Error('Lyric words must have text and ascending, non-overlapping times inside the clip.');
    }
    previousEnd = cue.endMs;
  }
}

/** Playback shows the frame at or before the audio playhead. */
export function playheadFrame(ms: number) {
  return Math.min(FRAMES - 1, Math.max(0, Math.floor(ms * FPS / 1000)));
}
