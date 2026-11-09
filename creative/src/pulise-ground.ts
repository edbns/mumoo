/**
 * Pulise ground: what the field is made of between the type and the stickers. 'flat' is the plain neon cut;
 * the others are patterns that slide or turn one step on every cut, and are a pure function of the cut and its age.
 */
import type { Graphics } from 'pixi.js';
import { HEIGHT, WIDTH } from './composition';
import type { PulisePhase } from './pulise-palettes';

export const GROUND_IDS = ['flat', 'checker', 'burst', 'dots', 'stripes'] as const;
export type GroundId = (typeof GROUND_IDS)[number];

const CELL = 180;
const DOT = 120;
const BAND = 150;
const RAYS = 20;
const CENTRE_Y = HEIGHT * 0.42;
/** Long enough that a ray reaches past every corner. */
const REACH = HEIGHT;

/** How far a cut has settled into its pattern step: fast at first, then easing in over a quarter of a second. */
function settle(ageMs: number) {
  const t = Math.min(1, Math.max(0, ageMs / 260));
  return 1 - (1 - t) ** 3;
}

function checker(g: Graphics, phase: PulisePhase, step: number) {
  // Sliding one square sideways swaps the colours, so every cut inverts the board.
  const shift = (step * CELL) % (CELL * 2);
  for (let row = 0; row < HEIGHT / CELL + 1; row++) {
    for (let col = -2; col < WIDTH / CELL + 1; col++) {
      if ((row + col) % 2 !== 0) g.rect(col * CELL + shift, row * CELL, CELL, CELL);
    }
  }
  g.fill(phase.alt);
}

function burst(g: Graphics, phase: PulisePhase, step: number) {
  const wedge = (Math.PI * 2) / RAYS;
  for (let i = 0; i < RAYS; i += 2) {
    const a = (i + step) * wedge;
    g.poly([WIDTH / 2, CENTRE_Y, WIDTH / 2 + Math.cos(a) * REACH, CENTRE_Y + Math.sin(a) * REACH, WIDTH / 2 + Math.cos(a + wedge) * REACH, CENTRE_Y + Math.sin(a + wedge) * REACH]);
  }
  g.fill(phase.alt);
}

function dots(g: Graphics, phase: PulisePhase, step: number, hit: number) {
  const radius = DOT * (0.27 + hit * 0.07);
  const shift = (step * DOT) % DOT;
  for (let row = -1; row < HEIGHT / DOT + 1; row++) {
    for (let col = -1; col < WIDTH / DOT + 2; col++) {
      g.circle(col * DOT + shift + (row % 2 ? DOT / 2 : 0), row * DOT + shift, radius);
    }
  }
  g.fill(phase.alt);
}

function stripes(g: Graphics, phase: PulisePhase, step: number) {
  const shift = (step * BAND) % (BAND * 2);
  for (let x = -HEIGHT - BAND * 2; x < WIDTH + BAND * 2; x += BAND * 2) {
    const left = x + shift;
    g.poly([left, 0, left + BAND, 0, left + BAND + HEIGHT, HEIGHT, left + HEIGHT, HEIGHT]);
  }
  g.fill(phase.alt);
}

/** Draws the ground of one cut: `cut` is which cut it is, `ageMs` how long ago it began, `hit` the beat. */
export function drawGround(g: Graphics, id: GroundId, phase: PulisePhase, cut: number, ageMs: number, hit: number) {
  g.rect(0, 0, WIDTH, HEIGHT);
  g.fill(phase.field);
  const step = cut + settle(ageMs);
  switch (id) {
    case 'flat': return;
    case 'checker': return checker(g, phase, step);
    case 'burst': return burst(g, phase, step);
    case 'dots': return dots(g, phase, step, hit);
    case 'stripes': return stripes(g, phase, step);
  }
}
