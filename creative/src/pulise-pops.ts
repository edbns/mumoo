/**
 * When and where Pulise stickers pop. Everything is decided from the look, the cut number and the music at the
 * moment the cut began (its energy), so a frame is a pure function of its time: no clock, no randomness at play time.
 * Mood comes only from the song's sound: the lane picked the look's sticker set and how busy it is, and the energy
 * decides, cut by cut, whether a sticker appears and how many.
 */
import { WIDTH } from './composition';
import { puliseCut, stickerColors, type NeonId, type PulisePhase } from './pulise-palettes';
import type { PuliseLook } from './pulise-look';
import { VARIANTS, type StickerId, type StickerInk } from './pulise-stickers';

export type Pop = {
  id: StickerId;
  ink: StickerInk;
  x: number;
  y: number;
  radius: number;
  tilt: number;
  variant: number;
  gaze: number;
  /** Milliseconds since this sticker appeared. */
  ageMs: number;
  lifeMs: number;
};

/** Where the big sticker of a cut sits: mostly above the word, sometimes right behind it like a face behind a headline. */
const HERO_PLACES = [[300, 400], [780, 390], [540, 370], [220, 560], [860, 560], [740, 830], [340, 830]] as const;
/** Where the smaller ones sit: at the sides and under the word, clear of the small line of context at the bottom. */
const SIDE_PLACES = [[170, 1170], [910, 1170], [540, 1200], [120, 560], [960, 560]] as const;
/** A sticker never reaches down into the small line of context under the word. */
const FLOOR = 1340;
/** The most of a sticker's width that may hang off the side of the frame: it peeks in from the edge, it is never mostly gone. */
const EDGE_REACH = 1.4;
const POP_IN_MS = 150;
const POP_OUT_MS = 90;
const STAGGER_MS = 60;

/** A number in [0, 1) that depends only on its three inputs. */
function unit(seed: number, cut: number, salt: number) {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(cut + 1, 0xc2b2ae35) ^ Math.imul(salt + 7, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** The sticker set is dealt like a deck: every sticker once, in a new order each round, so the same one never shows twice running within a round. */
function dealt(look: PuliseLook, cut: number, extra: number) {
  const size = look.stickers.length;
  const round = Math.floor(cut / size);
  const order = look.stickers.map((_, index) => index).sort((a, b) => unit(look.seed, round, 40 + a) - unit(look.seed, round, 40 + b));
  return look.stickers[order[(cut + extra) % size]];
}

function inkFor(neon: NeonId, phase: PulisePhase, pick: (salt: number) => number): StickerInk {
  const { bodies, hues, paper, void: black } = stickerColors(neon, phase);
  const body = bodies[Math.floor(pick(20) * bodies.length)];
  const accents = hues.filter(color => color !== body);
  return {
    body,
    accent: accents[Math.floor(pick(21) * accents.length)],
    edge: phase.field === black || body === black ? paper : black,
    light: paper,
    dark: black,
  };
}

/**
 * The stickers of one cut. `energy` is the song's energy when the cut began (0 to 1), `cutMs` how long the cut lasts.
 * Returns the ones still on screen `ageMs` into the cut.
 */
export function popsAt(look: PuliseLook, cut: number, energy: number, ageMs: number, cutMs: number): Pop[] {
  if (cutMs <= 0) return [];
  const pick = (salt: number) => unit(look.seed, cut, salt);
  if (pick(1) > Math.min(0.95, look.density * (0.4 + 0.5 * energy))) return [];
  const count = 1 + (pick(2) < look.density * (energy - 0.55) * 1.6 ? 1 : 0) + (pick(3) < look.density * (energy - 0.8) * 1.5 ? 1 : 0);
  const phase = puliseCut(look.neon, cut);
  // The smaller stickers of the cut take their own places, in an order this cut shuffles.
  const sides = SIDE_PLACES.map((_, place) => place).sort((a, b) => pick(60 + a) - pick(60 + b));
  const pops: Pop[] = [];
  for (let index = 0; index < count; index++) {
    const salt = 100 + 30 * index;
    const hero = index === 0;
    const anchor = hero ? HERO_PLACES[Math.floor(pick(5) * HERO_PLACES.length)] : SIDE_PLACES[sides[index - 1]];
    const delay = index * STAGGER_MS;
    // Every sticker is gone by the time its cut ends, the later ones included.
    const life = cutMs * (0.6 + 0.4 * pick(salt + 9)) - delay;
    const age = ageMs - delay;
    if (age < 0 || age > life) continue;
    const x = anchor[0] + (pick(salt + 7) - 0.5) * 140;
    const y = anchor[1] + (pick(salt + 8) - 0.5) * 100;
    const size = (hero ? 280 + 160 * pick(salt + 4) : 130 + 80 * pick(salt + 4)) * (0.65 + 0.35 * look.density) * (0.9 + 0.25 * energy);
    pops.push({
      id: dealt(look, cut, index),
      ink: inkFor(look.neon, phase, which => pick(salt + which)),
      x,
      y,
      radius: Math.min(size, FLOOR - y, EDGE_REACH * Math.min(x, WIDTH - x)),
      tilt: (pick(salt + 3) - 0.5) * 0.7,
      variant: Math.floor(pick(salt + 2) * VARIANTS),
      gaze: pick(salt + 1) * Math.PI * 2,
      ageMs: age,
      lifeMs: life,
    });
  }
  return pops;
}

/** Pop in with a little overshoot, hold, then shrink away just before the cut ends. */
export function popScale(pop: Pop) {
  const rise = Math.min(1, pop.ageMs / POP_IN_MS);
  const overshoot = 1 + 2.70158 * (rise - 1) ** 3 + 1.70158 * (rise - 1) ** 2;
  const fall = Math.min(1, Math.max(0, (pop.ageMs - (pop.lifeMs - POP_OUT_MS)) / POP_OUT_MS));
  return overshoot * (1 - fall * fall);
}
