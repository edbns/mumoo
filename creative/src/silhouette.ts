/**
 * Silhouette — the figures a card can be: flat drawings of one person from the shoulders up (a man or a woman, upright, tilted or
 * lying sideways), a couple, and a skull, served from `public/silhouettes/{id}.png` and drawn from `silhouette-art/{name}.svg`.
 * The song's video plays in the drawing's black; the skin and everything around the figure are one solid colour, and the lyrics
 * sit on it above the head.
 */
import { HEIGHT } from './composition';
import type { TypeStyleId } from './pack-type';

type Figure = {
  id: string;
  /** How far down the frame the top of the figure is (a share of the height). */
  headAt: number;
  /** Who it is, so a row takes turns. A retired figure is never dealt: it is kept only so creatives already made with it still draw. */
  kind: 'man' | 'woman' | 'couple' | 'skull' | 'retired';
};

export const SILHOUETTES: readonly Figure[] = [
  { id: 'art-locs', headAt: 0.257, kind: 'man' },
  { id: 'art-hood', headAt: 0.257, kind: 'man' },
  { id: 'art-cap', headAt: 0.237, kind: 'man' },
  { id: 'art-beard', headAt: 0.237, kind: 'man' },
  { id: 'art-headphones', headAt: 0.237, kind: 'man' },
  { id: 'art-afro', headAt: 0.218, kind: 'woman' },
  { id: 'art-profile', headAt: 0.237, kind: 'woman' },
  { id: 'art-braids', headAt: 0.237, kind: 'woman' },
  { id: 'art-bun', headAt: 0.237, kind: 'woman' },
  { id: 'art-lying', headAt: 0.218, kind: 'woman' },
  { id: 'art-shades', headAt: 0.237, kind: 'woman' },
  // The couple carries red accent ink (her nails), so it is only dealt on white.
  { id: 'art-embrace', headAt: 0.2, kind: 'couple' },
  // Only for phonk and Brazilian funk (`isSkullStyle`).
  { id: 'art-skull', headAt: 0.296, kind: 'skull' },
  // The first figures: plain white-on-black masks of the whole person.
  { id: 'man-cap', headAt: 0.238, kind: 'retired' },
  { id: 'woman-hair', headAt: 0.241, kind: 'retired' },
  { id: 'man-wide', headAt: 0.249, kind: 'retired' },
  { id: 'woman-wide', headAt: 0.246, kind: 'retired' },
  { id: 'woman-curls', headAt: 0.239, kind: 'retired' },
  { id: 'man-hood', headAt: 0.21, kind: 'retired' },
  { id: 'woman-head', headAt: 0.218, kind: 'retired' },
  { id: 'man-head', headAt: 0.267, kind: 'retired' },
];

export const SILHOUETTE_IDS: readonly string[] = SILHOUETTES.map(figure => figure.id);

export const figuresOf = (kind: Figure['kind']): readonly string[] => SILHOUETTES.filter(figure => figure.kind === kind).map(figure => figure.id);


/** A drawn figure: its mask's red is where the video plays and its green where the accent ink is. */
export const isDrawnFigure = (id: string) => id.startsWith('art-');

/** The screens a retired figure was drawn on (ids of `WINDOW_PALETTES`). */
export const SILHOUETTE_SCREENS = ['red', 'black', 'off-white', 'plum'] as const;

/** The screens a drawn figure is dealt on, taking turns; the couple only on the first. */
export const DRAWN_SCREENS = ['off-white', 'black', 'red', 'green'] as const;

/** The accent ink of a drawn figure. */
export const DRAWN_ACCENT = '#e1121b';

/** The lyric styles a Silhouette card is dealt: each card of a row has its own. */
export const SILHOUETTE_TYPES = ['stack', 'swap', 'karaoke', 'outline', 'editorial', 'glitch', 'echo', 'wipe', 'flicker', 'slide', 'bounce', 'zoom'] as const satisfies readonly TypeStyleId[];

export const silhouetteUrl = (id: string) => `/silhouettes/${id}.png`;

/** How far down the frame the top of this figure is, in px. A figure fills the whole frame. */
export function headTop(id: string): number {
  const figure = SILHOUETTES.find(candidate => candidate.id === id);
  if (!figure) throw new Error(`There is no silhouette "${id}".`);
  return HEIGHT * figure.headAt;
}
