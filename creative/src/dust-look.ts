/**
 * What makes one Dust card different from another, besides its two colours and its typeface: how the photo's
 * grains move on a beat, how a lyric word arrives and leaves, where the word sits and how big and coarse it is,
 * and how wild the whole card is. A look is a handful of ids (the cloud worker checks them against these lists);
 * the numbers they stand for are in DUST_FEEL, DUST_GRAIN and DUST_SCALE.
 */
import { hashPick, type MoodLane } from './ad-fonts';

/** A way grains travel: out toward the viewer, up, down, sideways, round the middle, or in toward it. */
export const DUST_MOVES = ['burst', 'rise', 'fall', 'left', 'right', 'swirl', 'implode'] as const;
export type DustMove = (typeof DUST_MOVES)[number];
export const DUST_PLACES = ['low', 'high'] as const;
export type DustPlace = (typeof DUST_PLACES)[number];
export const DUST_ALIGNS = ['center', 'left', 'right'] as const;
export type DustAlign = (typeof DUST_ALIGNS)[number];
export const DUST_SCALES = ['small', 'medium', 'large'] as const;
export type DustScale = (typeof DUST_SCALES)[number];
export const DUST_GRAINS = ['fine', 'medium', 'coarse'] as const;
export type DustGrain = (typeof DUST_GRAINS)[number];
export const DUST_ENERGIES = ['calm', 'steady', 'wild'] as const;
export type DustEnergy = (typeof DUST_ENERGIES)[number];

export type DustLook = {
  /** How the photo's grains move on every beat. */
  flow: DustMove;
  /** How the lyric word arrives and leaves. */
  enter: DustMove;
  place: DustPlace;
  align: DustAlign;
  scale: DustScale;
  grain: DustGrain;
  energy: DustEnergy;
};

/** How wild a card is: beat strength, how long grains hang in the air, how they drift at rest, how many fly far. */
export const DUST_FEEL: Record<DustEnergy, { power: number; hang: number; loose: number; ruffle: number; depth: number; wordHit: number }> = {
  calm: { power: 0.6, hang: 1.6, loose: 2.2, ruffle: 0.12, depth: 6, wordHit: 0.06 },
  steady: { power: 1, hang: 1, loose: 1, ruffle: 0.22, depth: 4, wordHit: 0.15 },
  wild: { power: 1.7, hang: 0.7, loose: 0.4, ruffle: 0.5, depth: 2.6, wordHit: 0.32 },
};

/** Grain radius for the photo and for the word, and how many grains a word is made of. */
export const DUST_GRAIN: Record<DustGrain, { photo: number; word: number; count: number }> = {
  fine: { photo: 1.8, word: 1.5, count: 26_000 },
  medium: { photo: 2.4, word: 2.1, count: 16_000 },
  coarse: { photo: 3, word: 3.1, count: 7_000 },
};

/** The size a lyric word starts at before it is fitted to the width of the frame. */
export const DUST_SCALE: Record<DustScale, number> = { small: 170, medium: 260, large: 380 };

type Palette = { flows: readonly DustMove[]; enters: readonly DustMove[]; energies: readonly DustEnergy[]; grains: readonly DustGrain[] };

/** What the song feels like decides which motions the cards may use; each list is long enough for four different cards. */
const PALETTES: Record<MoodLane, Palette> = {
  gospel: { flows: ['rise', 'swirl', 'fall', 'implode'], enters: ['rise', 'fall', 'swirl', 'implode'], energies: ['calm', 'steady'], grains: ['fine', 'medium'] },
  quiet: { flows: ['rise', 'fall', 'swirl', 'left', 'right'], enters: ['rise', 'fall', 'left', 'right', 'swirl'], energies: ['calm', 'steady'], grains: ['fine', 'medium'] },
  dark: { flows: ['implode', 'swirl', 'fall', 'burst', 'left'], enters: ['implode', 'fall', 'swirl', 'burst'], energies: ['calm', 'steady', 'wild'], grains: ['fine', 'medium', 'coarse'] },
  techno: { flows: ['burst', 'implode', 'left', 'right', 'swirl'], enters: ['burst', 'left', 'right', 'implode', 'swirl'], energies: ['steady', 'wild'], grains: ['medium', 'coarse', 'fine'] },
  party: { flows: DUST_MOVES, enters: DUST_MOVES, energies: ['steady', 'wild'], grains: DUST_GRAINS },
  general: { flows: DUST_MOVES, enters: DUST_MOVES, energies: DUST_ENERGIES, grains: DUST_GRAINS },
};

const seeded = <T extends string>(items: readonly T[], seed: string, salt: string) =>
  [...items].sort((a, b) => hashPick(seed, `${salt}:${a}`, 99991) - hashPick(seed, `${salt}:${b}`, 99991));

/**
 * Looks for a row of `count` cards that move differently: each card has its own photo motion, its own word arrival,
 * and its own corner of the frame for the word. The deal is seeded, so a refresh brings a new row.
 */
export function dustLooks(lane: MoodLane, seed: string, count: number): DustLook[] {
  const palette = PALETTES[lane];
  const flows = seeded(palette.flows, seed, 'dust-flow');
  const enters = seeded(palette.enters, seed, 'dust-enter');
  const energies = seeded(palette.energies, seed, 'dust-energy');
  const grains = seeded(palette.grains, seed, 'dust-grain');
  const scales = seeded(DUST_SCALES, seed, 'dust-scale');
  const corners = DUST_PLACES.flatMap(place => DUST_ALIGNS.map(align => ({ place, align })));
  const dealt = [...corners].sort((a, b) => hashPick(seed, `dust-corner:${a.place}:${a.align}`, 99991) - hashPick(seed, `dust-corner:${b.place}:${b.align}`, 99991));
  return Array.from({ length: count }, (_, i) => ({
    flow: flows[i % flows.length],
    enter: enters[i % enters.length],
    ...dealt[i % dealt.length],
    scale: scales[i % scales.length],
    grain: grains[i % grains.length],
    energy: energies[i % energies.length],
  }));
}
