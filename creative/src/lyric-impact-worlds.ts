import { HEIGHT, WIDTH, type ImpactVariant, type ImpactWorldId } from './composition';
import {
  type DrawContext,
  clamp01,
  easeOutCubic,
  hash01,
  lerp,
} from './lyric-impact-motion';
import { blitPreparedPlate, paintHeroDepthForeground, prepareHeroDepthPlate } from './lyric-impact-plate';

export type ImpactWorldMeta = {
  id: ImpactWorldId;
  name: string;
  description: string;
  preferredStyles: readonly ImpactVariant[];
  blockedStyles: readonly ImpactVariant[];
  accent: string;
  paper: string;
};

/** Featured compositions — one world × one intact lyric style. */
export const IMPACT_WORLD_FEATURES = [
  { world: 'cinematic-depth' as const, style: 'tunnel' as const, title: 'Cinematic Depth', subtitle: 'Tunnel over baked cinematic plate' },
  { world: 'material-motion' as const, style: 'collision' as const, title: 'Material Motion', subtitle: 'Collision in chrome & glass' },
  { world: 'editorial-collage' as const, style: 'pull-quote' as const, title: 'Editorial Collage', subtitle: 'Pull Quote on art-directed layers' },
] as const;

/** Worlds that need async baked footage before typography. */
export function worldNeedsPlate(world: ImpactWorldId | null | undefined) {
  return world === 'cinematic-depth';
}

export const IMPACT_WORLDS_META: readonly ImpactWorldMeta[] = [
  {
    id: 'cinematic-depth',
    name: 'Cinematic Depth',
    description: 'Baked cinematic plate with depth grade and Tunnel lyrics',
    preferredStyles: ['tunnel', 'monument', 'folio', 'telescope', 'colonnade', 'type-curtain'],
    blockedStyles: ['mosaic', 'ticker-wall', 'stamp-sheet', 'stencil', 'duotone-split'],
    accent: '#7dd3fc',
    paper: '#071018',
  },
  {
    id: 'material-motion',
    name: 'Material Motion',
    description: 'Chrome, glass, liquid light and soft glow',
    preferredStyles: ['collision', 'billboard', 'concrete', 'rubber-band', 'mirror-axis', 'cutout-stack'],
    blockedStyles: ['margin-note', 'folio', 'pull-quote', 'stencil', 'ticker-wall'],
    accent: '#e2e8f0',
    paper: '#09090b',
  },
  {
    id: 'editorial-collage',
    name: 'Editorial Collage',
    description: 'Masked photo-graphic layers and cinematic cuts',
    preferredStyles: ['pull-quote', 'overprint', 'margin-note', 'cutout-stack', 'wipe-blade', 'slit-reveal'],
    blockedStyles: ['skyline', 'mosaic', 'ticker-wall', 'gravity-drop', 'wave-deform'],
    accent: '#f43f5e',
    paper: '#1c1917',
  },
];

export function worldMeta(id: ImpactWorldId) {
  return IMPACT_WORLDS_META.find(item => item.id === id) ?? IMPACT_WORLDS_META[0];
}

export function worldCompatible(world: ImpactWorldId, style: ImpactVariant) {
  return !worldMeta(world).blockedStyles.includes(style);
}

type WorldSignals = { beat: number; energy: number; onset: number; low: number; bright: number; change: number };

function worldSignals(draw: DrawContext): WorldSignals {
  const { music, ms, reaction } = draw;
  let onset = 0;
  let low = reaction.energy * 0.55;
  let bright = 0.35;
  let change = 0;
  if (music?.onsetsMs?.length) {
    let recent = -Infinity;
    for (const hit of music.onsetsMs) {
      if (hit > ms) break;
      recent = hit;
    }
    onset = Math.exp(-Math.max(0, ms - recent) / 140);
  }
  if (music?.spectrum?.length) {
    let point = music.spectrum[0];
    for (const sample of music.spectrum) {
      if (sample.timeMs > ms) break;
      point = sample;
    }
    low = clamp01(point.lowShare);
    bright = clamp01(point.centroidHz / 6000);
  }
  if (music?.energy?.length) {
    let previous = music.energy[0]?.rms ?? 0;
    let current = previous;
    for (const sample of music.energy) {
      if (sample.timeMs > ms) break;
      previous = current;
      current = sample.rms;
    }
    change = clamp01(Math.abs(current - previous) * 4);
  }
  return { beat: reaction.beat, energy: reaction.energy, onset, low, bright, change };
}

let activeWorld: { id: ImpactWorldId; draw: DrawContext; plate?: CanvasImageSource | null } | null = null;

export function beginImpactWorld(
  id: ImpactWorldId | null | undefined,
  draw: DrawContext,
  plate?: CanvasImageSource | null,
) {
  activeWorld = id ? { id, draw, plate: plate ?? null } : null;
}

export function endImpactWorld() {
  activeWorld = null;
}

export function paintActiveWorldBackground(ctx: CanvasRenderingContext2D) {
  if (!activeWorld || ctx !== activeWorld.draw.ctx) return false;
  if (activeWorld.plate) {
    blitPreparedPlate(ctx, activeWorld.plate);
    return true;
  }
  paintWorldBackground(activeWorld.draw, activeWorld.id);
  return true;
}

export function paintWorldBackground(draw: DrawContext, world: ImpactWorldId) {
  const { ctx } = draw;
  ctx.save();
  if (world === 'cinematic-depth') paintDepthBackground(draw);
  else if (world === 'material-motion') paintMaterialBackground(draw);
  else paintCollageBackground(draw);
  ctx.restore();
}

export async function prepareWorldPlate(draw: DrawContext, world: ImpactWorldId) {
  if (world !== 'cinematic-depth') return null;
  try {
    return await prepareHeroDepthPlate(draw);
  } catch {
    return null;
  }
}

export function paintWorldForeground(draw: DrawContext, world: ImpactWorldId) {
  const { ctx } = draw;
  ctx.save();
  if (world === 'cinematic-depth') paintHeroDepthForeground(draw);
  else if (world === 'material-motion') paintMaterialForeground(draw);
  else paintCollageForeground(draw);
  ctx.restore();
}

function paintDepthBackground(draw: DrawContext) {
  const { ctx, frame, ms } = draw;
  const signal = worldSignals(draw);
  const camX = Math.sin(ms / 4200) * 26 + signal.beat * 5;
  const camY = Math.cos(ms / 5100) * 16 + signal.energy * 8;
  const zoom = 1.03 + signal.energy * 0.025 + frame / 450 * 0.018;

  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, '#020617');
  sky.addColorStop(0.5, '#0c2740');
  sky.addColorStop(1, '#071018');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.save();
  ctx.translate(WIDTH / 2 + camX * 0.2, HEIGHT * 0.55 + camY * 0.15);
  ctx.scale(zoom, zoom);

  for (let layer = 0; layer < 3; layer++) {
    const depth = (layer + 1) / 3;
    const shift = camX * depth * 1.6;
    const base = 80 + layer * 140;
    ctx.fillStyle = `rgba(${10 + layer * 22},${36 + layer * 28},${58 + layer * 30},${0.4 + depth * 0.25})`;
    ctx.beginPath();
    ctx.moveTo(-700 + shift, 900);
    ctx.lineTo(-480 + shift, base - 40);
    ctx.lineTo(-220 + shift, base + 70);
    ctx.lineTo(40 + shift, base - 90);
    ctx.lineTo(300 + shift, base + 40);
    ctx.lineTo(560 + shift, base - 50);
    ctx.lineTo(700 + shift, 900);
    ctx.closePath();
    ctx.fill();
  }

  // Depth orbs
  for (let i = 0; i < 8; i++) {
    const seed = hash01(i, 3);
    const x = Math.sin(ms / 1800 + i) * (220 + seed * 200);
    const y = Math.cos(ms / 1500 + i * 0.7) * (160 + seed * 120) - 80;
    const r = 4 + seed * 9 + signal.onset * 3;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 7);
    glow.addColorStop(0, `rgba(186,230,253,${0.4 + signal.beat * 0.2})`);
    glow.addColorStop(1, 'rgba(56,189,248,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const vig = ctx.createRadialGradient(WIDTH / 2, HEIGHT * 0.42, 160, WIDTH / 2, HEIGHT / 2, 1100);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(2,6,23,0.7)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function paintMaterialBackground(draw: DrawContext) {
  const { ctx, ms } = draw;
  const signal = worldSignals(draw);

  const base = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  base.addColorStop(0, '#09090b');
  base.addColorStop(0.55, '#18181b');
  base.addColorStop(1, '#0a0a0a');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const floorY = HEIGHT * 0.64 - signal.energy * 16;
  const floor = ctx.createLinearGradient(0, floorY, 0, HEIGHT);
  floor.addColorStop(0, 'rgba(148,163,184,0.2)');
  floor.addColorStop(1, 'rgba(9,9,11,0.95)');
  ctx.fillStyle = floor;
  ctx.fillRect(0, floorY, WIDTH, HEIGHT - floorY);

  for (let i = 0; i < 2; i++) {
    const x = 140 + i * 480 + Math.sin(ms / 1700 + i) * 14;
    ctx.save();
    ctx.translate(x + 120, 520);
    ctx.rotate((-6 + i * 8) * Math.PI / 180);
    const glass = ctx.createLinearGradient(-120, -380, 120, 380);
    glass.addColorStop(0, 'rgba(255,255,255,0.1)');
    glass.addColorStop(0.5, 'rgba(148,163,184,0.05)');
    glass.addColorStop(1, 'rgba(255,255,255,0.03)');
    ctx.fillStyle = glass;
    ctx.fillRect(-120, -380, 240, 760);
    ctx.strokeStyle = `rgba(226,232,240,${0.2 + signal.bright * 0.12})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(-120, -380, 240, 760);
    ctx.fillStyle = `rgba(255,255,255,${0.14 + signal.onset * 0.12})`;
    ctx.fillRect(-70 + signal.beat * 16, -320, 14, 620);
    ctx.restore();
  }

  for (let i = 0; i < 4; i++) {
    const seed = hash01(i, 40);
    const orbit = ms / (1500 + seed * 700) + i;
    const cx = WIDTH / 2 + Math.cos(orbit) * (160 + seed * 180);
    const cy = HEIGHT * 0.38 + Math.sin(orbit * 0.9) * 140;
    const r = 54 + seed * 48 + signal.energy * 10;
    const metal = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.08, cx, cy, r);
    metal.addColorStop(0, '#fff');
    metal.addColorStop(0.25, '#e2e8f0');
    metal.addColorStop(0.55, '#64748b');
    metal.addColorStop(1, '#020617');
    ctx.fillStyle = metal;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    const glow = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, r * 2.1);
    glow.addColorStop(0, `rgba(148,163,184,${0.12 + signal.beat * 0.08})`);
    glow.addColorStop(1, 'rgba(148,163,184,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.1, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.beginPath();
  for (let x = 0; x <= WIDTH; x += 24) {
    const y = HEIGHT * 0.72 + Math.sin(x / 70 + ms / 500) * (24 + signal.energy * 28);
    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = `rgba(226,232,240,${0.35 + signal.onset * 0.2})`;
  ctx.lineWidth = 3 + signal.beat * 3;
  ctx.stroke();
}

function paintMaterialForeground(draw: DrawContext) {
  const { ctx } = draw;
  const signal = worldSignals(draw);
  const bloom = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 100, WIDTH / 2, HEIGHT / 2, 880);
  bloom.addColorStop(0, `rgba(255,255,255,${0.03 + signal.onset * 0.04})`);
  bloom.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = `rgba(226,232,240,${0.14 + signal.bright * 0.1})`;
  ctx.lineWidth = 3;
  ctx.strokeRect(28, 28, WIDTH - 56, HEIGHT - 56);
}

function paintCollageBackground(draw: DrawContext) {
  const { ctx, ms } = draw;
  const signal = worldSignals(draw);

  ctx.fillStyle = '#1c1917';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const panels = [
    { x: 40, y: 100, w: 560, h: 480, rot: -6, color: '#9f1239' },
    { x: 500, y: 240, w: 560, h: 420, rot: 4, color: '#44403c' },
    { x: 80, y: 820, w: 500, h: 560, rot: 3, color: '#fafaf9' },
    { x: 540, y: 940, w: 520, h: 620, rot: -4, color: '#e11d48' },
  ];

  panels.forEach((panel, index) => {
    const slide = (signal.change * 28 + signal.onset * 16) * (index % 2 ? 1 : -1);
    const drift = Math.sin(ms / 2200 + index) * 8;
    ctx.save();
    ctx.translate(panel.x + panel.w / 2 + slide * 0.12 + drift, panel.y + panel.h / 2);
    ctx.rotate((panel.rot + signal.beat * (index % 2 ? 0.5 : -0.35)) * Math.PI / 180);
    ctx.fillStyle = panel.color;
    ctx.fillRect(-panel.w / 2, -panel.h / 2, panel.w, panel.h);
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = index % 2 ? '#000' : '#fff';
    ctx.fillRect(-panel.w / 2 + 24, -panel.h / 2 + 40, panel.w - 48, panel.h * 0.18);
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = index % 2 ? '#fef3c7' : '#0ea5e9';
    ctx.fillRect(panel.w * 0.05, -panel.h * 0.2, panel.w * 0.28, panel.h * 0.3);
    ctx.globalAlpha = 1;
    ctx.restore();
  });

  // Lyric reading plate
  ctx.save();
  ctx.translate(WIDTH / 2, HEIGHT / 2 + 16);
  ctx.rotate((-1.2 + signal.beat * 0.3) * Math.PI / 180);
  ctx.fillStyle = 'rgba(250,250,249,0.92)';
  ctx.fillRect(-400, -300, 800, 600);
  ctx.strokeStyle = 'rgba(28,25,23,0.3)';
  ctx.lineWidth = 3;
  ctx.strokeRect(-400, -300, 800, 600);
  ctx.restore();

  if (signal.change > 0.28 || signal.onset > 0.5) {
    const progress = easeOutCubic(Math.max(signal.change, signal.onset));
    ctx.globalAlpha = 0.16 * progress;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(WIDTH * progress - 180, 0);
    ctx.lineTo(WIDTH * progress + 60, 0);
    ctx.lineTo(WIDTH * progress - 100, HEIGHT);
    ctx.lineTo(WIDTH * progress - 340, HEIGHT);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function paintCollageForeground(draw: DrawContext) {
  const { ctx, frame } = draw;
  const signal = worldSignals(draw);
  // Sparse grain — cheap and cinematic
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = frame % 2 ? '#fff' : '#000';
  for (let i = 0; i < 28; i++) {
    ctx.fillRect(hash01(frame, i) * WIDTH, hash01(frame, i + 40) * HEIGHT, 2, 2);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = `rgba(250,250,249,${0.35 + signal.beat * 0.15})`;
  ctx.lineWidth = 2;
  const m = 48;
  ctx.strokeRect(m, m, WIDTH - m * 2, HEIGHT - m * 2);
  ctx.fillStyle = `rgba(244,63,94,${0.55 + signal.onset * 0.2})`;
  ctx.fillRect(72, 120, 150 + signal.energy * 70, 4);
}

export function worldCameraOffset(draw: DrawContext) {
  const signal = worldSignals(draw);
  return {
    x: Math.sin(draw.ms / 4200) * 26 + signal.beat * 5,
    y: Math.cos(draw.ms / 5100) * 16 + signal.energy * 8,
    zoom: 1.03 + signal.energy * 0.025 + draw.frame / 450 * 0.018,
  };
}

export function lerpWorld(a: number, b: number, t: number) {
  return lerp(a, b, clamp01(t));
}
