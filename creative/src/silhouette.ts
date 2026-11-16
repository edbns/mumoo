/**
 * Silhouette — the figures a card can be: still, black-on-white masks of one person (a man or a woman, facing us or
 * in profile), served from `public/silhouettes/{id}.png` (white is the person). The song's video plays inside the
 * figure; the rest of the frame is one solid colour, and the lyrics sit on it above the head.
 */
import { HEIGHT } from './composition';

/** Each figure, and how far down its mask the top of the head is (a share of the mask's height). */
export const SILHOUETTES = [
  { id: 'woman-front', headAt: 0.18 },
  { id: 'woman-side', headAt: 0.17 },
  { id: 'woman-curls', headAt: 0.21 },
  { id: 'man-front', headAt: 0.25 },
  { id: 'man-hood', headAt: 0.21 },
  { id: 'man-cap', headAt: 0.23 },
] as const;

export type SilhouetteId = (typeof SILHOUETTES)[number]['id'];
export const SILHOUETTE_IDS: readonly string[] = SILHOUETTES.map(figure => figure.id);

/** The screens a Silhouette card is dealt in (ids of `WINDOW_PALETTES`). */
export const SILHOUETTE_SCREENS = ['red', 'black', 'off-white'] as const;

/** The figure is drawn this big against the frame, standing on its bottom edge in the middle: the room above its head is the lyrics'. */
export const FIGURE_SCALE = 0.8;

export const silhouetteUrl = (id: string) => `/silhouettes/${id}.png`;

/** How far down the frame the top of this figure's head is, in px. */
export function headTop(id: string): number {
  const figure = SILHOUETTES.find(candidate => candidate.id === id);
  if (!figure) throw new Error(`There is no silhouette "${id}".`);
  return HEIGHT - FIGURE_SCALE * HEIGHT * (1 - figure.headAt);
}
