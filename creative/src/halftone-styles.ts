/**
 * Halftone: how every print is made, in plain code with no drawing in it. The shader (live-look.ts) is written from these tables, and the palette reader
 * (live-look-ramp.ts, which picks the lyric ink and the scrim) runs the same colour maths, so the type is chosen against the print as it is seen.
 *
 * A print is a paper and one or more screens. Each screen is a grid of marks (dots, squares or lines) laid at its own angle, in its own ink, and the
 * mark grows where the picture has what that screen is about (`channel`): the dark parts, the light parts, the middle tones, or one of the four process
 * inks (cyan, magenta, yellow, black). Inks are laid one over another the way a printer does it (`blend`).
 * One effect, as many prints as we care to write down: a new print is one entry here, an id in `live-look-deal.ts`, a builder in `live-look.ts` and an id in the worker.
 */
import type { HalftoneLookId } from './live-look-deal';

export type Rgb = readonly [number, number, number];

/** What a screen is about: how much of a cell its mark covers is read from this part of the picture. */
export type Channel = 'dark' | 'light' | 'mid' | 'cyan' | 'magenta' | 'yellow' | 'black';

export type Screen = {
  /** `'own'`: the picture's own colour, richer (`sat`) and darker or brighter (`gain`) as a printer's ink is. `'poster'`: the picture's colour as one of a few flat inks (red, yellow, blue, black, white). Or one flat colour. */
  ink: 'own' | 'poster' | Rgb;
  /** Default `dark`. */
  channel?: Channel;
  /** The angle of the grid in degrees. Default 15. Colour printing turns each ink to its own angle so the dots do not clash. */
  angle?: number;
  /** `round` dots; `square` marks (turn them 45 degrees for diamonds); `line` parallel lines that thicken; `wave` the same lines, gently waving. Default `round`. */
  shape?: 'round' | 'square' | 'line' | 'wave';
  /**
   * How this ink lies on what is already printed. `cover`: it hides it (one ink on paper, or light dots on a dark card). `multiply`: it is transparent, so
   * where two inks meet they make a third colour. `screen`: it glows, so where two inks meet they brighten. Default `cover`.
   */
  blend?: 'cover' | 'multiply' | 'screen';
  /** The screen is shifted by this much of a cell, so it is slightly out of register with the others. */
  offset?: readonly [number, number];
  /** The mark appears only where the channel is above this (0-1); crosshatch lays its darker hatches only in the darker parts. */
  from?: number;
  /** A mark of one size (a fraction of the cell) wherever the picture has colour, instead of one that grows with the channel (Ben-Day dots). */
  fixed?: number;
  /** For the picture's own ink. Defaults 1.4 and 0.55. */
  sat?: number;
  gain?: number;
};

export type HalftoneStyle = {
  paper: Rgb;
  screens: readonly Screen[];
  /** How many rows of marks the picture's height holds. Default 100. A fine screen (manga) has more; a coarse poster, fewer. */
  rows?: number;
  /** Grain in the paper (0-1). Shader only. */
  grain?: number;
  /** Wear: blotches in the paper and specks of ink missing (0-1). Shader only. */
  distress?: number;
  /** How hard the light and dark parts are pushed apart before the marks are sized. Default 1. */
  contrast?: number;
};

const CREAM: Rgb = [0.96, 0.93, 0.86];
const BLACK: Rgb = [0.05, 0.05, 0.06];

/** The four process inks, a little muted as they are on newsprint. */
const CYAN: Rgb = [0.0, 0.62, 0.86];
const MAGENTA: Rgb = [0.9, 0.12, 0.5];
const YELLOW: Rgb = [1.0, 0.9, 0.1];

/** A single ink on paper, or (`light`) a single ink on a dark card. */
const one = (paper: Rgb, ink: Rgb, extra: Partial<HalftoneStyle> = {}, light = false): HalftoneStyle => ({
  paper, screens: [{ ink, ...(light ? { channel: 'light' as const } : {}) }], ...extra,
});

export const HALFTONE_STYLES: Record<HalftoneLookId, HalftoneStyle> = {
  // The first set: one ink on one paper.
  halftone: { paper: CREAM, screens: [{ ink: 'own' }] },
  halftonebw: one([0.98, 0.98, 0.97], BLACK),
  halftonenews: one([0.82, 0.8, 0.74], [0.1, 0.1, 0.11]),
  halftoneblue: one([0.95, 0.96, 0.98], [0.06, 0.16, 0.5]),
  halftonered: one(CREAM, [0.82, 0.1, 0.12]),
  halftonepink: one([0.97, 0.94, 0.9], [0.95, 0.25, 0.55]),
  halftoneteal: one([0.96, 0.95, 0.9], [0.0, 0.5, 0.52]),
  halftonepop: { paper: [1.0, 0.93, 0.45], screens: [{ ink: 'own', sat: 2.2, gain: 0.85 }] },
  halftoneneon: { paper: [0.03, 0.02, 0.06], screens: [{ ink: 'own', channel: 'light', sat: 2.0, gain: 1.35 }] },
  halftoneinvert: one([0.03, 0.03, 0.04], [0.97, 0.97, 0.95], {}, true),
  halftonegold: one([0.04, 0.03, 0.02], [0.95, 0.74, 0.25], {}, true),

  // Print and analog media.
  /** Cyan, magenta, yellow and black on their own press angles, laid over each other on warm newsprint. */
  halftonecmyk: {
    paper: [0.95, 0.92, 0.83], rows: 90, grain: 0.05,
    screens: [
      { ink: CYAN, channel: 'cyan', angle: 15, blend: 'multiply' },
      { ink: MAGENTA, channel: 'magenta', angle: 75, blend: 'multiply' },
      { ink: YELLOW, channel: 'yellow', angle: 0, blend: 'multiply' },
      { ink: [0.08, 0.07, 0.09], channel: 'black', angle: 45, blend: 'multiply' },
    ],
  },
  /** Two fluorescent inks, pink and royal blue, overlapping on textured ivory, as an indie zine is printed. */
  halftoneriso: {
    paper: [0.97, 0.95, 0.88], rows: 85, grain: 0.1, distress: 0.2,
    screens: [
      { ink: [0.0, 0.3, 0.88], channel: 'dark', angle: 75, blend: 'multiply' },
      { ink: [1.0, 0.3, 0.58], channel: 'mid', angle: 15, blend: 'multiply', offset: [0.12, -0.08] },
    ],
  },
  /** White dots on deep Prussian blue, as an architect's schematic. */
  halftoneblueprint: { paper: [0.04, 0.16, 0.34], rows: 100, grain: 0.04, screens: [{ ink: [0.92, 0.96, 1.0], channel: 'light' }] },
  /** Dark brown ink on aged tan parchment, a nineteenth-century photograph. */
  halftonesepia: { paper: [0.82, 0.7, 0.5], rows: 100, grain: 0.1, distress: 0.35, screens: [{ ink: [0.25, 0.13, 0.06] }] },
  /** Very fine, very dense black dots, hard contrast, on bright white. */
  halftonemanga: { paper: [0.99, 0.99, 0.98], rows: 230, contrast: 1.7, screens: [{ ink: [0.03, 0.03, 0.04], angle: 45 }] },
  /** Big red, yellow and black dots, each a little out of register, on worn beige paper. */
  halftonesubway: {
    paper: [0.86, 0.8, 0.67], rows: 55, grain: 0.12, distress: 0.8,
    screens: [
      { ink: [1.0, 0.78, 0.05], channel: 'yellow', angle: 0, blend: 'multiply', offset: [0.28, -0.2] },
      { ink: [0.88, 0.12, 0.1], channel: 'magenta', angle: 75, blend: 'multiply', offset: [-0.22, 0.24] },
      { ink: [0.1, 0.08, 0.08], channel: 'black', angle: 45, blend: 'multiply' },
    ],
  },

  // Two inks.
  /** Deep violet in the shadows, bright tangerine in the middle tones, on warm cream. */
  halftonesunset: {
    paper: [0.98, 0.94, 0.84], rows: 90, grain: 0.05,
    screens: [
      { ink: [0.3, 0.08, 0.5], channel: 'dark', angle: 75, blend: 'multiply' },
      { ink: [1.0, 0.5, 0.1], channel: 'mid', angle: 15, blend: 'multiply' },
    ],
  },
  /** Dark charcoal on muted sage. */
  halftonematcha: one([0.7, 0.78, 0.64], [0.12, 0.14, 0.13], { grain: 0.06 }),
  /** Soft pink and baby blue on clean white. */
  halftonecandy: {
    paper: [0.99, 0.99, 1.0], rows: 85,
    screens: [
      { ink: [1.0, 0.6, 0.78], channel: 'dark', angle: 15, blend: 'multiply' },
      { ink: [0.5, 0.76, 1.0], channel: 'mid', angle: 75, blend: 'multiply' },
    ],
  },
  /** Warm gold on deep midnight navy. */
  halftonetarot: one([0.04, 0.06, 0.2], [0.93, 0.73, 0.28], { grain: 0.04 }, true),
  /** Hard black on neon yellow construction paper. */
  halftoneacid: one([0.86, 1.0, 0.12], [0.04, 0.04, 0.04], { grain: 0.08 }),

  // Dark card and metal.
  /** Silver foil on matte charcoal. */
  halftonesilver: one([0.1, 0.1, 0.11], [0.8, 0.82, 0.86], { grain: 0.05 }, true),
  /** A green terminal glowing on a black screen. */
  halftonephosphor: one([0.0, 0.02, 0.01], [0.2, 1.0, 0.36], {}, true),
  /** Electric purple and cyan glowing on deep indigo. */
  halftoneuv: {
    paper: [0.04, 0.02, 0.16], rows: 90,
    screens: [
      { ink: [0.62, 0.2, 1.0], channel: 'light', angle: 75, blend: 'screen' },
      { ink: [0.1, 0.92, 1.0], channel: 'mid', angle: 15, blend: 'screen' },
    ],
  },
  /** Copper and rose gold on dark espresso. */
  halftonecopper: one([0.1, 0.06, 0.04], [0.86, 0.5, 0.36], { grain: 0.05 }, true),

  // Other marks than round dots.
  /** Waving lines that thicken in the dark, as an engraving or woodcut. */
  halftoneengrave: { paper: [0.95, 0.92, 0.84], rows: 80, grain: 0.06, screens: [{ ink: [0.1, 0.08, 0.07], shape: 'wave', angle: 0 }] },
  /** Hatches laid over each other: the darker the part, the more directions of line. */
  halftonehatch: {
    paper: [0.96, 0.94, 0.88], rows: 85, grain: 0.05,
    screens: [
      { ink: [0.08, 0.08, 0.1], shape: 'line', angle: 45, from: 0.1 },
      { ink: [0.08, 0.08, 0.1], shape: 'line', angle: 135, from: 0.42 },
      { ink: [0.08, 0.08, 0.1], shape: 'line', angle: 0, from: 0.68 },
    ],
  },
  /** Square lights in a strict grid, like an LED wall. */
  halftoneled: { paper: [0.02, 0.02, 0.03], rows: 70, screens: [{ ink: 'own', channel: 'light', shape: 'square', angle: 0, sat: 1.7, gain: 1.15 }] },
  /** Dots all one size, in the flat colours of a comic (red, yellow, blue, black); the colour changes, not the dot. */
  halftonebenday: { paper: [0.98, 0.96, 0.9], rows: 60, screens: [{ ink: 'poster', angle: 45, fixed: 0.38 }] },
};

const luma = (r: number, g: number, b: number) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
const clamp = (x: number) => Math.min(1, Math.max(0, x));

/** How much of a cell this screen's mark covers (0-1) where the picture has this colour (0-255 in). */
export function screenCover(screen: Screen, contrast: number, r: number, g: number, b: number): number {
  const light = clamp((luma(r, g, b) - 0.5) * contrast + 0.5);
  const key = 1 - Math.max(r, g, b) / 255;
  const process = (channel: number) => (1 - (channel / 255) - key) / Math.max(1 - key, 0.001);
  const read = {
    dark: 1 - light, light, mid: 1 - Math.abs(2 * light - 1),
    cyan: process(r), magenta: process(g), yellow: process(b), black: key,
  }[screen.channel ?? 'dark'];
  const from = screen.from ?? 0;
  return clamp(((read - from) / (1 - from)) * 1.05);
}

/** The ink of this screen for a colour (0-255 in, 0-1 out). */
export function screenInk(screen: Screen, r: number, g: number, b: number): Rgb {
  const { ink, sat = 1.4, gain = 0.55 } = screen;
  if (ink !== 'own' && ink !== 'poster') return ink;
  const light = luma(r, g, b);
  const lift = (channel: number, amount: number) => light + (channel / 255 - light) * amount;
  if (ink === 'poster') return [r, g, b].map(channel => (clamp(lift(channel, 1.8)) >= 0.5 ? 1 : 0)) as unknown as Rgb;
  return [r, g, b].map(channel => clamp(lift(channel, sat) * gain)) as unknown as Rgb;
}

/** What a screen lays down on what is already there, per channel (0-1). */
export function laid(blend: NonNullable<Screen['blend']>, under: number, ink: number, cover: number): number {
  const over = blend === 'multiply' ? under * ink : blend === 'screen' ? 1 - (1 - under) * (1 - ink) : ink;
  return under + (over - under) * cover;
}

/** A pixel of the print as it averages over a cell (0-255 in and out): each screen lays its ink over the paper in proportion to what it covers. The marks, the grain and the beat are in the shader only. */
export function halftoneAverage(look: HalftoneLookId, r: number, g: number, b: number): [number, number, number] {
  const { paper, screens, contrast = 1 } = HALFTONE_STYLES[look];
  const out = [...paper];
  for (const screen of screens) {
    const cover = screen.fixed !== undefined ? Math.min(1, Math.PI * screen.fixed * screen.fixed) : screenCover(screen, contrast, r, g, b);
    const ink = screenInk(screen, r, g, b);
    for (let i = 0; i < 3; i++) out[i] = laid(screen.blend ?? 'cover', out[i], ink[i], cover);
  }
  return out.map(value => value * 255) as [number, number, number];
}
