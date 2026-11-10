/**
 * Image-derived palette — type colors come FROM the background, never from a fixed bank.
 * Deterministic (pure function of the pixels) so the shelf and the cloud render agree.
 */
import type { Texture } from 'pixi.js';
import type { LiveLookId } from './live-look-deal';
import { heatSource, lookPixel } from './live-look-ramp';

export type TexturePalette = {
  /** Highest-contrast ink against the text zone. */
  ink: string;
  /** Dominant saturated hue of the image, adjusted to stay legible. */
  accent: string;
  /** Scrim laid under the type when the text zone is busy or low-contrast. */
  scrim: { color: string; alpha: number };
  /** Mean luminance of the text zone (0 dark … 1 light). */
  luma: number;
  /** How cold and how hot (0-1, 2nd and 98th percentile) the picture's parts read to a heat look (`heatSource`), which the look stretches over its ramp. */
  range: [number, number];
};

const W = 40;
const H = 72;
const WHITE = '#f7f4ee';
const BLACK = '#0d0d12';

const cache = new Map<string, TexturePalette>();

function relLum(r: number, g: number, b: number): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(l1: number, l2: number): number {
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

function hex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function parse(color: string): [number, number, number] {
  return [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)) as [number, number, number];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** `look`: the live look drawn on the picture, so the ink, the scrim and the accent suit what is seen. */
export function analyzeTexture(texture: Texture, look?: LiveLookId): TexturePalette {
  const key = `${texture.uid}:${look ?? ''}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Palette analysis is unavailable.');
  ctx.drawImage(texture.source.resource as CanvasImageSource, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;

  // How cold and how hot the picture itself reads, then (with a look) the picture as the look shows it.
  const lights: number[] = [];
  for (let i = 0; i < data.length; i += 4) lights.push(heatSource(data[i], data[i + 1], data[i + 2]));
  lights.sort((a, b) => a - b);
  const range: [number, number] = [lights[Math.floor(lights.length * 0.02)], lights[Math.min(lights.length - 1, Math.floor(lights.length * 0.98))]];
  if (look) {
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = lookPixel(look, data[i], data[i + 1], data[i + 2], range);
      data[i] = r; data[i + 1] = g; data[i + 2] = b;
    }
  }

  // Hue histogram weighted by saturation × value; text zone = centre band.
  const bins = Array.from({ length: 18 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  const zone: [number, number, number][] = [];
  let zr = 0, zg = 0, zb = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const [h, s, l] = rgbToHsl(r, g, b);
      const weight = s * (1 - Math.abs(l - 0.5) * 1.4);
      if (weight > 0.05) {
        const bin = bins[Math.floor(h / 20) % 18];
        bin.w += weight; bin.r += r * weight; bin.g += g * weight; bin.b += b * weight;
      }
      if (y > H * 0.28 && y < H * 0.78) {
        zone.push([r, g, b]);
        zr += r; zg += g; zb += b;
      }
    }
  }
  const meanR = zr / zone.length, meanG = zg / zone.length, meanB = zb / zone.length;
  const meanLum = relLum(meanR, meanG, meanB);

  const inkIsWhite = contrast(relLum(...parse(WHITE)), meanLum) >= contrast(relLum(...parse(BLACK)), meanLum);
  const ink = inkIsWhite ? WHITE : BLACK;
  const inkLum = relLum(...parse(ink));

  // Share of the text zone where the ink would be hard to read.
  let weak = 0;
  for (const [r, g, b] of zone) if (contrast(inkLum, relLum(r, g, b)) < 3) weak++;
  const weakShare = weak / zone.length;
  const scrim = weakShare > 0.12
    ? { color: inkIsWhite ? '#000000' : '#ffffff', alpha: Math.min(0.62, 0.2 + weakShare * 0.6) }
    : { color: '#000000', alpha: 0 };

  // Accent: dominant saturated hue, nudged until it clears 3:1 against the text zone.
  const best = bins.reduce((a, b) => (b.w > a.w ? b : a));
  let accent: string;
  if (best.w > 0.5) {
    const [h, saturation, lightness] = rgbToHsl(best.r / best.w, best.g / best.w, best.b / best.w);
    const s = Math.max(0.55, saturation);
    let l = lightness;
    for (let step = 0; step < 14; step++) {
      const [r, g, b] = hslToRgb(h, s, l);
      if (contrast(relLum(r, g, b), meanLum) >= 3) break;
      l = inkIsWhite ? Math.min(0.92, l + 0.04) : Math.max(0.12, l - 0.04);
    }
    accent = hex(...hslToRgb(h, s, l));
  } else {
    accent = ink; // a truly monochrome image: accent is the ink itself
  }

  const palette: TexturePalette = { ink, accent, scrim, luma: meanLum, range };
  cache.set(key, palette);
  return palette;
}
