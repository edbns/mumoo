/**
 * Riso — the sheet of paper. Warm cream with fine grain, soft blotches, a few stains, loose fibres and darker
 * corners, all drawn here from a seed (no picture files). The same seed always makes the same sheet.
 */
import { HEIGHT, WIDTH } from './composition';
import { RISO_PAPER, generator } from './riso-look';

function context(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is unavailable.');
  return ctx;
}

export function paperCanvas(seed: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = context(canvas);
  const random = generator(seed ^ 0x9a9e);
  const between = (low: number, high: number) => low + (high - low) * random();

  ctx.fillStyle = RISO_PAPER;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const blot = (x: number, y: number, radius: number, color: [number, number, number], alpha: number) => {
    const fill = ctx.createRadialGradient(x, y, 0, x, y, radius);
    fill.addColorStop(0, `rgba(${color},${alpha})`);
    fill.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = fill;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  };

  // The sheet is never one flat tone: broad warm and cool patches.
  for (let n = 0; n < 46; n++) {
    const warm = random() < 0.6;
    blot(between(0, WIDTH), between(0, HEIGHT), between(120, 460), warm ? [196, 160, 100] : [255, 252, 240], between(0.035, 0.09));
  }
  // A few stains: an uneven pool with a slightly darker rim where it dried.
  for (let n = 0; n < 4; n++) {
    ctx.save();
    ctx.translate(between(80, WIDTH - 80), between(120, HEIGHT - 120));
    ctx.rotate(between(0, Math.PI));
    ctx.scale(1, between(0.55, 1));
    const radius = between(60, 150);
    const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    pool.addColorStop(0, `rgba(150,110,60,${between(0.04, 0.08)})`);
    pool.addColorStop(0.7, `rgba(150,110,60,${between(0.05, 0.09)})`);
    pool.addColorStop(1, 'rgba(150,110,60,0)');
    ctx.fillStyle = pool;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    ctx.restore();
  }

  // Loose fibres, light and dark, a few pixels to a finger's width long.
  ctx.lineCap = 'round';
  for (let n = 0; n < 1100; n++) {
    const x = between(0, WIDTH);
    const y = between(0, HEIGHT);
    const length = between(6, 34);
    const angle = between(0, Math.PI * 2);
    const bend = between(-0.7, 0.7);
    ctx.strokeStyle = random() < 0.5 ? `rgba(255,255,250,${between(0.25, 0.5)})` : `rgba(120,95,60,${between(0.08, 0.2)})`;
    ctx.lineWidth = between(0.5, 1.3);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(angle + bend) * length * 0.5, y + Math.sin(angle + bend) * length * 0.5, x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    ctx.stroke();
  }
  // Specks: bits of husk left in the pulp.
  for (let n = 0; n < 1400; n++) {
    ctx.fillStyle = `rgba(${random() < 0.7 ? '110,85,55' : '70,55,40'},${between(0.15, 0.5)})`;
    const size = between(0.6, 2);
    ctx.fillRect(between(0, WIDTH), between(0, HEIGHT), size, size);
  }

  // Grain: fine per-pixel tooth, and a coarser clumping one on top.
  const pixels = ctx.getImageData(0, 0, WIDTH, HEIGHT);
  const data = pixels.data;
  const coarseWidth = WIDTH >> 1;
  const coarse = new Float32Array(coarseWidth * (HEIGHT >> 1));
  for (let i = 0; i < coarse.length; i++) coarse[i] = random() - 0.5;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const i = (y * WIDTH + x) * 4;
      const shift = (random() - 0.5) * 13 + coarse[(y >> 1) * coarseWidth + (x >> 1)] * 9;
      data[i] += shift;
      data[i + 1] += shift;
      data[i + 2] += shift * 0.9;
    }
  }
  ctx.putImageData(pixels, 0, 0);

  // Darker corners where the stack was handled.
  const vignette = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, HEIGHT * 0.3, WIDTH / 2, HEIGHT / 2, HEIGHT * 0.72);
  vignette.addColorStop(0, 'rgba(255,255,255,1)');
  vignette.addColorStop(1, 'rgba(222,203,172,1)');
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}
