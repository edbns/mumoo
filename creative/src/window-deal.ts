/**
 * Window — which four cards a row of the shelf deals. Pure: the same seed always deals the same cards.
 *
 * A card is the song's video (the Director's reel, or the person's own picture) seen through a giant lyric word cut out of a flat
 * screen, or (Silhouette) through the figure of a person. The screen is black or white (Silhouette's also red) and holds its colour the whole video; the four cards take turns, starting on the seed's pick.
 */
import { hashPick, type AdFont } from './ad-fonts';
import { WINDOW_FACES } from './window-look';
import { DRAWN_SCREEN, SILHOUETTE_IDS, SILHOUETTE_SCREENS, SILHOUETTE_TYPES, isDrawnFigure } from './silhouette';
import type { TypeStyleId } from './pack-type';

/** What the picture is seen through: the lyric word (`plain`), or the figure of a person (`silhouette`, Silhouette's cards). */
export type WindowMode = 'plain' | 'silhouette';

/** One card: its screen (the only one it is allowed, so it never flips), its face and, for Silhouette, its figure. */
export type WindowCard = { mode: WindowMode; palette: string; allowed: string[]; font: AdFont; shape?: string; type?: TypeStyleId };

const CARDS = 4;

const order = <T>(items: readonly T[], seed: string, key: (item: T) => string) => [...items].sort((a, b) => hashPick(seed, key(a), 99991) - hashPick(seed, key(b), 99991));

/** The only screens Window is dealt in. */
export const WINDOW_SCREENS = ['black', 'off-white', 'plum'] as const;

export function dealWindow(seed: string): WindowCard[] {
  const faces = order(WINDOW_FACES, `${seed}:faces`, face => face);
  const first = hashPick(seed, 'screen', WINDOW_SCREENS.length);
  return Array.from({ length: CARDS }, (_, index) => {
    const palette = WINDOW_SCREENS[(first + index) % WINDOW_SCREENS.length];
    return { mode: 'plain', palette, allowed: [palette], font: faces[index] };
  });
}

/** Four Silhouette cards: four different figures (two men and two women, taking turns) and lyric styles (those of `SILHOUETTE_TYPES` the song's mood allows), the screens red, black and white taking turns from the seed's pick. */
export function dealSilhouette(seed: string, moodTypes: readonly TypeStyleId[]): WindowCard[] {
  const faces = order(WINDOW_FACES, `${seed}:faces`, face => face);
  const [men, women, drawn] = ['man-', 'woman-', 'art-'].map(kind => order(SILHOUETTE_IDS.filter(id => id.startsWith(kind)), `${seed}:figures`, id => id));
  const types = order(SILHOUETTE_TYPES.filter(type => moodTypes.includes(type)), `${seed}:types`, type => type);
  const first = hashPick(seed, 'screen', SILHOUETTE_SCREENS.length);
  return Array.from({ length: CARDS }, (_, index) => {
    // On trial: the shelf's lead card is one of the drawn figures, on pink; then a man, a woman and a man.
    const shape = index === 0 ? drawn[0] : index % 2 ? men[index >> 1] : women[0];
    const palette = isDrawnFigure(shape) ? DRAWN_SCREEN : SILHOUETTE_SCREENS[(first + index) % SILHOUETTE_SCREENS.length];
    return { mode: 'silhouette', palette, allowed: [palette], font: faces[index], shape, type: types[index % types.length] };
  });
}
