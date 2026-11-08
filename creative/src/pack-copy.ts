import { FPS, type ImpactMusic, type LyricCue } from './composition';
import { entrance, impactFrame, impactSignals } from './ad-punch-fit';
import { AD_PUNCH_META, type AdPunchStyle } from './ad-punch';
import type { AdFont, AdLayout, AdPalette, PackMotion } from './ad-fonts';
import type { AdBaseId, AdBeatProp } from './ad-worlds';
import type { TimedWord, TypeStyleId } from './pack-type';

export type PackSceneInput = {
  base: AdBaseId;
  prop: AdBeatProp;
  style?: AdPunchStyle;
  motion?: PackMotion;
  beat: number;
  energy: number;
  frame: number;
  palette: AdPalette;
  layout: AdLayout;
  font: AdFont;
  fontSecondary: AdFont;
  phrase: string;
  word: string;
  wordEnter: number;
  /** Cleared still composited under graphic treatments (Pixi texture). */
  plateTexture?: import('pixi.js').Texture | null;
  /** Same-origin cleared plate path (also keys the baked look plate). */
  plateUrl?: string;
  /** Look Lab baked plate (static JPEG from Shaders.com recipe), loaded as a texture. */
  lookPlateTexture?: import('pixi.js').Texture | null;
  /** Current time within the clip (ms) and the cue's word timings (original case). */
  ms: number;
  phraseStartMs: number;
  words: readonly TimedWord[];
  /** Look Bank: baked Shaders Pro background and the lyric type style for this card. */
  bankTexture?: import('pixi.js').Texture | null;
  typeStyle?: TypeStyleId;
};

export function activePackCopy(cues: readonly LyricCue[], frame: number, fallback: string) {
  const state = impactFrame(cues, frame);
  const phrase = state.phrase.trim();
  if (phrase) {
    return {
      phrase: phrase.toLocaleUpperCase(),
      word: (state.word || phrase).toLocaleUpperCase(),
      wordStartMs: state.wordStartMs,
      phraseStartMs: state.startMs,
      words: state.words as readonly TimedWord[],
    };
  }
  const fb = fallback.toLocaleUpperCase();
  return {
    phrase: fb,
    word: fb,
    wordStartMs: 0,
    phraseStartMs: 0,
    words: [{ text: fallback || 'NOW', startMs: 0, endMs: 600 }] as readonly TimedWord[],
  };
}

export function packMeta(style: AdPunchStyle) {
  return AD_PUNCH_META.find(item => item.id === style) ?? AD_PUNCH_META[0];
}

export function packReaction(music: ImpactMusic | null, frame: number) {
  const ms = frame * 1000 / FPS;
  return { ms, ...impactSignals(music, ms) };
}

export function packWordEnter(ms: number, wordStartMs: number, hasWord: boolean) {
  return hasWord ? entrance(ms, wordStartMs, 180) : 1;
}

export function holdGate(beat: number): number {
  if (beat < 0.12) return 0.5;
  if (beat < 0.28) return 0.75;
  return 1;
}
