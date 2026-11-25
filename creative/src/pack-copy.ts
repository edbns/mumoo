import type { LiveLookId } from './live-look-deal';
import { FPS, type ImpactMusic, type LyricCue } from './composition';
import { cueFrame, entrance, impactFrame, impactSignals } from './lyric-motion';
import type { Texture } from 'pixi.js';
import type { AdPunchStyle } from './ad-punch';
import type { AdFont, AdLayout } from './ad-fonts';
import type { TimedWord, TypeStyleId } from './pack-type';
import type { TypeEmphasis, TypeFinish } from './type-finish';
import type { DustColors } from './dust-colors';
import type { DustPoints, DustWord } from './pack-dust';
import type { RisoInkSet } from './riso-look';
import type { RisoPhoto } from './riso-photo';
import type { TreatmentId } from './treatment-deal';
import type { PresetId } from './edit-presets';

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
  /** Current time within the clip (ms), how long the clip is, and the cue's word timings (original case). */
  ms: number;
  durationMs: number;
  words: readonly TimedWord[];
  /** The picture behind the lyrics: a baked photography effect, a library picture, or the person's own picture. */
  background?: Texture | null;
  /** Dust: the two colours of the template. */
  colors?: DustColors;
  typeStyle?: TypeStyleId;
  /** How the lyric letters are finished (type-finish.ts), and the song's colour for a picture with none. Solid, and no colour, when absent. */
  typeFinish?: TypeFinish;
  typeAccent?: string;
  /** How the line's key word is set apart (two-tone or mixed serif); absent, the sung word is lit. */
  typeEmphasis?: TypeEmphasis;
  /** Our photography: the live look drawn on the picture (never on the type). */
  look?: LiveLookId;
  /** False when the person switched lyrics off: no words anywhere, only the picture. */
  lyrics: boolean;
  /** Dust: its air as grains, every beat, and the lyric word now on screen (null when none). */
  dustPoints?: DustPoints | null;
  beatsMs: readonly number[];
  downbeatsMs: readonly number[];
  dustWord: DustWord | null;
  /** Riso and Window: the lyric words with their times (none when lyrics are off), and the card's own seed (where each word falls, how the paper is stained). */
  cues: readonly LyricCue[];
  seed: number;
  /** Riso: the card's inks, and the person's photo read for the halftone. */
  inks?: RisoInkSet['inks'];
  /** Pulse: its colour set (`PULISE_SETS`), red when none. */
  pulseSet?: string;
  risoPhoto?: RisoPhoto | null;
  /** Window: the picture seen through the word (with the cut-out of a person to stand in front), the screen colour it opens on, and the colours it may flip to (only its own, on the cards dealt now). */
  windowPicture?: Texture;
  windowPalette?: string;
  windowAllowed?: readonly string[];
  /** Silhouette: the figure the picture is seen through, and its mask (white is the person). */
  windowShape?: string;
  windowFigure?: Texture;
  /** A video treatment over the Director's finished reel (`treatment-deal.ts`). */
  treatment?: TreatmentId;
  treatmentVariant?: string;
  /** Screenshot: the time the card was made ("HH:MM"), on the phone's clock and its messages. */
  clock?: string;
  /** An edit preset already moved and coloured `background` (pack-preset.ts): it is drawn still, as it is. */
  preset?: PresetId;
};

/**
 * The lyric on screen at a frame: only ever the song's own words. Between two lines the last one sung stays up, on its
 * last word, until the next begins; before the first line there are none.
 */
export function activePackCopy(cues: readonly LyricCue[], frame: number) {
  let state = impactFrame(cues, frame);
  if (!state.phrase.trim()) {
    const sung = cues.filter(cue => cueFrame(cue.startMs) <= frame).at(-1);
    if (sung) state = impactFrame(cues, Math.max(cueFrame(sung.startMs), Math.ceil(sung.endMs * FPS / 1000) - 1));
  }
  const phrase = state.phrase.trim();
  if (!phrase) return { phrase: '', word: '', wordStartMs: 0, words: [] as readonly TimedWord[] };
  return {
    phrase: phrase.toLocaleUpperCase(),
    word: (state.word || phrase).toLocaleUpperCase(),
    wordStartMs: state.wordStartMs,
    words: state.words as readonly TimedWord[],
  };
}

export function packReaction(music: ImpactMusic | null, frame: number) {
  const ms = frame * 1000 / FPS;
  return { ms, ...impactSignals(music, ms) };
}

export function packWordEnter(ms: number, wordStartMs: number, hasWord: boolean) {
  return hasWord ? entrance(ms, wordStartMs, 180) : 1;
}
