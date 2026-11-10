/**
 * Live looks: effects drawn on a picture while the card plays (live-look.ts), so they work on any picture, ours or the person's own,
 * which the baked effects of Our photography cannot. This file is only the list of looks and which cards carry one (no drawing).
 * Each look is added here when its shader exists. Add the id to the worker's LIVE_LOOKS too (a test keeps them in step).
 */
import type { MoodLane } from './ad-fonts';

export const LIVE_LOOKS = [
  /** The picture as a heat camera sees it: bodies hot, shade cold, soft and banded, in the iron palette. It flares on the beat. */
  { id: 'thermal', title: 'Thermal', lanes: ['dark', 'techno', 'party', 'general'] },
  /** The same heat reading in cold light: navy, blue, cyan, ice white. */
  { id: 'arctic', title: 'Arctic', lanes: ['quiet', 'dark', 'techno', 'general'] },
  /** A night-vision tube: phosphor green, heavy grain, dark edges. */
  { id: 'night', title: 'Night vision', lanes: ['dark', 'techno', 'party'] },
] as const satisfies readonly { id: string; title: string; lanes: readonly MoodLane[] }[];

export type LiveLookId = (typeof LIVE_LOOKS)[number]['id'];
export const LIVE_LOOK_IDS: readonly LiveLookId[] = LIVE_LOOKS.map(look => look.id);

export const isLiveLook = (value: unknown): value is LiveLookId => LIVE_LOOK_IDS.includes(value as LiveLookId);
export const liveLookTitle = (id: LiveLookId) => LIVE_LOOKS.find(look => look.id === id)!.title;

function hash(seed: string, salt: string, modulo: number) {
  let h = 2166136261;
  const text = `${seed}:${salt}`;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return Math.abs(h) % Math.max(1, modulo);
}

/** The items in an order the seed decides. */
const shuffled = <T>(items: readonly T[], seed: string, salt: string, key: (item: T) => string) =>
  items.map(item => ({ item, order: hash(seed, `${salt}:${key(item)}`, 1_000_000) })).sort((a, b) => a.order - b.order).map(entry => entry.item);

/**
 * The look of each of `count` cards: up to three cards carry a look the lane welcomes, each a different one, and the rest show the picture as it is,
 * so a row is never one look four times. The seed (the song and the row's Refresh count) decides which cards and which looks, so Refresh deals new ones.
 * A lane no look welcomes (gospel) deals none.
 */
export function dealLooks(lane: MoodLane, seed: string, count: number): (LiveLookId | null)[] {
  const welcome = LIVE_LOOKS.filter(look => (look.lanes as readonly MoodLane[]).includes(lane));
  const carried = Math.min(welcome.length, 3, count);
  const looks = shuffled(welcome.map(look => look.id), seed, 'look', id => id).slice(0, carried);
  const places = shuffled(Array.from({ length: count }, (_, index) => index), seed, 'place', index => String(index)).slice(0, carried);
  return Array.from({ length: count }, (_, index) => {
    const at = places.indexOf(index);
    return at === -1 ? null : looks[at];
  });
}
