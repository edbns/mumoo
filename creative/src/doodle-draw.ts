import {
  ARM_BACK, ARM_FRONT, BEARDS, BODIES, GROUND, HAIR, HATS, HEADS, HEAD_CENTRE, HEAD_SCALE, INK, NECK, PROPS, SHOULDER_OF, WORN, moodFace,
  type DoodleMood,
} from './doodle-parts';
import { singersOf, type DoodlePaper, type Singer } from './doodle-cast';
import { cssFont, displayFace, type AdFont } from './ad-fonts';

/**
 * Doodle: draws a singer, the paper and the speech bubble onto a 2D canvas. Every frame is a pure function of the
 * clock, the beats and the words, so the preview on the shelf and the cloud render draw the same picture.
 * The lines "boil" the way a flip-book of pen drawings does: every stroke is redrawn a hair off several times a second.
 */

type Op = {
  shape: 'path' | 'circle' | 'ellipse' | 'rect';
  d?: string; cx?: number; cy?: number; r?: number; rx?: number; ry?: number; x?: number; y?: number; width?: number; height?: number;
  fill: string | null;
  stroke: string | null;
  lineWidth: number;
  turn?: { angle: number; x: number; y: number };
  path?: Path2D;
};

const PAPER_FILL = '#fff';
const parsed = new Map<string, Op[]>();

function attributes(text: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const match of text.matchAll(/([a-z-]+)="([^"]*)"/g)) found[match[1]] = match[2];
  return found;
}

/** The strokes of a piece of SVG, with the pen every part is drawn with unless it says otherwise (black, five units wide, filled with paper). */
export function strokes(svg: string): Op[] {
  const cached = parsed.get(svg);
  if (cached) return cached;
  const ops: Op[] = [];
  for (const match of svg.matchAll(/<(path|circle|ellipse|rect)\b([^>]*?)\/?>/g)) {
    const a = attributes(match[2]);
    const num = (name: string) => Number(a[name] ?? 0);
    const turn = a.transform?.match(/rotate\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\)/);
    ops.push({
      shape: match[1] as Op['shape'],
      ...(a.d ? { d: a.d } : {}),
      cx: num('cx'), cy: num('cy'), r: num('r'), rx: num('rx'), ry: num('ry'), x: num('x'), y: num('y'), width: num('width'), height: num('height'),
      fill: a.fill === 'none' ? null : a.fill ?? PAPER_FILL,
      stroke: a.stroke === 'none' ? null : a.stroke ?? INK,
      lineWidth: a['stroke-width'] ? Number(a['stroke-width']) : 5,
      ...(turn ? { turn: { angle: (Number(turn[1]) * Math.PI) / 180, x: Number(turn[2]), y: Number(turn[3]) } } : {}),
    });
  }
  parsed.set(svg, ops);
  return ops;
}

function shapeOf(op: Op): Path2D {
  if (op.path) return op.path;
  const path = new Path2D();
  if (op.shape === 'path') return (op.path = new Path2D(op.d));
  if (op.shape === 'circle') path.arc(op.cx!, op.cy!, op.r!, 0, Math.PI * 2);
  else if (op.shape === 'ellipse') path.ellipse(op.cx!, op.cy!, op.rx!, op.ry!, 0, 0, Math.PI * 2);
  else path.roundRect(op.x!, op.y!, op.width!, op.height!, op.rx || 0);
  return (op.path = path);
}

/** A number from three numbers, the same each time: where a stroke wanders to in a given redraw. */
function noise(a: number, b: number, c: number) {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** How the strokes are drawn: the paper colour fills what is "white", and each stroke is a hair off its place in this redraw. */
type Pen = { ctx: CanvasRenderingContext2D; paper: string; boil: number; seed: number; wander: number };

function draw(pen: Pen, svg: string, salt: number) {
  const { ctx } = pen;
  strokes(svg).forEach((op, index) => {
    ctx.save();
    ctx.translate((noise(pen.seed, pen.boil, salt * 97 + index * 2) - 0.5) * 2 * pen.wander, (noise(pen.seed, pen.boil, salt * 97 + index * 2 + 1) - 0.5) * 2 * pen.wander);
    if (op.turn) { ctx.translate(op.turn.x, op.turn.y); ctx.rotate(op.turn.angle); ctx.translate(-op.turn.x, -op.turn.y); }
    const path = shapeOf(op);
    if (op.fill) { ctx.fillStyle = op.fill === PAPER_FILL ? pen.paper : op.fill; ctx.fill(path); }
    if (op.stroke) { ctx.strokeStyle = op.stroke === PAPER_FILL ? pen.paper : op.stroke; ctx.lineWidth = op.lineWidth; ctx.stroke(path); }
    ctx.restore();
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Paper

export const PAPER_COLOUR: Record<DoodlePaper, string> = { white: '#fbfaf4', ruled: '#fbf9ee', graph: '#f6f8f4', kraft: '#cfb28a' };

function paper(ctx: CanvasRenderingContext2D, kind: DoodlePaper, width: number, height: number, seed: number) {
  ctx.fillStyle = PAPER_COLOUR[kind];
  ctx.fillRect(0, 0, width, height);
  ctx.lineWidth = 3;
  if (kind === 'ruled') {
    ctx.strokeStyle = 'rgba(96,142,196,0.5)';
    for (let y = 150; y < height; y += 76) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(214,84,84,0.55)';
    ctx.beginPath(); ctx.moveTo(118, 0); ctx.lineTo(118, height); ctx.stroke();
  } else if (kind === 'graph') {
    ctx.strokeStyle = 'rgba(94,150,170,0.38)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= width; x += 54) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    for (let y = 0; y <= height; y += 54) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  }
  // Specks of the paper itself.
  ctx.fillStyle = kind === 'kraft' ? 'rgba(90,60,30,0.16)' : 'rgba(110,100,80,0.10)';
  for (let n = 0; n < 220; n++) {
    ctx.beginPath();
    ctx.arc(noise(seed, n, 1) * width, noise(seed, n, 2) * height, 1 + noise(seed, n, 3) * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // A strip of tape at each top corner.
  ctx.fillStyle = kind === 'kraft' ? 'rgba(244,236,206,0.78)' : 'rgba(226,214,164,0.7)';
  for (const [x, y, turn] of [[78, 34, -0.5], [width - 78, 34, 0.5]] as const) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(turn); ctx.fillRect(-92, -26, 184, 52); ctx.restore();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Speech bubble

/** The points round a rounded box, walked once: straight sides in a few steps, corners in a few more. */
function roundedBox(x: number, y: number, w: number, h: number, radius: number): [number, number][] {
  const out: [number, number][] = [];
  const side = (x1: number, y1: number, x2: number, y2: number, steps: number) => { for (let i = 0; i < steps; i++) out.push([x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps]); };
  const corner = (cx: number, cy: number, from: number, steps: number) => { for (let i = 0; i < steps; i++) { const a = from + ((Math.PI / 2) * i) / steps; out.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]); } };
  side(x + radius, y, x + w - radius, y, 10);
  corner(x + w - radius, y + radius, -Math.PI / 2, 5);
  side(x + w, y + radius, x + w, y + h - radius, 4);
  corner(x + w - radius, y + h - radius, 0, 5);
  side(x + w - radius, y + h, x + radius, y + h, 10);
  corner(x + radius, y + h - radius, Math.PI / 2, 5);
  side(x, y + h - radius, x, y + radius, 4);
  corner(x + radius, y + radius, Math.PI, 5);
  return out;
}

/** A speech bubble whose outline wanders a little, differently each redraw, with a tail to the singer. */
function blob(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, boil: number, seed: number, tail: { x: number; y: number }) {
  const points = roundedBox(x, y, w, h, Math.min(h / 2, 80)).map(([px, py], i): [number, number] => [px + (noise(seed, boil, i) - 0.5) * 6, py + (noise(seed, boil, i + 99) - 0.5) * 6]);
  const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  ctx.beginPath();
  const start = mid(points[points.length - 1], points[0]);
  ctx.moveTo(start[0], start[1]);
  points.forEach((point, i) => { const next = mid(point, points[(i + 1) % points.length]); ctx.quadraticCurveTo(point[0], point[1], next[0], next[1]); });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // The tail: two strokes down to the singer, with the bubble's edge between them painted out so bubble and tail are one line.
  const base = Math.max(x + 120, Math.min(x + w - 210, tail.x - 45));
  ctx.beginPath();
  ctx.moveTo(base, y + h - 4);
  ctx.lineTo(tail.x, tail.y);
  ctx.lineTo(base + 90, y + h - 4);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(base, y + h - 2);
  ctx.lineTo(tail.x, tail.y);
  ctx.lineTo(base + 90, y + h - 2);
  ctx.stroke();
  const stroke = ctx.strokeStyle;
  ctx.strokeStyle = ctx.fillStyle;
  ctx.beginPath();
  ctx.moveTo(base + 5, y + h - 1);
  ctx.lineTo(base + 85, y + h - 1);
  ctx.stroke();
  ctx.strokeStyle = stroke;
}

function lines(ctx: CanvasRenderingContext2D, text: string, font: AdFont, size: number, maxWidth: number) {
  ctx.font = cssFont(displayFace(font), size);
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) { out.push(line); line = word; } else line = next;
  }
  if (line) out.push(line);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The scene

export type DoodleFrame = {
  width: number;
  height: number;
  /** A card's singers (`doodle-cast.ts`), its paper, the mood of the song and the hand the words are in. */
  id: string;
  paper: DoodlePaper;
  mood: DoodleMood;
  font: AdFont;
  /** The card's own seed: where the strokes wander. */
  seed: number;
  ms: number;
  /** 0 to 1, how hard the last beat is still hitting; and how many beats have fallen. */
  beat: number;
  beatIndex: number;
  /** The phrase being sung (empty between phrases), when it began, and whether a word is being sung right now. */
  phrase: string;
  phraseStartMs: number;
  singing: boolean;
};

/** How often the lines are redrawn a hair off, per second. */
const BOIL_PER_SECOND = 9;
const easeOutBack = (t: number) => { const c = 1.9; const x = Math.min(1, Math.max(0, t)) - 1; return 1 + (c + 1) * x ** 3 + c * x ** 2; };

function singer(pen: Pen, who: Singer, mood: DoodleMood, at: { x: number; y: number; scale: number }, motion: { beat: number; beatIndex: number; talk: number; salt: number; ms: number }) {
  const { ctx } = pen;
  const sway = (motion.beatIndex % 2 ? 1 : -1) * 0.028 * (0.5 + 0.5 * (1 - motion.beat));
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.scale(at.scale, at.scale);
  ctx.translate(0, -motion.beat * 7);
  // The figure's feet are the origin: it sways about them.
  ctx.rotate(sway);
  ctx.translate(-150, -GROUND);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const head = HEADS[who.head];
  const [shoulderX, shoulderY] = SHOULDER_OF(who.body);
  const salt = motion.salt;
  // The waving arm swings up on every other beat.
  ctx.save();
  ctx.translate(shoulderX, shoulderY);
  ctx.rotate((motion.beatIndex % 2 ? -0.32 : 0.06) * (0.35 + 0.65 * motion.beat) + Math.sin(motion.ms / 240) * 0.05);
  ctx.translate(-shoulderX, -shoulderY);
  draw(pen, ARM_BACK(who.body), salt + 1);
  ctx.restore();
  draw(pen, BODIES[who.body], salt + 2);
  draw(pen, NECK, salt + 3);
  who.props.filter(prop => WORN.includes(prop)).forEach((prop, i) => draw(pen, PROPS[prop], salt + 4 + i));

  // The head is drawn bigger than a person's, and nods against the sway.
  ctx.save();
  ctx.translate(HEAD_CENTRE[0], HEAD_CENTRE[1] + 12);
  ctx.rotate(-sway * 1.4);
  ctx.scale(HEAD_SCALE, HEAD_SCALE);
  ctx.translate(-HEAD_CENTRE[0], -HEAD_CENTRE[1] - 12);
  draw(pen, HAIR[who.hair].back, salt + 8);
  draw(pen, head.draw, salt + 9);
  if (who.beard) draw(pen, BEARDS[who.beard], salt + 10);
  draw(pen, HAIR[who.hair].front, salt + 11);
  draw(pen, moodFace(mood, head.face, motion.talk), salt + 12);
  ctx.save();
  ctx.translate(0, head.hatDy);
  who.hat.forEach((hat, i) => draw(pen, HATS[hat], salt + 13 + i));
  ctx.restore();
  ctx.restore();

  draw(pen, ARM_FRONT(who.body), salt + 20);
  who.props.filter(prop => !WORN.includes(prop)).forEach((prop, i) => draw(pen, PROPS[prop], salt + 22 + i));
  ctx.restore();
}

/** The mouth of a head in the frame's pixels: where a bubble's tail points. */
function above(at: { x: number; y: number; scale: number }) {
  return { x: at.x + (150 - 150) * at.scale, y: at.y + (-30 - GROUND) * at.scale };
}

export function drawDoodle(ctx: CanvasRenderingContext2D, frame: DoodleFrame) {
  const { width, height, ms } = frame;
  const boil = Math.floor((ms / 1000) * BOIL_PER_SECOND);
  paper(ctx, frame.paper, width, height, frame.seed);
  const pen: Pen = { ctx, paper: PAPER_COLOUR[frame.paper], boil, seed: frame.seed, wander: 1.5 };
  const who = singersOf(frame.id);
  const ground = height * 0.8;
  const spots = who.length === 1
    ? [{ x: width / 2, y: ground, scale: 2.7 }]
    : [{ x: width * 0.31, y: ground, scale: 2.15 }, { x: width * 0.71, y: ground, scale: 2.15 }];

  // The ground line.
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(70, ground + 10 + noise(frame.seed, boil, 5) * 6);
  ctx.bezierCurveTo(width * 0.35, ground - 2 + noise(frame.seed, boil, 6) * 8, width * 0.7, ground + 18, width - 70, ground + 8 + noise(frame.seed, boil, 7) * 6);
  ctx.stroke();

  // In a duet the singers take the phrases in turns.
  const speaker = who.length === 1 ? 0 : Math.floor(noise(frame.seed, Math.round(frame.phraseStartMs / 10), 3) * who.length);
  who.forEach((one, index) => {
    const talk = frame.singing && index === speaker ? 0.5 + 0.5 * Math.abs(Math.sin(ms / 95)) : 0;
    singer(pen, one, frame.mood, spots[index], { beat: frame.beat, beatIndex: frame.beatIndex + index, talk, salt: index * 40, ms });
  });

  // The bubble.
  ctx.lineWidth = 9;
  ctx.strokeStyle = INK;
  ctx.fillStyle = '#fff';
  const text = frame.phrase.trim().toLowerCase();
  if (!text) return;
  const popped = easeOutBack((ms - frame.phraseStartMs) / 190);
  const box = { x: 70, y: 120, w: width - 140 };
  let size = 104;
  let rows = lines(ctx, text, frame.font, size, box.w - 110);
  while (rows.length > 3 && size > 58) { size -= 6; rows = lines(ctx, text, frame.font, size, box.w - 110); }
  const lineHeight = size * 1.12;
  const h = Math.min(520, rows.length * lineHeight + 84);
  const target = above(spots[speaker]);
  ctx.save();
  ctx.translate(width / 2, box.y + h);
  ctx.scale(0.88 + 0.12 * popped, 0.88 + 0.12 * popped);
  ctx.translate(-width / 2, -(box.y + h));
  blob(ctx, box.x, box.y, box.w, h, boil, frame.seed, target);
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = cssFont(displayFace(frame.font), size);
  rows.forEach((row, i) => ctx.fillText(row, width / 2, box.y + 42 + lineHeight * (i + 0.5) + (noise(frame.seed, boil, 300 + i) - 0.5) * 3));
  ctx.restore();
}
