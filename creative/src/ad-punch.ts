import { FPS, HEIGHT, WIDTH, type ImpactMusic, type LyricCue } from './composition';
import type { AdFont, AdLayout, AdPalette } from './ad-fonts';
import { entrance, impactFrame, impactSignals, wrapFit } from './ad-punch-fit';
import {
  drawGraphicStack,
  type AdBaseId,
  type AdBeatProp,
  type FlashPlateColors,
} from './ad-worlds';

/**
 * Style catalog + legacy Canvas 2D drawer.
 * Creatives Pack no longer designs here — see pack-renderer.ts (Pixi WebGL).
 * drawAdPunch remains only as a legacy reference; do not extend for new GD plates.
 */
export const META_SAFE_BOTTOM = Math.round(HEIGHT * 0.82);

export const AD_PUNCH_STYLES = [
  'slam',
  'slam-flash',
  'slam-rise',
  'slam-split',
  'noir',
  'oil',
  'riso',
  'paper-cutout',
  'paper-cutout-beast',
  'paper-cutout-scratch',
  'pulse',
  'pulse-beast',
  'pulse-scratch',
  'lyric-hold',
  'bank',
] as const;
export type AdPunchStyle = (typeof AD_PUNCH_STYLES)[number];

export const AD_PUNCH_META: {
  id: AdPunchStyle;
  name: string;
  description: string;
  tags: string[];
  base: AdBaseId;
  prop: AdBeatProp;
}[] = [
  { id: 'slam', name: 'Color Slam', description: 'Full-bleed color + kinetic lyric scale/slam', tags: ['uplifting', 'kinetic', 'high', 'saturated', 'aggressive', 'balanced'], base: 'slam', prop: 'none' },
  { id: 'slam-flash', name: 'Slam · Flash', description: 'Beat invert flash + lyric punch', tags: ['aggressive', 'kinetic', 'high', 'saturated', 'cinematic'], base: 'slam', prop: 'none' },
  { id: 'slam-rise', name: 'Slam · Rise', description: 'Lyrics rise into frame on the hit', tags: ['uplifting', 'kinetic', 'balanced', 'restrained', 'mellow'], base: 'slam', prop: 'none' },
  { id: 'slam-split', name: 'Slam · Split', description: 'Split-field color + kinetic type', tags: ['cinematic', 'balanced', 'saturated', 'kinetic', 'dark'], base: 'slam', prop: 'none' },
  { id: 'noir', name: 'Noir', description: 'Cleared photo through cinematic film grain + light', tags: ['cinematic', 'dark', 'balanced', 'restrained', 'ambient', 'mellow'], base: 'noir', prop: 'none' },
  { id: 'oil', name: 'Oil', description: 'Cleared photo as a painterly oil plate', tags: ['cinematic', 'uplifting', 'balanced', 'restrained', 'mellow', 'saturated'], base: 'oil', prop: 'none' },
  { id: 'riso', name: 'Riso', description: 'Cleared photo through riso drums + halftone', tags: ['uplifting', 'balanced', 'saturated', 'kinetic', 'restrained', 'mellow'], base: 'riso', prop: 'none' },
  { id: 'paper-cutout', name: 'Paper Cutout', description: 'Cleared photo under stacked cut-paper sheets', tags: ['uplifting', 'balanced', 'saturated', 'kinetic', 'restrained'], base: 'paper-cutout', prop: 'none' },
  { id: 'paper-cutout-beast', name: 'Paper · Beast', description: 'Paper cutout plate + beast prop on the pulse', tags: ['uplifting', 'kinetic', 'high', 'saturated', 'aggressive'], base: 'paper-cutout', prop: 'beast' },
  { id: 'paper-cutout-scratch', name: 'Paper · Scratch', description: 'Paper cutout plate + scratch flares on hits', tags: ['cinematic', 'balanced', 'kinetic', 'restrained'], base: 'paper-cutout', prop: 'scratch' },
  { id: 'pulse', name: 'Pulse', description: 'Graphic pulse plate — Nosebleeds flash', tags: ['aggressive', 'kinetic', 'high', 'dark', 'cinematic'], base: 'pulse', prop: 'none' },
  { id: 'pulse-beast', name: 'Pulse · Beast', description: 'Pulse plate + animal head hitting with the beat', tags: ['uplifting', 'kinetic', 'high', 'saturated', 'aggressive'], base: 'pulse', prop: 'beast' },
  { id: 'pulse-scratch', name: 'Pulse · Scratch', description: 'Pulse plate + scratches that flare on hits', tags: ['cinematic', 'dark', 'balanced', 'kinetic'], base: 'pulse', prop: 'scratch' },
  { id: 'bank', name: 'Look Bank', description: 'Shaders Pro background + trend lyric type', tags: ['uplifting', 'balanced', 'saturated', 'kinetic', 'restrained', 'mellow', 'cinematic', 'dark', 'ambient'], base: 'bank', prop: 'none' },
  { id: 'lyric-hold', name: 'Lyric Hold', description: 'Quiet hold — no beat prop', tags: ['cinematic', 'dark', 'balanced', 'restrained', 'ambient', 'mellow'], base: 'hold', prop: 'none' },
];

export type AdPunchOptions = {
  style: AdPunchStyle;
  font: AdFont;
  fontSecondary: AdFont;
  palette: AdPalette;
  layout: AdLayout;
  music: ImpactMusic | null;
  fallbackText: string;
};

export type { FlashPlateColors, AdBaseId, AdBeatProp };

function holdGate(beat: number): number {
  if (beat < 0.12) return 0.5;
  if (beat < 0.28) return 0.75;
  return 1;
}

function solidOffset(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  color: string,
  dx: number,
  dy: number,
) {
  ctx.fillStyle = color;
  ctx.fillText(text, x + dx, y + dy, maxW);
}

function ghostPhrase(
  ctx: CanvasRenderingContext2D,
  phrase: string,
  font: AdFont,
  color: string,
  alpha: number,
) {
  if (!phrase) return;
  const fit = wrapFit(ctx, phrase, font, 320, WIDTH * 1.15, 3);
  ctx.save();
  ctx.translate(WIDTH / 2, HEIGHT * 0.4);
  ctx.globalAlpha = Math.max(0.12, Math.min(0.5, alpha));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `400 ${fit.size}px "${font}"`;
  ctx.fillStyle = color;
  fit.lines.forEach((line, i) => {
    ctx.fillText(line, 0, (i - (fit.lines.length - 1) / 2) * fit.size * 0.8, WIDTH * 1.1);
  });
  ctx.restore();
}

function activeCopy(cues: readonly LyricCue[], frame: number, fallback: string) {
  const state = impactFrame(cues, frame);
  const phrase = state.phrase.trim();
  if (phrase) {
    return {
      phrase: phrase.toLocaleUpperCase(),
      word: (state.word || phrase).toLocaleUpperCase(),
      wordStartMs: state.wordStartMs,
    };
  }
  const fb = fallback.toLocaleUpperCase();
  return { phrase: fb, word: fb, wordStartMs: 0 };
}

function metaFor(style: AdPunchStyle) {
  return AD_PUNCH_META.find(item => item.id === style) ?? AD_PUNCH_META[0];
}

/** Cut-paper lyric type — stacked paper sheets with soft depth (AE paper-cut look). */
function drawPaperType(
  ctx: CanvasRenderingContext2D,
  o: AdPunchOptions,
  phrase: string,
  word: string,
  beat: number,
  wordEnter: number,
  accent: string,
  prop: AdBeatProp,
) {
  const wash = o.palette.wash || '#efe4d0';
  const fit = wrapFit(ctx, phrase, o.font, 150, 920, 4);
  const scale = (1 + beat * 0.08) * o.layout.scaleBias;
  const cy = prop === 'beast' ? HEIGHT * 0.72 : HEIGHT * 0.48;
  const sheets: { color: string; dx: number; dy: number }[] = [
    { color: 'rgba(28,18,10,0.28)', dx: 14 + beat * 4, dy: 16 + beat * 4 },
    { color: accent, dx: 9, dy: 10 },
    { color: wash, dx: 4, dy: 5 },
    { color: '#faf7f0', dx: 0, dy: 0 },
  ];

  ctx.save();
  ctx.translate(WIDTH / 2 + o.layout.driftX * 0.15, Math.min(cy, META_SAFE_BOTTOM - 80));
  ctx.scale(scale, scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `400 ${fit.size}px "${o.font}"`;
  sheets.forEach(sheet => {
    ctx.fillStyle = sheet.color;
    fit.lines.forEach((line, i) => {
      const y = (i - (fit.lines.length - 1) / 2) * fit.size * 0.88;
      ctx.fillText(line, sheet.dx, y + sheet.dy, 920);
    });
  });

  if (word && word !== phrase) {
    const chipSize = Math.max(44, fit.size * 0.34);
    const chipY = fit.lines.length * fit.size * 0.4 + (1 - wordEnter) * 16;
    ctx.font = `400 ${chipSize}px "${o.fontSecondary}"`;
    ctx.globalAlpha = 0.9 + wordEnter * 0.1;
    // Hot word as a separate paper chip
    ctx.fillStyle = 'rgba(28,18,10,0.25)';
    ctx.fillText(word, 6, chipY + 7, 860);
    ctx.fillStyle = accent;
    ctx.fillText(word, 3, chipY + 3, 860);
    ctx.fillStyle = '#faf7f0';
    ctx.fillText(word, 0, chipY, 860);
  }
  ctx.restore();
}

function drawLyricOverlay(
  ctx: CanvasRenderingContext2D,
  o: AdPunchOptions,
  phrase: string,
  word: string,
  beat: number,
  wordEnter: number,
  ink: string,
  accent: string,
  prop: AdBeatProp,
  base: AdBaseId,
) {
  if (base === 'hold') {
    const hold = holdGate(beat);
    ghostPhrase(ctx, phrase, o.font, ink, 0.2 + (1 - hold) * 0.12);
    const hot = word || phrase;
    const fit = wrapFit(ctx, hot, o.fontSecondary, 130, 860, 3);
    ctx.save();
    ctx.translate(WIDTH / 2, HEIGHT * 0.52);
    ctx.scale((0.94 + wordEnter * 0.1 + beat * 0.05) * o.layout.scaleBias, (0.94 + wordEnter * 0.1 + beat * 0.05) * o.layout.scaleBias);
    ctx.globalAlpha = hold;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `400 ${fit.size}px "${o.fontSecondary}"`;
    solidOffset(ctx, fit.lines.join(' '), 0, 0, 860, accent, 5, 5);
    ctx.fillStyle = '#f8f8f8';
    fit.lines.forEach((line, i) => {
      ctx.fillText(line, 0, (i - (fit.lines.length - 1) / 2) * fit.size * 0.9, 860);
    });
    ctx.restore();
    return;
  }

  if (base === 'paper-cutout') {
    drawPaperType(ctx, o, phrase, word, beat, wordEnter, accent, prop);
    return;
  }

  const fit = wrapFit(ctx, phrase, o.font, 150, 920, 4);
  const scale = (1 + beat * 0.1) * o.layout.scaleBias;
  // Beast prop owns mid frame — lyrics sit under it, still Meta-safe
  const cy = prop === 'beast' ? HEIGHT * 0.72 : HEIGHT * 0.48;
  ctx.save();
  ctx.translate(WIDTH / 2 + o.layout.driftX * 0.15, Math.min(cy, META_SAFE_BOTTOM - 80));
  ctx.scale(scale, scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `400 ${fit.size}px "${o.font}"`;
  fit.lines.forEach((line, i) => {
    const y = (i - (fit.lines.length - 1) / 2) * fit.size * 0.88;
    solidOffset(ctx, line, 0, y, 920, accent, 8, 8);
  });
  ctx.fillStyle = ink;
  fit.lines.forEach((line, i) => {
    ctx.fillText(line, 0, (i - (fit.lines.length - 1) / 2) * fit.size * 0.88, 920);
  });
  if (word && word !== phrase) {
    ctx.font = `400 ${Math.max(44, fit.size * 0.34)}px "${o.fontSecondary}"`;
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.9 + wordEnter * 0.1;
    ctx.fillText(word, 0, fit.lines.length * fit.size * 0.4 + (1 - wordEnter) * 16, 860);
  }
  ctx.restore();
}

export function drawAdPunch(
  canvas: HTMLCanvasElement,
  cues: readonly LyricCue[],
  frame: number,
  options: AdPunchOptions,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable.');
  const ms = frame * 1000 / FPS;
  const reaction = impactSignals(options.music, ms);
  const copy = activeCopy(cues, frame, options.fallbackText || 'NOW');
  const wordEnter = copy.word ? entrance(ms, copy.wordStartMs, 180) : 1;
  ctx.save();
  if (canvas.width !== WIDTH || canvas.height !== HEIGHT) {
    ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
  }
  const { beat, energy } = reaction;
  const o = options;
  const meta = metaFor(o.style);
  const paint = { beat, energy, frame, palette: o.palette, layout: o.layout };

  let plate: FlashPlateColors | null = null;
  try {
    plate = drawGraphicStack(ctx, meta.base, meta.prop, paint);
  } catch {
    // Never leave a blank frame — stock wash + accent bar if a plate crashes.
    const stock = o.palette.wash || o.palette.bg || '#efe4d0';
    ctx.fillStyle = stock;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = o.palette.accent;
    ctx.fillRect(0, HEIGHT * 0.42, WIDTH, HEIGHT * 0.12);
    plate = { bg: stock, ink: '#1a1410', accent: o.palette.accent, flipped: false };
  }
  const ink = plate?.ink ?? '#f5f5f5';
  const accent = plate?.accent ?? o.palette.accent;
  drawLyricOverlay(ctx, o, copy.phrase, copy.word, beat, wordEnter, ink, accent, meta.prop, meta.base);

  ctx.restore();
}
