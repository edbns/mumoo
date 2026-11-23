import type { Pace } from './pack-director';

export const WIDTH = 1080;
export const HEIGHT = 1920;
export const FPS = 30;
/** The clip: 15 seconds of the song. A shorter song (a saved TikTok or Reel) is used whole, down to `MIN_SONG_MS`. */
export const FULL_CLIP_MS = 15_000;
export const MIN_SONG_MS = 10_000;
/** The most frames a creative has (a 15-second clip). */
export const MAX_FRAMES = FPS * FULL_CLIP_MS / 1000;

/** How long the clip of a song this long is: 15 seconds, or all of a shorter song in whole tenths of a second (so samples at every rate, and frames, come out whole). */
export function clipLengthMs(songMs: number) {
  return Math.min(FULL_CLIP_MS, Math.floor(songMs / 100) * 100);
}

export const framesOf = (clipMs: number) => Math.round(clipMs * FPS / 1000);

export interface ImpactMusic {
  beatsMs: number[];
  /** The first beat of each bar; the Dust scene breaks up hardest on these. */
  downbeatsMs?: number[];
  energy: { timeMs: number; rms: number }[];
  /** Section changes and sung line starts: the Director cuts on these (`songAccents`). */
  accentsMs?: number[];
  /** How the song wants to be cut, from its vibe. */
  pace?: Pace;
  /** Where the drums hit (`music-hits.ts`): the edit presets cut and move on these. */
  kicksMs?: number[];
  heavyMs?: number[];
  snaresMs?: number[];
  hatsMs?: number[];
  dropsMs?: number[];
}

/** One timed word (or short phrase) of the lyrics, in milliseconds from the start of the clip. */
export interface LyricCue { text: string; startMs: number; endMs: number }

/** What the creator chose: which clip of which song (its length follows from the song's, `clipLengthMs`), and the timed lyrics for it. */
export interface Composition {
  sourceSha256: string;
  clipStartMs: number;
  cues: LyricCue[];
}

function isTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function validate(value: unknown, sourceDurationMs: number): asserts value is Composition {
  if (!Number.isFinite(sourceDurationMs) || sourceDurationMs < MIN_SONG_MS) {
    throw new Error(Number.isFinite(sourceDurationMs) && sourceDurationMs > 0
      ? `Song is ${Math.floor(sourceDurationMs / 100) / 10} seconds. Need at least ${MIN_SONG_MS / 1000}.`
      : `Pick a song that’s at least ${MIN_SONG_MS / 1000} seconds.`);
  }
  const clipMs = clipLengthMs(sourceDurationMs);
  if (!value || typeof value !== 'object') throw new Error('Invalid composition.');
  const { sourceSha256, clipStartMs, cues } = value as Composition;
  if (typeof sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sourceSha256)) {
    throw new Error('Invalid source audio identity.');
  }
  if (!isTime(clipStartMs) || clipStartMs > sourceDurationMs - clipMs) {
    throw new Error(`Select a ${clipMs / 1000}-second range (whole milliseconds).`);
  }
  if (!Array.isArray(cues) || cues.length > 120) throw new Error('Up to 120 lyric cues.');
  let previousEnd = 0;
  for (const cue of cues) {
    if (!cue || typeof cue.text !== 'string' || [...cue.text].length > 48 || !cue.text.trim() ||
        !isTime(cue.startMs) || !isTime(cue.endMs) ||
        cue.startMs < previousEnd || cue.startMs >= cue.endMs || cue.endMs > clipMs) {
      throw new Error('Words need text and non-overlapping times that go in order inside the clip.');
    }
    previousEnd = cue.endMs;
  }
}

/** Playback shows the frame at or before the audio playhead. */
export function playheadFrame(ms: number, clipMs: number) {
  return Math.min(framesOf(clipMs) - 1, Math.max(0, Math.floor(ms * FPS / 1000)));
}
