import type { LyricAttitude, LyricMeaning } from './lyric-meaning';

/**
 * How the words colour and calm the picture. The song's genre and tempo still choose the look and its motion;
 * the lyrics only grade that look (colour) and soften how hard it hits the beat. All numbers, so a render job
 * can carry them. 1 = unchanged for saturation, brightness and contrast; 0 = unchanged for warmth and calm.
 */
export type MoodGrade = {
  saturation: number;
  /** -1 cool … +1 warm. */
  warmth: number;
  brightness: number;
  contrast: number;
  /** 0 untouched … 1 as calm as it gets: beat hits shrink to a third. */
  calm: number;
};

const WARMTH: Partial<Record<LyricAttitude, number>> = {
  confident: 0.3, flirty: 0.3, love: 0.3, happy: 0.25, angry: 0.2, fun: 0.2, spiritual: 0, thoughtful: -0.05, sad: -0.2,
};
const VIVID = new Set<LyricAttitude>(['happy', 'fun', 'flirty', 'confident']);

const BEAT_CALM = 0.65;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const round = (value: number) => Math.round(value * 1000) / 1000;

export function moodGrade(meaning: LyricMeaning | null): MoodGrade | undefined {
  if (!meaning) return undefined;
  const sad = meaning.sadness / 3;
  const punch = (meaning.intensity - 3) / 2;
  const grade: MoodGrade = {
    saturation: clamp(1 - 0.35 * sad + (VIVID.has(meaning.attitude) ? 0.1 : 0), 0.55, 1.15),
    warmth: clamp((WARMTH[meaning.attitude] ?? 0) - 0.7 * sad, -1, 1),
    brightness: 1 - 0.14 * sad,
    contrast: 1 + 0.1 * Math.max(0, punch),
    calm: clamp((3 - meaning.intensity) * 0.25 + meaning.sadness * 0.2, 0, 1),
  };
  const rounded = Object.fromEntries(Object.entries(grade).map(([key, value]) => [key, round(value)])) as MoodGrade;
  return isNeutral(rounded) ? undefined : rounded;
}

const isNeutral = (grade: MoodGrade) => grade.saturation === 1 && grade.warmth === 0 && grade.brightness === 1 && grade.contrast === 1 && grade.calm === 0;

/** The beat pulse the type and background react with, softened for calm words. */
export const calmBeat = (beat: number, grade?: MoodGrade) => beat * (1 - BEAT_CALM * (grade?.calm ?? 0));

const LUMA = [0.2126, 0.7152, 0.0722];

/** 4x5 colour matrix (rows R, G, B, A; columns R, G, B, A, offset) = saturation, then warmth + brightness, then contrast. */
export function gradeMatrix(grade: MoodGrade): number[] {
  const gain = [1 + 0.12 * grade.warmth, 1, 1 - 0.12 * grade.warmth].map(value => value * grade.brightness * grade.contrast);
  const offset = 0.5 * (1 - grade.contrast);
  const rows: number[] = [];
  for (let channel = 0; channel < 3; channel++) {
    for (let source = 0; source < 3; source++) {
      const saturate = (channel === source ? grade.saturation : 0) + (1 - grade.saturation) * LUMA[source];
      rows.push(round(gain[channel] * saturate));
    }
    rows.push(0, round(offset));
  }
  return [...rows, 0, 0, 0, 1, 0];
}
