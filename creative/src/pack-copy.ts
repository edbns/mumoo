import { FPS, type ImpactMusic, type LyricCue } from './composition';
import { entrance, impactFrame, impactSignals } from './lyric-motion';
import type { Texture } from 'pixi.js';
import type { AdPunchStyle } from './ad-punch';
import type { AdFont, AdLayout } from './ad-fonts';
import type { TimedWord, TypeStyleId } from './pack-type';
import type { DustColors } from './dust-colors';
import type { DustPoints, DustWord } from './pack-dust';
import type { RisoInkSet } from './riso-look';
import type { RisoPhoto } from './riso-photo';
import type { SprayPalette } from './spray-look';
import type { WindowPicture } from './pack-window';

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
  /** The picture behind the lyrics: a baked Look Bank background or photography effect, or the person's own picture. */
  background?: Texture | null;
  /** Dust: the two colours of the template. */
  colors?: DustColors;
  typeStyle?: TypeStyleId;
  /** False when the person switched lyrics off: no words anywhere, only the picture. */
  lyrics: boolean;
  /** Dust: the photo as grains, every beat, and the lyric word now on screen (null when none). */
  dustPoints?: DustPoints | null;
  beatsMs: readonly number[];
  downbeatsMs: readonly number[];
  dustWord: DustWord | null;
  /** Riso and Spray: the lyric words with their times (none when lyrics are off), and the card's own seed (where each word falls, how the paper is stained). */
  cues: readonly LyricCue[];
  seed: number;
  /** Riso: the card's inks, and the person's photo read for the halftone. Spray: the card's wall and paints. */
  inks?: RisoInkSet['inks'];
  risoPhoto?: RisoPhoto | null;
  palette?: SprayPalette;
  /** Window: the picture seen through the word (with the cut-out of a person to stand in front), the screen colour the card opens on, and the colours it may flip to. */
  windowPicture?: WindowPicture;
  windowPalette?: string;
  windowAllowed?: readonly string[];
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
