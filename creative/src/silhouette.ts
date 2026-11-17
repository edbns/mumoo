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
] as const;

export const SILHOUETTE_IDS: readonly string[] = SILHOUETTES.map(figure => figure.id);

/** The screens a Silhouette card is dealt in (ids of `WINDOW_PALETTES`). */
export const SILHOUETTE_SCREENS = ['red', 'black', 'off-white'] as const;

/** The lyric styles a Silhouette card is dealt: each card of a row has its own. */
export const SILHOUETTE_TYPES = ['stack', 'karaoke', 'outline', 'editorial', 'glitch', 'echo', 'wipe', 'flicker', 'slide', 'bounce', 'zoom'] as const satisfies readonly TypeStyleId[];

export const silhouetteUrl = (id: string) => `/silhouettes/${id}.png`;

/** How far down the frame the top of this figure is, in px. A figure fills the whole frame. */
export function headTop(id: string): number {
  const figure = SILHOUETTES.find(candidate => candidate.id === id);
  if (!figure) throw new Error(`There is no silhouette "${id}".`);
  return HEIGHT * figure.headAt;
}
