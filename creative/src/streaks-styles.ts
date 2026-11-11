/**
 * Streaks: how every colouring is made, in plain code with no drawing in it. The shader (live-look.ts) is written from these tables, and the palette reader
 * (live-look-ramp.ts, which picks the lyric ink and the scrim) runs the same colour maths, so the type is chosen against the picture as it is seen.
 *
 * A colouring grades the picture, then drags its bright parts into tinted lines (anamorphic, rain, radial, edge leaks). One effect, as many colourings as
 * we care to write down: a new colouring is one entry here, an id in `live-look-deal.ts`, a builder in `live-look.ts` and an id in the worker.
 *
 * Every colouring has a different direction / shape so a row of four never reads as the same filter with a different tint.
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

/** Hard anamorphic defaults: long hot trails over a crushed picture so each colouring is obvious. */
const anamorphic = (tint: Rgb | readonly [Rgb, Rgb], extra: Partial<StreaksStyle> = {}): StreaksStyle => ({
  direction: 0, length: 0.92, threshold: 0.2, strength: 3.8, falloff: 0.92,
  tint, grade: { shadows: [0.01, 0.01, 0.05], contrast: 1.5, mid: 0.58 },
  ...extra,
});

export const STREAKS_STYLES: Record<StreaksLookId, StreaksStyle> = {
  /** Classic anamorphic blue — dead horizontal. */
  streakblue: anamorphic([0.15, 0.55, 1.0]),
  /** Warm amber — slight upward tilt so it never reads as blue. */
  streakamber: anamorphic([1.0, 0.48, 0.05], {
    direction: 8,
    grade: { shadows: [0.06, 0.02, 0.0], contrast: 1.45, mid: 0.52 },
  }),
  /** Teal and orange crossed. */
  streakteal: anamorphic([[0.0, 0.85, 0.8], [1.0, 0.35, 0.05]] as const, {
    direction: -6, second: 78, length: 0.82, strength: 3.5,
  }),
  /** Magenta — steep diagonal. */
  streakmagenta: anamorphic([1.0, 0.05, 0.72], { direction: 52, length: 0.9, strength: 3.6 }),
  /** White — long flat flare, cooler grade. */
  streakwhite: anamorphic([1.0, 1.0, 1.0], {
    direction: 0, length: 0.95, strength: 3.1, threshold: 0.26,
    grade: { shadows: [0.0, 0.0, 0.04], contrast: 1.55, mid: 0.6 },
  }),
  /** Red laser — long horizontal, hot. */
  streakred: anamorphic([1.0, 0.02, 0.05], { direction: 0, length: 0.95, strength: 3.8 }),
  /** Green — vertical so it cannot twin a horizontal. */
  streakgreen: anamorphic([0.1, 1.0, 0.2], { direction: 90, length: 0.9, strength: 3.5 }),
  /** Gold — shallow diagonal. */
  streakgold: anamorphic([1.0, 0.72, 0.1], {
    direction: 28, length: 0.88, strength: 3.45,
    grade: { shadows: [0.06, 0.03, 0.0], contrast: 1.42, mid: 0.52 },
  }),
  /** Cyan — opposite shallow diagonal. */
  streakcyan: anamorphic([0.0, 0.95, 1.0], { direction: -18, length: 0.9, strength: 3.55 }),
  /** Violet — steep opposite diagonal. */
  streakviolet: anamorphic([0.65, 0.1, 1.0], { direction: -48, length: 0.9, strength: 3.5 }),
  /** Prism: channels streaked differently, crossed. */
  streakprism: anamorphic([[1.0, 0.12, 0.3], [0.05, 0.85, 1.0]] as const, {
    prism: true, direction: 12, second: -55, length: 0.85, strength: 3.6,
  }),
  /** Sunset — warm dual tint, mild uphill. */
  streaksunset: anamorphic([[1.0, 0.15, 0.25], [1.0, 0.7, 0.1]] as const, {
    direction: 22, length: 0.88, strength: 3.45,
  }),
  /** Ice — cold horizontal with blue shadows. */
  streakice: anamorphic([0.45, 0.8, 1.0], {
    direction: 0, length: 0.92, threshold: 0.2, strength: 3.35,
    grade: { shadows: [0.01, 0.05, 0.14], contrast: 1.45, mid: 0.52 },
  }),
  /** Film burn: orange-red streaks plus a warm edge leak. */
  streakburn: {
    direction: 0, second: 90, length: 0.85, threshold: 0.2, strength: 3.4, falloff: 0.88,
    tint: [[1.0, 0.08, 0.0], [1.0, 0.45, 0.05]] as const,
    grade: { shadows: [0.05, 0.01, 0.0], contrast: 1.45, mid: 0.52 },
    edge: true,
  },
  /** Rain: vertical blue-white. */
  streakrain: anamorphic([0.45, 0.75, 1.0], {
    direction: 90, length: 0.98, falloff: 0.93, strength: 4.0, threshold: 0.16,
    grade: { shadows: [0.01, 0.03, 0.12], contrast: 1.5, mid: 0.58 },
  }),
  /** Zoom pulse: starburst cross (radial-from-centre looked like a black card on real photos). */
  streakzoom: anamorphic([1.0, 0.82, 0.55], {
    direction: -70, second: 20, length: 0.88, strength: 3.7, threshold: 0.18, falloff: 0.9,
    grade: { shadows: [0.03, 0.01, 0.02], contrast: 1.48, mid: 0.55 },
  }),
  /** Speed lines: steep crossed diagonals. */
  streakspeed: anamorphic([1.0, 0.95, 0.82], {
    direction: -38, second: 142, length: 0.92, strength: 3.5, falloff: 0.87,
    grade: { shadows: [0.01, 0.01, 0.03], contrast: 1.48, mid: 0.55 },
  }),
};

const luma = (r: number, g: number, b: number) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const softClip = (x: number) => x / (1 + Math.max(0, x - 0.9) * 1.1);

export function streaksGrade(style: StreaksStyle, r: number, g: number, b: number): [number, number, number] {
  const { shadows, contrast = 1.25, mid = 0.32 } = style.grade;
  const rgb = [r, g, b].map(value => clamp(((value / 255) - 0.5) * contrast + 0.5));
  const light = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  const shadowed = rgb.map((channel, i) => channel * (0.3 + 0.4 * light) + shadows[i] * (1 - light) * 0.7);
  const pulled = shadowed.map(channel => channel * (1 - mid * (0.55 + 0.45 * (1 - Math.abs(2 * light - 1)))));
  return pulled.map(channel => clamp(channel * 0.62)) as [number, number, number];
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
  const glow = Math.pow(Math.max(amount, fallback), 0.8) * (style.strength ?? 3.2) * 0.85;
  const tint = streaksTint(style, light);
  return [0, 1, 2].map(i => softClip(base[i] + tint[i] * glow) * 255) as [number, number, number];
}

/** Geometry bucket so a dealt row can avoid four near-identical filters. */
export function streaksGeometry(look: StreaksLookId): string {
  const style = STREAKS_STYLES[look];
  if (style.edge) return 'edge';
  if (style.direction === 'radial') return 'cross';
  if (style.prism || style.second !== undefined) return 'cross';
  const angle = ((Number(style.direction) % 180) + 180) % 180;
  if (angle < 12 || angle > 168) return 'horizontal';
  if (Math.abs(angle - 90) < 12) return 'vertical';
  return 'diagonal';
}
