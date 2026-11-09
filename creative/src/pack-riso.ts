/**
 * Riso — a Risograph print. Warm paper, two or three fluorescent inks printed one after another, so where they
 * overlap a darker colour appears and no two layers sit exactly on top of each other. The lyric words are stamped
 * big and scattered over the page, older ones thinning out to a faint dot screen; the person is two halftone
 * screens in front of them, and her silhouette hides the words behind her. Every frame is a pure function of the
 * clock and the beat times, so the shelf preview and the cloud render draw the same picture.
 */
import { Container, Geometry, Mesh, Shader, Sprite, Texture } from 'pixi.js';
import { HEIGHT, WIDTH, type LyricCue } from './composition';
import { cssFont, displayFace, setCase, type AdFont } from './ad-fonts';
import { textMeasureCtx } from './pack-text';
import {
  WORD_WIDTH_MAX, breath, lastDownbeat, misregistration, pageAt, pageBreaks, placeWord, stampScale, wordCentre, wordDensity,
  type RisoInkSet,
} from './riso-look';
import { paperCanvas } from './riso-paper';
import type { RisoPhoto } from './riso-photo';

/** Halftone cell, in px of the 1080×1920 frame, before the beat makes it breathe. */
const CELL = 8.5;
/** Screen angles of the three inks, in degrees: two inks never share one, or the dots would stack instead of weave. */
const ANGLES = [15, 75, 45] as const;
/** Cell of the faint dot screen that older words are printed in. */
const WORD_CELL = 8;
/** How far the edge of a stamped letter is blurred before the ink roughens it, in px. */
const EDGE_BLUR = 8;

const hexToRgb = (color: string) => [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255);

// ---------------------------------------------------------------------------------------------------------------
// Shaders

/** The worn, uneven way ink lands on paper: noise fixed to the sheet, so it does not slide when a layer slips. */
const COMMON = `
precision highp float;
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float sum = 0.0;
  float gain = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += gain * vnoise(p);
    p = p * 2.03 + 17.1;
    gain *= 0.5;
  }
  return sum;
}
/** How much of the ink really prints at this spot of the sheet: blotchy density, and pinholes where the paper's tooth refuses it. */
float lay(vec2 paper, float seed) {
  float blotch = fbm(paper * 0.011 + seed * 3.7);
  float tooth = vnoise(paper * 0.85 + seed);
  float pin = smoothstep(0.76, 0.88, tooth) * 0.45;
  return clamp(mix(0.66, 1.0, smoothstep(0.25, 0.7, blotch)) - pin, 0.0, 1.0);
}
/** A dot screen at an angle: 1 inside a dot. \`cover\` is the share of paper the ink should cover. */
float dots(vec2 plate, float angle, float cell, float cover, float wobble) {
  float c = cos(angle);
  float s = sin(angle);
  vec2 cellPos = vec2(c * plate.x + s * plate.y, -s * plate.x + c * plate.y) / cell;
  float distanceToCentre = length(fract(cellPos) - 0.5) + wobble;
  float radius = sqrt(clamp(cover, 0.0, 1.0)) * 0.75;
  float soft = 0.9 / cell;
  return 1.0 - smoothstep(radius - soft, radius + soft, distanceToCentre);
}
`;

const QUAD_VERTEX = `#version 300 es
precision highp float;
in vec2 aPosition;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec2 uCentre;
uniform vec2 uHalf;
uniform float uRotation;
uniform float uScale;
uniform vec2 uOffset;
out vec2 vUv;
out vec2 vPlate;
out vec2 vPaper;
void main() {
  vec2 local = aPosition * uHalf * uScale;
  float c = cos(uRotation);
  float s = sin(uRotation);
  vec2 place = uCentre + vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  // The plate is where the layer's own marks sit; the paper is where they land once the layer has slipped.
  vPlate = place;
  vPaper = place + uOffset;
  vUv = aPosition * 0.5 + 0.5;
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(vPaper, 1.0)).xy, 0.0, 1.0);
}
`;

const WORD_FRAGMENT = `#version 300 es
${COMMON}
in vec2 vUv;
in vec2 vPlate;
in vec2 vPaper;
uniform sampler2D uGlyph;
uniform vec3 uInk;
uniform float uDensity;
uniform float uAngle;
uniform float uSeed;
uniform float uWipe;
out vec4 finalColor;
void main() {
  float glyph = texture(uGlyph, vUv).a;
  // Worn edge: the letter's soft rim is cut at a threshold that wanders, so the outline is rough and chewed.
  float edge = 0.5 + (fbm(vPaper * 0.09 + uSeed) - 0.5) * 0.7 + (hash(vPaper * 0.91 + uSeed) - 0.5) * 0.3;
  float shape = smoothstep(edge - 0.08, edge + 0.08, glyph);
  // An older word keeps less ink: a screen of dots over its letters, thinner each time.
  float screen = uDensity > 0.995 ? 1.0 : dots(vPlate, uAngle, ${WORD_CELL.toFixed(1)}, uDensity, (vnoise(vPaper * 0.45 + uSeed) - 0.5) * 0.16);
  float wiped = uWipe < 0.0 ? 1.0 : step(uWipe + (fbm(vPaper * 0.02) - 0.5) * 150.0, vPaper.y);
  float cover = shape * screen * lay(vPaper, uSeed) * wiped;
  finalColor = vec4(mix(vec3(1.0), uInk, cover), 1.0);
}
`;

const PERSON_FRAGMENT = `#version 300 es
${COMMON}
in vec2 vUv;
in vec2 vPlate;
in vec2 vPaper;
uniform sampler2D uTone;
uniform vec3 uInkA;
uniform vec3 uInkB;
uniform vec2 uOffA;
uniform vec2 uOffB;
uniform float uCell;
uniform float uAngleA;
uniform float uAngleB;
out vec4 finalColor;
const vec2 SIZE = vec2(${WIDTH}.0, ${HEIGHT}.0);

/** One ink's screen: the dot of the cell this spot is in is sized by the photo's light at the cell's centre. */
float printed(vec2 paper, vec2 offset, float angle, float shadowsOnly, float seed) {
  vec2 plate = paper - offset;
  float c = cos(angle);
  float s = sin(angle);
  vec2 cellId = floor(vec2(c * plate.x + s * plate.y, -s * plate.x + c * plate.y) / uCell) + 0.5;
  vec2 centre = vec2(c * cellId.x - s * cellId.y, s * cellId.x + c * cellId.y) * uCell;
  float light = texture(uTone, centre / SIZE).r;
  // The first ink carries the whole picture; the second only the shadows, so they overlap only where it is dark.
  float cover = shadowsOnly > 0.5
    ? pow(clamp((0.58 - light) / 0.58, 0.0, 1.0), 1.15) * 1.05
    : pow(clamp(1.0 - light, 0.0, 1.0), 1.1) * 1.05;
  float onPerson = smoothstep(0.35, 0.65, texture(uTone, plate / SIZE).b);
  return dots(plate, angle, uCell, cover, (vnoise(paper * 0.45 + seed) - 0.5) * 0.14) * onPerson * lay(paper, seed);
}
void main() {
  float a = printed(vPaper, uOffA, uAngleA, 0.0, 1.0);
  float b = printed(vPaper, uOffB, uAngleB, 1.0, 2.0);
  finalColor = vec4(mix(vec3(1.0), uInkA, a) * mix(vec3(1.0), uInkB, b), 1.0);
}
`;

/** The paper, put back where the person stands, so the words behind her are covered. */
const HIDE_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uPaper;
uniform sampler2D uTone;
out vec4 finalColor;
void main() {
  float hidden = smoothstep(0.2, 0.5, texture(uTone, vUv).g);
  finalColor = vec4(texture(uPaper, vUv).rgb * hidden, hidden);
}
`;

// ---------------------------------------------------------------------------------------------------------------
// Pieces

const CORNERS = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]);

/** A quad placed by uniforms: a lyric word, or the whole frame. */
function quad(geometry: Geometry, fragment: string, textures: Record<string, Texture>, extra: Record<string, { value: number | Float32Array; type: string }>, size: [number, number], centre: [number, number], blend: 'multiply' | 'normal') {
  const uniforms = {
    uCentre: { value: new Float32Array(centre), type: 'vec2<f32>' },
    uHalf: { value: new Float32Array(size), type: 'vec2<f32>' },
    uRotation: { value: 0, type: 'f32' },
    uScale: { value: 1, type: 'f32' },
    uOffset: { value: new Float32Array(2), type: 'vec2<f32>' },
    ...extra,
  };
  const resources: Record<string, unknown> = { riso: uniforms };
  for (const [name, texture] of Object.entries(textures)) resources[name] = texture.source;
  const shader = Shader.from({ gl: { vertex: QUAD_VERTEX, fragment }, resources: resources as never });
  const mesh = new Mesh({ geometry, shader });
  mesh.cullable = false;
  mesh.blendMode = blend;
  const group = shader.resources.riso;
  return {
    mesh,
    set(values: Record<string, number | readonly number[]>) {
      for (const [name, value] of Object.entries(values)) {
        const slot = group.uniforms[name] as number | Float32Array;
        if (typeof value === 'number') group.uniforms[name] = value;
        else (slot as Float32Array).set(value);
      }
      group.update();
    },
    destroy: () => mesh.destroy(),
  };
}

/** What a lyric word looks like as a stencil: its letters, white on clear, with a soft rim for the ink to eat into. */
function stencil(text: string, font: AdFont, size: number) {
  const measure = textMeasureCtx();
  measure.font = cssFont(displayFace(font), size);
  const box = measure.measureText(text);
  const pad = EDGE_BLUR * 2 + 4;
  const inkWidth = box.actualBoundingBoxLeft + box.actualBoundingBoxRight;
  const inkHeight = box.actualBoundingBoxAscent + box.actualBoundingBoxDescent;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(inkWidth) + pad * 2;
  canvas.height = Math.ceil(inkHeight) + pad * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable.');
  ctx.font = measure.font;
  ctx.fillStyle = '#fff';
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = EDGE_BLUR;
  ctx.fillText(text, pad + box.actualBoundingBoxLeft, pad + box.actualBoundingBoxAscent);
  return { texture: Texture.from(canvas), width: inkWidth, height: inkHeight };
}

/** The size a word is set at: the one its place asks for, shortened if it would be wider than the limit. */
function fitSize(text: string, font: AdFont, wanted: number) {
  const measure = textMeasureCtx();
  measure.font = cssFont(displayFace(font), 100);
  return Math.min(wanted, (WORD_WIDTH_MAX * 100) / measure.measureText(text).width);
}

/** Commas and full stops are not part of a big stamped word. */
const stamped = (font: AdFont, text: string) => setCase(font, text).replace(/[,.;:]+$/u, '');

type Word = ReturnType<typeof makeWord>;

function makeWord(geometry: Geometry, text: string, font: AdFont, index: number, seed: number, inkCount: number) {
  const place = placeWord(seed, index, inkCount);
  const letters = stencil(text, font, fitSize(text, font, place.size));
  const [x, y] = wordCentre(place, letters.width, letters.height);
  const view = quad(
    geometry,
    WORD_FRAGMENT,
    { uGlyph: letters.texture },
    {
      uInk: { value: new Float32Array(3), type: 'vec3<f32>' },
      uDensity: { value: 1, type: 'f32' },
      uAngle: { value: 0, type: 'f32' },
      uSeed: { value: (seed * 31 + index * 17) % 97, type: 'f32' },
      uWipe: { value: -1, type: 'f32' },
    },
    [letters.texture.width / 2, letters.texture.height / 2],
    [x, y],
    'multiply',
  );
  view.set({ uRotation: place.rotation });
  return { place, view, texture: letters.texture, destroy() { view.destroy(); letters.texture.destroy(true); } };
}

// ---------------------------------------------------------------------------------------------------------------
// The world

export type RisoInput = {
  ms: number;
  /** Every beat in the clip, in ms. */
  beatsMs: readonly number[];
  /** The first beat of each bar: the layers jump hardest and the words stamp hardest here. */
  downbeatsMs?: readonly number[];
  /** The lyric words with their times. Empty means lyrics are off: only the person is printed. */
  cues: readonly LyricCue[];
  inks: RisoInkSet['inks'];
  font: AdFont;
};

export type RisoWorld = {
  root: Container;
  update(input: RisoInput): void;
  destroy(): void;
};

/**
 * The print for one card. `seed` decides the sheet's stains and where each word falls; `photo` is the person
 * (absent: a lyrics-only print).
 */
export function createRisoWorld(photo: RisoPhoto | null, seed: number): RisoWorld {
  const root = new Container();
  const geometry = new Geometry({ attributes: { aPosition: { buffer: CORNERS, format: 'float32x2', stride: 8, offset: 0 } }, indexBuffer: new Uint32Array([0, 1, 2, 0, 2, 3]) });
  const paper = Texture.from(paperCanvas(seed));
  const words = new Container();
  root.addChild(new Sprite(paper), words);

  const frame: [number, number] = [WIDTH / 2, HEIGHT / 2];
  const half: [number, number] = [WIDTH / 2, HEIGHT / 2];
  let tone: Texture | null = null;
  let person: ReturnType<typeof quad> | null = null;
  let hidden: ReturnType<typeof quad> | null = null;
  if (photo) {
    tone = Texture.from(photo.canvas);
    const hide = quad(geometry, HIDE_FRAGMENT, { uPaper: paper, uTone: tone }, {}, half, frame, 'normal');
    person = quad(
      geometry,
      PERSON_FRAGMENT,
      { uTone: tone },
      {
        uInkA: { value: new Float32Array(3), type: 'vec3<f32>' },
        uInkB: { value: new Float32Array(3), type: 'vec3<f32>' },
        uOffA: { value: new Float32Array(2), type: 'vec2<f32>' },
        uOffB: { value: new Float32Array(2), type: 'vec2<f32>' },
        uCell: { value: CELL, type: 'f32' },
        uAngleA: { value: 0, type: 'f32' },
        uAngleB: { value: 0, type: 'f32' },
      },
      half,
      frame,
      'multiply',
    );
    root.addChild(hide.mesh, person.mesh);
    hidden = hide;
  }

  const live = new Map<number, Word>();
  let built = '';
  let breaks: number[] = [];
  let cuesSeen: readonly LyricCue[] | null = null;
  let downbeatsSeen: readonly number[] | null = null;

  function show(input: RisoInput, offsets: [number, number][], page: ReturnType<typeof pageAt>) {
    const downbeats = input.downbeatsMs ?? [];
    const wanted = new Map<number, { rank: number; wipe: number }>();
    page.words.forEach((index, at) => wanted.set(index, { rank: page.words.length - 1 - at, wipe: -1 }));
    if (page.wiping) {
      const { words: gone, progress } = page.wiping;
      const edge = progress * (HEIGHT + 200) - 100;
      gone.forEach((index, at) => wanted.set(index, { rank: gone.length - 1 - at, wipe: edge }));
    }
    for (const [index, word] of live) {
      if (wanted.has(index)) continue;
      words.removeChild(word.view.mesh);
      word.destroy();
      live.delete(index);
    }
    const down = lastDownbeat(input.ms, downbeats);
    for (const [index, { rank, wipe }] of wanted) {
      const cue = input.cues[index];
      let word = live.get(index);
      if (!word) {
        word = makeWord(geometry, stamped(input.font, cue.text), input.font, index, seed, input.inks.length);
        live.set(index, word);
        words.addChild(word.view.mesh);
      }
      // A word lands on its own beat, and the whole page is struck again on each downbeat, the newest hardest.
      const struck = Math.max(cue.startMs, down);
      const weight = (down > cue.startMs ? 0.14 : 0.08) / (1 + rank * 0.6);
      word.view.set({
        uInk: hexToRgb(input.inks[word.place.ink]),
        uDensity: wordDensity(rank),
        uAngle: (ANGLES[word.place.ink] * Math.PI) / 180,
        uWipe: wipe,
        uScale: stampScale((input.ms - struck) / 1000, weight),
        uOffset: offsets[word.place.ink],
      });
    }
  }

  return {
    root,
    update(input) {
      const downbeats = input.downbeatsMs ?? [];
      const offsets = input.inks.map((_, ink) => misregistration(seed, ink, input.ms, input.beatsMs, downbeats));
      if (cuesSeen !== input.cues || downbeatsSeen !== input.downbeatsMs) {
        cuesSeen = input.cues;
        downbeatsSeen = input.downbeatsMs ?? null;
        breaks = pageBreaks(input.cues, downbeats);
      }
      // Another font is another set of stencils.
      if (built !== input.font) {
        for (const word of live.values()) { words.removeChild(word.view.mesh); word.destroy(); }
        live.clear();
        built = input.font;
      }
      show(input, offsets, pageAt(input.cues, breaks, input.ms));
      person?.set({
        uInkA: hexToRgb(input.inks[0]),
        uInkB: hexToRgb(input.inks[1]),
        uOffA: offsets[0],
        uOffB: offsets[1],
        uCell: CELL * (1 + 0.1 * breath(input.ms, input.beatsMs, downbeats)),
        uAngleA: (ANGLES[0] * Math.PI) / 180,
        uAngleB: (ANGLES[1] * Math.PI) / 180,
      });
    },
    destroy() {
      for (const word of live.values()) { words.removeChild(word.view.mesh); word.destroy(); }
      live.clear();
      for (const piece of [hidden, person]) if (piece) { root.removeChild(piece.mesh); piece.destroy(); }
      geometry.destroy(true);
      paper.destroy(true);
      tone?.destroy(true);
      root.destroy({ children: true });
    },
  };
}
