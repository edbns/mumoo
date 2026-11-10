/**
 * Live looks: effects drawn on a picture while the card plays (live-look.ts), so they work on any picture, ours or the person's own,
 * which the baked effects of Our photography cannot. This file is only the list of looks and which cards carry one (no drawing).
 * Each look is added here when its shader exists. Add the id to the worker's LIVE_LOOKS too (a test keeps them in step).
 */
import type { MoodLane } from './ad-fonts';

export const LIVE_LOOKS = [
  /** The picture as a heat camera sees it: dark to cold indigo, then magenta, red, orange, yellow, white. It flares on the beat. */
  { id: 'thermal', title: 'Thermal', lanes: ['dark', 'techno', 'party', 'general'] },
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

/**
 * The look of each of `count` cards: every other card carries one the lane welcomes, so a row always still shows the picture as it is.
 * A lane no look welcomes (calm, gospel, sad words) deals none. The seed decides which cards and which look.
 */
export function dealLooks(lane: MoodLane, seed: string, count: number): (LiveLookId | null)[] {
  const welcome = LIVE_LOOKS.filter(look => (look.lanes as readonly MoodLane[]).includes(lane));
  if (!welcome.length) return Array.from({ length: count }, () => null);
  const start = hash(seed, 'look-start', 2);
  const first = hash(seed, 'look-pick', welcome.length);
  return Array.from({ length: count }, (_, index) => (index + start) % 2 === 0 ? welcome[(first + Math.floor(index / 2)) % welcome.length].id : null);
}
