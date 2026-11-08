import { HEIGHT, WIDTH } from './composition';
import type { AdLayout, AdPalette } from './ad-fonts';
import { drawSvgMeshPaperCutout } from './paper-mesh';

/**
 * Layer 1 — Graphic base (designed plate that pulses).
 * Layer 2 — Beat props (beast, scratch, alien…) that appear WITH the pulse, not alone.
 * Layer 3 — Lyrics (ad-punch).
 *
 * Neon dots removed. Props never ship as standalone pack cards.
 */

export const AD_BASES = ['pulse', 'paper-cutout', 'riso', 'noir', 'oil', 'slam', 'hold', 'bank'] as const;
export type AdBaseId = (typeof AD_BASES)[number];

/** Elements that ride the pulse hit — mood picks which. */
export const AD_BEAT_PROPS = ['none', 'beast', 'scratch'] as const;
export type AdBeatProp = (typeof AD_BEAT_PROPS)[number];

export type WorldPaint = {
  beat: number;
  energy: number;
  frame: number;
  palette: AdPalette;
  layout: AdLayout;
};

export type FlashPlateColors = { bg: string; ink: string; accent: string; flipped: boolean };

export function fill(ctx: CanvasRenderingContext2D, color: string) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

export function paperGrain(ctx: CanvasRenderingContext2D, amount: number, seed: number) {
  ctx.save();
  ctx.globalAlpha = Math.max(0.05, Math.min(0.2, amount));
  for (let i = 0; i < 1200; i++) {
    const x = (i * 7919 + seed * 17) % WIDTH;
    const y = (i * 9973 + seed * 31) % HEIGHT;
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.85)' : 'rgba(40,20,10,0.65)';
    ctx.fillRect(x, y, 1 + (i % 2), 1);
  }
  ctx.restore();
}

export function vignette(ctx: CanvasRenderingContext2D, strength: number) {
  const g = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, HEIGHT * 0.25, WIDTH / 2, HEIGHT / 2, HEIGHT * 0.78);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

export function flashPlate(
  ctx: CanvasRenderingContext2D,
  beat: number,
  energy: number,
  palette: AdPalette,
  frame: number,
  darkBase = '#050505',
): FlashPlateColors {
  const threshold = 0.48 - energy * 0.12;
  const wantFlip = beat > threshold;
  const flipped = wantFlip && (energy < 0.72 || frame % 2 === 0);
  const bg = flipped ? palette.accent : darkBase;
  const ink = flipped ? darkBase : '#f5f5f5';
  const accent = flipped ? '#f5f5f5' : palette.accent;
  fill(ctx, bg);
  return { bg, ink, accent, flipped };
}

/** Wolf / panther head — clear animal silhouette for beat props. */
export function drawBeastHead(ctx: CanvasRenderingContext2D, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, -20, 120, 110, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-95, -90);
  ctx.lineTo(-130, -200);
  ctx.lineTo(-40, -120);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(95, -90);
  ctx.lineTo(130, -200);
  ctx.lineTo(40, -120);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-55, 40);
  ctx.quadraticCurveTo(0, 160, 55, 40);
  ctx.quadraticCurveTo(0, 70, -55, 40);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 95, 28, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#06040a';
  ctx.beginPath();
  ctx.ellipse(-48, -30, 22, 16, -0.2, 0, Math.PI * 2);
  ctx.ellipse(48, -30, 22, 16, 0.2, 0, Math.PI * 2);
  ctx.fill();
}

/** Pulse graphic base — Nosebleeds flash plate + bars. */
export function drawPulseBase(ctx: CanvasRenderingContext2D, p: WorldPaint): FlashPlateColors {
  const plate = flashPlate(ctx, p.beat, p.energy, p.palette, p.frame, '#050505');
  const barH = 10 + p.energy * 22 + p.beat * 28;
  ctx.fillStyle = plate.accent;
  ctx.fillRect(0, 0, WIDTH, barH);
  ctx.fillRect(0, HEIGHT - barH, WIDTH, barH);
  paperGrain(ctx, 0.08 + (plate.flipped ? 0.04 : 0), 3);
  vignette(ctx, plate.flipped ? 0.18 : 0.4);
  return plate;
}

export function drawHoldBase(ctx: CanvasRenderingContext2D, p: WorldPaint) {
  fill(ctx, p.palette.bg || '#0c0c10');
  ctx.strokeStyle = p.palette.accent;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 2;
  ctx.strokeRect(48, 48, WIDTH - 96, HEIGHT - 96);
  ctx.globalAlpha = 1;
}

/**
 * Paper cutout plate — svg-mesh-3d silhouettes (MIT), layered + beat lift.
 * Hand-authored paths only; no from-scratch organic diorama.
 */
export function drawPaperCutoutBase(ctx: CanvasRenderingContext2D, p: WorldPaint): FlashPlateColors {
  return drawSvgMeshPaperCutout(ctx, p);
}

/**
 * Beat prop: beast — only visible / punched on the hit (rides the pulse).
 * When beat is quiet, prop sits dim; on hit it scales hard.
 */
function drawBeastProp(ctx: CanvasRenderingContext2D, p: WorldPaint) {
  const onHit = p.beat > 0.22;
  const hit = onHit ? 0.9 + p.beat * 0.4 + p.energy * 0.1 : 0.55 + p.energy * 0.08;
  const alpha = onHit ? 0.95 : 0.28;
  const bob = Math.sin(p.frame / 14) * 6 * (0.2 + p.energy);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(WIDTH / 2 + p.layout.driftX * 0.1, HEIGHT * 0.38 + bob);
  ctx.scale(hit * p.layout.scaleBias, hit * p.layout.scaleBias);
  ctx.rotate(p.layout.rotate + (onHit ? (p.beat - 0.5) * 0.08 : 0));
  ctx.save();
  ctx.translate(10, 12);
  ctx.globalAlpha = alpha * 0.5;
  drawBeastHead(ctx, p.palette.accent);
  ctx.restore();
  drawBeastHead(ctx, onHit && p.beat > 0.55 ? '#ffffff' : '#e8e8e8');
  ctx.restore();
}

/** Beat prop: scratches — flare with the pulse, idle almost gone. */
function drawScratchProp(ctx: CanvasRenderingContext2D, p: WorldPaint) {
  const onHit = p.beat > 0.28;
  const count = 12 + Math.floor(p.energy * 8);
  ctx.lineWidth = 2 + p.beat * 2;
  ctx.strokeStyle = p.palette.accent;
  for (let i = 0; i < count; i++) {
    const seed = (i * 9973 + Math.floor(p.frame / 3) * 7) % 1000;
    const x0 = (i * 173 + seed) % WIDTH;
    const y0 = ((i * 419 + seed * 2) % HEIGHT) * 0.65;
    const len = 70 + (seed % 160) + p.beat * 50;
    const ang = -0.65 + (seed % 100) / 180;
    ctx.globalAlpha = onHit ? 0.5 + (i % 3) * 0.12 : 0.06 + (i % 3) * 0.02;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function drawBeatProp(ctx: CanvasRenderingContext2D, prop: AdBeatProp, p: WorldPaint) {
  if (prop === 'beast') drawBeastProp(ctx, p);
  else if (prop === 'scratch') drawScratchProp(ctx, p);
}

/**
 * Full graphic stack: designed plate (pulses) → beat prop on the hit → lyrics.
 */
export function drawGraphicStack(
  ctx: CanvasRenderingContext2D,
  base: AdBaseId,
  prop: AdBeatProp,
  p: WorldPaint,
): FlashPlateColors | null {
  let plate: FlashPlateColors | null = null;
  if (base === 'hold') {
    drawHoldBase(ctx, p);
  } else if (base === 'paper-cutout') {
    plate = drawPaperCutoutBase(ctx, p);
  } else {
    plate = drawPulseBase(ctx, p);
  }
  drawBeatProp(ctx, prop, p);
  return plate;
}
