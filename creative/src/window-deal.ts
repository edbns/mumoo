/**
 * Window — which four cards a row of the shelf deals. Pure: the same seed always deals the same cards.
 *
 * A card is the song's video (the Director's reel, or the person's own picture) seen through a giant lyric word cut out of a flat
 * screen. The screen is black or white and holds its colour the whole video; the four cards take turns, starting on the seed's pick.
 */
import { hashPick, type AdFont } from './ad-fonts';
import { WINDOW_FACES } from './window-look';

/** What is seen through the word: the picture as it is. */
export type WindowMode = 'plain';

/** One card: its screen (the only one it is allowed, so it never flips) and its face. */
export type WindowCard = { mode: WindowMode; palette: string; allowed: string[]; font: AdFont };

const CARDS = 4;

const order = <T>(items: readonly T[], seed: string, key: (item: T) => string) => [...items].sort((a, b) => hashPick(seed, key(a), 99991) - hashPick(seed, key(b), 99991));

/** The only screens Window is dealt in. */
export const WINDOW_SCREENS = ['black', 'off-white'] as const;

export function dealWindow(seed: string): WindowCard[] {
  const faces = order(WINDOW_FACES, `${seed}:faces`, face => face);
  const first = hashPick(seed, 'screen', WINDOW_SCREENS.length);
  return Array.from({ length: CARDS }, (_, index) => {
    const palette = WINDOW_SCREENS[(first + index) % WINDOW_SCREENS.length];
    return { mode: 'plain', palette, allowed: [palette], font: faces[index] };
  });
}
