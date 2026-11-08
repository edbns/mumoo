import type { CoverRead } from './cover-palette';

/** Measured colour of a baked background (same numbers as a cover read). */
export type LookRead = CoverRead;

const parse = (hex: string): [number, number, number] =>
  [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16)) as [number, number, number];

/** 0 (no relation) … 1 (same colours): how well a background carries the colours of a cover. */
function paletteFit(cover: CoverRead, look: LookRead): number {
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
export function coverFit(cover: CoverRead, look: LookRead): number {
  return 0.5 * paletteFit(cover, look)
    + 0.2 * (1 - Math.abs(cover.lightness - look.lightness))
    + 0.15 * (1 - Math.abs(cover.saturation - look.saturation))
    + 0.15 * (1 - Math.abs(cover.warmth - look.warmth));
}
