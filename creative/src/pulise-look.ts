/**
 * The look of one Pulise card: which neon palette, which ground, which stickers, and how busy it is.
 * A row of four is dealt so no two cards share a palette or a ground. The only things that steer it are the song's
 * lane (how it sounds and what the creator said it is) and the seed (the song and the Refresh count); never lyric text.
 */
import { hashPick, type MoodLane } from './ad-fonts';
import { GROUND_IDS, type GroundId } from './pulise-ground';
import { NEONS, NEON_IDS, type NeonId } from './pulise-palettes';
import type { StickerId } from './pulise-stickers';

export type PuliseLook = {
  neon: NeonId;
  ground: GroundId;
  /** The stickers this card cycles through. */
  stickers: readonly StickerId[];
  /** Decides where and when stickers pop; any whole number below a million. */
  seed: number;
  /** How often a cut brings a sticker (0 to 1). */
  density: number;
};

/** Which stickers suit a lane: attitude without leaving the mood (nothing scary on a quiet song, nothing sweet on a dark one). */
const STICKER_POOLS: Record<MoodLane, readonly StickerId[]> = {
  party: ['lips', 'star', 'smiley', 'bolt', 'heart', 'monster', 'eye', 'flame'],
  techno: ['monster', 'eye', 'bolt', 'skull', 'star', 'smiley', 'flame'],
  dark: ['skull', 'eye', 'monster', 'flame', 'bolt', 'lips'],
  quiet: ['heart', 'star', 'eye', 'lips', 'smiley'],
  gospel: ['star', 'heart', 'flame', 'smiley', 'eye'],
  general: ['lips', 'star', 'smiley', 'eye', 'bolt', 'monster', 'heart', 'flame', 'skull'],
};

/** How often a cut brings a sticker: busy for party and club music, sparse for calm songs. */
const DENSITY: Record<MoodLane, number> = { party: 0.85, techno: 0.7, general: 0.65, dark: 0.55, gospel: 0.35, quiet: 0.3 };

const STICKERS_PER_CARD = 4;

function dealt<T extends string>(items: readonly T[], seed: string): T[] {
  return [...items].sort((a, b) => hashPick(seed, a, 99991) - hashPick(seed, b, 99991));
}

/** Palettes that suit a lane: all of the neon that fits its mood, so Refresh has plenty to choose from. */
export function neonsForLane(lane: MoodLane): NeonId[] {
  return NEON_IDS.filter(id => (NEONS[id].lanes as readonly MoodLane[]).includes(lane));
}

/** `count` cards that all differ in palette and ground. */
export function puliseLooks(lane: MoodLane, seed: string, count: number): PuliseLook[] {
  const neons = dealt(neonsForLane(lane), `${seed}:neon`);
  const grounds = dealt(GROUND_IDS, `${seed}:ground`);
  if (neons.length < count || grounds.length < count) throw new Error('Not enough palettes or grounds for a row.');
  return Array.from({ length: count }, (_, index) => ({
    neon: neons[index],
    ground: grounds[index],
    stickers: dealt(STICKER_POOLS[lane], `${seed}:stickers:${index}`).slice(0, STICKERS_PER_CARD),
    seed: hashPick(seed, `pop:${index}`, 1_000_000),
    density: DENSITY[lane],
  }));
}
