/**
 * Dither: how every colouring is made, in plain code with no drawing in it. The shader (live-look.ts) is written from these tables, and the palette reader
 * (live-look-ramp.ts, which picks the lyric ink and the scrim) runs the same colour maths, so the type is chosen against the picture as it is seen.
 *
 * A colouring is a palette of flat colours (darkest first, brightest last) and a threshold matrix. The picture is reduced to chunky square blocks; each
 * block's brightness picks the two nearest palette colours, and the matrix decides which of the two is drawn. One effect, as many colourings as we care
 * to write down: a new colouring is one entry here, an id in `live-look-deal.ts`, a builder in `live-look.ts` and an id in the worker.
 */
import type { DitherLookId } from './live-look-deal';

export type Rgb = readonly [number, number, number];

/** Ordered dither matrix, or a noise / diagonal-line threshold. */
export type DitherMatrix = 'bayer2' | 'bayer4' | 'bayer8' | 'noise' | 'diagonal';

/**
 * `'own8'` / `'own16'`: the picture's own colours reduced to 8 or 16 by quantising each channel (1 bit, or ~2 bits) with the same threshold.
 * Otherwise a fixed palette, darkest first, brightest last.
 */
export type DitherStyle = {
  palette: readonly Rgb[] | 'own8' | 'own16';
  matrix: DitherMatrix;
  /** How many rows of blocks the picture's height holds. Default 120. */
  rows?: number;
  /** How hard the light and dark parts are pushed apart before the threshold. Default 1. */
  contrast?: number;
  /** Soft posterise of the tone into this many bands before the palette is read (shader leans on it; average uses it lightly). Default equals the palette span. */
  levels?: number;
};

const BLACK: Rgb = [0.0, 0.0, 0.0];
const WHITE: Rgb = [1.0, 1.0, 1.0];

const two = (dark: Rgb, light: Rgb, matrix: DitherMatrix = 'bayer8', extra: Partial<DitherStyle> = {}): DitherStyle => ({
  palette: [dark, light], matrix, ...extra,
});

export const DITHER_STYLES: Record<DitherLookId, DitherStyle> = {
  /** 1-bit black on white, as an early Mac. */
  dithermac: two(BLACK, WHITE, 'bayer8', { rows: 140, contrast: 1.15 }),
  /** 1-bit white on black: the negative of Mac classic (dark parts of the picture become white). */
  ditherinvert: two(WHITE, BLACK, 'bayer8', { rows: 140, contrast: 1.15 }),
  /** Four greens of a Game Boy. */
  dithergameboy: {
    palette: [[0.06, 0.16, 0.06], [0.19, 0.38, 0.19], [0.55, 0.67, 0.21], [0.81, 0.89, 0.42]],
    matrix: 'bayer4', rows: 100, contrast: 1.1,
  },
  /** CGA palette 1: black, magenta, cyan, white. */
  dithercga: {
    palette: [BLACK, [0.0, 0.67, 0.67], [0.67, 0.0, 0.67], WHITE],
    matrix: 'bayer4', rows: 100,
  },
  /** CGA green monitor: black and green. */
  dithercgagreen: two(BLACK, [0.13, 0.85, 0.2], 'bayer4', { rows: 110 }),
  /** EGA: a short 16-colour set, kept to sixteen. */
  ditherega: {
    palette: [
      BLACK, [0.0, 0.0, 0.67], [0.0, 0.67, 0.0], [0.0, 0.67, 0.67],
      [0.67, 0.0, 0.0], [0.67, 0.0, 0.67], [0.67, 0.33, 0.0], [0.67, 0.67, 0.67],
      [0.33, 0.33, 0.33], [0.33, 0.33, 1.0], [0.33, 1.0, 0.33], [0.33, 1.0, 1.0],
      [1.0, 0.33, 0.33], [1.0, 0.33, 1.0], [1.0, 1.0, 0.33], WHITE,
    ],
    matrix: 'bayer8', rows: 110,
  },
  /** Commodore 64: the classic sixteen, ordered by brightness. */
  ditherc64: {
    palette: [
      BLACK, [0.25, 0.15, 0.09], [0.35, 0.16, 0.15], [0.0, 0.25, 0.4],
      [0.4, 0.22, 0.18], [0.35, 0.35, 0.35], [0.42, 0.42, 0.42], [0.47, 0.27, 0.2],
      [0.55, 0.4, 0.25], [0.42, 0.55, 0.25], [0.6, 0.35, 0.35], [0.42, 0.55, 0.65],
      [0.7, 0.7, 0.7], [0.65, 0.8, 0.45], [0.75, 0.65, 0.55], WHITE,
    ],
    matrix: 'bayer8', rows: 100,
  },
  /** Apple II hi-res: black, green, purple, orange, blue, white. */
  ditherapple2: {
    palette: [BLACK, [0.1, 0.55, 0.15], [0.55, 0.1, 0.55], [0.85, 0.4, 0.1], [0.15, 0.35, 0.85], WHITE],
    matrix: 'bayer4', rows: 100, contrast: 1.05,
  },
  /** PICO-8's sixteen. */
  ditherpico8: {
    palette: [
      BLACK, [0.11, 0.17, 0.33], [0.49, 0.15, 0.33], [0.0, 0.51, 0.32],
      [0.67, 0.32, 0.21], [0.37, 0.34, 0.31], [0.76, 0.76, 0.78], [1.0, 0.95, 0.91],
      [1.0, 0.0, 0.3], [1.0, 0.64, 0.0], [1.0, 0.93, 0.15], [0.0, 0.89, 0.21],
      [0.16, 0.68, 1.0], [0.51, 0.46, 0.61], [1.0, 0.47, 0.66], [1.0, 0.8, 0.67],
    ],
    matrix: 'bayer8', rows: 100,
  },
  /** Amiga Workbench: a short bright set. */
  ditheramiga: {
    palette: [BLACK, [0.0, 0.0, 0.6], [0.6, 0.0, 0.0], [0.0, 0.6, 0.0], [0.6, 0.6, 0.0], [0.0, 0.6, 0.6], [0.9, 0.9, 0.9], WHITE],
    matrix: 'bayer8', rows: 95,
  },
  /** Thermal receipt: black on warm cream, diagonal lines. */
  ditherreceipt: two([0.08, 0.07, 0.05], [0.96, 0.93, 0.82], 'diagonal', { rows: 130, contrast: 1.2 }),
  /** Blueprint: white marks on Prussian blue. */
  ditherblueprint: two([0.04, 0.16, 0.34], [0.92, 0.96, 1.0], 'bayer4', { rows: 120 }),
  /** Amber CRT. */
  ditheramber: {
    palette: [[0.04, 0.02, 0.0], [0.35, 0.16, 0.02], [0.75, 0.42, 0.08], [1.0, 0.78, 0.28]],
    matrix: 'bayer8', rows: 110, contrast: 1.1,
  },
  /** Four warm sunset colours. */
  dithersunset: {
    palette: [[0.12, 0.04, 0.18], [0.55, 0.12, 0.28], [0.95, 0.4, 0.18], [1.0, 0.85, 0.45]],
    matrix: 'bayer4', rows: 100,
  },
  /** Vapor: purple, pink, cyan on near-black. */
  dithervapor: {
    palette: [[0.05, 0.0, 0.12], [0.45, 0.1, 0.7], [0.95, 0.3, 0.65], [0.2, 0.9, 0.95]],
    matrix: 'bayer4', rows: 100,
  },
  /** Forest: deep greens and a pale leaf. */
  ditherforest: {
    palette: [[0.04, 0.08, 0.04], [0.1, 0.28, 0.12], [0.25, 0.5, 0.22], [0.7, 0.85, 0.45]],
    matrix: 'bayer4', rows: 110,
  },
  /** Newspaper duotone: charcoal on newsprint. */
  dithernews: two([0.1, 0.1, 0.11], [0.82, 0.8, 0.74], 'diagonal', { rows: 125, contrast: 1.15 }),
  /** Neon: black, hot pink, cyan. */
  ditherneon: {
    palette: [BLACK, [1.0, 0.1, 0.55], [0.1, 0.95, 1.0]],
    matrix: 'bayer4', rows: 100, contrast: 1.1,
  },
  /** Gold on black. */
  dithergold: two([0.04, 0.03, 0.02], [0.95, 0.74, 0.25], 'bayer4', { rows: 110 }),
  /** The picture's own colours, reduced to sixteen by channel quantisation. */
  ditherown: { palette: 'own16', matrix: 'bayer8', rows: 100, contrast: 1.05, levels: 4 },
};

const luma = (r: number, g: number, b: number) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
const clamp = (x: number) => Math.min(1, Math.max(0, x));

/** Tone of a picture colour after contrast (and soft levels), 0-1. */
export function ditherTone(style: DitherStyle, r: number, g: number, b: number): number {
  let tone = clamp((luma(r, g, b) - 0.5) * (style.contrast ?? 1) + 0.5);
  const levels = style.levels;
  if (levels && levels > 1) {
    const band = Math.floor(tone * levels);
    const into = tone * levels - band;
    tone = (band + into) / levels;
  }
  return clamp(tone);
}

/**
 * A pixel of the dither as it averages over a cell (0-255 in and out): the expected colour of a tone with a threshold matrix is a mix of the two
 * nearest palette colours in the proportion of the tone, which is the same as sampling a gradient through the palette by brightness. The matrix, the
 * beat and the hard block edges are in the shader only.
 */
export function ditherAverage(look: DitherLookId, r: number, g: number, b: number): [number, number, number] {
  const style = DITHER_STYLES[look];
  const { palette } = style;
  if (palette === 'own8' || palette === 'own16') {
    const steps = palette === 'own8' ? 1 : 3;
    const q = 1 / steps;
    const contrast = style.contrast ?? 1;
    const channel = (value: number) => {
      const shaped = clamp(((value / 255) - 0.5) * contrast + 0.5);
      return Math.round(shaped / q) * q * 255;
    };
    return [channel(r), channel(g), channel(b)];
  }
  const tone = ditherTone(style, r, g, b);
  if (palette.length === 1) return [palette[0][0] * 255, palette[0][1] * 255, palette[0][2] * 255];
  const x = tone * (palette.length - 1);
  const i = Math.min(palette.length - 2, Math.floor(x));
  const f = x - i;
  const a = palette[i];
  const c = palette[i + 1];
  return [
    (a[0] + (c[0] - a[0]) * f) * 255,
    (a[1] + (c[1] - a[1]) * f) * 255,
    (a[2] + (c[2] - a[2]) * f) * 255,
  ];
}
