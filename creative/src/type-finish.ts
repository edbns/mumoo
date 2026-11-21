import type { MoodLane } from './ad-fonts';

/**
 * How a card's lyric letters are finished. Every card gets one, dealt by the song's mood:
 *  solid     letters in the picture's tinted ink, the sung word in its colour, a soft shadow
 *  gradient  each word fades from its colour into the other one, top to bottom
 *  box       the sung word sits on a rounded box of the colour, in letters readable on it
 *  sticker   a thick edge and a hard offset shadow in the colour, like a cut-out sticker
 *  glass     the sung word sits on a frosted pill, a see-through light plate with a bright rim, in the ink
 *  print     flat ink with a second impression a little off register in the colour, like a worn press print
 */
export const TYPE_FINISHES = ['solid', 'gradient', 'box', 'sticker', 'glass', 'print'] as const;
export type TypeFinish = typeof TYPE_FINISHES[number];

/** Calm songs keep their letters quiet: no boxes, no stickers. */
export const FINISH_ALLOW: Record<MoodLane, readonly TypeFinish[]> = {
  gospel: ['solid', 'print', 'gradient'],
  quiet: ['solid', 'glass', 'print', 'gradient'],
  dark: ['solid', 'print', 'gradient', 'sticker', 'box'],
  techno: ['box', 'sticker', 'glass', 'gradient', 'solid'],
  party: ['sticker', 'box', 'glass', 'print', 'gradient', 'solid'],
  general: TYPE_FINISHES,
};

/** Finishes that set the sung word on a plate of its own (a box, a frosted pill). */
export const PLATED: readonly TypeFinish[] = ['box', 'glass'];

/** The monochrome card: white (or black) letters only, the editorial look. */
export const MONO_ACCENT = '#f7f4ee';

/**
 * The song's colour for the sung word: editorial and few, mostly monochrome with a red or a pink, the way curated lyric
 * pages look now, never a mix of the picture's hues. Light enough for the dark pictures most cards are; the page darkens
 * or lightens it until it reads on the picture.
 */
export const MOOD_ACCENTS: Record<MoodLane, readonly string[]> = {
  gospel: [MONO_ACCENT, '#e8c872', '#f4b8c5'],
  quiet: [MONO_ACCENT, '#f2b5c4', '#c84b31', '#5c6b54'],
  dark: [MONO_ACCENT, '#e5383b', '#b3001b'],
  techno: [MONO_ACCENT, '#ff2a2a', '#c6ff00'],
  party: ['#ff4fa3', MONO_ACCENT, '#ff5a1f', '#8ce600'],
  general: [MONO_ACCENT, '#e5383b', '#ff7eb6', '#d99b26'],
};

/**
 * How a card sets the line's key word (lyric-keyword.ts) apart, when it does:
 *  tone   two-tone: the key word in the song's colour, the rest of the line in the ink
 *  serif  the key word in an italic serif among the line's display face (and in the colour)
 * A card without one lights the word being sung instead.
 */
export const TYPE_EMPHASES = ['tone', 'serif'] as const;
export type TypeEmphasis = typeof TYPE_EMPHASES[number];

/** What a lane's cards may do with the key word: `none` lights the sung word as before. */
export const EMPHASIS_ALLOW: Record<MoodLane, readonly (TypeEmphasis | 'none')[]> = {
  gospel: ['serif', 'none', 'tone'],
  quiet: ['serif', 'none', 'tone'],
  dark: ['tone', 'serif', 'none'],
  techno: ['tone', 'none', 'serif'],
  party: ['tone', 'serif', 'none'],
  general: ['tone', 'serif', 'none'],
};

