/**
 * Pulise stickers: hard-edged, thick-outlined cartoon shapes that pop in on the beat and are gone on the next cut.
 * Every shape is drawn here as Pixi vector Graphics in a unit box (about -1 to 1, y down), so nothing is downloaded,
 * nothing needs a licence, and a frame is a pure function of the pose (the cloud page and the browser draw the same pixels).
 */
import type { Graphics } from 'pixi.js';

export const STICKER_IDS = ['lips', 'monster', 'eye', 'star', 'bolt', 'flame', 'skull', 'smiley', 'heart'] as const;
export type StickerId = (typeof STICKER_IDS)[number];

export type StickerInk = {
  body: string;
  accent: string;
  /** The outline, and what the sticker's details are drawn on. */
  edge: string;
  light: string;
  dark: string;
};

export type StickerPose = {
  /** The beat, 1 on the hit and falling to 0. */
  hit: number;
  /** Milliseconds since the sticker appeared. */
  ageMs: number;
  /** Which version of the shape: eye count, star points, face. */
  variant: number;
  /** Where the eyes look (radians). */
  gaze: number;
};

export const VARIANTS = 3;

/**
 * Draws in the unit box but hands Pixi real pixels. (Pixi decides how many segments a curve or circle gets from its
 * size in the path, so a unit-sized shape that is scaled up afterwards comes out as a polygon.)
 */
class Pen {
  constructor(private readonly g: Graphics, private readonly k: number) {}

  moveTo(x: number, y: number) { this.g.moveTo(x * this.k, y * this.k); }
  lineTo(x: number, y: number) { this.g.lineTo(x * this.k, y * this.k); }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) { this.g.quadraticCurveTo(cx * this.k, cy * this.k, x * this.k, y * this.k); }
  bezierCurveTo(ax: number, ay: number, bx: number, by: number, x: number, y: number) {
    this.g.bezierCurveTo(ax * this.k, ay * this.k, bx * this.k, by * this.k, x * this.k, y * this.k);
  }
  closePath() { this.g.closePath(); }
  poly(points: number[], close = false) { this.g.poly(points.map(value => value * this.k), close); }
  circle(x: number, y: number, r: number) { this.g.circle(x * this.k, y * this.k, r * this.k); }
  ellipse(x: number, y: number, rx: number, ry: number) { this.g.ellipse(x * this.k, y * this.k, rx * this.k, ry * this.k); }
  roundRect(x: number, y: number, w: number, h: number, r: number) { this.g.roundRect(x * this.k, y * this.k, w * this.k, h * this.k, r * this.k); }
  fill(color: string) { this.g.fill(color); }
  stroke(color: string, width: number) { this.g.stroke({ color, width: width * this.k, join: 'round', cap: 'round' }); }
}
const EDGE = 0.075;
const THIN = 0.04;

function paint(p: Pen, ink: StickerInk, fill: string, width = EDGE) {
  p.fill(fill);
  p.stroke(ink.edge, width);
}

type Curve = readonly (readonly [number, number, number, number, number, number])[];
const LIP_TOP: Curve = [[-0.85, -0.2, -0.6, -0.62, -0.28, -0.62], [-0.14, -0.62, -0.07, -0.5, 0, -0.42], [0.07, -0.5, 0.14, -0.62, 0.28, -0.62], [0.6, -0.62, 0.85, -0.2, 1, 0]];
/** The line where the lips meet, left to right, and back again. */
const LIP_LINE: Curve = [[-0.6, 0.1, -0.3, 0.04, 0, 0.07], [0.3, 0.04, 0.6, 0.1, 1, 0]];
const LIP_BACK: Curve = [[0.6, 0.1, 0.3, 0.04, 0, 0.07], [-0.3, 0.04, -0.6, 0.1, -1, 0]];
const LIP_BOTTOM: Curve = [[0.85, 0.5, 0.45, 0.9, 0, 0.9], [-0.45, 0.9, -0.85, 0.5, -1, 0]];

function lips(p: Pen, ink: StickerInk, pose: StickerPose) {
  // The mouth opens on the hit, widest in the middle and closed at the corners.
  const open = 0.05 + pose.hit * 0.2;
  const gap = (x: number) => open * (1 - x * x);
  /** Traces curves with their y pushed away from the mouth line: `side` -1 up, +1 down. */
  const trace = (curve: Curve, side: number) => {
    for (const [ax, ay, bx, by, x, y] of curve) p.bezierCurveTo(ax, ay + side * gap(ax), bx, by + side * gap(bx), x, y + side * gap(x));
  };
  p.moveTo(-1, 0);
  trace(LIP_LINE, -1);
  trace(LIP_BACK, 1);
  p.closePath();
  paint(p, ink, ink.dark);
  if (open > 0.1) {
    p.roundRect(-0.55, 0.07 - open * 0.9, 1.1, Math.min(0.2, open * 0.8), 0.04);
    paint(p, ink, ink.light, THIN);
  }
  p.moveTo(-1, 0);
  trace(LIP_LINE, 1);
  trace(LIP_BOTTOM, 1);
  p.closePath();
  paint(p, ink, ink.body);
  p.moveTo(-1, 0);
  trace(LIP_TOP, -1);
  trace(LIP_BACK, -1);
  p.closePath();
  paint(p, ink, ink.body);
  p.moveTo(-0.5, 0.5 + open * 0.6);
  p.quadraticCurveTo(-0.3, 0.64 + open * 0.6, -0.04, 0.62 + open * 0.6);
  p.stroke(ink.light, 0.07);
  p.moveTo(-0.66, -0.2 - open * 0.6);
  p.quadraticCurveTo(-0.52, -0.4 - open * 0.6, -0.34, -0.46 - open * 0.6);
  p.stroke(ink.light, 0.05);
}

function monster(p: Pen, ink: StickerInk, pose: StickerPose) {
  for (const side of [-1, 1]) {
    p.poly([side * 0.25, -0.8, side * 0.82, -0.62, side * 0.62, -1.38]);
    paint(p, ink, ink.accent);
  }
  const fur: number[] = [];
  for (let i = 0; i < 30; i++) {
    const angle = (i / 30) * Math.PI * 2;
    const radius = i % 2 ? 1.13 : 0.98;
    fur.push(Math.cos(angle) * radius * 1.05, Math.sin(angle) * radius * 0.95);
  }
  p.poly(fur, true);
  paint(p, ink, ink.body);
  const eyes = [
    [[-0.36, -0.24, 0.27], [0.36, -0.24, 0.27]],
    [[0, -0.28, 0.42]],
    [[-0.52, -0.16, 0.21], [0, -0.42, 0.21], [0.52, -0.16, 0.21]],
  ][pose.variant % VARIANTS];
  for (const [x, y, r] of eyes) {
    p.circle(x, y, r);
    paint(p, ink, ink.light, THIN * 1.5);
    p.circle(x + Math.cos(pose.gaze) * r * 0.32, y + Math.sin(pose.gaze) * r * 0.32, r * 0.46);
    p.fill(ink.dark);
  }
  const open = 0.1 + pose.hit * 0.28;
  p.moveTo(-0.62, 0.2);
  p.bezierCurveTo(-0.5, 0.62 + open, 0.5, 0.62 + open, 0.62, 0.2);
  p.bezierCurveTo(0.3, 0.32, -0.3, 0.32, -0.62, 0.2);
  p.closePath();
  paint(p, ink, ink.dark, EDGE * 0.8);
  p.ellipse(0, 0.4 + open * 0.6, 0.22, 0.09 + open * 0.1);
  p.fill(ink.accent);
  for (const x of [-0.42, -0.21, 0, 0.21, 0.42]) {
    const top = 0.2 + 0.1 * (1 - (x / 0.62) ** 2);
    p.poly([x - 0.095, top - 0.02, x + 0.095, top - 0.02, x, top + 0.15 + open * 0.2]);
    paint(p, ink, ink.light, THIN * 0.7);
  }
}

function eye(p: Pen, ink: StickerInk, pose: StickerPose) {
  const k = 0.88 + pose.hit * 0.14;
  for (const x of [-0.7, -0.35, 0, 0.35, 0.7]) {
    const top = 0.6 * k * (1 - x * x * 0.62);
    p.moveTo(x, -top + 0.08);
    p.lineTo(x * 1.22, -top - 0.3);
    p.stroke(ink.edge, 0.085);
  }
  p.moveTo(-1, 0);
  p.bezierCurveTo(-0.55, -0.8 * k, 0.55, -0.8 * k, 1, 0);
  p.bezierCurveTo(0.55, 0.8 * k, -0.55, 0.8 * k, -1, 0);
  p.closePath();
  paint(p, ink, ink.light);
  const x = Math.cos(pose.gaze) * 0.3;
  const y = Math.sin(pose.gaze) * 0.07;
  p.circle(x, y, 0.4);
  paint(p, ink, ink.body, THIN * 1.5);
  p.circle(x, y, 0.19 + pose.hit * 0.07);
  p.fill(ink.dark);
  p.circle(x - 0.09, y - 0.1, 0.07);
  p.fill(ink.light);
}

function star(p: Pen, ink: StickerInk, pose: StickerPose) {
  const [points, inner] = [[5, 0.48], [8, 0.7], [4, 0.3]][pose.variant % VARIANTS];
  const spin = pose.ageMs * 0.0016;
  const vertices: number[] = [];
  for (let i = 0; i < points * 2; i++) {
    const angle = -Math.PI / 2 + spin + (i * Math.PI) / points;
    const radius = i % 2 ? inner : 1;
    vertices.push(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  p.poly(vertices, true);
  paint(p, ink, ink.body);
  p.circle(-0.12, -0.12, 0.09);
  p.fill(ink.light);
}

function bolt(p: Pen, ink: StickerInk) {
  p.poly([-0.1, -1, 0.58, -1, 0.14, -0.22, 0.66, -0.22, -0.46, 1, -0.1, 0.12, -0.62, 0.12]);
  paint(p, ink, ink.body);
  p.moveTo(0.2, -0.82);
  p.lineTo(-0.2, -0.3);
  p.stroke(ink.light, 0.07);
}

function flame(p: Pen, ink: StickerInk, pose: StickerPose) {
  const sway = 1 + 0.07 * Math.sin(pose.ageMs * 0.03);
  const shape = (scale: number, dy: number, fill: string, outlined: boolean) => {
    const at = (x: number, y: number) => [x * scale * sway, y * scale + dy] as const;
    p.moveTo(...at(0, -1));
    p.bezierCurveTo(...at(0.2, -0.55), ...at(0.8, -0.2), ...at(0.8, 0.35));
    p.bezierCurveTo(...at(0.8, 0.78), ...at(0.45, 1), ...at(0, 1));
    p.bezierCurveTo(...at(-0.45, 1), ...at(-0.8, 0.78), ...at(-0.8, 0.35));
    p.bezierCurveTo(...at(-0.8, 0.05), ...at(-0.62, -0.2), ...at(-0.45, -0.35));
    p.bezierCurveTo(...at(-0.4, -0.1), ...at(-0.3, 0), ...at(-0.2, 0.02));
    p.bezierCurveTo(...at(-0.25, -0.4), ...at(-0.15, -0.75), ...at(0, -1));
    p.closePath();
    if (outlined) paint(p, ink, fill);
    else p.fill(fill);
  };
  shape(1, 0, ink.body, true);
  shape(0.5, 0.5, ink.accent, false);
}

function skull(p: Pen, ink: StickerInk, pose: StickerPose) {
  const drop = pose.hit * 0.14;
  p.roundRect(-0.5, 0.5 + drop, 1, 0.46, 0.1);
  paint(p, ink, ink.body);
  for (const x of [-0.25, 0, 0.25]) {
    p.moveTo(x, 0.62 + drop);
    p.lineTo(x, 0.94 + drop);
    p.stroke(ink.edge, THIN);
  }
  p.moveTo(-0.72, 0.3);
  p.bezierCurveTo(-1, -0.1, -0.85, -1, 0, -1);
  p.bezierCurveTo(0.85, -1, 1, -0.1, 0.72, 0.3);
  p.lineTo(0.5, 0.5);
  p.lineTo(-0.5, 0.5);
  p.closePath();
  paint(p, ink, ink.body);
  for (const x of [-0.34, 0.34]) {
    p.circle(x, -0.1, 0.25);
    p.fill(ink.dark);
    p.circle(x + Math.cos(pose.gaze) * 0.07, -0.1 + Math.sin(pose.gaze) * 0.07, 0.07);
    p.fill(ink.accent);
  }
  p.poly([0, 0.12, -0.11, 0.34, 0.11, 0.34]);
  p.fill(ink.dark);
}

function smiley(p: Pen, ink: StickerInk, pose: StickerPose) {
  p.circle(0, 0, 1);
  paint(p, ink, ink.body);
  const variant = pose.variant % VARIANTS;
  if (variant === 2) {
    p.poly([-0.78, -0.42, -0.04, -0.42, -0.1, 0.02, -0.5, 0.1, -0.74, -0.04]);
    p.fill(ink.dark);
    p.poly([0.78, -0.42, 0.04, -0.42, 0.1, 0.02, 0.5, 0.1, 0.74, -0.04]);
    p.fill(ink.dark);
    p.moveTo(-0.55, -0.32);
    p.lineTo(-0.34, -0.32);
    p.stroke(ink.light, 0.05);
  } else {
    p.ellipse(-0.36, -0.28, 0.12, 0.22);
    p.fill(ink.dark);
    if (variant === 1) {
      p.moveTo(0.2, -0.26);
      p.quadraticCurveTo(0.36, -0.46, 0.52, -0.26);
      p.stroke(ink.dark, 0.08);
    } else {
      p.ellipse(0.36, -0.28, 0.12, 0.22);
      p.fill(ink.dark);
    }
  }
  const open = 0.1 + pose.hit * 0.25;
  p.moveTo(-0.62, 0.12);
  p.bezierCurveTo(-0.5, 0.7 + open, 0.5, 0.7 + open, 0.62, 0.12);
  p.closePath();
  paint(p, ink, ink.dark, EDGE * 0.8);
  p.ellipse(0, 0.5 + open * 0.5, 0.24, 0.1 + open * 0.12);
  p.fill(ink.accent);
  p.roundRect(-0.46, 0.1, 0.92, 0.14, 0.05);
  p.fill(ink.light);
  for (const x of [-0.7, 0.7]) {
    p.ellipse(x, 0.18, 0.13, 0.09);
    p.fill(ink.accent);
  }
}

function heart(p: Pen, ink: StickerInk) {
  p.moveTo(0, 0.95);
  p.bezierCurveTo(-1.25, 0.1, -0.85, -0.95, 0, -0.45);
  p.bezierCurveTo(0.85, -0.95, 1.25, 0.1, 0, 0.95);
  p.closePath();
  paint(p, ink, ink.body);
  p.moveTo(-0.62, -0.1);
  p.quadraticCurveTo(-0.7, -0.4, -0.42, -0.46);
  p.stroke(ink.light, 0.08);
}

/** Draws one sticker, centred on the Graphics' origin, `radius` pixels from the middle to the edge. */
export function drawSticker(g: Graphics, id: StickerId, ink: StickerInk, pose: StickerPose, radius: number) {
  const p = new Pen(g, radius);
  switch (id) {
    case 'lips': return lips(p, ink, pose);
    case 'monster': return monster(p, ink, pose);
    case 'eye': return eye(p, ink, pose);
    case 'star': return star(p, ink, pose);
    case 'bolt': return bolt(p, ink);
    case 'flame': return flame(p, ink, pose);
    case 'skull': return skull(p, ink, pose);
    case 'smiley': return smiley(p, ink, pose);
    case 'heart': return heart(p, ink);
  }
}
