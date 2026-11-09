/**
 * Lyric motion: how each piece of a lyric (a letter or a word) enters, moves on the beat and leaves.
 * Every function here is pure: a piece's place depends only on the clock, the song's beat and the card's own
 * seed, never on random numbers or on how many frames were drawn before, so the shelf and the cloud render
 * draw the same frame. Nothing flashes more than twice a second (see `buzzingWords`), and every motion comes
 * to rest on the plain word.
 */
import type { FontNeed } from './ad-fonts';

export const FX_STYLES = ['bounce', 'wave', 'glitch', 'rotate', 'stretch', 'split', 'wipe', 'flicker', 'zoom', 'scatter', 'jitter', 'echo', 'slide', 'tilt'] as const;
export type FxStyleId = (typeof FX_STYLES)[number];

/** What a style moves (letters or whole words) and what it asks of the font. */
export type FxTraits = { unit: 'letter' | 'word'; needs: readonly FontNeed[] };

export const FX_TRAITS: Record<FxStyleId, FxTraits> = {
  bounce: { unit: 'letter', needs: ['letters'] },
  wave: { unit: 'letter', needs: ['letters'] },
  rotate: { unit: 'letter', needs: ['letters'] },
  scatter: { unit: 'letter', needs: ['letters'] },
  glitch: { unit: 'word', needs: [] },
  stretch: { unit: 'word', needs: ['heavy'] },
  split: { unit: 'word', needs: ['heavy'] },
  wipe: { unit: 'word', needs: [] },
  flicker: { unit: 'word', needs: [] },
  jitter: { unit: 'word', needs: [] },
  slide: { unit: 'word', needs: [] },
  tilt: { unit: 'word', needs: [] },
  zoom: { unit: 'word', needs: ['heavy'] },
  echo: { unit: 'word', needs: ['heavy'] },
};

/** Single-word styles keep the replaced word on screen this long while it leaves; every exit below finishes sooner. */
export const EXIT_MS = 200;

/** A part of the box a layer is clipped to, as fractions of the piece's width and height. */
export type Clip = { x0: number; x1: number; y0: number; y1: number };

/** One drawing of the piece's text. Most pieces are one layer; glitch, split, wipe and echo stack several. */
export type Layer = { dx: number; dy: number; alpha: number; tone: 'ink' | 'accent'; grow: number; clip?: Clip };

export type Placement = {
  x: number;
  y: number;
  sx: number;
  sy: number;
  rot: number;
  alpha: number;
  layers: readonly Layer[];
};

export type PieceInput = {
  /** Time in the clip, and time since this piece's word was first sung (negative before). */
  ms: number;
  ageMs: number;
  /** Single-word styles only: time since the next word replaced this one, or null while it is the one on screen. */
  exitMs: number | null;
  /** Position within its word (letters), how many pieces the word has, and the running count across the lyric. */
  index: number;
  count: number;
  ordinal: number;
  word: number;
  line: number;
  /** Type size in px: motion distances are fractions of it. */
  size: number;
  seed: number;
  beat: number;
  beatIndex: number;
  energy: number;
  /** The word being sung now. */
  active: boolean;
  /** A word that is allowed to flicker (see `buzzingWords`). */
  buzz: boolean;
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOutCubic = (v: number) => 1 - (1 - clamp01(v)) ** 3;
const easeInCubic = (v: number) => clamp01(v) ** 3;
const easeOutBack = (v: number) => {
  const x = clamp01(v) - 1;
  return 1 + 2.4 * x ** 3 + 1.4 * x ** 2;
};
const easeOutElastic = (v: number) => {
  const x = clamp01(v);
  return x === 0 || x === 1 ? x : 2 ** (-10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
};
const easeOutBounce = (v: number) => {
  let x = clamp01(v);
  if (x < 1 / 2.75) return 7.5625 * x * x;
  if (x < 2 / 2.75) { x -= 1.5 / 2.75; return 7.5625 * x * x + 0.75; }
  if (x < 2.5 / 2.75) { x -= 2.25 / 2.75; return 7.5625 * x * x + 0.9375; }
  x -= 2.625 / 2.75;
  return 7.5625 * x * x + 0.984375;
};

/** A fixed-input hash in [0, 1): the same arguments always give the same number. */
export function hash01(seed: number, a: number, b = 0, c = 0): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(a + 1, 0xc2b2ae35) ^ Math.imul(b + 7, 0x27d4eb2f) ^ Math.imul(c + 13, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** The least time between two flickering words, and how dim a flicker gets (a dip, never a blackout). */
export const BUZZ_GAP_MS = 1100;
export const BUZZ_DIM = 0.3;

/** Which words flicker: the first, then the next one that starts at least `BUZZ_GAP_MS` later, so there are never three flashes in a second. */
export function buzzingWords(startsMs: readonly number[]): Set<number> {
  const result = new Set<number>();
  let last = -Infinity;
  startsMs.forEach((start, index) => {
    if (start - last >= BUZZ_GAP_MS) { result.add(index); last = start; }
  });
  return result;
}

const ink = (over: Partial<Layer> = {}): Layer => ({ dx: 0, dy: 0, alpha: 1, tone: 'ink', grow: 1, ...over });
const place = (over: Partial<Omit<Placement, 'layers'>> & { layers?: readonly Layer[]; tone?: Layer['tone'] } = {}): Placement => {
  const { layers, tone, ...rest } = over;
  return { x: 0, y: 0, sx: 1, sy: 1, rot: 0, alpha: 1, layers: layers ?? [ink({ tone: tone ?? 'ink' })], ...rest };
};
const hidden: Placement = place({ alpha: 0 });

/** How hard this moment of the song hits: a beat on a quiet passage is a tap, on a loud one a blow. */
const power = (u: PieceInput) => u.beat * (0.35 + 0.65 * u.energy);

export const FX: Record<FxStyleId, (u: PieceInput) => Placement> = {
  /** Letters drop in from above and bounce to rest; every beat hops them. */
  bounce(u) {
    const t = u.ageMs - u.index * 34;
    if (t < 0) return hidden;
    return place({
      y: -u.size * 1.7 * (1 - easeOutBounce(t / 560)) - power(u) * u.size * (u.index % 2 ? 0.1 : 0.06),
      alpha: clamp01(t / 70),
    });
  },

  /** The whole lyric rides a travelling wave; sung words are solid, the word now sung is lit. */
  wave(u) {
    const sung = u.ageMs >= 0 ? 0.32 + 0.68 * easeOutCubic(u.ageMs / 160) : 0.32;
    return place({
      y: Math.sin(u.ms * 0.0062 - u.ordinal * 0.55) * u.size * (0.025 + 0.05 * u.energy) - power(u) * u.size * 0.04,
      alpha: sung,
      tone: u.active ? 'accent' : 'ink',
    });
  },

  /** A word tears into colour-split slices when it lands and on every other beat, then snaps clean. */
  glitch(u) {
    if (u.ageMs < 0) return hidden;
    const hit = u.beatIndex % 2 === 0 && u.beat > 0.4 ? u.beat * 0.8 : 0;
    const k = Math.max(1 - clamp01(u.ageMs / 260), hit);
    if (k <= 0.02) return place();
    const step = Math.floor(u.ms / 40);
    const r = (n: number) => hash01(u.seed, u.word, step, n) - 0.5;
    const d = u.size * 0.22 * k;
    return place({
      layers: [
        ink({ dx: -d * (1 + r(1)), dy: r(2) * u.size * 0.03, tone: 'accent', alpha: 0.85 }),
        ink({ dx: r(3) * d * 1.4, clip: { x0: 0, x1: 1, y0: 0, y1: 0.36 } }),
        ink({ dx: r(4) * d * 1.4, clip: { x0: 0, x1: 1, y0: 0.36, y1: 0.68 } }),
        ink({ dx: r(5) * d * 1.4, clip: { x0: 0, x1: 1, y0: 0.68, y1: 1 } }),
      ],
    });
  },

  /** Letters spin in from a quarter turn back, one after another. */
  rotate(u) {
    const t = u.ageMs - u.index * 38;
    if (t < 0) return hidden;
    const p = clamp01(t / 440);
    const s = easeOutBack(p);
    return place({
      rot: -(1 - easeOutCubic(p)) * Math.PI * 1.2 + power(u) * 0.07 * (u.index % 2 ? 1 : -1),
      sx: s,
      sy: s,
      y: (1 - p) * u.size * 0.35,
      alpha: clamp01(t / 90),
    });
  },

  /** A word snaps in stretched wide and thin, then settles with a rubbery wobble; beats squash it. */
  stretch(u) {
    if (u.ageMs < 0) return hidden;
    const e = easeOutElastic(u.ageMs / 420);
    const hit = power(u);
    return place({ sx: (2.4 - 1.4 * e) * (1 - hit * 0.05), sy: (0.2 + 0.8 * e) * (1 + hit * 0.1), alpha: clamp01(u.ageMs / 60) });
  },

  /** Top and bottom halves slide in from opposite sides and lock; a beat knocks them apart a little. */
  split(u) {
    if (u.ageMs < 0) return hidden;
    const gap = (1 - easeOutCubic(u.ageMs / 300)) * u.size * 3.2 + power(u) * u.size * 0.05;
    return place({
      alpha: clamp01(u.ageMs / 50),
      layers: [
        ink({ dx: -gap, clip: { x0: 0, x1: 1, y0: 0, y1: 0.5 } }),
        ink({ dx: gap, clip: { x0: 0, x1: 1, y0: 0.5, y1: 1 } }),
      ],
    });
  },

  /** A word is wiped on from the left behind a bright leading edge. */
  wipe(u) {
    if (u.ageMs < 0) return hidden;
    const p = easeOutCubic(u.ageMs / 320);
    const s = 1 + power(u) * 0.03;
    return place({
      sx: s,
      sy: s,
      layers: [
        ink({ clip: { x0: 0, x1: p, y0: 0, y1: 1 } }),
        ...(p < 1 ? [ink({ tone: 'accent', clip: { x0: Math.max(0, p - 0.14), x1: p, y0: 0, y1: 1 } })] : []),
      ],
    });
  },

  /** A neon sign: a halo behind the word, and a word that is allowed to flicker twice as it lights up. */
  flicker(u) {
    if (u.ageMs < 0) return hidden;
    const dim = u.buzz && ((u.ageMs >= 70 && u.ageMs < 130) || (u.ageMs >= 210 && u.ageMs < 270));
    const lit = u.buzz ? 1 : clamp01(u.ageMs / 120);
    return place({
      alpha: dim ? BUZZ_DIM : lit,
      layers: [ink({ tone: 'accent', grow: 1.07, alpha: 0.3 + (u.beatIndex % 2 === 0 ? power(u) * 0.25 : 0) }), ink()],
    });
  },

  /** One word at a time, pushed in from far away while the last one flies past the camera. */
  zoom(u) {
    if (u.exitMs !== null) {
      const p = clamp01(u.exitMs / 180);
      const s = 1 + 1.6 * easeInCubic(p);
      return place({ sx: s, sy: s, alpha: 1 - p });
    }
    if (u.ageMs < 0) return hidden;
    const s = (0.5 + 0.5 * easeOutBack(u.ageMs / 240)) * (1 + power(u) * 0.03);
    return place({ sx: s, sy: s, alpha: clamp01(u.ageMs / 60) });
  },

  /** Letters burst in from all around and fly into place, each at its own moment. */
  scatter(u) {
    const r = (n: number) => hash01(u.seed, u.word, u.index, n) - 0.5;
    const t = u.ageMs - (r(4) + 0.5) * 160;
    if (t < 0) return hidden;
    const p = clamp01(t / 480);
    const left = 1 - easeOutCubic(p);
    return place({
      x: r(1) * u.size * 7 * left,
      y: r(2) * u.size * 6 * left - power(u) * u.size * 0.03 * (1 + r(5)),
      rot: r(3) * Math.PI * 2 * left,
      alpha: clamp01(p * 4),
    });
  },

  /** Hand-drawn: words pop in and then boil, redrawn a little differently eight times a second. */
  jitter(u) {
    if (u.ageMs < 0) return hidden;
    const step = Math.floor(u.ms / 120);
    const r = (n: number) => hash01(u.seed, u.word, step, n) - 0.5;
    const s = (1 + 0.25 * (1 - clamp01(u.ageMs / 110))) * (1 + power(u) * 0.05);
    return place({ rot: r(1) * 0.075, x: r(2) * u.size * 0.03, y: r(3) * u.size * 0.03, sx: s, sy: s });
  },

  /** One word at a time slides in from the left leaving a trail, and a beat throws the trail again. */
  echo(u) {
    if (u.exitMs !== null) {
      const p = clamp01(u.exitMs / 160);
      return place({ x: easeInCubic(p) * u.size * 1.2, alpha: 1 - p });
    }
    if (u.ageMs < 0) return hidden;
    const k = Math.max(1 - clamp01(u.ageMs / 420), power(u));
    return place({
      x: -(1 - easeOutCubic(u.ageMs / 280)) * u.size * 1.6,
      alpha: clamp01(u.ageMs / 80),
      layers: [3, 2, 1].map(n => ink({ dx: -n * u.size * 0.1 * k, tone: 'accent', alpha: (k * 0.5) / n })).concat(ink()),
    });
  },

  /** Lines slide in from alternate sides. */
  slide(u) {
    if (u.ageMs < 0) return hidden;
    return place({
      x: (u.line % 2 ? 1 : -1) * (1 - easeOutCubic(u.ageMs / 420)) * 560,
      y: -power(u) * u.size * 0.02,
      alpha: clamp01(u.ageMs / 120),
    });
  },

  /** A tilted block whose words stamp in big and settle. */
  tilt(u) {
    if (u.ageMs < 0) return hidden;
    const p = clamp01(u.ageMs / 280);
    const s = 1.7 - 0.7 * easeOutBack(p);
    return place({ sx: s, sy: s, rot: (1 - p) * 0.12 * (u.word % 2 ? 1 : -1), y: -power(u) * u.size * 0.02, alpha: clamp01(u.ageMs / 70) });
  },
};
