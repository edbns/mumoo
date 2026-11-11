/**
 * Streaks: how every colouring is made, in plain code with no drawing in it. The shader (live-look.ts) is written from these tables, and the palette reader
 * (live-look-ramp.ts, which picks the lyric ink and the scrim) runs the same colour maths, so the type is chosen against the picture as it is seen.
 *
 * A colouring grades the picture, then drags its bright parts into tinted lines (anamorphic, rain, radial, edge leaks). One effect, as many colourings as
 * we care to write down: a new colouring is one entry here, an id in `live-look-deal.ts`, a builder in `live-look.ts` and an id in the worker.
 */
import type { StreaksLookId } from './live-look-deal';

export type Rgb = readonly [number, number, number];

export type StreaksStyle = {
  /** Main streak angle in degrees, or `'radial'` from the centre. */
  direction: number | 'radial';
  /** Optional second angle (degrees) for a crossed streak. */
  second?: number;
  /** Streak length as a fraction of the picture width. Default 0.38. */
  length?: number;
  /** Brightness above which light is dragged. Default 0.55; the shader also falls back to the brightest ~15%. */
  threshold?: number;
  /** How hard the streaks are added. Default 1.15. */
  strength?: number;
  /** Exponential fall-off along the streak (higher = shorter tail). Default 0.82. */
  falloff?: number;
  /** One tint, or two blended by brightness. */
  tint: Rgb | readonly [Rgb, Rgb];
  grade: { shadows: Rgb; contrast?: number; mid?: number };
  /** Prism: each colour channel is streaked a little differently. */
  prism?: boolean;
  /** Film burn: streaks seeded from the left and top edges, not from highlights. */
  edge?: boolean;
};

const anamorphic = (tint: Rgb | readonly [Rgb, Rgb], extra: Partial<StreaksStyle> = {}): StreaksStyle => ({
  direction: 0, length: 0.42, threshold: 0.48, strength: 1.35, falloff: 0.8,
  tint, grade: { shadows: [0.02, 0.02, 0.06], contrast: 1.28, mid: 0.34 },
  ...extra,
});

export const STREAKS_STYLES: Record<StreaksLookId, StreaksStyle> = {
  /** Classic anamorphic blue. */
  streakblue: anamorphic([0.35, 0.7, 1.0]),
  /** Warm amber. */
  streakamber: anamorphic([1.0, 0.62, 0.18], { grade: { shadows: [0.05, 0.02, 0.01], contrast: 1.25, mid: 0.32 } }),
  /** Teal and orange. */
  streakteal: anamorphic([[0.1, 0.75, 0.7], [1.0, 0.45, 0.12]] as const, { second: 12, length: 0.4 }),
  /** Magenta. */
  streakmagenta: anamorphic([1.0, 0.15, 0.7]),
  /** White. */
  streakwhite: anamorphic([1.0, 1.0, 1.0], { strength: 1.15, threshold: 0.52 }),
  /** Red laser. */
  streakred: anamorphic([1.0, 0.08, 0.12], { length: 0.48, strength: 1.5 }),
  /** Green. */
  streakgreen: anamorphic([0.25, 1.0, 0.35]),
  /** Gold, diagonal. */
  streakgold: anamorphic([1.0, 0.78, 0.25], { direction: 28, grade: { shadows: [0.05, 0.03, 0.01], contrast: 1.25, mid: 0.32 } }),
  /** Cyan. */
  streakcyan: anamorphic([0.15, 0.95, 1.0]),
  /** Violet, diagonal. */
  streakviolet: anamorphic([0.65, 0.25, 1.0], { direction: -22 }),
  /** Prism: channels streaked differently. */
  streakprism: anamorphic([[1.0, 0.25, 0.4], [0.2, 0.85, 1.0]] as const, { prism: true, length: 0.45, strength: 1.4 }),
  /** Sunset. */
  streaksunset: anamorphic([[0.95, 0.25, 0.35], [1.0, 0.75, 0.25]] as const, { direction: 18, length: 0.4 }),
  /** Ice. */
  streakice: anamorphic([0.65, 0.88, 1.0], { threshold: 0.45, grade: { shadows: [0.03, 0.06, 0.12], contrast: 1.22, mid: 0.3 } }),
  /** Film burn: orange-red leaks from the edges. */
  streakburn: {
    direction: 0, second: 90, length: 0.55, threshold: 0.35, strength: 1.55, falloff: 0.72,
    tint: [[1.0, 0.2, 0.05], [1.0, 0.55, 0.15]] as const,
    grade: { shadows: [0.04, 0.01, 0.0], contrast: 1.3, mid: 0.38 },
    edge: true,
  },
  /** Rain: vertical blue-white. */
  streakrain: anamorphic([0.7, 0.88, 1.0], {
    direction: 90, length: 0.55, falloff: 0.78, strength: 1.25, threshold: 0.42,
    grade: { shadows: [0.02, 0.04, 0.1], contrast: 1.25, mid: 0.36 },
  }),
  /** Zoom pulse: radial from the centre. */
  streakzoom: anamorphic([1.0, 0.9, 0.85], {
    direction: 'radial', length: 0.4, strength: 1.4, threshold: 0.46,
    grade: { shadows: [0.03, 0.02, 0.05], contrast: 1.32, mid: 0.4 },
  }),
  /** Speed lines: steep diagonal. */
  streakspeed: anamorphic([1.0, 0.95, 0.85], {
    direction: -38, second: 142, length: 0.5, strength: 1.35, falloff: 0.76,
    grade: { shadows: [0.02, 0.02, 0.04], contrast: 1.3, mid: 0.38 },
  }),
};

const luma = (r: number, g: number, b: number) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const softClip = (x: number) => x / (1 + Math.max(0, x - 0.9) * 1.1);

export function streaksGrade(style: StreaksStyle, r: number, g: number, b: number): [number, number, number] {
  const { shadows, contrast = 1.25, mid = 0.32 } = style.grade;
  const rgb = [r, g, b].map(value => clamp(((value / 255) - 0.5) * contrast + 0.5));
  const light = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  const shadowed = rgb.map((channel, i) => channel * (0.4 + 0.5 * light) + shadows[i] * (1 - light) * 0.6);
  const pulled = shadowed.map(channel => channel * (1 - mid * (0.45 + 0.4 * (1 - Math.abs(2 * light - 1)))));
  return pulled.map(channel => clamp(channel * 0.82)) as [number, number, number];
}

export function streaksTint(style: StreaksStyle, brightness: number): Rgb {
  const { tint } = style;
  if (typeof tint[0] === 'number') return tint as Rgb;
  const [a, c] = tint as readonly [Rgb, Rgb];
  const t = clamp(brightness);
  return [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
}

/**
 * A pixel of the streaks as it averages over a cell (0-255 in and out): graded base plus a weaker tint times brightness squared (the directional blur
 * is approximated; the taps, the beat and the edge seed are in the shader only).
 */
export function streaksAverage(look: StreaksLookId, r: number, g: number, b: number): [number, number, number] {
  const style = STREAKS_STYLES[look];
  const base = streaksGrade(style, r, g, b);
  const light = luma(r, g, b);
  const threshold = style.threshold ?? 0.55;
  const amount = clamp((light - threshold) / Math.max(1e-3, 1 - threshold));
  const fallback = light > 0.85 ? (light - 0.85) / 0.15 : 0;
  const glow = Math.max(amount, fallback) * Math.max(amount, fallback) * (style.strength ?? 1.15) * 0.55;
  const tint = streaksTint(style, light);
  return [0, 1, 2].map(i => softClip(base[i] + tint[i] * glow) * 255) as [number, number, number];
}
