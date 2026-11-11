/**
 * ASCII: how every colouring is made, in plain code with no drawing in it. The shader (live-look.ts) is written from these tables, and the palette reader
 * (live-look-ramp.ts, which picks the lyric ink and the scrim) runs the same colour maths, so the type is chosen against the picture as it is seen.
 *
 * A colouring picks a character ramp, an ink and a paper. Characters are 5×7 bitmaps (no font file). One effect, as many colourings as we care to write
 * down: a new colouring is one entry here, an id in `live-look-deal.ts`, a builder in `live-look.ts` and an id in the worker.
 */
import type { AsciiLookId } from './live-look-deal';

export type Rgb = readonly [number, number, number];

/** Character ramp: denser glyphs as the index rises (or falls when inverted). */
export type AsciiRamp = 'density' | 'binary' | 'blocks' | 'dots' | 'slash' | 'mumoo';

export type AsciiStyle = {
  ramp: AsciiRamp;
  /** Ink colour, or the picture's own colour when `'picture'`. */
  ink: Rgb | 'picture';
  paper: Rgb;
  /** How many character columns across the picture. Default 80. */
  cols?: number;
  /** Denser characters where the picture is darker (typewriter). */
  invert?: boolean;
  /** Matrix rain: columns scroll downward. */
  rain?: boolean;
};

/** One glyph as seven row masks (5 bits, bit 4 = left). */
export type Glyph = readonly [number, number, number, number, number, number, number];

const g = (rows: Glyph): Glyph => rows;

/** Shared atlas: index matches the ramp tables below. */
export const ASCII_GLYPHS = {
  space: g([0, 0, 0, 0, 0, 0, 0]),
  dot: g([0, 0, 0, 0, 0, 4, 0]),
  colon: g([0, 4, 0, 0, 0, 4, 0]),
  dash: g([0, 0, 0, 31, 0, 0, 0]),
  equals: g([0, 0, 31, 0, 31, 0, 0]),
  plus: g([0, 4, 4, 31, 4, 4, 0]),
  star: g([0, 21, 14, 4, 14, 21, 0]),
  hash: g([10, 31, 10, 10, 31, 10, 0]),
  percent: g([25, 26, 4, 4, 11, 19, 0]),
  at: g([14, 17, 23, 21, 23, 16, 14]),
  zero: g([14, 17, 19, 21, 25, 17, 14]),
  one: g([4, 12, 4, 4, 4, 4, 14]),
  block1: g([0, 0, 0, 0, 0, 0, 31]),
  block2: g([0, 0, 0, 0, 31, 31, 31]),
  block3: g([0, 0, 31, 31, 31, 31, 31]),
  block4: g([31, 31, 31, 31, 31, 31, 31]),
  dot1: g([0, 0, 0, 4, 0, 0, 0]),
  dot2: g([0, 0, 14, 14, 14, 0, 0]),
  dot3: g([0, 14, 31, 31, 31, 14, 0]),
  dot4: g([14, 31, 31, 31, 31, 31, 14]),
  slash: g([1, 2, 4, 4, 8, 16, 0]),
  backslash: g([16, 8, 4, 4, 2, 1, 0]),
  pipe: g([4, 4, 4, 4, 4, 4, 4]),
  under: g([0, 0, 0, 0, 0, 0, 31]),
  M: g([17, 27, 21, 17, 17, 17, 17]),
  U: g([17, 17, 17, 17, 17, 17, 14]),
  O: g([14, 17, 17, 17, 17, 17, 14]),
} as const;

export type GlyphId = keyof typeof ASCII_GLYPHS;

/** Ramp tables: glyph ids ordered light → dark ink (index 0 = sparsest). */
export const ASCII_RAMPS: Record<AsciiRamp, readonly GlyphId[]> = {
  density: ['space', 'dot', 'colon', 'dash', 'equals', 'plus', 'star', 'hash', 'percent', 'at'],
  binary: ['zero', 'one'],
  blocks: ['space', 'block1', 'block2', 'block3', 'block4'],
  dots: ['space', 'dot1', 'dot2', 'dot3', 'dot4'],
  slash: ['space', 'under', 'dash', 'slash', 'backslash', 'pipe', 'hash'],
  mumoo: ['space', 'dot', 'O', 'U', 'M', 'hash', 'at'],
};

const inkCoverage = (glyph: Glyph) => glyph.reduce((sum, row) => {
  let bits = 0;
  for (let i = 0; i < 5; i++) if ((row >> i) & 1) bits++;
  return sum + bits;
}, 0) / 35;

/** Average ink coverage (0-1) for each ramp step, light → dense. */
export const ASCII_COVERAGE = (Object.keys(ASCII_RAMPS) as AsciiRamp[]).reduce((out, ramp) => {
  out[ramp] = ASCII_RAMPS[ramp].map(id => inkCoverage(ASCII_GLYPHS[id]));
  return out;
}, {} as Record<AsciiRamp, readonly number[]>);

const terminal = (ink: Rgb | 'picture', extra: Partial<AsciiStyle> = {}): AsciiStyle => ({
  ramp: 'density', ink, paper: [0.02, 0.03, 0.04], cols: 80, ...extra,
});

export const ASCII_STYLES: Record<AsciiLookId, AsciiStyle> = {
  /** Green phosphor terminal. */
  asciigreen: terminal([0.2, 1.0, 0.35]),
  /** Amber CRT. */
  asciiamber: terminal([1.0, 0.7, 0.15], { paper: [0.04, 0.02, 0.0] }),
  /** White on black. */
  asciiwhite: terminal([0.92, 0.94, 0.96]),
  /** Typewriter: black on paper, denser in the dark. */
  asciitype: { ramp: 'density', ink: [0.08, 0.07, 0.06], paper: [0.93, 0.9, 0.82], cols: 72, invert: true },
  /** Picture colours on black. */
  asciicolour: terminal('picture', { cols: 72 }),
  /** Cyan code editor. */
  asciicyan: terminal([0.2, 0.95, 1.0], { paper: [0.02, 0.05, 0.08] }),
  /** Hot pink on navy. */
  asciipink: terminal([1.0, 0.25, 0.7], { paper: [0.04, 0.02, 0.18] }),
  /** Blueprint: white on blue. */
  asciiblueprint: { ramp: 'density', ink: [0.85, 0.92, 1.0], paper: [0.05, 0.18, 0.45], cols: 76 },
  /** Matrix rain. */
  asciimatrix: terminal([0.15, 1.0, 0.4], { rain: true, cols: 64 }),
  /** Red alert. */
  asciired: terminal([1.0, 0.12, 0.1], { paper: [0.06, 0.0, 0.0] }),
  /** Gold on black. */
  asciigold: terminal([1.0, 0.82, 0.25]),
  /** Ice on deep blue. */
  asciiice: terminal([0.7, 0.9, 1.0], { paper: [0.02, 0.05, 0.12] }),
  /** Newsprint grey. */
  asciinews: { ramp: 'density', ink: [0.2, 0.2, 0.22], paper: [0.88, 0.88, 0.84], cols: 84, invert: true },
  /** Sunset terminal: orange on purple. */
  asciisunset: terminal([1.0, 0.45, 0.15], { paper: [0.12, 0.02, 0.22] }),
  /** Binary 01. */
  asciibinary: terminal([0.3, 1.0, 0.45], { ramp: 'binary', cols: 70 }),
  /** Block shades. */
  asciiblocks: terminal([0.95, 0.95, 0.9], { ramp: 'blocks', cols: 56 }),
  /** Slash field. */
  asciislash: terminal([0.85, 0.95, 1.0], { ramp: 'slash', cols: 70 }),
  /** MUMOO letters by brightness. */
  asciimumoo: terminal([1.0, 0.85, 0.3], { ramp: 'mumoo', cols: 64 }),
};

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const luma = (r: number, g: number, b: number) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

/**
 * A pixel of ASCII as it averages over a cell (0-255 in and out): paper mixed toward ink by the ramp's average coverage at this brightness.
 */
export function asciiAverage(look: AsciiLookId, r: number, g: number, b: number): [number, number, number] {
  const style = ASCII_STYLES[look];
  const light = luma(r, g, b);
  const tone = style.invert ? 1 - light : light;
  const coverage = ASCII_COVERAGE[style.ramp];
  const x = tone * (coverage.length - 1);
  const i = Math.min(coverage.length - 2, Math.max(0, Math.floor(x)));
  const t = x - i;
  const dens = coverage[i]! + (coverage[i + 1]! - coverage[i]!) * t;
  const paper = style.paper;
  const ink = style.ink === 'picture'
    ? [clamp(r / 255), clamp(g / 255), clamp(b / 255)] as Rgb
    : style.ink;
  return [0, 1, 2].map(c => clamp(paper[c]! + (ink[c]! - paper[c]!) * dens) * 255) as [number, number, number];
}
