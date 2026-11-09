import { FPS, type ImpactMusic, type LyricCue } from './composition';
import { entrance, impactFrame, impactSignals } from './lyric-motion';
import type { Texture } from 'pixi.js';
import type { AdPunchStyle } from './ad-punch';
import type { AdFont, AdLayout } from './ad-fonts';
import type { PhotoFilterId } from './pack-filter';
import type { TimedWord, TypeStyleId } from './pack-type';
import type { DustColors } from './dust-colors';
import type { DustPoints, DustWord } from './pack-dust';
import type { PuliseLook } from './pulise-look';

export type PackSceneInput = {
  style: AdPunchStyle;
  beat: number;
  energy: number;
  /** How many beats have passed, and the gap before the latest one (ms; 0 when unknown). */
  beatIndex: number;
  beatGapMs: number;
  frame: number;
  layout: AdLayout;
  font: AdFont;
  fontSecondary: AdFont;
  phrase: string;
  word: string;
  wordEnter: number;
  /** Current time within the clip (ms) and the cue's word timings (original case). */
  ms: number;
  words: readonly TimedWord[];
  /** The picture behind the lyrics: a baked Look Bank background, or the person's own photo for Filter. */
  background?: Texture | null;
  /** Filter: how the person's photo is treated, and the two colours the treatment draws from. */
  filter?: PhotoFilterId;
  colors?: DustColors;
  typeStyle?: TypeStyleId;
  /** False when the person switched lyrics off: no words anywhere, only the picture. */
  lyrics: boolean;
  /** Dust: the photo as grains, every beat, and the lyric word now on screen (null when none). */
  dustPoints?: DustPoints | null;
  /** The song: its beats and energy. Dust breaks up on them; Pulise cuts and pops stickers on them. */
  music: ImpactMusic | null;
  /** Pulise: its palette, ground and stickers. */
  pulise?: PuliseLook;
  dustWord: DustWord | null;
};

export function activePackCopy(cues: readonly LyricCue[], frame: number, fallback: string) {
  const state = impactFrame(cues, frame);
  const phrase = state.phrase.trim();
  if (phrase) {
    return {
      phrase: phrase.toLocaleUpperCase(),
      word: (state.word || phrase).toLocaleUpperCase(),
      wordStartMs: state.wordStartMs,
      words: state.words as readonly TimedWord[],
    };
  }
  const fb = fallback.toLocaleUpperCase();
  return {
    phrase: fb,
    word: fb,
    wordStartMs: 0,
    words: [{ text: fallback || 'NOW', startMs: 0, endMs: 600 }] as readonly TimedWord[],
  };
}

export function packReaction(music: ImpactMusic | null, frame: number) {
  const ms = frame * 1000 / FPS;
  return { ms, ...impactSignals(music, ms) };
}

export function packWordEnter(ms: number, wordStartMs: number, hasWord: boolean) {
  return hasWord ? entrance(ms, wordStartMs, 180) : 1;
}
