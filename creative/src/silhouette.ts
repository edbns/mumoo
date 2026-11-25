/**
 * Silhouette — the figures a card can be: still, black-on-white masks of one person in a pose (a man or a woman, facing us or
 * in profile, a hand on the cap or in the hair, the arms out to both sides), served from `public/silhouettes/{id}.png` (white is the person). The song's video plays inside the
 * figure; the rest of the frame is one solid colour, and the lyrics sit on it above the head.
 */
import { HEIGHT } from './composition';
import type { TypeStyleId } from './pack-type';

/** Each figure, and how far down the frame the top of it is (a share of the height). The two with their arms out reach both sides of the frame. */
export const SILHOUETTES = [
  { id: 'man-cap', headAt: 0.238 },
  { id: 'woman-hair', headAt: 0.241 },
  { id: 'man-wide', headAt: 0.249 },
  { id: 'woman-wide', headAt: 0.246 },
  { id: 'woman-curls', headAt: 0.239 },
  { id: 'man-hood', headAt: 0.21 },
  { id: 'woman-head', headAt: 0.218 },
  { id: 'man-head', headAt: 0.267 },
  // Drawn figures, on trial: the video plays in the drawing's black, its accent ink (red nails) stays, the rest is the screen.
  { id: 'art-embrace', headAt: 0.2 },
  { id: 'art-afro', headAt: 0.218 },
  { id: 'art-locs', headAt: 0.321 },
  { id: 'art-profile', headAt: 0.237 },
  { id: 'art-hood', headAt: 0.257 },
] as const;

export const SILHOUETTE_IDS: readonly string[] = SILHOUETTES.map(figure => figure.id);

/** A drawn figure: its mask's red is where the video plays and its green where the accent ink is. */
export const isDrawnFigure = (id: string) => id.startsWith('art-');

/** The screens a Silhouette card is dealt in (ids of `WINDOW_PALETTES`). */
export const SILHOUETTE_SCREENS = ['red', 'black', 'off-white', 'plum'] as const;

/** The screen a drawn figure is dealt on. */
export const DRAWN_SCREEN = 'pink';

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
