import type { MoodLane } from './ad-fonts';

/**
 * What the words MEAN, as read by our own language model (see audio-intelligence/modal_lyric_meaning_staging.py).
 * Only these codes are kept. The lyrics themselves never leave the request that reads them.
 */
export const ATTITUDES = [
  'happy', 'fun', 'flirty', 'love', 'confident', 'angry', 'sad', 'thoughtful', 'spiritual', 'neutral',
] as const;
export type LyricAttitude = typeof ATTITUDES[number];

/** The finer moods we used to have, and the one each became: an older reader or library item still speaks them. */
export const FORMER_ATTITUDES: Readonly<Record<string, LyricAttitude>> = {
  joyful: 'happy', hopeful: 'happy', playful: 'fun', tender: 'love', romantic: 'love', boastful: 'confident', defiant: 'confident',
  annoyed: 'angry', bitter: 'angry', menacing: 'angry', heartbroken: 'sad', lonely: 'sad', nostalgic: 'thoughtful', reflective: 'thoughtful',
};

/** Today's mood for a code, old or new; null when it is not one. */
export function attitudeOf(code: unknown): LyricAttitude | null {
  if (typeof code !== 'string') return null;
  if ((ATTITUDES as readonly string[]).includes(code)) return code as LyricAttitude;
  return FORMER_ATTITUDES[code] ?? null;
}

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
  const { sadness, intensity } = body;
  const attitude = attitudeOf(body.attitude);
  if (!attitude) return null;
  if (!Number.isInteger(sadness) || (sadness as number) < 0 || (sadness as number) > 3) return null;
  if (!Number.isInteger(intensity) || (intensity as number) < 1 || (intensity as number) > 5) return null;
  // The model is told that fun carries no sadness and swagger or anger little; it sometimes forgets, and a stray 2 would dull the colours of a cocky or angry song. The rule is kept here, in code.
  const sorrow = Math.min(sadness as number, MOST_SORROW[attitude] ?? 3);
  return { attitude, sadness: sorrow, intensity: intensity as number };
}

const MOST_SORROW: Partial<Record<LyricAttitude, number>> = { fun: 0, confident: 1, angry: 1 };

const HEAVY = new Set<LyricAttitude>(['sad']);
const HARSH = new Set<LyricAttitude>(['angry']);
const SOFT = new Set<LyricAttitude>(['love']);
const BRIGHT = new Set<LyricAttitude>(['happy', 'fun', 'flirty', 'confident']);

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
