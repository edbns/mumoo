import type { MoodLane } from './ad-fonts';

/**
 * How a card's lyric letters are finished. Every card gets one, dealt by the song's mood:
 *  solid     letters in the picture's tinted ink, the sung word in its colour, a soft shadow
 *  gradient  each word fades from its colour into the other one, top to bottom
 *  box       the sung word sits on a rounded box of the colour, in letters readable on it
 *  sticker   a thick edge and a hard offset shadow in the colour, like a cut-out sticker
 */
export const TYPE_FINISHES = ['solid', 'gradient', 'box', 'sticker'] as const;
export type TypeFinish = typeof TYPE_FINISHES[number];

/** Calm songs keep their letters quiet: no boxes, no stickers. */
export const FINISH_ALLOW: Record<MoodLane, readonly TypeFinish[]> = {
  gospel: ['solid', 'gradient'],
  quiet: ['solid', 'gradient'],
  dark: ['solid', 'gradient', 'sticker', 'box'],
  techno: ['box', 'sticker', 'gradient', 'solid'],
  party: ['sticker', 'box', 'gradient', 'solid'],
  general: TYPE_FINISHES,
};

/**
 * The song's own colours, for a picture with no colour of its own (black and white, grey): the lyric still gets one.
 * Light enough for the dark pictures most cards are; the page darkens or lightens it until it reads on the picture.
 */
export const MOOD_ACCENTS: Record<MoodLane, readonly string[]> = {
  gospel: ['#f2c14e', '#f4a7b9', '#9fd3f5'],
  quiet: ['#a8c5a0', '#9db4d6', '#e3c9a1'],
  dark: ['#e5383b', '#9b5de5', '#7fdbff'],
  techno: ['#c6ff00', '#00e5ff', '#ff2bd6'],
  party: ['#ff4fa3', '#ff8a00', '#3d7bff', '#9dff3d'],
  general: ['#ff5a5f', '#4cc9f0', '#ffd166', '#06d6a0'],
};

export const isTypeFinish = (value: unknown): value is TypeFinish => TYPE_FINISHES.includes(value as TypeFinish);
