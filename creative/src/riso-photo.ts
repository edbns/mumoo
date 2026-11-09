/**
 * Riso — reading the photo for the halftone. The picture is fitted to cover the frame and turned into one small
 * texture: how light each spot is (stretched so the face has contrast), where the person is, and which spots may
 * carry ink. The inks themselves are screened from this on the GPU, so a frame stays a function of the clock.
 */
import { HEIGHT, WIDTH } from './composition';

type Picture = CanvasImageSource & { width: number; height: number };

export type RisoPhoto = {
  /** Red: lightness. Green: 1 inside the silhouette (it hides the lyrics). Blue: 1 where ink may be printed. */
  canvas: HTMLCanvasElement;
};

/** How wide, in px, the neighbourhood is that the face is lifted away from. */
const DETAIL_RADIUS = 34;
/** How hard the local contrast is pushed. 1 leaves the photo as it is. */
const DETAIL_GAIN = 2.1;
/** A cut-out that finds less of the picture than this has no clear subject. */
const SUBJECT_SHARE = 0.08;

function read(picture: Picture) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is unavailable.');
  const cover = Math.max(WIDTH / picture.width, HEIGHT / picture.height);
  ctx.drawImage(picture, (WIDTH - picture.width * cover) / 2, (HEIGHT - picture.height * cover) / 2, picture.width * cover, picture.height * cover);
  return { ctx, pixels: ctx.getImageData(0, 0, WIDTH, HEIGHT).data };
}

/** Averages every value with its neighbours within `radius` px, rows then columns. */
function blur(source: Float32Array, radius: number): Float32Array {
  const pass = (from: Float32Array, length: number, lines: number, stride: number, step: number) => {
    const to = new Float32Array(from.length);
    for (let line = 0; line < lines; line++) {
      const base = line * stride;
      let sum = 0;
      for (let i = 0; i <= radius && i < length; i++) sum += from[base + i * step];
      for (let i = 0; i < length; i++) {
        const lo = i - radius - 1;
        const hi = i + radius;
        if (hi < length && i > 0) sum += from[base + hi * step];
        if (lo >= 0) sum -= from[base + lo * step];
        to[base + i * step] = sum / (Math.min(length - 1, i + radius) - Math.max(0, i - radius) + 1);
      }
    }
    return to;
  };
  return pass(pass(source, WIDTH, HEIGHT, WIDTH, 1), HEIGHT, WIDTH, 1, WIDTH);
}

export function prepareRisoPhoto(image: Picture, cutout: Picture): RisoPhoto {
  const { pixels } = read(image);
  const cut = read(cutout).pixels;
  const count = WIDTH * HEIGHT;

  let found = 0;
  for (let i = 0; i < count; i += 4) if (cut[i * 4] > 127) found++;
  // No clear subject (a landscape, a pattern): the whole picture is the print and nothing hides the words.
  const subject = found / (count / 4) >= SUBJECT_SHARE;
  const person = new Float32Array(count);
  const light = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    person[i] = subject ? cut[i * 4] / 255 : 1;
    light[i] = (0.2126 * pixels[i * 4] + 0.7152 * pixels[i * 4 + 1] + 0.0722 * pixels[i * 4 + 2]) / 255;
  }

  // The average light round each spot, taken from the person alone, so a bright wall never washes the edge out.
  const weighted = new Float32Array(count);
  for (let i = 0; i < count; i++) weighted[i] = light[i] * person[i];
  const around = blur(blur(weighted, DETAIL_RADIUS), DETAIL_RADIUS);
  const share = blur(blur(person, DETAIL_RADIUS), DETAIL_RADIUS);

  const lifted = new Float32Array(count);
  const histogram = new Uint32Array(256);
  let inside = 0;
  for (let i = 0; i < count; i++) {
    const mean = share[i] > 1e-3 ? around[i] / share[i] : light[i];
    // Outside the person the average stands in, so the cells on the silhouette's edge still get ink.
    lifted[i] = person[i] > 0.5 ? mean + (light[i] - mean) * DETAIL_GAIN : mean;
    if (person[i] > 0.5) {
      histogram[Math.min(255, Math.max(0, Math.round(lifted[i] * 255)))]++;
      inside++;
    }
  }
  const percentile = (at: number) => {
    let seen = 0;
    for (let bin = 0; bin < 256; bin++) {
      seen += histogram[bin];
      if (seen >= inside * at) return bin / 255;
    }
    return 1;
  };
  const low = percentile(0.02);
  const high = Math.max(low + 0.1, percentile(0.98));

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable.');
  const out = ctx.createImageData(WIDTH, HEIGHT);
  for (let i = 0; i < count; i++) {
    out.data[i * 4] = Math.round(Math.min(1, Math.max(0, (lifted[i] - low) / (high - low))) * 255);
    out.data[i * 4 + 1] = subject ? Math.round(person[i] * 255) : 0;
    out.data[i * 4 + 2] = Math.round(person[i] * 255);
    out.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return { canvas };
}
