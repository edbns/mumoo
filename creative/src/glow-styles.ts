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
/** Soft looks still bloom hard: the picture is pulled down so the haze is the point. */
const soft = (tint: Rgb | readonly [Rgb, Rgb], extra: Partial<GlowStyle> = {}): GlowStyle => ({
  tint, threshold: 0.32, radius: 58, strength: 1.45,
  grade: { shadows: [0.06, 0.05, 0.1], contrast: 1.15, mid: 0.32 },
  ...extra,
});
/** Neon / club: deep grade, hot tinted bleed that flares on the beat. */
const neon = (tint: Rgb | readonly [Rgb, Rgb], extra: Partial<GlowStyle> = {}): GlowStyle => ({
  tint, threshold: 0.38, radius: 48, strength: 1.85,
  grade: { shadows: [0.01, 0.0, 0.05], contrast: 1.4, mid: 0.48 },
  ...extra,
});

export const GLOW_STYLES: Record<GlowLookId, GlowStyle> = {
  /** Soft white bloom. */
  glowbloom: soft(WHITE, { strength: 1.35, radius: 68, grade: { shadows: [0.08, 0.08, 0.12], contrast: 1.12, mid: 0.28 } }),
  /** Hot pink neon. */
  glowpink: neon([1.0, 0.12, 0.55]),
  /** Cyan neon. */
  glowcyan: neon([0.1, 0.95, 1.0]),
  /** Magenta and cyan split. */
  glowsplit: neon([[0.95, 0.08, 0.7], [0.08, 0.95, 1.0]] as const, { chroma: 0.55, strength: 2.0 }),
  /** Amber street light. */
  glowamber: neon([1.0, 0.52, 0.08], { threshold: 0.34, grade: { shadows: [0.05, 0.02, 0.01], contrast: 1.35, mid: 0.45 } }),
  /** Gold. */
  glowgold: soft([1.0, 0.78, 0.22], { strength: 1.5, grade: { shadows: [0.06, 0.04, 0.01], contrast: 1.2, mid: 0.34 } }),
  /** Ultraviolet. */
  glowuv: neon([[0.3, 0.02, 0.95], [0.95, 0.3, 1.0]] as const, { grade: { shadows: [0.03, 0.0, 0.1], contrast: 1.45, mid: 0.5 } }),
  /** Toxic green. */
  glowtoxic: neon([0.3, 1.0, 0.15], { grade: { shadows: [0.01, 0.05, 0.01], contrast: 1.4, mid: 0.48 } }),
  /** Red alert. */
  glowred: neon([1.0, 0.05, 0.08], { strength: 2.05, grade: { shadows: [0.06, 0.0, 0.01], contrast: 1.5, mid: 0.52 } }),
  /** Sunset peach. */
  glowpeach: soft([[1.0, 0.4, 0.28], [1.0, 0.85, 0.5]] as const, { radius: 62, strength: 1.5 }),
  /** Ice blue. */
  glowice: soft([0.45, 0.82, 1.0], { threshold: 0.34, grade: { shadows: [0.03, 0.06, 0.14], contrast: 1.22, mid: 0.36 } }),
  /** Rainbow prism: large chroma split. */
  glowprism: neon([[1.0, 0.15, 0.35], [0.15, 0.85, 1.0]] as const, { chroma: 1.1, radius: 52, strength: 1.9 }),
  /** Dream: pastel haze, wide soft bloom. */
  glowdream: soft([[1.0, 0.72, 0.9], [0.72, 0.9, 1.0]] as const, {
    threshold: 0.22, radius: 72, strength: 1.65,
    grade: { shadows: [0.12, 0.1, 0.18], contrast: 1.05, mid: 0.22 },
  }),
  /** Noir: crushed blacks, hard white glow. */
  glownoir: {
    tint: WHITE, threshold: 0.42, radius: 42, strength: 1.9,
    grade: { shadows: [0.0, 0.0, 0.02], contrast: 1.6, mid: 0.58 },
  },
  /** Club: dark with pink and blue glow by position. */
  glowclub: neon([1.0, 0.15, 0.7], {
    club: true, strength: 2.1, radius: 50,
    grade: { shadows: [0.01, 0.0, 0.07], contrast: 1.5, mid: 0.55 },
  }),
  /** Soft mist: pale wide haze. */
  glowmist: soft([0.82, 0.9, 1.0], { threshold: 0.28, radius: 70, strength: 1.25, grade: { shadows: [0.08, 0.1, 0.14], contrast: 1.1, mid: 0.26 } }),
  /** Soft lilac bloom. */
  glowlilac: soft([0.72, 0.48, 1.0], { strength: 1.4, grade: { shadows: [0.08, 0.04, 0.14], contrast: 1.18, mid: 0.32 } }),
  /** Soft rose. */
  glowrose: soft([1.0, 0.48, 0.6], { strength: 1.4, grade: { shadows: [0.1, 0.04, 0.06], contrast: 1.18, mid: 0.32 } }),
};

const luma = (r: number, g: number, b: number) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const softClip = (x: number) => x / (1 + Math.max(0, x - 0.85) * 1.4);

/** Grade a picture colour the way the glow shader does (0-255 in, 0-1 out). */
export function glowGrade(style: GlowStyle, r: number, g: number, b: number): [number, number, number] {
  const { shadows, contrast = 1.2, mid = 0.25 } = style.grade;
  const rgb = [r, g, b].map(value => clamp(((value / 255) - 0.5) * contrast + 0.5));
  const light = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  const shadowed = rgb.map((channel, i) => channel * (0.35 + 0.45 * light) + shadows[i] * (1 - light) * 0.7);
  const pulled = shadowed.map(channel => channel * (1 - mid * (0.55 + 0.45 * (1 - Math.abs(2 * light - 1)))));
  // Keep the base clearly below the original so the bloom is what you see.
  return pulled.map(channel => clamp(channel * 0.72)) as [number, number, number];
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
  // Brightness squared approximates the blur; strength is high so the tint reads as the look.
  const glow = Math.pow(amount, 0.9) * (style.strength ?? 1.6) * 0.9;
  const tint = glowTint(style, light);
  return [0, 1, 2].map(i => {
    const bloom = tint[i] * glow;
    const screened = 1 - (1 - base[i]) * (1 - clamp(bloom));
    return softClip(base[i] + bloom * 0.85 * 0.35 + screened * 0.65) * 255;
  }) as [number, number, number];
}
