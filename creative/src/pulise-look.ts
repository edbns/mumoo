/**
 * The look of one Pulise card: which neon set it cuts through. A row of four is dealt so no two cards share a set.
 * Only the seed (the song and the Refresh count) steers it, never lyric text or meaning.
 */
import { hashPick } from './ad-fonts';
import { NEON_IDS, type NeonId } from './pulise-palettes';

export type PuliseLook = { neon: NeonId };

/** `count` cards that all differ in neon set. */
export function puliseLooks(seed: string, count: number): PuliseLook[] {
  if (NEON_IDS.length < count) throw new Error('Not enough neon sets for a row.');
  const dealt = [...NEON_IDS].sort((a, b) => hashPick(seed, a, 99991) - hashPick(seed, b, 99991));
  return dealt.slice(0, count).map(neon => ({ neon }));
}
