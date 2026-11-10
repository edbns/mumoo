/**
 * What each live look does to a colour, in plain code with no drawing in it. The shader (live-look.ts) is written from the same numbers,
 * and the palette reader (pack-palette.ts) runs the same function over a small copy of the picture, so the lyric ink and the
 * scrim that keep the words readable are chosen against the picture as it is *seen* (looked), not as it was.
 */
import type { LiveLookId } from './live-look-deal';

/** The heat ramp, cold to hot (0-1 per channel). */
export const THERMAL_STOPS: readonly (readonly [number, number, number])[] = [
  [0.02, 0.0, 0.1], [0.17, 0.02, 0.47], [0.64, 0.05, 0.5], [0.93, 0.18, 0.18], [1.0, 0.55, 0.05], [1.0, 0.92, 0.35], [1.0, 1.0, 0.92],
];

const smooth = (low: number, high: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

/** How hot a picture's brightness reads: its own darkest-to-lightest range is spread over the whole ramp, so a pale or dark picture still shows cold and hot. */
export function heatOf(light: number, low: number, high: number): number {
  const spread = smooth(low, high, light);
  return smooth(0, 1, spread);
}

export function thermalColor(heat: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, heat)) * (THERMAL_STOPS.length - 1);
  const i = Math.min(THERMAL_STOPS.length - 2, Math.floor(x));
  const f = x - i;
  const [a, b] = [THERMAL_STOPS[i], THERMAL_STOPS[i + 1]];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** The narrowest range of brightness a look stretches: a flat picture is not blown up into noise. */
export const MIN_SPREAD = 0.25;

/** A pixel (0-255) as the look shows it, without the beat or the grain, which move too much to read the type against. */
export function lookPixel(look: LiveLookId, r: number, g: number, b: number, range: readonly [number, number]): [number, number, number] {
  const [low, high] = [range[0], Math.max(range[1], range[0] + MIN_SPREAD)];
  const light = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const [lr, lg, lb] = { thermal: () => thermalColor(heatOf(light, low, high)) }[look]();
  return [lr * 255, lg * 255, lb * 255];
}
