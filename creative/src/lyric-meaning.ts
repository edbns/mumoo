import type { MoodLane } from './ad-fonts';

/**
 * What the words MEAN, as read by our own language model (see audio-intelligence/modal_lyric_meaning_staging.py).
 * Only these codes are kept. The lyrics themselves never leave the request that reads them.
 */
export const ATTITUDES = [
  'joyful', 'playful', 'flirty', 'tender', 'romantic', 'hopeful', 'boastful', 'defiant', 'annoyed', 'angry',
  'menacing', 'bitter', 'heartbroken', 'lonely', 'nostalgic', 'reflective', 'spiritual', 'neutral',
] as const;
export type LyricAttitude = typeof ATTITUDES[number];

export type LyricMeaning = {
  attitude: LyricAttitude;
  /** 0 none … 3 deep sorrow. Boasting, anger and playfulness are 0. */
  sadness: number;
  /** 1 calm and gentle … 5 fierce and forceful. */
  intensity: number;
};

export type LyricMeaningState =
  | { status: 'pending' }
  | { status: 'ready'; meaning: LyricMeaning }
  | { status: 'error' };

/** A clip whose words say too little (chants, a single phrase) carries no feeling: neutral changes nothing downstream. */
export const NEUTRAL_MEANING: LyricMeaning = { attitude: 'neutral', sadness: 0, intensity: 3 };

/** Validate the worker's answer. Anything unexpected is rejected, never guessed at. */
export function parseLyricMeaning(raw: unknown): LyricMeaning | null {
  const body = raw as Record<string, unknown> | null;
  if (!body || body.version !== 1) return null;
  if (body.clarity === 'thin') return NEUTRAL_MEANING;
  const { attitude, sadness, intensity } = body;
  if (typeof attitude !== 'string' || !(ATTITUDES as readonly string[]).includes(attitude)) return null;
  if (!Number.isInteger(sadness) || (sadness as number) < 0 || (sadness as number) > 3) return null;
  if (!Number.isInteger(intensity) || (intensity as number) < 1 || (intensity as number) > 5) return null;
  // The model is told that boasting, anger and playfulness carry no sadness; it sometimes forgets, and a stray 2 would dull the colours of a cocky or angry song. Defiance and irritation can hide a little hurt, so they keep at most 1. The rule is kept here, in code.
  const sorrow = Math.min(sadness as number, MOST_SORROW[attitude as LyricAttitude] ?? 3);
  return { attitude: attitude as LyricAttitude, sadness: sorrow, intensity: intensity as number };
}

const MOST_SORROW: Partial<Record<LyricAttitude, number>> = { boastful: 0, angry: 0, playful: 0, defiant: 1, annoyed: 1 };

const HEAVY = new Set<LyricAttitude>(['heartbroken', 'lonely']);
const HARSH = new Set<LyricAttitude>(['angry', 'menacing', 'bitter']);
const SOFT = new Set<LyricAttitude>(['tender', 'romantic']);
const BRIGHT = new Set<LyricAttitude>(['joyful', 'playful', 'flirty', 'boastful']);

/** Sad or harsh words never sit on a sunny background. */
export function leansDeep(meaning: LyricMeaning | null): boolean {
  return Boolean(meaning && (meaning.sadness >= 2 || HEAVY.has(meaning.attitude) || HARSH.has(meaning.attitude)));
}

/**
 * Lane = what the song is. A genre the creator picked (gospel, club) wins; otherwise the words and the audio vote.
 * `audioLane` is the lane the audio and genre logic already produced.
 */
export function laneFromMeaning(audioLane: MoodLane, genreLocked: boolean, meaning: LyricMeaning | null): MoodLane {
  if (genreLocked || !meaning) return audioLane;
  const { attitude } = meaning;
  if (attitude === 'spiritual') return 'gospel';
  if (meaning.sadness >= 2 || HEAVY.has(attitude)) return audioLane === 'dark' ? 'dark' : 'quiet';
  if (HARSH.has(attitude)) return 'dark';
  if (SOFT.has(attitude)) return audioLane === 'party' ? 'general' : 'quiet';
  if (BRIGHT.has(attitude)) return audioLane === 'quiet' || audioLane === 'dark' ? 'general' : 'party';
  return audioLane;
}
