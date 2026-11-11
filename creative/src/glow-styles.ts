/**
 * Glow: how every colouring is made, in plain code with no drawing in it. The shader (live-look.ts) is written from these tables, and the palette reader
 * (live-look-ramp.ts, which picks the lyric ink and the scrim) runs the same colour maths, so the type is chosen against the picture as it is seen.
 *
 * A colouring grades the picture darker, then adds a tinted bloom of its bright parts. Soft looks keep the grade gentle; neon and club looks push the
 * glow hard. One effect, as many colourings as we care to write down: a new colouring is one entry here, an id in `live-look-deal.ts`, a builder in
 * `live-look.ts` and an id in the worker.
 */
import type { GlowLookId } from './live-look-deal';

export type Rgb = readonly [number, number, number];

export type GlowStyle = {
  /** Brightness above which light is pulled into the glow (0-1). Default 0.55. */
  threshold?: number;
  /** Glow radius in rows of the picture's height. Default 36. */
  radius?: number;
  /** How hard the glow is added. Default 0.85. */
  strength?: number;
  /** One tint, or two blended by the glow's brightness (darker tint first). */
  tint: Rgb | readonly [Rgb, Rgb];
  /** Shadows colour cast, contrast (>1 punches), and how much midtones are pulled down (0-1). */
  grade: { shadows: Rgb; contrast?: number; mid?: number };
  /** Red/blue split of the glow, as a fraction of the radius. Default 0. */
  chroma?: number;
  /** Club: glow tint alternates pink and blue across the picture. */
  club?: boolean;
};

const WHITE: Rgb = [1.0, 1.0, 1.0];
const soft = (tint: Rgb | readonly [Rgb, Rgb], extra: Partial<GlowStyle> = {}): GlowStyle => ({
  tint, threshold: 0.45, radius: 42, strength: 0.7,
  grade: { shadows: [0.08, 0.06, 0.12], contrast: 1.05, mid: 0.12 },
  ...extra,
});
const neon = (tint: Rgb | readonly [Rgb, Rgb], extra: Partial<GlowStyle> = {}): GlowStyle => ({
  tint, threshold: 0.5, radius: 34, strength: 1.05,
  grade: { shadows: [0.02, 0.01, 0.06], contrast: 1.25, mid: 0.28 },
  ...extra,
});

export const GLOW_STYLES: Record<GlowLookId, GlowStyle> = {
  /** Soft white bloom. */
  glowbloom: soft(WHITE, { strength: 0.65, radius: 48, grade: { shadows: [0.1, 0.1, 0.14], contrast: 1.02, mid: 0.1 } }),
  /** Hot pink neon. */
  glowpink: neon([1.0, 0.15, 0.55]),
  /** Cyan neon. */
  glowcyan: neon([0.15, 0.95, 1.0]),
  /** Magenta and cyan split. */
  glowsplit: neon([[0.95, 0.1, 0.7], [0.1, 0.95, 1.0]] as const, { chroma: 0.35, strength: 1.1 }),
  /** Amber street light. */
  glowamber: neon([1.0, 0.55, 0.12], { threshold: 0.48, grade: { shadows: [0.06, 0.03, 0.02], contrast: 1.2, mid: 0.25 } }),
  /** Gold. */
  glowgold: soft([1.0, 0.78, 0.28], { strength: 0.75, grade: { shadows: [0.08, 0.05, 0.02], contrast: 1.08, mid: 0.14 } }),
  /** Ultraviolet. */
  glowuv: neon([[0.35, 0.05, 0.95], [0.95, 0.35, 1.0]] as const, { grade: { shadows: [0.04, 0.0, 0.12], contrast: 1.3, mid: 0.3 } }),
  /** Toxic green. */
  glowtoxic: neon([0.35, 1.0, 0.2], { grade: { shadows: [0.02, 0.06, 0.02], contrast: 1.28, mid: 0.28 } }),
  /** Red alert. */
  glowred: neon([1.0, 0.08, 0.1], { strength: 1.15, grade: { shadows: [0.08, 0.0, 0.02], contrast: 1.35, mid: 0.32 } }),
  /** Sunset peach. */
  glowpeach: soft([[1.0, 0.45, 0.35], [1.0, 0.85, 0.55]] as const, { radius: 44, strength: 0.72 }),
  /** Ice blue. */
  glowice: soft([0.55, 0.85, 1.0], { threshold: 0.48, grade: { shadows: [0.04, 0.08, 0.16], contrast: 1.1, mid: 0.16 } }),
  /** Rainbow prism: large chroma split. */
  glowprism: neon([[1.0, 0.2, 0.4], [0.2, 0.85, 1.0]] as const, { chroma: 0.85, radius: 38, strength: 1.0 }),
  /** Dream: pastel, strong lift, low contrast. */
  glowdream: soft([[1.0, 0.75, 0.9], [0.75, 0.9, 1.0]] as const, {
    threshold: 0.35, radius: 52, strength: 0.9,
    grade: { shadows: [0.16, 0.12, 0.2], contrast: 0.92, mid: 0.05 },
  }),
  /** Noir: very dark grade, single white glow. */
  glownoir: {
    tint: WHITE, threshold: 0.58, radius: 30, strength: 0.95,
    grade: { shadows: [0.0, 0.0, 0.02], contrast: 1.45, mid: 0.42 },
  },
  /** Club: dark with pink and blue glow by position. */
  glowclub: neon([1.0, 0.2, 0.7], {
    club: true, strength: 1.15, radius: 36,
    grade: { shadows: [0.02, 0.0, 0.08], contrast: 1.35, mid: 0.35 },
  }),
  /** Soft mist: pale lift for quiet songs. */
  glowmist: soft([0.85, 0.9, 1.0], { threshold: 0.4, radius: 50, strength: 0.55, grade: { shadows: [0.1, 0.12, 0.16], contrast: 1.0, mid: 0.08 } }),
  /** Soft lilac bloom. */
  glowlilac: soft([0.75, 0.55, 1.0], { strength: 0.68, grade: { shadows: [0.1, 0.06, 0.16], contrast: 1.05, mid: 0.12 } }),
  /** Soft rose. */
  glowrose: soft([1.0, 0.55, 0.65], { strength: 0.7, grade: { shadows: [0.12, 0.06, 0.08], contrast: 1.06, mid: 0.12 } }),
};

const luma = (r: number, g: number, b: number) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const softClip = (x: number) => x / (1 + Math.max(0, x - 0.85) * 1.4);

/** Grade a picture colour the way the glow shader does (0-255 in, 0-1 out). */
export function glowGrade(style: GlowStyle, r: number, g: number, b: number): [number, number, number] {
  const { shadows, contrast = 1.2, mid = 0.25 } = style.grade;
  const rgb = [r, g, b].map(value => clamp(((value / 255) - 0.5) * contrast + 0.5));
  const light = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  const shadowed = rgb.map((channel, i) => channel * (1 - (1 - light) * 0.55) + shadows[i] * (1 - light) * 0.55);
  const pulled = shadowed.map(channel => channel * (1 - mid * (1 - Math.abs(2 * light - 1) * 0.35)));
  return pulled.map(clamp) as [number, number, number];
}

/** Tint of the glow for a brightness 0-1 (club ignored here; the shader owns that). */
export function glowTint(style: GlowStyle, brightness: number): Rgb {
  const { tint } = style;
  if (typeof tint[0] === 'number') return tint as Rgb;
  const [a, c] = tint as readonly [Rgb, Rgb];
  const t = clamp(brightness);
  return [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
}

/**
 * A pixel of the glow as it averages over a cell (0-255 in and out): graded base plus tint times brightness squared (a bright pixel is surrounded by
 * glow). The blur taps, the beat and the club split are in the shader only.
 */
export function glowAverage(look: GlowLookId, r: number, g: number, b: number): [number, number, number] {
  const style = GLOW_STYLES[look];
  const base = glowGrade(style, r, g, b);
  const light = luma(r, g, b);
  const threshold = style.threshold ?? 0.55;
  const amount = clamp((light - threshold) / Math.max(1e-3, 1 - threshold));
  const glow = amount * amount * (style.strength ?? 0.85) * 0.85;
  const tint = glowTint(style, light);
  return [0, 1, 2].map(i => softClip(base[i] + tint[i] * glow) * 255) as [number, number, number];
}
