import type { Pace } from './pack-director';

export const WIDTH = 1080;
export const HEIGHT = 1920;
export const FPS = 30;
/** The clip: 15 seconds of the song. A shorter song (a saved TikTok or Reel) is used whole, down to `MIN_SONG_MS`. */
export const FULL_CLIP_MS = 15_000;
export const MIN_SONG_MS = 10_000;
/** The most frames a creative has (a 15-second clip). */
export const MAX_FRAMES = FPS * FULL_CLIP_MS / 1000;

/** The longest clip a song this long can give: 15 seconds, or all of a shorter song in whole tenths of a second (so samples at every rate, and frames, come out whole). */
export function clipLengthMs(songMs: number) {
  return Math.min(FULL_CLIP_MS, Math.floor(songMs / 100) * 100);
}

/** A clip length the creator asked for, kept to 10–15 seconds, inside the song, in whole tenths of a second. */
export function fitClipMs(ms: number, songMs: number) {
  const longest = clipLengthMs(songMs);
  return Math.min(longest, Math.max(MIN_SONG_MS, Math.round(ms / 100) * 100));
}

/** How long the chosen clip is: the creator's length, or the longest the song gives when none was chosen. */
export const chosenClipMs = (composition: Pick<Composition, 'clipMs'>, songMs: number) =>
  composition.clipMs === undefined ? clipLengthMs(songMs) : composition.clipMs;

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
  /** How driving the song really is, 0..1 (tempo and busy drums): a slow song is cut slower whatever its genre. */
  drive?: number;
}

/** One timed word (or short phrase) of the lyrics, in milliseconds from the start of the clip. */
export interface LyricCue { text: string; startMs: number; endMs: number }

/** What the creator chose: which clip of which song, how long (10–15 s; the longest the song gives when unset), and the timed lyrics for it. */
export interface Composition {
  sourceSha256: string;
  clipStartMs: number;
  clipMs?: number;
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
  if (!value || typeof value !== 'object') throw new Error('Invalid composition.');
  const { sourceSha256, clipStartMs, cues } = value as Composition;
  if (typeof sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sourceSha256)) {
    throw new Error('Invalid source audio identity.');
  }
  const clipMs = chosenClipMs(value as Composition, sourceDurationMs);
  if (!isTime(clipMs) || clipMs !== fitClipMs(clipMs, sourceDurationMs)) {
    throw new Error(`Pick a clip of ${MIN_SONG_MS / 1000} to ${clipLengthMs(sourceDurationMs) / 1000} seconds.`);
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
