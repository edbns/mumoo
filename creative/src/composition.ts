export const WIDTH = 1080;
export const HEIGHT = 1920;
export const FPS = 30;
export const DURATION_MS = 15_000;
export const FRAMES = FPS * DURATION_MS / 1000;

export interface Composition {
  version: 1;
  template: 'scribble';
  sourceSha256: string;
  clipStartMs: number;
  lyric: { text: string; startMs: number; endMs: number };
}

function isTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function validate(value: unknown, sourceDurationMs: number): asserts value is Composition {
  if (!Number.isFinite(sourceDurationMs) || sourceDurationMs < DURATION_MS) {
    throw new Error('Choose a WAV at least 15 seconds long.');
  }
  if (!value || typeof value !== 'object') throw new Error('Invalid composition.');
  const { version, template, sourceSha256, clipStartMs, lyric } = value as Partial<Composition>;
  if (version !== 1 || template !== 'scribble') throw new Error('Unsupported composition.');
  if (typeof sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sourceSha256)) {
    throw new Error('Invalid source audio identity.');
  }
  if (!isTime(clipStartMs) || clipStartMs > sourceDurationMs - DURATION_MS) {
    throw new Error('Select a 15-second range inside the song using whole milliseconds.');
  }
  if (!lyric || typeof lyric.text !== 'string' || [...lyric.text].length > 48 ||
      !isTime(lyric.startMs) || !isTime(lyric.endMs) ||
      lyric.startMs >= lyric.endMs || lyric.endMs > DURATION_MS) {
    throw new Error('Enter up to 48 characters and a valid lyric range in whole milliseconds.');
  }
}

// Playback selects the frame at or before the playhead.
// Each cue boundary takes effect on the first frame at or after that timestamp.
export function playheadFrame(ms: number) {
  return Math.min(FRAMES - 1, Math.max(0, Math.floor(ms * FPS / 1000)));
}

export function evaluate(composition: Composition, frame: number) {
  const { lyric } = composition;
  const start = Math.ceil(lyric.startMs * FPS / 1000);
  const end = Math.ceil(lyric.endMs * FPS / 1000);
  return {
    text: frame >= start && frame < end ? lyric.text : '',
    phase: (frame - start) / FPS,
  };
}
