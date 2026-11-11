import type { CoverRead } from './cover-palette';
import type { LyricAttitude, LyricMeaning } from './lyric-meaning';

/** Measured colour of a baked background (same numbers as a cover read). */
export type LookRead = CoverRead;

const parse = (hex: string): [number, number, number] =>
  [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16)) as [number, number, number];

/** 0 (no relation) … 1 (same colours): how well a background carries the colours of a cover. */
function paletteFit(cover: CoverRead, look: Pick<LookRead, 'palette'>): number {
  const lookColors = look.palette.map(color => parse(color.hex));
  let total = 0;
  for (const color of cover.palette) {
    const [r, g, b] = parse(color.hex);
    const nearest = Math.min(...lookColors.map(([lr, lg, lb]) => Math.hypot(r - lr, g - lg, b - lb)));
    total += color.share * (1 - nearest / 441);
  }
  return total;
}

/**
 * How well a background matches a song's cover, 0…1. Colours count most; then how bright, how saturated
 * and how warm it feels, so a dark moody cover is not given a pastel background and vice versa.
 */
export function coverFit(cover: CoverRead, look: Pick<LookRead, 'palette' | 'lightness' | 'saturation' | 'warmth'>): number {
  return 0.5 * paletteFit(cover, look)
    + 0.2 * (1 - Math.abs(cover.lightness - look.lightness))
    + 0.15 * (1 - Math.abs(cover.saturation - look.saturation))
    + 0.15 * (1 - Math.abs(cover.warmth - look.warmth));
}

/** The picture each attitude wants: how bright, saturated, warm (0 cool … 1 warm) and contrasty a background should be. */
type Feel = { lightness: number; saturation: number; warmth: number; contrast: number };
const FEEL: Partial<Record<LyricAttitude, Feel>> = {
  happy: { lightness: 0.62, saturation: 0.75, warmth: 0.8, contrast: 0.18 },
  fun: { lightness: 0.55, saturation: 0.8, warmth: 0.6, contrast: 0.2 },
  flirty: { lightness: 0.45, saturation: 0.8, warmth: 0.6, contrast: 0.2 },
  love: { lightness: 0.58, saturation: 0.5, warmth: 0.9, contrast: 0.15 },
  confident: { lightness: 0.33, saturation: 0.8, warmth: 0.75, contrast: 0.5 },
  angry: { lightness: 0.2, saturation: 0.75, warmth: 0.55, contrast: 0.45 },
  sad: { lightness: 0.18, saturation: 0.5, warmth: 0, contrast: 0.25 },
  thoughtful: { lightness: 0.42, saturation: 0.42, warmth: 0.45, contrast: 0.25 },
  spiritual: { lightness: 0.6, saturation: 0.5, warmth: 0.7, contrast: 0.15 },
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Neutral words (or none) have no particular picture in mind. */
export const hasFeel = (meaning: LyricMeaning | null): meaning is LyricMeaning => Boolean(meaning && FEEL[meaning.attitude]);

/**
 * How well a background carries what the words feel like, 0…1. Sadness darkens, dulls and cools the picture the
 * words ask for; intensity asks for more contrast.
 */
export function attitudeFit(meaning: LyricMeaning, look: LookRead): number {
  const feel = FEEL[meaning.attitude]!;
  const sad = meaning.sadness;
  const want: Feel = {
    lightness: clamp01(feel.lightness - 0.08 * sad),
    saturation: clamp01(feel.saturation - 0.1 * sad),
    warmth: clamp01(feel.warmth - 0.15 * sad),
    contrast: clamp01(feel.contrast + 0.1 * (meaning.intensity - 3)),
  };
  return 0.35 * (1 - Math.abs(want.lightness - look.lightness))
    + 0.25 * (1 - Math.abs(want.saturation - look.saturation))
    + 0.25 * (1 - Math.abs(want.warmth - look.warmth))
    + 0.15 * (1 - Math.abs(want.contrast - look.contrast));
}

/** Colour family of a background as the eye reads it: very dark ones are one family whatever their tint. */
export function colorFamily(read: LookRead): string {
  if (read.lightness < 0.15) return 'dark';
  if (read.hue === null || read.saturation < 0.2) return 'neutral';
  const hue = read.hue;
  if (hue >= 340 || hue < 50) return 'red-orange';
  if (hue < 170) return 'yellow-green';
  if (hue < 255) return 'cyan-blue';
  if (hue < 300) return 'violet';
  return 'pink';
}

/** Backgrounds made by the same effect (`network-lights`, `network-lights-3`…) look alike even when numbered apart. */
export const effectFamily = (slug: string) => slug.replace(/-\d+$/, '');

/**
 * Put backgrounds in an order whose first cards are as different as possible: one per effect and at most
 * `perColor` per colour family. Whatever cannot satisfy that keeps its original order after them, so the
 * input order (cover fit, or the seeded shuffle) still decides among equally different candidates.
 */
export function diversify<T extends { slug: string; read: LookRead }>(ordered: readonly T[], perColor = 2): T[] {
  const first: T[] = [];
  const effects = new Set<string>();
  const colors = new Map<string, number>();
  for (const look of ordered) {
    const effect = effectFamily(look.slug);
    const color = colorFamily(look.read);
    if (effects.has(effect) || (colors.get(color) ?? 0) >= perColor) continue;
    effects.add(effect);
    colors.set(color, (colors.get(color) ?? 0) + 1);
    first.push(look);
  }
  return [...first, ...ordered.filter(look => !first.includes(look))];
}
