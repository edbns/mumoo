/**
 * Depth: how every colouring is made, in plain code with no drawing in it. The far/near shaders (live-look.ts) and the bank world's
 * two-layer motion are written from these tables; the palette reader (live-look-ramp.ts) runs the same colour maths without the mask.
 *
 * Phase 1: the far layer is the full picture (graded, optionally blurred / fogged); the near layer is the cut-out subject on top,
 * shifted the other way on the beat. One effect, as many colourings as we care to write down.
 */
import type { DepthLookId } from './live-look-deal';

export type Rgb = readonly [number, number, number];

export type DepthStyle = {
  far: { shadows: Rgb; contrast?: number; mid?: number; /** Desaturate the far layer (0-1). */ grey?: number; /** Mix toward this fog colour (0-1). */ fog?: Rgb; fogAmount?: number; /** Blur radius in rows of the picture height. */ blur?: number };
  near: { shadows: Rgb; contrast?: number; mid?: number; /** Paint the subject a flat colour (silhouette). */ flat?: Rgb; /** Neon edge tint. */ outline?: Rgb };
  /** How hard near and far push apart on the beat (pixels at full frame). Default 18. */
  push?: number;
  /** Slow sway amplitude. Default 10. */
  sway?: number;
  /** Extra far zoom (0-0.2). Default 0.04; zoom pulse uses more. */
  farZoom?: number;
  /** Echo: trailing copies of the subject. */
  echo?: boolean;
  /** Soft spotlight behind the subject on the far layer. */
  spot?: boolean;
};

const coolFar = (extra: Partial<DepthStyle['far']> = {}): DepthStyle['far'] => ({
  shadows: [0.02, 0.05, 0.12], contrast: 1.15, mid: 0.28, grey: 0.15, ...extra,
});
const warmNear = (extra: Partial<DepthStyle['near']> = {}): DepthStyle['near'] => ({
  shadows: [0.08, 0.03, 0.01], contrast: 1.2, mid: 0.18, ...extra,
});

export const DEPTH_STYLES: Record<DepthLookId, DepthStyle> = {
  /** Far fades into mist. */
  depthfog: {
    far: { shadows: [0.12, 0.14, 0.18], contrast: 1.05, mid: 0.22, fog: [0.72, 0.78, 0.86], fogAmount: 0.55, blur: 28 },
    near: warmNear(), push: 20, sway: 12, farZoom: 0.05,
  },
  /** Tilt-shift: far blurred hard. */
  depthtilt: {
    far: { shadows: [0.04, 0.04, 0.06], contrast: 1.2, mid: 0.3, blur: 48, grey: 0.1 },
    near: { shadows: [0.02, 0.02, 0.03], contrast: 1.25, mid: 0.12 }, push: 16, sway: 8, farZoom: 0.03,
  },
  /** Warm near / cool far. */
  depthwarm: {
    far: coolFar({ fog: [0.35, 0.5, 0.75], fogAmount: 0.28, blur: 22 }),
    near: warmNear({ shadows: [0.12, 0.04, 0.01] }), push: 22, sway: 14, farZoom: 0.05,
  },
  /** Silhouette: near black against a lifted far. */
  depthsilhouette: {
    far: { shadows: [0.15, 0.12, 0.1], contrast: 1.35, mid: 0.15, fog: [1.0, 0.92, 0.82], fogAmount: 0.35 },
    near: { shadows: [0, 0, 0], contrast: 1, mid: 0, flat: [0.02, 0.02, 0.03] }, push: 24, sway: 10, farZoom: 0.06,
  },
  /** Neon outline around the subject. */
  depthneon: {
    far: { shadows: [0.01, 0.0, 0.08], contrast: 1.3, mid: 0.4, grey: 0.2, blur: 18 },
    near: { shadows: [0.02, 0.01, 0.05], contrast: 1.15, mid: 0.2, outline: [0.2, 1.0, 0.85] }, push: 18, sway: 12, farZoom: 0.04,
  },
  /** Echo: trailing copies of the subject on the beat. */
  depthecho: {
    far: { shadows: [0.03, 0.02, 0.06], contrast: 1.2, mid: 0.32, blur: 20, grey: 0.25 },
    near: warmNear({ outline: [1.0, 0.4, 0.8] }), push: 28, sway: 8, farZoom: 0.04, echo: true,
  },
  /** Zoom pulse: far layer zooms on the beat. */
  depthzoom: {
    far: { shadows: [0.04, 0.03, 0.05], contrast: 1.25, mid: 0.28, blur: 16 },
    near: warmNear(), push: 14, sway: 6, farZoom: 0.12,
  },
  /** Dream: pastel soft far. */
  depthdream: {
    far: { shadows: [0.18, 0.14, 0.22], contrast: 0.95, mid: 0.12, fog: [0.92, 0.82, 0.95], fogAmount: 0.4, blur: 36 },
    near: { shadows: [0.1, 0.06, 0.1], contrast: 1.05, mid: 0.1 }, push: 14, sway: 16, farZoom: 0.05,
  },
  /** Gold far. */
  depthgold: {
    far: { shadows: [0.12, 0.06, 0.0], contrast: 1.2, mid: 0.25, fog: [0.95, 0.75, 0.25], fogAmount: 0.45, blur: 24 },
    near: { shadows: [0.04, 0.02, 0.01], contrast: 1.18, mid: 0.15 }, push: 18, sway: 12, farZoom: 0.05,
  },
  /** Noir: black-and-white far, colour near. */
  depthnoir: {
    far: { shadows: [0.0, 0.0, 0.02], contrast: 1.45, mid: 0.4, grey: 1, blur: 14 },
    near: { shadows: [0.05, 0.02, 0.02], contrast: 1.2, mid: 0.15 }, push: 20, sway: 10, farZoom: 0.04,
  },
  /** Spotlight: dark far, soft light behind the subject. */
  depthspot: {
    far: { shadows: [0.0, 0.0, 0.02], contrast: 1.35, mid: 0.55, blur: 20 },
    near: warmNear(), push: 16, sway: 10, farZoom: 0.04, spot: true,
  },
  /** Double exposure: far tinted toward a second cast. */
  depthdouble: {
    far: { shadows: [0.08, 0.0, 0.15], contrast: 1.25, mid: 0.3, fog: [0.55, 0.15, 0.75], fogAmount: 0.5, blur: 22 },
    near: { shadows: [0.02, 0.05, 0.08], contrast: 1.15, mid: 0.18 }, push: 22, sway: 14, farZoom: 0.05,
  },
  /** Cool ice depth. */
  depthice: {
    far: { shadows: [0.02, 0.06, 0.14], contrast: 1.15, mid: 0.28, fog: [0.65, 0.85, 1.0], fogAmount: 0.35, blur: 26 },
    near: { shadows: [0.02, 0.05, 0.1], contrast: 1.15, mid: 0.16 }, push: 18, sway: 12, farZoom: 0.04,
  },
  /** Ember: warm fog far, hot near. */
  depthember: {
    far: { shadows: [0.1, 0.02, 0.0], contrast: 1.25, mid: 0.35, fog: [0.9, 0.25, 0.05], fogAmount: 0.4, blur: 24 },
    near: { shadows: [0.1, 0.03, 0.0], contrast: 1.22, mid: 0.14, outline: [1.0, 0.45, 0.1] }, push: 20, sway: 11, farZoom: 0.05,
  },
};

const clamp = (x: number) => Math.min(1, Math.max(0, x));

function grade(layer: { shadows: Rgb; contrast?: number; mid?: number; grey?: number; fog?: Rgb; fogAmount?: number }, r: number, g: number, b: number): [number, number, number] {
  const { shadows, contrast = 1.15, mid = 0.25, grey = 0, fog, fogAmount = 0 } = layer;
  let rgb = [r, g, b].map(value => clamp(((value / 255) - 0.5) * contrast + 0.5));
  const light = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  rgb = rgb.map((channel, i) => channel * (0.4 + 0.6 * light) + shadows[i] * (1 - light) * 0.7);
  rgb = rgb.map(channel => channel * (1 - mid * (0.5 + 0.5 * (1 - Math.abs(2 * light - 1)))));
  if (grey > 0) {
    const l = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
    rgb = rgb.map(channel => channel + (l - channel) * grey);
  }
  if (fog && fogAmount > 0) rgb = rgb.map((channel, i) => channel + (fog[i] - channel) * fogAmount);
  return rgb.map(clamp) as [number, number, number];
}

/**
 * A pixel of Depth as it averages over a cell (0-255 in and out): far grade lifted 20% toward the near grade (the mask is not available here).
 */
export function depthAverage(look: DepthLookId, r: number, g: number, b: number): [number, number, number] {
  const style = DEPTH_STYLES[look];
  const far = grade(style.far, r, g, b);
  const near = style.near.flat
    ? [...style.near.flat] as [number, number, number]
    : grade(style.near, r, g, b);
  return [0, 1, 2].map(i => clamp(far[i] + (near[i] - far[i]) * 0.2) * 255) as [number, number, number];
}
