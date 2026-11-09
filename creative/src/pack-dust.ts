/**
 * Dust — a photo breaks into thousands of grains that fly toward the viewer on every beat and settle back.
 * The picture is sampled once into grains (where each sits, how bright the photo was there). From then on a
 * grain's place is a pure function of the clock and the beat times, so the shelf preview and the cloud render
 * draw the same frame. Two colours rule the look: the ground and the dust; the photo's own light and shadow
 * only decide how much of the dust colour each grain gets.
 */
import { Container, Geometry, Graphics, Mesh, Shader, Sprite, Text, Texture } from 'pixi.js';
import { DURATION_MS, HEIGHT, WIDTH } from './composition';
import { contrast, hexToRgb, luminance, type DustColors } from './dust-colors';
import { META_SAFE_BOTTOM } from './ad-punch';
import type { AdFont } from './ad-fonts';
import { fitPackLines } from './pack-text';

/** How many grains the subject is made of. Enough that the face reads as a photo at rest. */
export const DUST_GRAINS = 90_000;
const BEATS = 8;

export type DustPoints = {
  /** x, y (canvas px), three random numbers, and the photo's brightness there: 6 floats a grain. */
  data: Float32Array;
  count: number;
};

/** A small deterministic generator: the same photo always breaks the same way. */
function generator(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Turns a photo into grains. The photo is fitted to cover the frame. If its edges are one plain colour
 * (a studio backdrop) the grains stay on the subject; a busy photo is dusted whole.
 */
export function sampleDust(image: CanvasImageSource & { width: number; height: number }, grains = DUST_GRAINS): DustPoints {
  const scale = 0.5;
  const w = Math.round(WIDTH * scale);
  const h = Math.round(HEIGHT * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is unavailable.');
  const cover = Math.max(w / image.width, h / image.height);
  ctx.drawImage(image, (w - image.width * cover) / 2, (h - image.height * cover) / 2, image.width * cover, image.height * cover);
  const pixels = ctx.getImageData(0, 0, w, h).data;
  const at = (x: number, y: number) => (Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4;

  // The backdrop: everything connected to the photo's edge that changes only gently from one pixel to the next
  // (a studio wall, even with a light gradient). Anything the fill cannot reach is the subject. A busy photo
  // where the fill swallows almost nothing is dusted whole.
  const reach = new Uint8Array(w * h);
  const queue: number[] = [];
  const seed = (x: number, y: number) => {
    const n = y * w + x;
    if (!reach[n]) { reach[n] = 1; queue.push(n); }
  };
  for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
  for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }
  const gap = (a: number, b: number) => Math.abs(pixels[a * 4] - pixels[b * 4]) + Math.abs(pixels[a * 4 + 1] - pixels[b * 4 + 1]) + Math.abs(pixels[a * 4 + 2] - pixels[b * 4 + 2]);
  for (let head = 0; head < queue.length; head++) {
    const n = queue[head];
    const x = n % w;
    const y = (n - x) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const m = ny * w + nx;
      if (!reach[m] && gap(n, m) < 14) { reach[m] = 1; queue.push(m); }
    }
  }
  const backdrop = queue.length / (w * h);
  const subject = (i: number) => backdrop < 0.12 || !reach[i / 4];
  let covered = 0;
  for (let i = 0; i < pixels.length; i += 16) if (subject(i)) covered++;
  const share = Math.max(0.05, covered / (pixels.length / 16));
  const step = Math.sqrt((WIDTH * HEIGHT * share) / grains);

  const random = generator(0x6d75);
  const kept: number[] = [];
  const light: number[] = [];
  for (let y = step / 2; y < HEIGHT; y += step) {
    for (let x = step / 2; x < WIDTH; x += step) {
      const gx = x + (random() - 0.5) * step;
      const gy = y + (random() - 0.5) * step;
      const i = at(Math.round(gx * scale), Math.round(gy * scale));
      if (!subject(i)) continue;
      const brightness = (0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]) / 255;
      kept.push(gx, gy, random(), random(), random(), brightness);
      light.push(brightness);
    }
  }
  // Stretch the photo's range so a flat or dark photo still uses the whole dust colour.
  const sorted = [...light].sort((a, b) => a - b);
  const low = sorted[Math.floor(sorted.length * 0.04)] ?? 0;
  const high = sorted[Math.floor(sorted.length * 0.97)] ?? 1;
  const data = new Float32Array(kept);
  for (let n = 5; n < data.length; n += 6) data[n] = Math.min(1, Math.max(0, (data[n] - low) / Math.max(0.05, high - low)));
  return { data, count: data.length / 6 };
}

const VERTEX = `#version 300 es
precision highp float;
in vec2 aPosition;
in vec2 aOrigin;
in vec4 aRand;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform float uTime;
uniform float uAges[${BEATS}];
uniform float uIds[${BEATS}];
uniform float uStrength[${BEATS}];
uniform float uDecay;
uniform float uInvert;
uniform float uPower;
uniform float uLoose;
uniform vec2 uFocus;
uniform float uGrain;
uniform vec3 uDust;
uniform vec3 uShade;
out vec2 vQuad;
out vec4 vColor;
out float vSoft;

float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }

void main() {
  // How far this grain has flown toward the viewer. Most barely move; a deep few surge past the camera.
  float travel = 0.0;
  float sway = 0.0;
  // The burst spreads out from the middle of the picture like a ring.
  float ripple = length(aOrigin - uFocus) / 1100.0 * 0.12;
  for (int k = 0; k < ${BEATS}; k++) {
    float age = uAges[k] - ripple - aRand.z * 0.04;
    if (age <= 0.0) continue;
    float push = (1.0 - exp(-age * 14.0)) * exp(-age * uDecay * (1.0 - 0.5 * aRand.z)) * uStrength[k];
    float depth = 0.015 + 0.985 * pow(aRand.z, 4.0);
    travel += push * uPower * depth;
    sway += push * (hash(aRand.x * 91.0 + uIds[k] * 7.3) - 0.5);
  }
  // Coming closer: the grain slides away from the focus point, grows, and softens.
  vec2 out_ = aOrigin - uFocus;
  vec2 place = uFocus + out_ * (1.0 + travel * 1.3);
  place += vec2(-out_.y, out_.x) / max(1.0, length(out_)) * sway * 70.0 * travel;
  place += vec2(sin(uTime * 0.8 + aRand.x * 40.0), cos(uTime * 0.6 + aRand.y * 40.0)) * (1.5 + 5.0 * uLoose);
  float radius = uGrain * (0.7 + aRand.z * 0.9) * (1.0 + travel * 2.4);
  place += aPosition * radius;
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(place, 1.0)).xy, 0.0, 1.0);
  float light = pow(smoothstep(0.0, 1.0, aRand.w), 0.8);
  // On a light ground the dust is the ink: the photo's shadows get it, so the picture still reads as a photo.
  float tone = mix(light, 1.0 - light, uInvert);
  float near = smoothstep(0.15, 1.1, travel);
  float alpha = mix(0.3, 1.0, tone) * (1.0 - 0.6 * near);
  vColor = vec4(mix(uShade, uDust, tone) * alpha, alpha);
  vQuad = aPosition;
  vSoft = near;
}
`;

const FRAGMENT = `#version 300 es
precision mediump float;
in vec2 vQuad;
in vec4 vColor;
in float vSoft;
out vec4 finalColor;
void main() {
  // Grains close to the camera are out of focus: a soft disc, not a hard dot.
  float shape = smoothstep(1.0, 0.45 - 0.45 * vSoft, length(vQuad));
  finalColor = vColor * shape;
}
`;

function glow() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable.');
  const fill = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  fill.addColorStop(0, 'rgba(255,255,255,1)');
  fill.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  fill.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(canvas);
}

export type DustInput = {
  ms: number;
  /** Every beat in the clip, in ms. */
  beatsMs: readonly number[];
  /** The first beat of each bar, in ms: these scatter the picture hardest. */
  downbeatsMs?: readonly number[];
  /** 0–1 pulse of the latest beat. */
  beat: number;
  colors: DustColors;
  word: string;
  font: AdFont;
  /** How hard each beat scatters the grains; 1 is the designed amount. */
  power?: number;
};

export type DustWorld = {
  root: Container;
  update(input: DustInput): void;
  destroy(): void;
};

export function createDustWorld(points: DustPoints): DustWorld {
  const root = new Container();
  const ground = new Graphics();
  const halo = new Sprite(glow());
  halo.anchor.set(0.5);
  halo.position.set(WIDTH / 2, HEIGHT * 0.42);

  const corners = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]);
  const geometry = new Geometry({
    attributes: {
      aPosition: { buffer: corners, format: 'float32x2', stride: 8, offset: 0 },
      aOrigin: { buffer: points.data, format: 'float32x2', stride: 24, offset: 0, instance: true },
      aRand: { buffer: points.data, format: 'float32x4', stride: 24, offset: 8, instance: true },
    },
    indexBuffer: new Uint32Array([0, 1, 2, 0, 2, 3]),
    instanceCount: points.count,
  });
  const ages = new Float32Array(BEATS);
  const ids = new Float32Array(BEATS);
  const strength = new Float32Array(BEATS);
  const shader = Shader.from({
    gl: { vertex: VERTEX, fragment: FRAGMENT },
    resources: {
      dust: {
        uTime: { value: 0, type: 'f32' },
        uAges: { value: ages, type: 'f32', size: BEATS },
        uIds: { value: ids, type: 'f32', size: BEATS },
        uStrength: { value: strength, type: 'f32', size: BEATS },
        uDecay: { value: 3, type: 'f32' },
        uInvert: { value: 0, type: 'f32' },
        uPower: { value: 1, type: 'f32' },
        uLoose: { value: 0, type: 'f32' },
        uFocus: { value: new Float32Array(2), type: 'vec2<f32>' },
        uGrain: { value: 2.4, type: 'f32' },
        uDust: { value: new Float32Array(3), type: 'vec3<f32>' },
        uShade: { value: new Float32Array(3), type: 'vec3<f32>' },
      },
    },
  });
  const grains = new Mesh({ geometry, shader });
  grains.cullable = false;
  const lyric = new Text({ text: '', style: { fontFamily: 'Anton', fontSize: 120, fill: '#ffffff', align: 'center', wordWrap: false } });
  lyric.anchor.set(0.5);
  lyric.position.set(WIDTH / 2, Math.min(HEIGHT * 0.8, META_SAFE_BOTTOM - 120));
  root.addChild(ground, halo, grains, lyric);

  const uniforms = shader.resources.dust;
  // The dust flies out from a point a little above the middle of the subject, so a face near the top moves least.
  let fx = 0;
  let top = HEIGHT;
  let bottom = 0;
  for (let n = 0; n < points.count; n++) {
    fx += points.data[n * 6];
    top = Math.min(top, points.data[n * 6 + 1]);
    bottom = Math.max(bottom, points.data[n * 6 + 1]);
  }
  uniforms.uniforms.uFocus = new Float32Array([fx / points.count, top + (bottom - top) * 0.4]);
  let painted = '';

  return {
    root,
    update(input) {
      const { ms, beatsMs, colors } = input;
      let last = -1;
      for (let i = 0; i < beatsMs.length && beatsMs[i] <= ms; i++) last = i;
      for (let k = 0; k < BEATS; k++) {
        const index = last - k;
        ages[k] = index >= 0 ? (ms - beatsMs[index]) / 1000 : 0;
        ids[k] = index;
        // The bar's first beat breaks the picture up hard; the others only ruffle it.
        strength[k] = index >= 0 && (input.downbeatsMs ?? []).some(d => Math.abs(d - beatsMs[index]) < 45) ? 1 : 0.22;
      }
      // Whatever the tempo, the nearer grains have come home by the next beat; the far ones linger like dust in air.
      const gap = last > 0 ? (beatsMs[last] - beatsMs[last - 1]) / 1000 : 0.5;
      uniforms.uniforms.uDecay = Math.LN10 * 1.5 / Math.min(1.2, Math.max(0.28, gap));
      const progress = Math.min(1, ms / DURATION_MS);
      uniforms.uniforms.uTime = ms / 1000;
      uniforms.uniforms.uPower = (input.power ?? 1) * (0.8 + 0.3 * progress);
      uniforms.uniforms.uLoose = progress;
      const dust = hexToRgb(colors.dust);
      const base = hexToRgb(colors.ground);
      uniforms.uniforms.uInvert = luminance(colors.ground) > luminance(colors.dust) ? 1 : 0;
      uniforms.uniforms.uDust = new Float32Array(dust);
      uniforms.uniforms.uShade = new Float32Array(base.map((v, i) => v * 0.8 + dust[i] * 0.2));
      uniforms.update();

      const key = `${colors.ground}${colors.dust}`;
      if (key !== painted) {
        painted = key;
        ground.clear();
        ground.rect(0, 0, WIDTH, HEIGHT);
        ground.fill({ color: colors.ground });
        halo.tint = colors.dust;
      }
      halo.alpha = 0.16 + input.beat * 0.2;
      halo.scale.set(5.2 + input.beat * 0.5);

      // One word, in whichever of white or near-black reads against the ground, with a ground-coloured keyline.
      const ink = contrast(colors.ground, '#ffffff') >= contrast(colors.ground, '#0b0b0d') ? '#ffffff' : '#0b0b0d';
      const fit = fitPackLines(input.word, input.font, 200, 900, 1);
      lyric.text = fit.lines.join(' ');
      lyric.style = {
        fontFamily: input.font, fontSize: fit.size, fill: ink, align: 'center', wordWrap: false,
        stroke: { color: colors.ground, width: Math.max(4, fit.size * 0.06), join: 'round' },
      };
      lyric.scale.set(1 + input.beat * 0.05);
    },
    destroy() {
      root.destroy({ children: true });
      geometry.destroy();
    },
  };
}
