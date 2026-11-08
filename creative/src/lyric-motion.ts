import { FPS, FRAMES, type ImpactMusic, type LyricCue } from './composition';

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
  if (!music) return { beat: 0, energy: 0, beatIndex: 0, beatGapMs: 0 };
  let recent = -Infinity;
  let previous = -Infinity;
  let beatIndex = 0;
  for (const beat of music.beatsMs) {
    if (beat > ms) break;
    previous = recent;
    recent = beat;
    beatIndex += 1;
  }
  const beat = Math.exp(-Math.max(0, ms - recent) / 110);
  let rms = 0;
  for (const point of music.energy) {
    if (point.timeMs > ms) break;
    rms = point.rms;
  }
  return { beat, energy: Math.max(0, Math.min(1, rms * 3)), beatIndex, beatGapMs: Number.isFinite(previous) ? recent - previous : 0 };
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function easeOutCubic(t: number) {
  const x = clamp01(t);
  return 1 - (1 - x) ** 3;
}

/** 0 at cue start → 1 after `duration` ms (eased). */
export function entrance(ms: number, startMs: number, duration = 280) {
  return easeOutCubic(Math.max(0, ms - startMs) / duration);
}

/** Frame where the first phrase is almost fully sung — the card poster shows real type, not an empty frame. */
export function posterFrame(cues: readonly LyricCue[]): number {
  const phrase = phrasesFor(cues)[0];
  if (!phrase) return 0;
  const end = phrase.words[phrase.words.length - 1].endMs;
  const ms = phrase.startMs + (end - phrase.startMs) * 0.85;
  return Math.max(0, Math.min(FRAMES - 1, Math.round(ms * FPS / 1000)));
}
