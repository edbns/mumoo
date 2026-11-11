/**
 * What each live look does to a colour, in plain code with no drawing in it. The shader (live-look.ts) is written from the same numbers,
 * and the palette reader (pack-palette.ts) runs the same function over a small copy of the picture, so the lyric ink and the
 * scrim that keep the words readable are chosen against the picture as it is *seen* (looked), not as it was.
 */
import type { HalftoneLookId, HeatLookId, LiveLookId } from './live-look-deal';

type Stops = readonly (readonly [number, number, number])[];

/** The colour ramps (0-1 per channel), cold to hot. All three looks read the picture as heat; they differ in the ramp and in how rough the picture is made. */
export const LOOK_STOPS: Record<HeatLookId, Stops> = {
  // A heat camera's iron palette: cold indigo, magenta, red, orange, yellow, white-hot.
  thermal: [[0.02, 0.0, 0.1], [0.17, 0.02, 0.47], [0.64, 0.05, 0.5], [0.93, 0.18, 0.18], [1.0, 0.55, 0.05], [1.0, 0.92, 0.35], [1.0, 1.0, 0.92]],
  // Cold light: black, navy, blue, cyan, ice white.
  arctic: [[0.0, 0.01, 0.06], [0.02, 0.08, 0.3], [0.05, 0.3, 0.75], [0.2, 0.7, 0.95], [0.75, 0.96, 1.0], [1.0, 1.0, 1.0]],
  // A night-vision tube: black, deep green, phosphor green, pale green-white.
  night: [[0.0, 0.02, 0.0], [0.0, 0.14, 0.03], [0.05, 0.45, 0.1], [0.3, 0.9, 0.3], [0.8, 1.0, 0.75]],
  // A heat camera's grey modes: hot is white, or hot is black.
  whitehot: [[0.0, 0.0, 0.0], [0.18, 0.18, 0.2], [0.45, 0.45, 0.47], [0.75, 0.75, 0.77], [1.0, 1.0, 1.0]],
  blackhot: [[1.0, 1.0, 1.0], [0.75, 0.75, 0.77], [0.45, 0.45, 0.47], [0.18, 0.18, 0.2], [0.0, 0.0, 0.0]],
  // The rainbow mode of a heat camera: navy, blue, cyan, green, yellow, orange, red.
  rainbow: [[0.0, 0.0, 0.35], [0.0, 0.2, 0.9], [0.0, 0.75, 0.85], [0.1, 0.8, 0.25], [0.95, 0.9, 0.1], [1.0, 0.45, 0.0], [0.95, 0.1, 0.1]],
  // Molten rock: black, dried blood, orange, yellow, pale glow.
  lava: [[0.03, 0.0, 0.0], [0.3, 0.02, 0.0], [0.7, 0.1, 0.0], [1.0, 0.4, 0.0], [1.0, 0.75, 0.1], [1.0, 0.95, 0.6]],
  // Blacklight: deep indigo, violet, magenta, pale pink.
  ultraviolet: [[0.02, 0.0, 0.08], [0.15, 0.0, 0.4], [0.4, 0.05, 0.8], [0.75, 0.2, 0.95], [1.0, 0.5, 0.95], [1.0, 0.85, 1.0]],
  // Toxic glow: black, bottle green, lime, acid yellow.
  acid: [[0.0, 0.03, 0.02], [0.02, 0.2, 0.1], [0.1, 0.5, 0.1], [0.6, 0.9, 0.05], [0.95, 1.0, 0.2], [1.0, 1.0, 0.8]],
  // The sky after sunset: navy, plum, rose, apricot, cream.
  dusk: [[0.05, 0.06, 0.2], [0.25, 0.12, 0.45], [0.65, 0.2, 0.55], [0.95, 0.42, 0.4], [1.0, 0.72, 0.4], [1.0, 0.93, 0.75]],
  // One warm hue, like an old amber monitor: brown, amber, pale honey.
  amber: [[0.04, 0.02, 0.01], [0.2, 0.08, 0.03], [0.45, 0.2, 0.06], [0.75, 0.42, 0.12], [0.95, 0.7, 0.35], [1.0, 0.92, 0.72]],
  // Sweets: indigo, periwinkle, pink, bubblegum, sky, white.
  candy: [[0.1, 0.05, 0.4], [0.35, 0.2, 0.85], [0.9, 0.3, 0.7], [1.0, 0.6, 0.75], [0.5, 0.9, 0.95], [1.0, 1.0, 1.0]],
  // Shallow tropical water: deep teal, turquoise, sea green, pale lime.
  lagoon: [[0.0, 0.05, 0.12], [0.0, 0.25, 0.35], [0.05, 0.55, 0.5], [0.3, 0.8, 0.55], [0.85, 0.95, 0.6], [1.0, 1.0, 0.85]],
  // Gold leaf: black, bronze, gold, pale gold.
  gold: [[0.03, 0.02, 0.0], [0.25, 0.15, 0.02], [0.6, 0.4, 0.05], [0.9, 0.7, 0.15], [1.0, 0.88, 0.5], [1.0, 0.98, 0.85]],
  // One red hue: black, wine, crimson, rose, blush.
  crimson: [[0.02, 0.0, 0.02], [0.25, 0.0, 0.08], [0.6, 0.02, 0.15], [0.9, 0.15, 0.25], [1.0, 0.5, 0.5], [1.0, 0.9, 0.9]],
  // A blueprint print: Prussian blue on paper white.
  cyanotype: [[0.0, 0.05, 0.15], [0.02, 0.17, 0.35], [0.1, 0.35, 0.55], [0.45, 0.62, 0.75], [0.85, 0.92, 0.95], [0.97, 0.98, 0.96]],
  // Northern lights: night, indigo, blue, green, mint.
  aurora: [[0.0, 0.02, 0.08], [0.1, 0.05, 0.35], [0.1, 0.35, 0.6], [0.1, 0.75, 0.55], [0.55, 0.95, 0.6], [0.9, 1.0, 0.85]],
  // Vapor wave: purple, hot pink, aqua, white.
  vapor: [[0.1, 0.0, 0.3], [0.45, 0.05, 0.65], [0.95, 0.25, 0.65], [1.0, 0.55, 0.8], [0.35, 0.9, 0.95], [0.95, 1.0, 1.0]],
};

/** How much grain and edge-darkening each look adds (the shader only; the palette reader leaves them out). */
export const LOOK_ROUGHNESS: Record<HeatLookId, { grain: number; vignette: number }> = {
  thermal: { grain: 0.03, vignette: 0.15 },
  arctic: { grain: 0.02, vignette: 0.1 },
  night: { grain: 0.09, vignette: 0.45 },
  whitehot: { grain: 0.04, vignette: 0.2 },
  blackhot: { grain: 0.04, vignette: 0.1 },
  rainbow: { grain: 0.02, vignette: 0.12 },
  lava: { grain: 0.04, vignette: 0.3 },
  ultraviolet: { grain: 0.03, vignette: 0.25 },
  acid: { grain: 0.06, vignette: 0.35 },
  dusk: { grain: 0.02, vignette: 0.1 },
  amber: { grain: 0.07, vignette: 0.35 },
  candy: { grain: 0.01, vignette: 0.05 },
  lagoon: { grain: 0.02, vignette: 0.1 },
  gold: { grain: 0.03, vignette: 0.2 },
  crimson: { grain: 0.04, vignette: 0.3 },
  cyanotype: { grain: 0.05, vignette: 0.15 },
  aurora: { grain: 0.02, vignette: 0.25 },
  vapor: { grain: 0.02, vignette: 0.1 },
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

type Rgb = readonly [number, number, number];

/**
 * How each halftone is printed: the paper, the ink (`'own'`: the picture's own colour, a printer's richer and darker version of it; or one flat colour),
 * and `negative` (light dots on dark paper, so a light part of the picture is a big dot). `sat` and `gain` shape the picture's own ink.
 * One effect, as many inks and papers as we care to write down.
 */
export type HalftoneStyle = { paper: Rgb; ink: 'own' | Rgb; negative?: true; sat?: number; gain?: number };

export const HALFTONE_STYLES: Record<HalftoneLookId, HalftoneStyle> = {
  halftone: { paper: [0.96, 0.93, 0.86], ink: 'own' },
  halftonebw: { paper: [0.98, 0.98, 0.97], ink: [0.05, 0.05, 0.06] },
  halftonenews: { paper: [0.82, 0.8, 0.74], ink: [0.1, 0.1, 0.11] },
  halftoneblue: { paper: [0.95, 0.96, 0.98], ink: [0.06, 0.16, 0.5] },
  halftonered: { paper: [0.96, 0.93, 0.86], ink: [0.82, 0.1, 0.12] },
  halftonepink: { paper: [0.97, 0.94, 0.9], ink: [0.95, 0.25, 0.55] },
  halftoneteal: { paper: [0.96, 0.95, 0.9], ink: [0.0, 0.5, 0.52] },
  halftonepop: { paper: [1.0, 0.93, 0.45], ink: 'own', sat: 2.2, gain: 0.85 },
  halftoneneon: { paper: [0.03, 0.02, 0.06], ink: 'own', negative: true, sat: 2.0, gain: 1.35 },
  halftoneinvert: { paper: [0.03, 0.03, 0.04], ink: [0.97, 0.97, 0.95], negative: true },
  halftonegold: { paper: [0.04, 0.03, 0.02], ink: [0.95, 0.74, 0.25], negative: true },
};

/** How much of a halftone cell the ink covers where the picture has this colour (0-1): on paper the dark parts are mostly ink, on a dark paper the light parts are. */
export function halftoneCover(look: HalftoneLookId, r: number, g: number, b: number): number {
  const light = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return Math.min(1, Math.max(0, (HALFTONE_STYLES[look].negative ? light : 1 - light) * 1.05));
}

/** The halftone's ink for a colour (0-255 in, 0-1 out). */
export function halftoneInk(look: HalftoneLookId, r: number, g: number, b: number): Rgb {
  const { ink, sat = 1.4, gain = 0.55 } = HALFTONE_STYLES[look];
  if (ink !== 'own') return ink;
  const light = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const own = (channel: number) => Math.min(1, Math.max(0, (light + (channel / 255 - light) * sat) * gain));
  return [own(r), own(g), own(b)];
}

/** A halftone pixel as it averages over a cell: paper and ink in the proportion the ink covers. The dots themselves and their swell on the beat are in the shader only. */
export function halftonePixel(look: HalftoneLookId, r: number, g: number, b: number): [number, number, number] {
  const cover = halftoneCover(look, r, g, b);
  const ink = halftoneInk(look, r, g, b);
  const { paper } = HALFTONE_STYLES[look];
  return [0, 1, 2].map(i => (paper[i] + (ink[i] - paper[i]) * cover) * 255) as [number, number, number];
}

export const isHalftone = (look: LiveLookId): look is HalftoneLookId => look in HALFTONE_STYLES;

/** A pixel (0-255) as the look shows it, without the beat, the grain or the softening, which move too much to read the type against. */
export function lookPixel(look: LiveLookId, r: number, g: number, b: number, range: readonly [number, number]): [number, number, number] {
  if (isHalftone(look)) return halftonePixel(look, r, g, b);
  const [low, high] = [range[0], Math.max(range[1], range[0] + MIN_SPREAD)];
  const [lr, lg, lb] = rampColor(LOOK_STOPS[look], heatOf(heatSource(r, g, b), low, high));
  return [lr * 255, lg * 255, lb * 255];
}
