import type { SongCover } from './audio-format';

/**
 * What a cover says about a song's look, as numbers the brain can match against backgrounds.
 * Only these numbers leave this module: the picture itself is never stored or uploaded.
 */
export interface CoverRead {
  /** Dominant colors, largest first. `share` sums to 1. */
  palette: { hex: string; share: number }[];
  /** 0 black … 1 white (perceived brightness). */
  lightness: number;
  /** 0 grey … 1 fully saturated (ignores near-black noise). */
  saturation: number;
  /** 0 flat … 1 stark light/dark split. */
  contrast: number;
  /** Dominant hue in degrees 0–359, or null when the cover is essentially black/white/grey. */
  hue: number | null;
  /** 0 cool (blues, greens, purples) … 1 warm (reds, oranges, yellows). 0.5 when there is no colour. */
  warmth: number;
}

const SIZE = 48;
const COLORS = 5;
const MIN_PIXELS = 64;

type Rgb = [number, number, number];

const hex = ([r, g, b]: Rgb) => `#${[r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const distance = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const round = (value: number) => Math.round(value * 1000) / 1000;

function hueOf(r: number, g: number, b: number, chroma: number, max: number) {
  if (chroma === 0) return 0;
  const h = max === r ? ((g - b) / chroma) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4;
  return (h * 60 + 360) % 360;
}

/** Deterministic k-means in RGB, seeded by farthest-point so the same cover always gives the same palette. */
function cluster(pixels: Rgb[]): { color: Rgb; share: number }[] {
  const mean = pixels.reduce<Rgb>((sum, p) => [sum[0] + p[0], sum[1] + p[1], sum[2] + p[2]], [0, 0, 0]).map(v => v / pixels.length) as Rgb;
  const centers: Rgb[] = [pixels.reduce((far, p) => (distance(p, mean) > distance(far, mean) ? p : far))];
  while (centers.length < COLORS) {
    const next = pixels.reduce((far, p) => {
      const d = Math.min(...centers.map(c => distance(p, c)));
      return d > far.d ? { p, d } : far;
    }, { p: pixels[0], d: -1 });
    if (next.d < 24) break;
    centers.push(next.p);
  }
  const counts = new Array<number>(centers.length).fill(0);
  for (let round = 0; round < 8; round++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const p of pixels) {
      let best = 0;
      for (let i = 1; i < centers.length; i++) if (distance(p, centers[i]) < distance(p, centers[best])) best = i;
      sums[best][0] += p[0]; sums[best][1] += p[1]; sums[best][2] += p[2]; sums[best][3]++;
    }
    sums.forEach((s, i) => { counts[i] = s[3]; if (s[3]) centers[i] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
  }
  return centers
    .map((color, i) => ({ color, share: counts[i] / pixels.length }))
    .filter(item => item.share > 0)
    .sort((a, b) => b.share - a.share);
}

/** Read a cover from RGBA pixels (any size; sampled as given). Returns null if there is too little to read. */
export function describePixels(rgba: ArrayLike<number>): CoverRead | null {
  const pixels: Rgb[] = [];
  for (let i = 0; i + 3 < rgba.length; i += 4) if (rgba[i + 3] >= 128) pixels.push([rgba[i], rgba[i + 1], rgba[i + 2]]);
  if (pixels.length < MIN_PIXELS) return null;

  let luma = 0;
  let lumaSquares = 0;
  let valueSum = 0;
  let chromaSum = 0;
  let warm = 0;
  let cool = 0;
  let hueX = 0;
  let hueY = 0;
  for (const [r, g, b] of pixels) {
    const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    luma += y;
    lumaSquares += y * y;
    const max = Math.max(r, g, b);
    const chroma = (max - Math.min(r, g, b)) / 255;
    chromaSum += chroma;
    valueSum += max / 255;
    if (chroma > 0.12) {
      const hue = hueOf(r, g, b, chroma * 255, max);
      const radians = hue * Math.PI / 180;
      hueX += Math.cos(radians) * chroma;
      hueY += Math.sin(radians) * chroma;
      if (hue < 70 || hue >= 330) warm += chroma; else cool += chroma;
    }
  }
  const count = pixels.length;
  const meanLuma = luma / count;
  const spread = Math.sqrt(Math.max(0, lumaSquares / count - meanLuma * meanLuma));
  const colourful = chromaSum / count >= 0.08 && warm + cool > 0;
  const hue = colourful ? Math.round(((Math.atan2(hueY, hueX) * 180) / Math.PI + 360) % 360) : null;

  const groups = cluster(pixels);
  const total = groups.reduce((sum, item) => sum + item.share, 0);
  return {
    palette: groups.map(item => ({ hex: hex(item.color), share: round(item.share / total) })),
    lightness: round(meanLuma),
    // Chroma over brightness: near-black pixels do not count as "saturated".
    saturation: round(valueSum ? Math.min(1, chromaSum / valueSum) : 0),
    contrast: round(Math.min(1, spread * 2)),
    hue,
    warmth: colourful ? round(warm / (warm + cool)) : 0.5,
  };
}

/** Decode the embedded picture and read it. Null if the browser cannot decode it. */
export async function describeCover(cover: SongCover | null): Promise<CoverRead | null> {
  if (!cover) return null;
  try {
    const bitmap = await createImageBitmap(new Blob([cover.data as BlobPart], { type: cover.mime }));
    try {
      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0, SIZE, SIZE);
      return describePixels(ctx.getImageData(0, 0, SIZE, SIZE).data);
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}
