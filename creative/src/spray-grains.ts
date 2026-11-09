/**
 * Spray — what a lyric word is made of. Given the stencil of a word's letters and the plan of what happens to it,
 * this lists every grain of paint (where it lands, how big and thick, when it arrives) and every drip. Nothing
 * here draws and nothing reads the clock: a grain's arrival time is data, so the picture at any moment is the
 * grains whose time has come. The same word always gives the same grains.
 *
 * Every grain is a droplet that lands near where the nozzle points, scattered like real spray: most land right
 * on target and overlap into a dense core with soft edges; some land wide and make a faint overspray halo; a few
 * hard tiny dots land farther out as speckle.
 */
import { generator, unit, type WordPlan } from './spray-look';

/** Floats per grain: x, y, radius, alpha (the word's local px), arrives (ms), flight (ms), flight start offset x, y, softness 0–1, paint index. */
export const GRAIN_FLOATS = 10;
/** Floats per drip: x, y of where it leaves the letter, width, length (px), starts (ms), paint index, a random number. */
export const DRIP_FLOATS = 7;

/** The letters of a word as a stencil: `alpha` is one byte a pixel, `pad` the empty border around the ink. */
export type SprayMask = { width: number; height: number; pad: number; alpha: Uint8Array };

export type SprayGrains = { grains: Float32Array; drips: Float32Array };

const LOOK = {
  /** Px² of letter each nozzle target covers. */
  anchorArea: 5,
  maxAnchors: 24_000,
  coreRadius: [3.6, 6.2],
  coreAlpha: [0.38, 0.62],
  /** How far (px) the core's droplets land from their target: it softens the edge of every letter. */
  coreScatter: 1.7,
  /** The overspray: a mist of fine droplets round the letters, and a few big faint blurs under it. */
  haloChance: 0.9,
  haloRadius: [3, 7],
  haloAlpha: [0.1, 0.2],
  /** Most of the mist lands within the near scatter, the rest within the far one. */
  haloScatter: [10, 28],
  glowChance: 0.05,
  glowRadius: [14, 28],
  glowAlpha: [0.03, 0.06],
  glowScatter: 14,
  speckleChance: 0.06,
  speckleRadius: [0.8, 2.6],
  speckleReach: [10, 64],
} as const;

/** Softness of each kind of grain: 1 is a smooth blur, 0 a hard dot. */
const SOFT = { core: 0.75, halo: 1, speckle: 0, fleck: 0.25 };
/** A second nozzle pass over a word starts this share of the sweep after the first. */
const SECOND_PASS = 0.35;

const between = (range: readonly [number, number], at: number) => range[0] + (range[1] - range[0]) * at;

/** Smooth random numbers in [0, 1): value noise that depends only on the seed and the place. */
function noise(seed: number, x: number, y: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = (x - x0) ** 2 * (3 - 2 * (x - x0));
  const fy = (y - y0) ** 2 * (3 - 2 * (y - y0));
  const top = unit(seed, x0, y0) * (1 - fx) + unit(seed, x0 + 1, y0) * fx;
  const bottom = unit(seed, x0, y0 + 1) * (1 - fx) + unit(seed, x0 + 1, y0 + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

type Point = readonly [number, number];
type Stroke = { points: readonly Point[]; width: number; startMs: number; durationMs: number };

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Points along the straight pieces between `points`, `steps` to a piece: where the nozzle's targets fall on a stroke. */
function curve(points: readonly Point[], steps: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    for (let s = 0; s < steps; s++) out.push([lerp(points[i][0], points[i + 1][0], s / steps), lerp(points[i][1], points[i + 1][1], s / steps)]);
  }
  out.push(points[points.length - 1]);
  return out;
}

/** The strokes of the mark sprayed round a word of this ink size, all in local px with the word's centre at 0, 0. */
function markStrokes(kind: NonNullable<WordPlan['mark']>, w: number, h: number, at: number, rnd: () => number): Stroke[] {
  const width = clamp(h * 0.11, 12, 26);
  if (kind === 'underline') {
    const y = h / 2 + width * 1.2;
    const first = curve([[-w / 2 - 12, y + (rnd() - 0.5) * 10], [-w * 0.1, y + (rnd() - 0.5) * 14], [w / 2 + 16, y - rnd() * 14]], 6);
    const second = curve([[-w * 0.36, y + width * 1.5], [w * 0.1, y + width * 1.5 + (rnd() - 0.5) * 10], [w * 0.34, y + width * 1.2]], 6);
    return [
      { points: first, width, startMs: at, durationMs: 170 },
      { points: second, width: width * 0.8, startMs: at + 130, durationMs: 120 },
    ];
  }
  if (kind === 'circle') {
    const rx = w / 2 * 1.04 + 30;
    const ry = h / 2 * 1.25 + 34;
    const start = rnd() * TAU;
    const turns = 1.12;
    const ring = Array.from({ length: 48 }, (_, n): Point => {
      const t = n / 47;
      const angle = start + t * turns * TAU;
      const grow = 1 + 0.06 * t + 0.03 * Math.sin(angle * 2);
      return [Math.cos(angle) * rx * grow, Math.sin(angle) * ry * grow];
    });
    return [{ points: ring, width, startMs: at, durationMs: 300 }];
  }
  // An arrow from below, curving up to the word.
  const x1 = (rnd() - 0.5) * w * 0.5;
  const y1 = h / 2 + width + 30;
  const x0 = x1 + (rnd() < 0.5 ? -1 : 1) * (60 + rnd() * 80);
  const y0 = y1 + 170 + rnd() * 40;
  const shaft = Array.from({ length: 24 }, (_, n): Point => {
    const t = n / 23;
    const sway = Math.sin(t * Math.PI) * (x0 < x1 ? 1 : -1) * 36;
    return [lerp(x0, x1, t) + sway, lerp(y0, y1, t)];
  });
  const tip = shaft[shaft.length - 1];
  const before = shaft[shaft.length - 4];
  const back = Math.atan2(before[1] - tip[1], before[0] - tip[0]);
  const wing = (turn: number): Point[] => [tip, [tip[0] + Math.cos(back + turn) * 62, tip[1] + Math.sin(back + turn) * 62]];
  return [
    { points: shaft, width: width * 0.9, startMs: at, durationMs: 170 },
    { points: wing(0.55), width: width * 0.85, startMs: at + 170, durationMs: 70 },
    { points: wing(-0.55), width: width * 0.85, startMs: at + 230, durationMs: 70 },
  ];
}

/** The strokes of a scribble over a word of this ink size. */
function scribbleStrokes(kind: NonNullable<WordPlan['scribble']>['kind'], w: number, h: number, at: number, rnd: () => number): Stroke[] {
  const width = clamp(h * 0.14, 16, 34);
  const wobble = () => (rnd() - 0.5) * h * 0.18;
  if (kind === 'cross') {
    return [
      { points: curve([[-w * 0.56, -h * 0.62 + wobble()], [wobble(), wobble()], [w * 0.56, h * 0.62 + wobble()]], 8), width, startMs: at, durationMs: 130 },
      { points: curve([[-w * 0.56, h * 0.58 + wobble()], [wobble(), wobble()], [w * 0.56, -h * 0.62 + wobble()]], 8), width, startMs: at + 150, durationMs: 130 },
    ];
  }
  const zig = Array.from({ length: 6 }, (_, n): Point => [lerp(-w * 0.56, w * 0.56, n / 5), (n % 2 ? 0.5 : -0.5) * h + wobble()]);
  return [{ points: curve(zig, 6), width, startMs: at, durationMs: 270 }];
}

/** Lists the grains and drips of one lyric word. */
export function sprayWord(mask: SprayMask, plan: WordPlan): SprayGrains {
  const rnd = generator(plan.seed);
  const out: number[] = [];
  const drips: number[] = [];
  const { width, height, pad, alpha } = mask;
  const inkW = width - pad * 2;
  const inkH = height - pad * 2;
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(TAU * rnd());
  const grain = (x: number, y: number, radius: number, a: number, arrives: number, soft: number, ink: number, flight = 0, fromX = 0, fromY = 0) =>
    out.push(x, y, radius, a, arrives, flight, fromX, fromY, soft, ink);

  // Thick and thin paint, and patches the nozzle moved too fast over: fixed to the word, so they do not shimmer.
  const density = (x: number, y: number) => (0.78 + 0.22 * noise(plan.seed, x / 70, y / 70)) * (noise(plan.seed + 1, x / 22, y / 22) < 0.16 ? 0.6 : 1);

  /** One nozzle target: a droplet of core, usually a droplet of mist, now and then a glow blur or a speckle. */
  function dab(x: number, y: number, arrives: number, ink: number) {
    const thick = density(x, y);
    grain(x + gauss() * LOOK.coreScatter, y + gauss() * LOOK.coreScatter, between(LOOK.coreRadius, rnd()), between(LOOK.coreAlpha, rnd()) * thick, arrives, SOFT.core, ink);
    if (rnd() < LOOK.haloChance) {
      const scatter = LOOK.haloScatter[rnd() < 0.7 ? 0 : 1];
      grain(x + gauss() * scatter, y + gauss() * scatter, between(LOOK.haloRadius, rnd()), between(LOOK.haloAlpha, rnd()), arrives + 35, SOFT.halo, ink);
    }
    if (rnd() < LOOK.glowChance) {
      grain(x + gauss() * LOOK.glowScatter, y + gauss() * LOOK.glowScatter, between(LOOK.glowRadius, rnd()), between(LOOK.glowAlpha, rnd()), arrives + 35, SOFT.halo, ink);
    }
    if (rnd() < LOOK.speckleChance) {
      const angle = rnd() * TAU;
      const reach = between(LOOK.speckleReach, rnd());
      grain(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach, between(LOOK.speckleRadius, rnd()), 0.7 + 0.3 * rnd(), arrives + 15, SOFT.speckle, ink);
    }
  }

  // The letters. The nozzle sweeps left to right, a second pass thickening what the first laid down.
  let area = 0;
  for (let i = 0; i < alpha.length; i++) if (alpha[i] > 127) area++;
  const inked = (px: number, py: number) => alpha[Math.min(height - 1, Math.floor(py)) * width + Math.min(width - 1, Math.floor(px))] > 127;
  /** A random place on the letters, in the word's local px. */
  const onLetters = (): Point | null => {
    for (let tries = 0; tries < 40; tries++) {
      const px = rnd() * width;
      const py = rnd() * height;
      if (inked(px, py)) return [px - width / 2, py - height / 2];
    }
    return null;
  };
  const targets = Math.min(LOOK.maxAnchors, Math.round(area / LOOK.anchorArea));
  for (let n = 0; n < targets; n++) {
    const at = onLetters();
    if (!at) continue;
    const [x, y] = at;
    const across = clamp((x + inkW / 2) / inkW, 0, 1);
    const pass = rnd() < 0.45 ? SECOND_PASS : 0;
    dab(x, y, plan.sweepMs * (pass + (1 - SECOND_PASS) * (0.84 * across + 0.16 * noise(plan.seed + 2, x / 40, y / 40))), plan.ink);
  }

  // A mark round the word, or a scribble over it: strokes sprayed along a path.
  const spray = (strokes: readonly Stroke[], ink: number) => {
    for (const { points, width: strokeWidth, startMs, durationMs } of strokes) {
      const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
      const total = lengths.reduce((sum, length) => sum + length, 0);
      for (let n = 0, count = Math.round((total * strokeWidth) / LOOK.anchorArea); n < count; n++) {
        let along = rnd() * total;
        let seg = 0;
        while (seg < lengths.length - 1 && along > lengths[seg]) along -= lengths[seg++];
        const t = lengths[seg] ? along / lengths[seg] : 0;
        const [ax, ay] = points[seg];
        const [bx, by] = points[seg + 1];
        const across = clamp(gauss() * 0.28, -0.6, 0.6) * strokeWidth;
        const nx = (by - ay) / (lengths[seg] || 1);
        const ny = -(bx - ax) / (lengths[seg] || 1);
        const progress = lengths.slice(0, seg).reduce((sum, length) => sum + length, 0) + along;
        dab(lerp(ax, bx, t) + nx * across, lerp(ay, by, t) + ny * across, startMs + durationMs * (progress / total), ink);
      }
    }
  };
  if (plan.mark) spray(markStrokes(plan.mark, inkW, inkH, plan.sweepMs + 70, rnd), plan.accent);
  if (plan.scribble) spray(scribbleStrokes(plan.scribble.kind, inkW, inkH, plan.scribble.atMs, rnd), plan.accent);

  // Droplets flung from the letters on a beat: they leave the letters and land `reach` px away.
  const fling = (arrives: number, from: Point, angle: number, reach: number, radius: number, soft: number) => {
    const toX = from[0] + Math.cos(angle) * reach;
    const toY = from[1] + Math.sin(angle) * reach;
    grain(toX, toY, radius, 0.95, arrives, soft, plan.ink, 90 + reach * 0.5, from[0] - toX, from[1] - toY);
  };
  for (const at of plan.puffsMs) {
    const from = onLetters();
    for (let n = 0; from && n < 8 + Math.floor(rnd() * 5); n++) fling(at, from, rnd() * TAU, 14 + rnd() * 56, between(LOOK.speckleRadius, rnd()), SOFT.speckle);
  }
  for (const at of plan.splatsMs) {
    const from = onLetters();
    const aim = rnd() * TAU;
    for (let n = 0; from && n < 20 + Math.floor(rnd() * 20); n++) {
      const radius = 2 + 7 * rnd() ** 2;
      fling(at, from, aim + gauss() * 0.9, (80 + 260 * rnd() ** 1.4) * (1 - 0.4 * ((radius - 2) / 7)), radius, SOFT.fleck);
    }
  }

  // Drips run from the lowest edge of the letters: the bottom ink of a column of the stencil.
  const lowest = new Int32Array(width).fill(-1);
  for (let x = 0; x < width; x++) {
    for (let y = height - 1; y >= 0; y--) if (alpha[y * width + x] > 127) { lowest[x] = y; break; }
  }
  const columns = Array.from(lowest.keys()).filter(x => lowest[x] >= 0);
  const scale = clamp(inkH / 200, 0.7, 1.2);
  for (const { atMs, count } of plan.drips) {
    const taken: number[] = [];
    for (let n = 0; columns.length && n < count; n++) {
      const x = columns[Math.floor(rnd() * columns.length)];
      if (taken.some(other => Math.abs(other - x) < 28 * scale)) continue;
      taken.push(x);
      drips.push(x - width / 2, lowest[x] - 3 - height / 2, (9 + 6 * rnd()) * scale, (60 + 200 * rnd() ** 1.2) * scale, Math.max(atMs, plan.sweepMs * 0.85), plan.ink, rnd());
    }
  }

  return { grains: Float32Array.from(out), drips: Float32Array.from(drips) };
}
