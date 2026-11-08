import { FPS, FRAMES, type ImpactMusic, type LyricCue } from './composition';
import { wrapScreenText } from './daily-screens';

export type Phrase = { words: LyricCue[]; startMs: number };

export function phrasesFor(cues: readonly LyricCue[]): Phrase[] {
  const result: Phrase[] = [];
  for (const cue of cues) {
    const previous = result.at(-1);
    const last = previous?.words.at(-1);
    if (!previous || !last || previous.words.length >= 5 || cue.startMs - last.endMs > 450 || /[.!?。！？]$/u.test(last.text)) {
      result.push({ words: [cue], startMs: cue.startMs });
    } else previous.words.push(cue);
  }
  return result;
}

export function cueFrame(ms: number) {
  return Math.min(FRAMES - 1, Math.ceil(ms * FPS / 1000));
}

export function impactFrame(cues: readonly LyricCue[], frame: number) {
  const phrase = phrasesFor(cues).filter(item => cueFrame(item.startMs) <= frame).at(-1);
  if (!phrase || frame >= Math.ceil(phrase.words[phrase.words.length - 1].endMs * FPS / 1000)) {
    return { phrase: '', word: '', startMs: 0, wordStartMs: 0, words: [] as LyricCue[] };
  }
  const word = phrase.words.filter(item => cueFrame(item.startMs) <= frame && frame < Math.ceil(item.endMs * FPS / 1000)).at(-1);
  return {
    phrase: phrase.words.map(item => item.text).join(' '),
    word: word?.text ?? '',
    startMs: phrase.startMs,
    wordStartMs: word?.startMs ?? 0,
    words: phrase.words,
  };
}

export function impactSignals(music: ImpactMusic | null, ms: number) {
  if (!music) return { beat: 0, energy: 0 };
  let recent = -Infinity;
  for (const beat of music.beatsMs) {
    if (beat > ms) break;
    recent = beat;
  }
  const beat = Math.exp(-Math.max(0, ms - recent) / 110);
  let rms = 0;
  for (const point of music.energy) {
    if (point.timeMs > ms) break;
    rms = point.rms;
  }
  return { beat, energy: Math.max(0, Math.min(1, rms * 3)) };
}

export function fitImpactText(
  ctx: Pick<CanvasRenderingContext2D, 'font' | 'measureText'>,
  value: string,
  width: number,
  start: number,
  weight: number,
  maxLines: number,
) {
  let size = start;
  let lines: string[] = [];
  do {
    ctx.font = `${weight} ${size}px "Inter Variable"`;
    lines = wrapScreenText(ctx, value, width);
    if (lines.length <= maxLines && lines.every(line => ctx.measureText(line).width <= width)) break;
    if (size <= 13) break;
    size = Math.max(13, size - 5);
  } while (true);
  return { lines, size };
}

export function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function easeOutCubic(t: number) {
  const x = clamp01(t);
  return 1 - (1 - x) ** 3;
}

export function easeOutBack(t: number) {
  const x = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
}

export function easeInOut(t: number) {
  const x = clamp01(t);
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
}

/** 0 at cue start → 1 after `duration` ms (eased). */
export function entrance(ms: number, startMs: number, duration = 280) {
  return easeOutCubic(Math.max(0, ms - startMs) / duration);
}

export function hash01(seed: number, salt = 0) {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function fillScene(ctx: CanvasRenderingContext2D, color: string) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

export type DrawContext = {
  ctx: CanvasRenderingContext2D;
  cues: readonly LyricCue[];
  frame: number;
  ms: number;
  music: ImpactMusic | null;
  state: ReturnType<typeof impactFrame>;
  reaction: ReturnType<typeof impactSignals>;
  enter: number;
  wordEnter: number;
  /** Cleared still plate for punch styles (billboard / collision). */
  plate?: CanvasImageSource;
};

export function prepareDraw(
  canvas: HTMLCanvasElement,
  cues: readonly LyricCue[],
  frame: number,
  music: ImpactMusic | null,
): DrawContext | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable.');
  const state = impactFrame(cues, frame);
  const ms = frame * 1000 / FPS;
  const reaction = impactSignals(music, ms);
  return {
    ctx,
    cues,
    frame,
    ms,
    music,
    state,
    reaction,
    enter: entrance(ms, state.startMs),
    wordEnter: entrance(ms, state.wordStartMs, 180),
  };
}
