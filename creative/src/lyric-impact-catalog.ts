import { HEIGHT, WIDTH, type ImpactVariant } from './composition';
import {
  type DrawContext,
  clamp01,
  easeInOut,
  easeOutBack,
  easeOutCubic,
  fitImpactText,
  fillScene,
  hash01,
  lerp,
} from './lyric-impact-motion';
import { drawPunchPlateBackground } from './punch-plates';

function fillPaperOrPlate(draw: DrawContext, paper: string) {
  if (draw.plate) drawPunchPlateBackground(draw.ctx, draw.plate);
  else fillScene(draw.ctx, paper);
}

export type ImpactStyleMeta = { id: ImpactVariant; name: string; description: string; accent: string; ink: string; paper: string };

/** Expandable registry — add a meta entry + drawer; no architecture rewrite required. */
export const IMPACT_STYLES: readonly ImpactStyleMeta[] = [
  { id: 'monument', name: 'Monument', description: 'Oversized architectural stacks', accent: '#e85d04', ink: '#111', paper: '#efe6d6' },
  { id: 'billboard', name: 'Billboard', description: 'Frame-filling word crop', accent: '#ff006e', ink: '#fff', paper: '#111' },
  { id: 'skyline', name: 'Skyline', description: 'Words as rising blocks', accent: '#00f5d4', ink: '#04120f', paper: '#0b1c19' },
  { id: 'colonnade', name: 'Colonnade', description: 'Vertical letter pillars', accent: '#c9a227', ink: '#f4efe4', paper: '#1a1510' },
  { id: 'telescope', name: 'Telescope', description: 'Extreme zoom from glyph to phrase', accent: '#4cc9f0', ink: '#04121a', paper: '#e8f4fa' },
  { id: 'microscope', name: 'Microscope', description: 'Tiny center bloom', accent: '#f72585', ink: '#fff', paper: '#140812' },
  { id: 'accordion', name: 'Accordion', description: 'Horizontal expand on the beat', accent: '#ffbe0b', ink: '#1a1400', paper: '#fff8e7' },
  { id: 'mosaic', name: 'Mosaic', description: 'Grid cells ignite with words', accent: '#7b2cbf', ink: '#fff', paper: '#12081c' },
  { id: 'ticker-wall', name: 'Ticker Wall', description: 'Multi-row kinetic crawl', accent: '#39ff14', ink: '#051405', paper: '#050805' },
  { id: 'stamp-sheet', name: 'Stamp Sheet', description: 'Repeated stamp field', accent: '#d00000', ink: '#1a0505', paper: '#f6ebe3' },
  { id: 'slit-reveal', name: 'Slit Reveal', description: 'Blind-slat type reveal', accent: '#adb5bd', ink: '#f8f9fa', paper: '#212529' },
  { id: 'circle-iris', name: 'Circle Iris', description: 'Circular aperture open', accent: '#ff4d6d', ink: '#fff', paper: '#0d0d0d' },
  { id: 'wipe-blade', name: 'Wipe Blade', description: 'Diagonal blade wipe', accent: '#3a86ff', ink: '#031025', paper: '#edf2ff' },
  { id: 'type-curtain', name: 'Type Curtain', description: 'Rising curtain of lines', accent: '#2a9d8f', ink: '#f1faee', paper: '#1d3557' },
  { id: 'cutout-stack', name: 'Cutout Stack', description: 'Offset color layers', accent: '#e9c46a', ink: '#264653', paper: '#f4a261' },
  { id: 'stencil', name: 'Stencil', description: 'Type cut from a solid field', accent: '#000', ink: '#000', paper: '#fff' },
  { id: 'duotone-split', name: 'Duotone Split', description: 'Split-field collision', accent: '#ff006e', ink: '#fff', paper: '#8338ec' },
  { id: 'rubber-band', name: 'Rubber Band', description: 'Elastic squash and stretch', accent: '#fb5607', ink: '#1a0900', paper: '#fff0e8' },
  { id: 'gravity-drop', name: 'Gravity Drop', description: 'Letters fall into place', accent: '#06d6a0', ink: '#023047', paper: '#e9f7f3' },
  { id: 'collision', name: 'Collision', description: 'Words slam and settle', accent: '#ef233c', ink: '#fff', paper: '#0b090a' },
  { id: 'wave-deform', name: 'Wave Deform', description: 'Sine-warped letter row', accent: '#4ea8de', ink: '#013a63', paper: '#caf0f8' },
  { id: 'margin-note', name: 'Margin Note', description: 'Quiet editorial rules', accent: '#6c757d', ink: '#212529', paper: '#f8f9fa' },
  { id: 'folio', name: 'Folio', description: 'Cinematic page quiet', accent: '#adb5bd', ink: '#e9ecef', paper: '#121212' },
  { id: 'pull-quote', name: 'Pull Quote', description: 'Giant quotation field', accent: '#bc4749', ink: '#1b1b1b', paper: '#f2e8cf' },
  { id: 'concrete', name: 'Concrete', description: 'Brutal condensed flash', accent: '#ffb703', ink: '#000', paper: '#e5e5e5' },
  { id: 'overprint', name: 'Overprint', description: 'Misregistered ink layers', accent: '#d62828', ink: '#003049', paper: '#fcbf49' },
  { id: 'mirror-axis', name: 'Mirror Axis', description: 'Reflected twin type', accent: '#9b5de5', ink: '#fff', paper: '#0f0a1a' },
  { id: 'tunnel', name: 'Tunnel', description: 'Perspective depth stacks', accent: '#00bbf9', ink: '#fff', paper: '#03071e' },
];

type Drawer = (draw: DrawContext, meta: ImpactStyleMeta) => void;

/** Centered multiline fill. Pass x=0 when the caller already translated to the frame center. */
function drawCenteredLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  size: number,
  color: string,
  y: number,
  leading = 1.05,
  maxWidth = 920,
  x = WIDTH / 2,
) {
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${size}px "Inter Variable"`;
  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + (index - (lines.length - 1) / 2) * size * leading, maxWidth);
  });
}

const drawers: Record<ImpactVariant, Drawer> = {
  monument(draw, meta) {
    const { ctx, state, enter, reaction } = draw;
    fillScene(ctx, meta.paper);
    if (!state.phrase) return;
    const fit = fitImpactText(ctx, state.phrase.toLocaleUpperCase(), 980, 190, 900, 4);
    ctx.save();
    ctx.translate(0, (1 - enter) * 40);
    ctx.fillStyle = meta.accent;
    ctx.fillRect(60, 220, 18, 1480 * (0.35 + reaction.energy * 0.4));
    drawCenteredLines(ctx, fit.lines, fit.size, meta.ink, HEIGHT / 2 + reaction.beat * 8, 0.95, 980);
    ctx.restore();
  },

  billboard(draw, meta) {
    const { ctx, state, wordEnter, reaction } = draw;
    fillPaperOrPlate(draw, meta.paper);
    if (!state.word) return;
    const fit = fitImpactText(ctx, state.word.toLocaleUpperCase(), 1000, 260, 900, 2);
    const scale = lerp(1.08, 1.0, wordEnter) + reaction.beat * 0.02;
    ctx.save();
    ctx.translate(WIDTH / 2, HEIGHT / 2);
    ctx.scale(scale, scale);
    ctx.rotate((-2 + reaction.energy * 1.5) * Math.PI / 180);
    drawCenteredLines(ctx, fit.lines, fit.size, meta.ink, 0, 0.9, 1000 / scale, 0);
    ctx.restore();
    ctx.fillStyle = meta.accent;
    ctx.fillRect(0, HEIGHT - 28, WIDTH * (0.2 + reaction.energy * 0.6), 28);
  },

  skyline(draw, meta) {
    const { ctx, state, enter, reaction, frame } = draw;
    fillScene(ctx, meta.paper);
    if (!state.words.length) return;
    const widths = state.words.map(word => Math.min(220, 72 + word.text.length * 24));
    const total = widths.reduce((sum, w) => sum + w, 0) + (state.words.length - 1) * 16;
    const scaleX = Math.min(1, (WIDTH - 100) / Math.max(1, total));
    let x = (WIDTH - total * scaleX) / 2;
    state.words.forEach((word, index) => {
      const h = 220 + hash01(frame, index) * 520 + reaction.energy * 80;
      const w = widths[index] * scaleX;
      const y = HEIGHT - 160 - h * easeOutCubic(clamp01(enter + index * 0.08));
      ctx.fillStyle = index === state.words.length - 1 ? meta.accent : meta.ink;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(x + w / 2, y + 40);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = meta.paper;
      ctx.font = `800 ${Math.max(28, 42 * scaleX)}px "Inter Variable"`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(word.text.toLocaleUpperCase(), 0, 0, h - 60);
      ctx.restore();
      x += w + 16 * scaleX;
    });
  },

  colonnade(draw, meta) {
    const { ctx, state, enter, reaction } = draw;
    fillScene(ctx, meta.paper);
    if (!state.word) return;
    const letters = [...state.word.toLocaleUpperCase()].slice(0, 10);
    const gap = WIDTH / (letters.length + 1);
    letters.forEach((letter, index) => {
      const x = gap * (index + 1);
      const rise = (1 - easeOutBack(clamp01(enter - index * 0.04))) * (220 + reaction.beat * 20);
      ctx.fillStyle = meta.accent;
      ctx.fillRect(x - 8, 280, 16, 1200);
      ctx.fillStyle = meta.ink;
      ctx.font = `200 160px "Inter Variable"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, x, HEIGHT / 2 - rise);
    });
  },

  telescope(draw, meta) {
    const { ctx, state, wordEnter, reaction } = draw;
    fillScene(ctx, meta.paper);
    if (!state.phrase) return;
    const focus = state.word || state.phrase.slice(0, 1);
    const zoom = lerp(4.2, 1, easeOutCubic(wordEnter));
    ctx.save();
    ctx.translate(WIDTH / 2, HEIGHT / 2);
    ctx.scale(zoom, zoom);
    ctx.fillStyle = meta.ink;
    ctx.font = `800 96px "Inter Variable"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = clamp01(0.35 + wordEnter * 1.2);
    ctx.fillText(focus.toLocaleUpperCase(), 0, 0, 900 / zoom);
    ctx.restore();
    if (wordEnter > 0.45) {
      const fit = fitImpactText(ctx, state.phrase.toLocaleUpperCase(), 900, 70, 700, 4);
      ctx.globalAlpha = easeOutCubic((wordEnter - 0.45) / 0.55);
      drawCenteredLines(ctx, fit.lines, fit.size, meta.ink, HEIGHT * 0.72 + reaction.beat * 6, 1.1, 900);
      ctx.globalAlpha = 1;
    }
  },

  microscope(draw, meta) {
    const { ctx, state, wordEnter, reaction } = draw;
    fillScene(ctx, meta.paper);
    if (!state.word) return;
    const scale = lerp(0.18, 1 + reaction.beat * 0.04, easeOutBack(wordEnter));
    ctx.save();
    ctx.translate(WIDTH / 2, HEIGHT / 2);
    ctx.scale(scale, scale);
    ctx.fillStyle = meta.accent;
    ctx.beginPath();
    ctx.arc(0, 0, 360, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = meta.ink;
    ctx.font = `900 110px "Inter Variable"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.word.toLocaleUpperCase(), 0, 0, 640);
    ctx.restore();
  },

  accordion(draw, meta) {
    const { ctx, state, enter, reaction } = draw;
    fillScene(ctx, meta.paper);
    if (!state.phrase) return;
    const fit = fitImpactText(ctx, state.phrase.toLocaleUpperCase(), 900, 110, 800, 3);
    const stretch = lerp(1.28, 1, enter) + reaction.beat * 0.08;
    ctx.save();
    ctx.translate(WIDTH / 2, HEIGHT / 2);
    ctx.scale(stretch, 1 / Math.sqrt(stretch));
    drawCenteredLines(ctx, fit.lines, fit.size, meta.ink, 0, 1, 900 / stretch, 0);
    ctx.restore();
    ctx.fillStyle = meta.accent;
    ctx.fillRect(80, HEIGHT - 120, WIDTH - 160, 8);
  },

  mosaic(draw, meta) {
    const { ctx, state, enter, reaction, frame } = draw;
    fillScene(ctx, meta.paper);
    const cols = 3;
    const rows = 4;
    const cellW = (WIDTH - 80) / cols;
    const cellH = (HEIGHT - 200) / rows;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const i = row * cols + col;
        const on = hash01(frame, i + 3) < 0.35 + enter * 0.5 + reaction.energy * 0.2;
        const x = 40 + col * cellW;
        const y = 120 + row * cellH;
        ctx.fillStyle = on ? meta.accent : '#1d1030';
        ctx.fillRect(x + 6, y + 6, cellW - 12, cellH - 12);
        if (on && state.word) {
          ctx.fillStyle = meta.ink;
          ctx.font = `800 36px "Inter Variable"`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(state.word.toLocaleUpperCase(), x + cellW / 2, y + cellH / 2, cellW - 24);
        }
      }
    }
  },

  'ticker-wall'(draw, meta) {
    const { ctx, state, ms, reaction } = draw;
    fillScene(ctx, meta.paper);
    const phrase = (state.phrase || '·').toLocaleUpperCase() + '   ';
    for (let row = 0; row < 14; row++) {
      const dir = row % 2 === 0 ? 1 : -1;
      const speed = 80 + row * 18 + reaction.energy * 60;
      const offset = ((ms / 1000) * speed * dir) % 1400;
      ctx.fillStyle = row === 7 ? meta.accent : meta.ink;
      ctx.globalAlpha = row === 7 ? 1 : 0.35;
      ctx.font = `800 ${row === 7 ? 64 : 42}px "Inter Variable"`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const y = 140 + row * 120;
      for (let copy = -1; copy < 4; copy++) {
        ctx.fillText(phrase.repeat(4), -200 + copy * 900 + offset, y);
      }
    }
    ctx.globalAlpha = 1;
  },

  'stamp-sheet'(draw, meta) {
    const { ctx, state, enter, reaction } = draw;
    fillScene(ctx, meta.paper);
    if (!state.word) return;
    const label = state.word.toLocaleUpperCase();
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        const x = 60 + col * 340;
        const y = 160 + row * 330;
        const pop = easeOutBack(clamp01(enter - (row * 3 + col) * 0.03));
        ctx.save();
        ctx.translate(x + 150, y + 140);
        ctx.scale(0.7 + pop * 0.35 + reaction.beat * 0.02, 0.7 + pop * 0.35);
        ctx.strokeStyle = meta.ink;
        ctx.lineWidth = 6;
        ctx.strokeRect(-140, -120, 280, 240);
        ctx.fillStyle = meta.accent;
        ctx.beginPath();
        ctx.arc(100, -90, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = meta.ink;
        ctx.font = `800 42px "Inter Variable"`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, 0, 10, 240);
        ctx.restore();
      }
    }
  },

  'slit-reveal'(draw, meta) {
    const { ctx, state, enter, reaction } = draw;
    fillScene(ctx, meta.paper);
    if (!state.phrase) return;
    const fit = fitImpactText(ctx, state.phrase.toLocaleUpperCase(), 900, 120, 800, 4);
    const band = 70;
    for (let i = 0; i < Math.ceil(HEIGHT / band); i++) {
      const open = easeOutCubic(clamp01(enter * 1.4 - i * 0.03));
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, i * band, WIDTH * open, band - 4);
      ctx.clip();
      drawCenteredLines(ctx, fit.lines, fit.size, meta.ink, HEIGHT / 2 + reaction.beat * 6, 1.05, 900);
      ctx.restore();
      ctx.fillStyle = meta.accent;
      ctx.globalAlpha = 0.15;
      ctx.fillRect(0, i * band + band - 4, WIDTH, 2);
      ctx.globalAlpha = 1;
    }
  },

  'circle-iris'(draw, meta) {
    const { ctx, state, enter, reaction } = draw;
    fillScene(ctx, meta.paper);
    if (!state.phrase) return;
    const radius = lerp(40, 1200, easeOutCubic(enter));
    ctx.save();
    ctx.beginPath();
    ctx.arc(WIDTH / 2, HEIGHT / 2, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = meta.accent;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const fit = fitImpactText(ctx, state.phrase.toLocaleUpperCase(), 880, 130, 850, 4);
    drawCenteredLines(ctx, fit.lines, fit.size, meta.ink, HEIGHT / 2 + reaction.beat * 10, 1, 880);
    ctx.restore();
  },

  'wipe-blade'(draw, meta) {
    const { ctx, state, enter, reaction } = draw;
    fillScene(ctx, meta.paper);
    if (!state.phrase) return;
    const progress = easeInOut(enter);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(WIDTH * progress * 1.4, 0);
    ctx.lineTo(WIDTH * progress * 1.4 - 400, HEIGHT);
    ctx.lineTo(0, HEIGHT);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = meta.accent;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const fit = fitImpactText(ctx, state.phrase.toLocaleUpperCase(), 900, 140, 850, 4);
    drawCenteredLines(ctx, fit.lines, fit.size, meta.ink, HEIGHT / 2, 1, 900);
    ctx.restore();
    ctx.strokeStyle = meta.ink;
    ctx.lineWidth = 10 + reaction.beat * 8;
    ctx.beginPath();
    ctx.moveTo(WIDTH * progress * 1.4, 0);
    ctx.lineTo(WIDTH * progress * 1.4 - 400, HEIGHT);
    ctx.stroke();
  },

  'type-curtain'(draw, meta) {
    const { ctx, state, enter, reaction } = draw;
    fillScene(ctx, meta.paper);
    if (!state.phrase) return;
    const fit = fitImpactText(ctx, state.phrase, 860, 100, 600, 5);
    fit.lines.forEach((line, index) => {
      const y = 420 + index * (fit.size * 1.35) + (1 - easeOutCubic(clamp01(enter - index * 0.1))) * 160;
      ctx.fillStyle = meta.ink;
      ctx.font = `600 ${fit.size}px "Inter Variable"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(line, WIDTH / 2, Math.min(HEIGHT - 180, y + reaction.beat * 4), 860);
    });
    ctx.fillStyle = meta.accent;
    ctx.fillRect(120, 280, WIDTH - 240, 4);
  },

  'cutout-stack'(draw, meta) {
    const { ctx, state, enter, reaction } = draw;
    fillScene(ctx, meta.paper);
    if (!state.phrase) return;
    const fit = fitImpactText(ctx, state.phrase.toLocaleUpperCase(), 880, 140, 900, 3);
    const layers = [
      { color: meta.ink, dx: -26, dy: 18 },
      { color: meta.accent, dx: 18, dy: -14 },
      { color: '#fff', dx: 0, dy: 0 },
    ];
    layers.forEach((layer, index) => {
      const t = easeOutCubic(clamp01(enter - index * 0.08));
      ctx.save();
      ctx.translate(layer.dx * t + reaction.beat * (index - 1) * 4, layer.dy * t);
      drawCenteredLines(ctx, fit.lines, fit.size, layer.color, HEIGHT / 2, 0.95, 880);
      ctx.restore();
    });
  },

  stencil(draw, meta) {
    const { ctx, state, enter, reaction } = draw;
    fillScene(ctx, meta.accent);
    if (!state.phrase) return;
    const fit = fitImpactText(ctx, state.phrase.toLocaleUpperCase(), 920, 150, 900, 4);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.translate(0, (1 - enter) * 60);
    drawCenteredLines(ctx, fit.lines, fit.size, '#000', HEIGHT / 2 + reaction.beat * 6, 0.95, 920);
    ctx.restore();
    ctx.fillStyle = meta.paper;
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 40; i++) ctx.fillRect(0, i * 50, WIDTH, 2);
    ctx.globalAlpha = 1;
  },

  'duotone-split'(draw, meta) {
    const { ctx, state, enter, reaction } = draw;
    const split = WIDTH * (0.35 + enter * 0.3);
    ctx.fillStyle = meta.paper;
    ctx.fillRect(0, 0, split, HEIGHT);
    ctx.fillStyle = meta.accent;
    ctx.fillRect(split, 0, WIDTH - split, HEIGHT);
    if (!state.phrase) return;
    const fit = fitImpactText(ctx, state.phrase.toLocaleUpperCase(), 900, 130, 850, 4);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, split, HEIGHT);
    ctx.clip();
    drawCenteredLines(ctx, fit.lines, fit.size, '#fff', HEIGHT / 2 + reaction.beat * 8, 1, 900);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(split, 0, WIDTH - split, HEIGHT);
    ctx.clip();
    drawCenteredLines(ctx, fit.lines, fit.size, meta.paper, HEIGHT / 2 + reaction.beat * 8, 1, 900);
    ctx.restore();
  },

  'rubber-band'(draw, meta) {
    const { ctx, state, wordEnter, reaction } = draw;
    fillScene(ctx, meta.paper);
    if (!state.word) return;
    const sx = 1 + Math.sin(wordEnter * Math.PI) * 0.28 + reaction.beat * 0.05;
    const sy = 1 / sx;
    const fit = fitImpactText(ctx, state.word.toLocaleUpperCase(), 900, 180, 900, 2);
    ctx.save();
    ctx.translate(WIDTH / 2, HEIGHT / 2);
    ctx.scale(sx, sy);
    drawCenteredLines(ctx, fit.lines, fit.size, meta.ink, 0, 0.9, 900 / sx, 0);
    ctx.restore();
    ctx.strokeStyle = meta.accent;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.ellipse(WIDTH / 2, HEIGHT / 2, Math.min(420, 460 / sx) * sx, 180 * sy, 0, 0, Math.PI * 2);
    ctx.stroke();
  },

  'gravity-drop'(draw, meta) {
    const { ctx, state, enter, reaction } = draw;
    fillScene(ctx, meta.paper);
    if (!state.word) return;
    const letters = [...state.word];
    let size = 110;
    let total = 0;
    do {
      ctx.font = `800 ${size}px "Inter Variable"`;
      total = letters.reduce((sum, letter) => sum + ctx.measureText(letter).width + 8, 0);
      if (total <= WIDTH - 120 || size <= 48) break;
      size -= 6;
    } while (true);
    let x = (WIDTH - total) / 2;
    letters.forEach((letter, index) => {
      ctx.font = `800 ${size}px "Inter Variable"`;
      const w = ctx.measureText(letter).width;
      const drop = (1 - easeOutBounce(clamp01(enter - index * 0.05))) * (420 + index * 24);
      ctx.fillStyle = meta.ink;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(letter, x, HEIGHT / 2 + 40 - drop + reaction.beat * 6);
      x += w + 8;
    });
    ctx.fillStyle = meta.accent;
    ctx.fillRect(120, HEIGHT / 2 + 70, WIDTH - 240, 8);
  },

  collision(draw, meta) {
    const { ctx, state, enter, reaction } = draw;
    fillPaperOrPlate(draw, meta.paper);
    if (!state.phrase) return;
    const parts = state.phrase.split(/\s+/).filter(Boolean);
    const mid = Math.max(1, Math.ceil(parts.length / 2));
    const left = parts.slice(0, mid).join(' ');
    const right = parts.slice(mid).join(' ') || parts.at(-1) || '';
    const slam = easeOutCubic(enter);
    const fly = (1 - slam) * 220;
    ctx.font = `900 84px "Inter Variable"`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = meta.accent;
    ctx.textAlign = 'right';
    ctx.fillText(left.toLocaleUpperCase(), WIDTH / 2 - 18 - fly, HEIGHT / 2 + reaction.beat * 10, WIDTH / 2 - 48);
    ctx.fillStyle = meta.ink;
    ctx.textAlign = 'left';
    ctx.fillText(right.toLocaleUpperCase(), WIDTH / 2 + 18 + fly, HEIGHT / 2 - reaction.beat * 10, WIDTH / 2 - 48);
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = 0.35 + slam * 0.65;
    ctx.fillRect(WIDTH / 2 - 4, 300, 8, 1320);
    ctx.globalAlpha = 1;
  },

  'wave-deform'(draw, meta) {
    const { ctx, state, ms, enter, reaction } = draw;
    fillScene(ctx, meta.paper);
    if (!state.phrase) return;
    const textValue = state.phrase.toLocaleUpperCase();
    let size = 78;
    ctx.font = `800 ${size}px "Inter Variable"`;
    while (ctx.measureText(textValue).width > WIDTH - 100 && size > 36) {
      size -= 4;
      ctx.font = `800 ${size}px "Inter Variable"`;
    }
    const width = ctx.measureText(textValue).width;
    let x = (WIDTH - width) / 2;
    [...textValue].forEach((letter, index) => {
      const w = ctx.measureText(letter).width;
      const wave = Math.sin(ms / 180 + index * 0.45) * (22 + reaction.energy * 16) * enter;
      ctx.fillStyle = meta.ink;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, x, HEIGHT / 2 + wave);
      x += w;
    });
    ctx.strokeStyle = meta.accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let px = 0; px <= WIDTH; px += 12) {
      const py = HEIGHT / 2 + 120 + Math.sin(ms / 200 + px / 40) * 20;
      if (px === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  },

  'margin-note'(draw, meta) {
    const { ctx, state, enter, reaction } = draw;
    fillScene(ctx, meta.paper);
    ctx.strokeStyle = meta.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(160, 200);
    ctx.lineTo(160, HEIGHT - 200);
    ctx.stroke();
    if (!state.phrase) return;
    const fit = fitImpactText(ctx, state.phrase, 720, 64, 500, 8);
    ctx.save();
    ctx.translate(0, (1 - enter) * 30);
    ctx.fillStyle = meta.ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `500 ${fit.size}px "Inter Variable"`;
    fit.lines.forEach((line, index) => {
      ctx.globalAlpha = 0.75 + reaction.energy * 0.25;
      ctx.fillText(line, 200, 360 + index * fit.size * 1.45, 720);
    });
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.fillStyle = meta.accent;
    ctx.font = `600 28px "Inter Variable"`;
    ctx.fillText('NOTE', 200, 300);
  },

  folio(draw, meta) {
    const { ctx, state, enter, reaction, frame } = draw;
    fillScene(ctx, meta.paper);
    ctx.fillStyle = meta.accent;
    ctx.font = `400 28px "Inter Variable"`;
    ctx.textAlign = 'center';
    ctx.fillText(String(frame + 1).padStart(3, '0'), WIDTH / 2, 220);
    if (!state.phrase) return;
    const fit = fitImpactText(ctx, state.phrase, 760, 78, 300, 6);
    ctx.globalAlpha = 0.7 + enter * 0.3;
    drawCenteredLines(ctx, fit.lines, fit.size, meta.ink, HEIGHT / 2 + reaction.energy * 10, 1.4, 760);
    ctx.globalAlpha = 1;
    ctx.fillStyle = meta.accent;
    ctx.fillRect(WIDTH / 2 - 40, HEIGHT - 260, 80, 2);
  },

  'pull-quote'(draw, meta) {
    const { ctx, state, enter, reaction } = draw;
    fillScene(ctx, meta.paper);
    ctx.fillStyle = meta.accent;
    ctx.font = `200 420px "Inter Variable"`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.globalAlpha = 0.25;
    ctx.fillText('“', 40, 180);
    ctx.textAlign = 'right';
    ctx.fillText('”', WIDTH - 40, HEIGHT - 620);
    ctx.globalAlpha = 1;
    if (!state.phrase) return;
    const fit = fitImpactText(ctx, state.phrase, 820, 100, 700, 5);
    ctx.save();
    ctx.translate(0, (1 - enter) * 50);
    drawCenteredLines(ctx, fit.lines, fit.size, meta.ink, HEIGHT / 2 + reaction.beat * 8, 1.2, 820);
    ctx.restore();
  },

  concrete(draw, meta) {
    const { ctx, state, wordEnter, reaction, frame } = draw;
    const flash = reaction.beat > 0.7 && frame % 2 === 0;
    fillScene(ctx, flash ? meta.accent : meta.paper);
    if (!state.word) return;
    const fit = fitImpactText(ctx, state.word.toLocaleUpperCase(), 920, 220, 900, 2);
    const skew = (1 - wordEnter) * 0.28;
    ctx.save();
    ctx.translate(WIDTH / 2, HEIGHT / 2);
    ctx.transform(1, 0, skew, 1, 0, 0);
    drawCenteredLines(ctx, fit.lines, fit.size, meta.ink, 0, 0.85, 920, 0);
    ctx.restore();
  },

  overprint(draw, meta) {
    const { ctx, state, enter, reaction } = draw;
    fillScene(ctx, meta.paper);
    if (!state.phrase) return;
    const fit = fitImpactText(ctx, state.phrase.toLocaleUpperCase(), 900, 140, 850, 3);
    const offset = (1 - enter) * 40 + reaction.beat * 12;
    ctx.globalAlpha = 0.7;
    ctx.save();
    ctx.translate(-offset, offset * 0.4);
    drawCenteredLines(ctx, fit.lines, fit.size, meta.accent, HEIGHT / 2, 0.95, 900);
    ctx.restore();
    ctx.save();
    ctx.translate(offset, -offset * 0.3);
    drawCenteredLines(ctx, fit.lines, fit.size, meta.ink, HEIGHT / 2, 0.95, 900);
    ctx.restore();
    ctx.globalAlpha = 1;
  },

  'mirror-axis'(draw, meta) {
    const { ctx, state, enter, reaction } = draw;
    fillScene(ctx, meta.paper);
    if (!state.phrase) return;
    const fit = fitImpactText(ctx, state.phrase.toLocaleUpperCase(), 880, 120, 800, 3);
    const gap = (1 - enter) * 200;
    ctx.save();
    ctx.translate(0, -gap);
    drawCenteredLines(ctx, fit.lines, fit.size, meta.ink, HEIGHT / 2 - 80 + reaction.beat * 6, 1, 880);
    ctx.restore();
    ctx.save();
    ctx.translate(WIDTH, HEIGHT);
    ctx.scale(-1, -1);
    ctx.translate(0, -gap);
    ctx.globalAlpha = 0.45;
    drawCenteredLines(ctx, fit.lines, fit.size, meta.accent, HEIGHT / 2 - 80, 1, 880);
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.fillRect(80, HEIGHT / 2 - 2, WIDTH - 160, 4);
  },

  tunnel(draw, meta) {
    const { ctx, state, enter, reaction } = draw;
    fillScene(ctx, meta.paper);
    if (!state.phrase) return;
    const fit = fitImpactText(ctx, state.phrase.toLocaleUpperCase(), 820, 96, 800, 3);
    for (let depth = 6; depth >= 0; depth--) {
      const t = depth / 6;
      const scale = lerp(1.05, 0.42, t) * (0.92 + enter * 0.08);
      const alpha = lerp(0.18, 1, 1 - t);
      ctx.save();
      ctx.translate(WIDTH / 2, HEIGHT / 2 + (1 - enter) * 48);
      ctx.scale(scale, scale);
      ctx.globalAlpha = alpha;
      drawCenteredLines(ctx, fit.lines, fit.size * 0.7, depth === 0 ? meta.accent : meta.ink, reaction.beat * 4, 1, 820 / scale, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },
};

function easeOutBounce(t: number) {
  let x = clamp01(t);
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) { x -= 1.5 / d1; return n1 * x * x + 0.75; }
  if (x < 2.5 / d1) { x -= 2.25 / d1; return n1 * x * x + 0.9375; }
  x -= 2.625 / d1;
  return n1 * x * x + 0.984375;
}

export function drawImpactStyle(draw: DrawContext, style: ImpactVariant) {
  const meta = IMPACT_STYLES.find(item => item.id === style) ?? IMPACT_STYLES[0];
  drawers[style](draw, meta);
}

export function impactStyleIds(): ImpactVariant[] {
  return IMPACT_STYLES.map(item => item.id);
}
