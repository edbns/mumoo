/**
 * Spray — spray-paint graffiti lyrics on a clean, smooth wall. No photo: the wall is a flat colour with the faintest
 * fade, and each lyric word is sprayed onto it in a quick sweep, as thousands of soft grains of paint: a dense core,
 * a faint overspray halo, speckle round the edges. On the bar's first beat paint runs down from the letters and a
 * splatter is flung; every beat hits the newest word. The words pile up over each other at angles, older ones fainter
 * and smaller, some crossed out, some marked; at the end of a phrase the wall is wiped.
 * Every frame is a pure function of the clock, the beat times and the lyric cues, so the shelf preview and the cloud
 * render draw the same picture.
 */
import { Buffer, BufferUsage, Container, Geometry, Mesh, Shader } from 'pixi.js';
import { HEIGHT, WIDTH, type LyricCue } from './composition';
import { cssFont, displayFace, setCase, type AdFont } from './ad-fonts';
import { hexToRgb } from './dust-colors';
import { textMeasureCtx } from './pack-text';
import { DRIP_FLOATS, GRAIN_FLOATS, sprayWord, type SprayMask } from './spray-grains';
import {
  DRIP_MS, FONT_SIZE_MAX, WIPE_BAND, hitAt, hitKick, pageAt, pageBreaks, placeWord, planWord, wipeEdge, wordAlpha, wordCentre, wordRanks, wordScale, wordWidth,
  type SprayPalette, type WordPlace,
} from './spray-look';

/** The empty border round a word's stencil, in px. */
const MASK_PAD = 24;
/** How much the newest word swells on a downbeat (a plain beat hits a third as hard) and how far its halo flares. */
const HIT_SWELL = 0.07;
const HIT_FLARE = 0.6;
/** The wipe has not started: far off the frame's diagonal. */
const NO_WIPE = -1e5;

// ---------------------------------------------------------------------------------------------------------------
// Shaders

/** Where a point of a word lands on the frame: the word is turned and sized about its own centre. */
const PLACE = `
uniform vec2 uCentre;
uniform float uRotation;
uniform float uScale;
vec2 place(vec2 local) {
  float c = cos(uRotation);
  float s = sin(uRotation);
  vec2 scaled = local * uScale;
  return uCentre + vec2(scaled.x * c - scaled.y * s, scaled.x * s + scaled.y * c);
}
`;

/** The wipe: paint past the sweep's edge is gone, grain by grain, so the edge is a spray and not a line. */
const WIPE = `
uniform float uWipe;
float kept(vec2 frame, float chance) {
  return smoothstep(uWipe - 20.0, uWipe + 20.0, frame.y + frame.x * 0.3 + chance * ${WIPE_BAND.toFixed(1)});
}
`;

const PAINTS = `
uniform vec3 uInk0;
uniform vec3 uInk1;
uniform vec3 uInk2;
vec3 paint(float index) {
  return index < 0.5 ? uInk0 : (index < 1.5 ? uInk1 : uInk2);
}
`;

const MATRICES = `
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
`;

const GRAIN_VERTEX = `#version 300 es
precision highp float;
in vec2 aPosition;
in vec4 aGrain;
in vec4 aTime;
in vec2 aLook;
${MATRICES}
uniform float uAge;
uniform float uFlare;
uniform float uAlpha;
${PAINTS}
${PLACE}
${WIPE}
out vec2 vQuad;
out vec4 vColor;
out float vSoft;

void main() {
  float t = uAge - aTime.x;
  // A droplet that was flung flies out of the letters and slows to a stop.
  float flown = aTime.y > 0.0 ? 1.0 - pow(1.0 - clamp(t / aTime.y, 0.0, 1.0), 3.0) : 1.0;
  vec2 centre = place(aGrain.xy + aTime.zw * (1.0 - flown));
  float chance = fract(sin(dot(aGrain.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float alpha = aGrain.w * smoothstep(0.0, 22.0, t) * uAlpha * kept(centre, chance);
  if (alpha < 0.002) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  // A beat flares the overspray: the soft grains swell.
  float radius = aGrain.z * uScale * (1.0 + uFlare * smoothstep(0.8, 1.0, aLook.x));
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(centre + aPosition * radius, 1.0)).xy, 0.0, 1.0);
  vColor = vec4(paint(aLook.y) * alpha, alpha);
  vQuad = aPosition;
  vSoft = aLook.x;
}
`;

const GRAIN_FRAGMENT = `#version 300 es
precision mediump float;
in vec2 vQuad;
in vec4 vColor;
in float vSoft;
out vec4 finalColor;
void main() {
  float d = length(vQuad);
  // A soft grain falls off like a gaussian; a hard one is a small crisp dot.
  float soft = exp(-d * d * 3.6) * (1.0 - smoothstep(0.8, 1.0, d));
  float hard = 1.0 - smoothstep(0.55, 1.0, d);
  finalColor = vColor * mix(hard, soft, vSoft);
}
`;

const DRIP_VERTEX = `#version 300 es
precision highp float;
in vec2 aPosition;
in vec4 aDrip;
in vec3 aStart;
${MATRICES}
uniform float uAge;
uniform float uAlpha;
${PAINTS}
${PLACE}
${WIPE}
out vec2 vAt;
out vec3 vShape;
out vec3 vInk;
out vec2 vPaint;

void main() {
  float t = uAge - aStart.x;
  vec2 top = place(aDrip.xy);
  float alpha = 0.97 * uAlpha * kept(top, aStart.z);
  if (t < 0.0 || alpha < 0.002) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  // The same easing as the look's dripReach: it runs fast, slows and stops.
  float reach = 1.0 - pow(1.0 - clamp(t / ${DRIP_MS.toFixed(1)}, 0.0, 1.0), 3.0);
  float width = aDrip.z * uScale;
  float run = aDrip.w * uScale * reach;
  // The blob at the end is wider than the run above it.
  float blob = width * 0.95;
  vec2 corner = vec2(aPosition.x * (blob + 2.0), -2.0 + (aPosition.y * 0.5 + 0.5) * (run + blob * 2.0 + 4.0));
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(top + corner, 1.0)).xy, 0.0, 1.0);
  vAt = corner;
  vShape = vec3(width, run, blob);
  vInk = paint(aStart.y);
  vPaint = vec2(alpha, aStart.z);
}
`;

const DRIP_FRAGMENT = `#version 300 es
precision mediump float;
in vec2 vAt;
in vec3 vShape;
in vec3 vInk;
in vec2 vPaint;
out vec4 finalColor;
void main() {
  float width = vShape.x;
  float run = vShape.y;
  float blob = vShape.z;
  // Wide where it leaves the letter, thinner as it runs, a little uneven.
  float down = clamp(vAt.y / max(run, 1.0), 0.0, 1.0);
  float radius = width * 0.5 * mix(1.15, 0.7, down) * (1.0 + 0.12 * sin(vAt.y * 0.08 + vPaint.y * 20.0));
  float streak = (1.0 - smoothstep(radius - 0.9, radius + 0.9, abs(vAt.x))) * (1.0 - smoothstep(run - 1.0, run + 1.0, vAt.y));
  vec2 toBlob = vAt - vec2(0.0, run);
  float round = 1.0 - smoothstep(blob - 0.9, blob + 0.9, length(toBlob));
  // The wet blob catches a little light.
  float shine = (1.0 - smoothstep(0.0, blob * 0.5, length(toBlob - vec2(-0.3, -0.3) * blob))) * round;
  float cover = max(streak, round) * vPaint.x;
  finalColor = vec4(mix(vInk, vec3(1.0), 0.3 * shine) * cover, cover);
}
`;

const GROUND_VERTEX = `#version 300 es
precision highp float;
in vec2 aPosition;
${MATRICES}
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(vUv * vec2(${WIDTH}.0, ${HEIGHT}.0), 1.0)).xy, 0.0, 1.0);
}
`;

const GROUND_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec3 uTop;
uniform vec3 uBottom;
out vec4 finalColor;
float noise(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  // A very soft fade, dithered by less than one level so it never bands and never shows a texture.
  float dither = (noise(gl_FragCoord.xy) + noise(gl_FragCoord.xy + 17.0) - 1.0) / 255.0;
  finalColor = vec4(mix(uTop, uBottom, vUv.y) + dither, 1.0);
}
`;

// ---------------------------------------------------------------------------------------------------------------
// Pieces

const CORNERS = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]);
const QUAD = new Uint32Array([0, 1, 2, 0, 2, 3]);

type Uniforms = Record<string, { value: number | Float32Array; type: string }>;
type Values = Record<string, number | readonly number[]>;

/** A mesh with its uniforms, set by name. */
function piece(geometry: Geometry, vertex: string, fragment: string, uniforms: Uniforms) {
  const shader = Shader.from({ gl: { vertex, fragment }, resources: { spray: uniforms } as never });
  const mesh = new Mesh({ geometry, shader });
  mesh.cullable = false;
  const group = shader.resources.spray;
  return {
    mesh,
    set(values: Values) {
      for (const [name, value] of Object.entries(values)) {
        if (typeof value === 'number') group.uniforms[name] = value;
        else (group.uniforms[name] as Float32Array).set(value);
      }
      group.update();
    },
    destroy() {
      // The grain buffers go too: left behind they stay on the GPU and in memory (tens of MB for every word).
      geometry.destroy(true);
      mesh.destroy();
    },
  };
}

/** The uniforms a word's grains and drips share: where the word sits and how old it is. */
const wordUniforms = (): Uniforms => ({
  uCentre: { value: new Float32Array(2), type: 'vec2<f32>' },
  uRotation: { value: 0, type: 'f32' },
  uScale: { value: 1, type: 'f32' },
  uAge: { value: 0, type: 'f32' },
  uAlpha: { value: 1, type: 'f32' },
  uWipe: { value: NO_WIPE, type: 'f32' },
  uInk0: { value: new Float32Array(3), type: 'vec3<f32>' },
  uInk1: { value: new Float32Array(3), type: 'vec3<f32>' },
  uInk2: { value: new Float32Array(3), type: 'vec3<f32>' },
});

/**
 * One quad per grain (or drip), read from `data` in groups of `floats`. Each quad has its own four vertices, not
 * one instanced quad: the software renderer the cloud uses draws instances about fifty times slower.
 */
function quads(data: Float32Array, floats: number, attributes: Record<string, { format: 'float32x2' | 'float32x3' | 'float32x4'; offset: number }>) {
  const count = data.length / floats;
  const expanded = new Float32Array(count * 4 * floats);
  const corners = new Float32Array(count * 8);
  const indices = new Uint32Array(count * 6);
  for (let n = 0; n < count; n++) {
    for (let k = 0; k < 4; k++) {
      expanded.set(data.subarray(n * floats, (n + 1) * floats), (n * 4 + k) * floats);
      corners.set(CORNERS.subarray(k * 2, k * 2 + 2), (n * 4 + k) * 2);
    }
    indices.set([0, 1, 2, 0, 2, 3].map(i => n * 4 + i), n * 6);
  }
  const buffer = new Buffer({ data: expanded, usage: BufferUsage.VERTEX | BufferUsage.COPY_DST });
  return new Geometry({
    attributes: {
      aPosition: { buffer: corners, format: 'float32x2', stride: 8, offset: 0 },
      ...Object.fromEntries(Object.entries(attributes).map(([name, { format, offset }]) => [name, { buffer, format, stride: floats * 4, offset: offset * 4 }])),
    },
    indexBuffer: indices,
  });
}

/** What a lyric word looks like as a stencil: its letters, white on clear. */
function stencil(text: string, font: AdFont, size: number): SprayMask {
  const measure = textMeasureCtx();
  measure.font = cssFont(displayFace(font), size);
  const box = measure.measureText(text);
  const inkWidth = Math.ceil(box.actualBoundingBoxLeft + box.actualBoundingBoxRight);
  const inkHeight = Math.ceil(box.actualBoundingBoxAscent + box.actualBoundingBoxDescent);
  const canvas = document.createElement('canvas');
  canvas.width = inkWidth + MASK_PAD * 2;
  canvas.height = inkHeight + MASK_PAD * 2;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is unavailable.');
  ctx.font = measure.font;
  ctx.fillStyle = '#fff';
  ctx.fillText(text, MASK_PAD + box.actualBoundingBoxLeft, MASK_PAD + box.actualBoundingBoxAscent);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const alpha = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3];
  return { width: canvas.width, height: canvas.height, pad: MASK_PAD, alpha };
}

/** The size a word is set at: the one that gives it the width its place asks for, but never bigger than the biggest. */
function fitSize(text: string, font: AdFont, place: WordPlace) {
  const measure = textMeasureCtx();
  measure.font = cssFont(displayFace(font), 100);
  return Math.min(FONT_SIZE_MAX, (wordWidth(place) * 100) / measure.measureText(text).width);
}

/** Commas and full stops are not part of a big sprayed word. */
const sprayed = (font: AdFont, text: string) => setCase(font, text).replace(/[,.;:]+$/u, '');

// ---------------------------------------------------------------------------------------------------------------
// The world

export type SprayInput = {
  ms: number;
  /** Every beat in the clip, in ms. */
  beatsMs: readonly number[];
  /** The first beat of each bar: paint runs and splatters here, and the newest word is hit hardest. */
  downbeatsMs?: readonly number[];
  /** The lyric words with their times. Empty means lyrics are off: the wall stays clean. */
  cues: readonly LyricCue[];
  palette: SprayPalette;
  font: AdFont;
};

export type SprayWorld = {
  root: Container;
  update(input: SprayInput): void;
  destroy(): void;
};

type Word = ReturnType<typeof makeWord>;

function makeWord(seed: number, index: number, input: SprayInput) {
  const inkCount = input.palette.sprays.length;
  const place = placeWord(seed, index, inkCount);
  const text = sprayed(input.font, input.cues[index].text);
  const mask = stencil(text, input.font, fitSize(text, input.font, place));
  const plan = planWord(seed, index, input.cues, input.beatsMs, input.downbeatsMs ?? [], inkCount);
  const { grains, drips } = sprayWord(mask, plan);
  const [x, y] = wordCentre(place, mask.width - mask.pad * 2, mask.height - mask.pad * 2);

  const container = new Container();
  container.zIndex = index;
  const dust = piece(
    quads(grains, GRAIN_FLOATS, { aGrain: { format: 'float32x4', offset: 0 }, aTime: { format: 'float32x4', offset: 4 }, aLook: { format: 'float32x2', offset: 8 } }),
    GRAIN_VERTEX,
    GRAIN_FRAGMENT,
    { ...wordUniforms(), uFlare: { value: 0, type: 'f32' } },
  );
  const runs = drips.length
    ? piece(quads(drips, DRIP_FLOATS, { aDrip: { format: 'float32x4', offset: 0 }, aStart: { format: 'float32x3', offset: 4 } }), DRIP_VERTEX, DRIP_FRAGMENT, wordUniforms())
    : null;
  container.addChild(dust.mesh);
  if (runs) container.addChild(runs.mesh);
  const shared = { uCentre: [x, y], uRotation: place.rotation };
  dust.set(shared);
  runs?.set(shared);

  return {
    container,
    startMs: input.cues[index].startMs,
    /** Sets how the word looks right now. `flare` swells its overspray. */
    show(values: Values, flare: number) {
      dust.set({ ...values, uFlare: flare });
      runs?.set(values);
    },
    destroy() {
      dust.destroy();
      runs?.destroy();
      container.destroy({ children: true });
    },
  };
}

/** The wall for one card. `seed` decides where each word is sprayed and what happens to it. */
export function createSprayWorld(seed: number): SprayWorld {
  const root = new Container();
  const geometry = new Geometry({ attributes: { aPosition: { buffer: CORNERS, format: 'float32x2', stride: 8, offset: 0 } }, indexBuffer: QUAD });
  const ground = piece(geometry, GROUND_VERTEX, GROUND_FRAGMENT, { uTop: { value: new Float32Array(3), type: 'vec3<f32>' }, uBottom: { value: new Float32Array(3), type: 'vec3<f32>' } });
  const words = new Container();
  words.sortableChildren = true;
  root.addChild(ground.mesh, words);

  const live = new Map<number, Word>();
  let built: Pick<SprayInput, 'cues' | 'beatsMs' | 'downbeatsMs' | 'font' | 'palette'> | null = null;
  let breaks: number[] = [];

  function clear() {
    for (const word of live.values()) { words.removeChild(word.container); word.destroy(); }
    live.clear();
  }

  function show(input: SprayInput, page: ReturnType<typeof pageAt>) {
    const { ms, palette } = input;
    const downbeats = input.downbeatsMs ?? [];
    const looks = new Map<number, { rank: number; wipe: number }>();
    if (page.wiping) {
      const { words: gone, progress } = page.wiping;
      gone.forEach((index, at) => looks.set(index, { rank: gone.length - 1 - at, wipe: wipeEdge(progress) }));
    }
    const ranks = page.words.length ? wordRanks(input.cues, page.words, ms) : [];
    page.words.forEach((index, at) => looks.set(index, { rank: ranks[at], wipe: NO_WIPE }));

    for (const [index, word] of live) {
      if (looks.has(index)) continue;
      words.removeChild(word.container);
      word.destroy();
      live.delete(index);
    }
    // The newest word takes the hit of the latest beat, if it was already on the wall when the beat fell.
    const hit = hitAt(ms, input.beatsMs, downbeats);
    const newestIndex = page.words.at(-1);
    const kick = hit && newestIndex !== undefined && ms - hit.age * 1000 >= input.cues[newestIndex].startMs ? hitKick(hit) : 0;
    const inks = Array.from({ length: 3 }, (_, i) => (i < palette.sprays.length ? hexToRgb(palette.sprays[i]) : [0, 0, 0]));
    for (const [index, { rank, wipe }] of looks) {
      let word = live.get(index);
      if (!word) {
        word = makeWord(seed, index, input);
        live.set(index, word);
        words.addChild(word.container);
      }
      const newest = rank <= 0 && wipe === NO_WIPE;
      word.show(
        {
          uAge: ms - word.startMs,
          uScale: wordScale(rank) * (1 + (newest ? HIT_SWELL * kick : 0)),
          uAlpha: wordAlpha(rank),
          uWipe: wipe,
          uInk0: inks[0],
          uInk1: inks[1],
          uInk2: inks[2],
        },
        newest ? HIT_FLARE * kick : 0,
      );
    }
  }

  return {
    root,
    update(input) {
      const downbeats = input.downbeatsMs ?? [];
      // Another set of cues, beats, type or paints is another set of words.
      if (!built || built.cues !== input.cues || built.beatsMs !== input.beatsMs || built.downbeatsMs !== input.downbeatsMs || built.font !== input.font || built.palette !== input.palette) {
        clear();
        built = { cues: input.cues, beatsMs: input.beatsMs, downbeatsMs: input.downbeatsMs, font: input.font, palette: input.palette };
        breaks = pageBreaks(input.cues, downbeats);
      }
      ground.set({ uTop: hexToRgb(input.palette.ground[0]), uBottom: hexToRgb(input.palette.ground[1]) });
      show(input, pageAt(input.cues, breaks, input.ms));
    },
    destroy() {
      clear();
      ground.destroy();
      root.destroy({ children: true });
    },
  };
}
