/**
 * What a picture's colours are, as a few numbers: the song's cover in the browser (`cover-palette.ts`) and every library picture on the
 * server (`netlify/lib/colours.mjs`) are read the same way, so they can be compared with each other and with a genre's colours.
 * Plain JavaScript, so the server can use it as it is; its types are in `colour-read.d.mts`.
 */

const COLORS = 5;
const MIN_PIXELS = 64;

const hex = ([r, g, b]) => `#${[r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const round = (value) => Math.round(value * 1000) / 1000;

function hueOf(r, g, b, chroma, max) {
  if (chroma === 0) return 0;
  const h = max === r ? ((g - b) / chroma) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4;
  return (h * 60 + 360) % 360;
}

/** Deterministic k-means in RGB, seeded by farthest-point so the same picture always gives the same palette. */
function cluster(pixels) {
  const mean = pixels.reduce((sum, p) => [sum[0] + p[0], sum[1] + p[1], sum[2] + p[2]], [0, 0, 0]).map(v => v / pixels.length);
  const centers = [pixels.reduce((far, p) => (distance(p, mean) > distance(far, mean) ? p : far))];
  while (centers.length < COLORS) {
    const next = pixels.reduce((far, p) => {
      const d = Math.min(...centers.map(c => distance(p, c)));
      return d > far.d ? { p, d } : far;
    }, { p: pixels[0], d: -1 });
    if (next.d < 24) break;
    centers.push(next.p);
  }
  const counts = new Array(centers.length).fill(0);
  for (let pass = 0; pass < 8; pass++) {
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

/** Reads a picture from RGBA pixels (any size; sampled as given). Null when there is too little to read. */
export function describePixels(rgba) {
  const pixels = [];
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

/** RGBA pixels of `width`×`height`, cut down to `size`×`size` by averaging each block, so a full photo reads like a small one. */
export function shrinkPixels(rgba, width, height, size = 48) {
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const top = Math.floor((y * height) / size);
    const bottom = Math.max(top + 1, Math.floor(((y + 1) * height) / size));
    for (let x = 0; x < size; x++) {
      const left = Math.floor((x * width) / size);
      const right = Math.max(left + 1, Math.floor(((x + 1) * width) / size));
      const sum = [0, 0, 0, 0];
      // Every second pixel each way is enough for an average, and four times quicker on a full photo.
      let n = 0;
      for (let py = top; py < bottom; py += 2) {
        for (let px = left; px < right; px += 2) {
          const at = (py * width + px) * 4;
          sum[0] += rgba[at]; sum[1] += rgba[at + 1]; sum[2] += rgba[at + 2]; sum[3] += rgba[at + 3];
          n++;
        }
      }
      const to = (y * size + x) * 4;
      for (let c = 0; c < 4; c++) out[to + c] = sum[c] / n;
    }
  }
  return out;
}
