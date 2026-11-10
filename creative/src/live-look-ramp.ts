/**
 * What each live look does to a colour, in plain code with no drawing in it. The shader (live-look.ts) is written from the same numbers,
 * and the palette reader (pack-palette.ts) runs the same function over a small copy of the picture, so the lyric ink and the
 * scrim that keep the words readable are chosen against the picture as it is *seen* (looked), not as it was.
 */
import type { LiveLookId } from './live-look-deal';

type Stops = readonly (readonly [number, number, number])[];

/** The colour ramps (0-1 per channel), cold to hot. All three looks read the picture as heat; they differ in the ramp and in how rough the picture is made. */
export const LOOK_STOPS: Record<LiveLookId, Stops> = {
  // A heat camera's iron palette: cold indigo, magenta, red, orange, yellow, white-hot.
  thermal: [[0.02, 0.0, 0.1], [0.17, 0.02, 0.47], [0.64, 0.05, 0.5], [0.93, 0.18, 0.18], [1.0, 0.55, 0.05], [1.0, 0.92, 0.35], [1.0, 1.0, 0.92]],
  // Cold light: black, navy, blue, cyan, ice white.
  arctic: [[0.0, 0.01, 0.06], [0.02, 0.08, 0.3], [0.05, 0.3, 0.75], [0.2, 0.7, 0.95], [0.75, 0.96, 1.0], [1.0, 1.0, 1.0]],
  // A night-vision tube: black, deep green, phosphor green, pale green-white.
  night: [[0.0, 0.02, 0.0], [0.0, 0.14, 0.03], [0.05, 0.45, 0.1], [0.3, 0.9, 0.3], [0.8, 1.0, 0.75]],
};

/** How much grain and edge-darkening each look adds (the shader only; the palette reader leaves them out). */
export const LOOK_ROUGHNESS: Record<LiveLookId, { grain: number; vignette: number }> = {
  thermal: { grain: 0.03, vignette: 0.15 },
  arctic: { grain: 0.02, vignette: 0.1 },
  night: { grain: 0.09, vignette: 0.45 },
};

const smooth = (low: number, high: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

/** How warm a picture reads to a heat camera: bodies, skin, fire and red cloth are hot; sky, shade, steel and water are cold. 0-255 in, 0-1 out. */
export function heatSource(r: number, g: number, b: number): number {
  const light = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const warmth = Math.min(1, Math.max(0, 0.5 + (1.5 * (r - b)) / 255));
  return 0.35 * light + 0.65 * warmth;
}

/** How hot a picture's heat source reads: its own coldest-to-hottest range is spread over the whole ramp, so a pale or dark picture still shows cold and hot. */
export function heatOf(source: number, low: number, high: number): number {
  return smooth(0, 1, smooth(low, high, source));
}

export function rampColor(stops: Stops, heat: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, heat)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const [a, b] = [stops[i], stops[i + 1]];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** The narrowest range a look stretches: a flat picture is not blown up into noise. */
export const MIN_SPREAD = 0.25;

/** A pixel (0-255) as the look shows it, without the beat, the grain or the softening, which move too much to read the type against. */
export function lookPixel(look: LiveLookId, r: number, g: number, b: number, range: readonly [number, number]): [number, number, number] {
  const [low, high] = [range[0], Math.max(range[1], range[0] + MIN_SPREAD)];
  const [lr, lg, lb] = rampColor(LOOK_STOPS[look], heatOf(heatSource(r, g, b), low, high));
  return [lr * 255, lg * 255, lb * 255];
}
