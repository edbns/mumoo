/**
 * Window — a blank, flat, single-colour screen with a giant heavy lyric word cut out of it: the word is a window,
 * and the picture behind shows through the letters. The edges are crisp, with a thin darker rim and a hard shadow
 * inside the top left of every letter, so the word reads as a hole cut in thick card. On every beat the window
 * punches and the picture behind pushes in. New words pop in, taking turns running across the frame and up it.
 * The picture is any Pixi texture: a photo, or the texture of a video (`Motion` in `pack-motion.ts`), which the
 * caller has already moved to the right moment. Every frame is a pure function of the clock, the beat times and the
 * lyric cues, so the shelf preview and the cloud render draw the same picture.
 */
import { Container, Geometry, Mesh, Shader, Texture } from 'pixi.js';
import { HEIGHT, WIDTH, type LyricCue } from './composition';
import { cssFont, displayFace, setCase, type AdFont } from './ad-fonts';
import { hexToRgb } from './dust-colors';
import { textMeasureCtx } from './pack-text';
import {
  WORD_CENTRE, coverSize, groupAt, layoutWindow, pictureScale, punchAt, screenAt, turnedAt, windowScale, wordGroups,
  type Measure, type WindowLayout, type WordGroup,
} from './window-look';

/** The words are drawn this much bigger than they are fitted, so a punch never shows the letters' edges enlarged. */
const SUPERSAMPLE = 1.1;
/** The empty border round the words in their picture, in px at the size they are drawn. */
const MASK_PAD = 6;
/** How thick the rim round the window is, and how deep its inner shadow reaches, in frame px. */
const RIM = 4;
const DEPTH = 14;
/** The shadow is the screen colour this much darker, laid over the picture this strongly. */
const SHADE_DARKEN = 0.35;
const SHADE_STRENGTH = 0.65;

// ---------------------------------------------------------------------------------------------------------------
// Shader

const VERTEX = `#version 300 es
precision highp float;
in vec2 aPosition;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
out vec2 vFrame;
void main() {
  vFrame = (aPosition * 0.5 + 0.5) * vec2(${WIDTH}.0, ${HEIGHT}.0);
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(vFrame, 1.0)).xy, 0.0, 1.0);
}
`;

/** The window and everything seen through it, in one pass: the screen, the rim, the picture in the letters. */
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vFrame;
uniform vec3 uScreen;
uniform vec3 uRim;
uniform float uOpen;
uniform vec2 uCentre;
uniform vec2 uHalf;
uniform float uScale;
uniform vec2 uCover;
uniform float uPush;
uniform float uTurn;
uniform sampler2D uWord;
uniform sampler2D uPhoto;
out vec4 finalColor;

/** How much of the word is under this spot of the frame. */
float word(vec2 frame) {
  vec2 d = (frame - uCentre) / uScale;
  // Turned words run up the frame: their line goes from the bottom to the top, the tops of the letters to the left.
  if (uTurn > 0.5) d = vec2(-d.y, d.x);
  vec2 at = d / (uHalf * 2.0) + 0.5;
  return texture(uWord, at).a;
}

/** The word's edge as a crisp line a pixel wide, not a blur. */
float cut(vec2 frame) {
  float a = word(frame);
  float w = max(fwidth(a) * 0.75, 0.02);
  return smoothstep(0.5 - w, 0.5 + w, a);
}

vec2 photoAt(vec2 frame, float size) {
  return (frame - vec2(${WIDTH / 2}, ${HEIGHT / 2})) / (uCover * size) + 0.5;
}

void main() {
  float inside = cut(vFrame) * uOpen;
  // The rim: the word grown by a few px, minus the word.
  float grown = 0.0;
  for (int k = 0; k < 8; k++) {
    float angle = float(k) * 0.7853982;
    grown = max(grown, cut(vFrame + vec2(cos(angle), sin(angle)) * ${RIM.toFixed(1)}));
  }
  float rim = max(grown * uOpen - inside, 0.0);
  // The inner shadow: a spot of the letter whose way to the light, up and left, runs out of the letter is in shadow.
  float shade = inside * (1.0 - cut(vFrame - vec2(${DEPTH.toFixed(1)}) * 0.7071));

  vec3 colour = mix(uScreen, uRim, rim);
  vec3 seen = mix(texture(uPhoto, photoAt(vFrame, uPush)).rgb, uScreen * ${SHADE_DARKEN.toFixed(2)}, ${SHADE_STRENGTH.toFixed(2)} * shade);
  colour = mix(colour, seen, inside);
  finalColor = vec4(colour, 1.0);
}
`;

type Values = Record<string, number | readonly number[]>;

/** The whole frame as one quad, with its uniforms set by name. */
function screen(picture: Texture, word: Texture) {
  const geometry = new Geometry({
    attributes: { aPosition: { buffer: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), format: 'float32x2', stride: 8, offset: 0 } },
    indexBuffer: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
  const vec2 = () => ({ value: new Float32Array(2), type: 'vec2<f32>' });
  const uniforms = {
    uScreen: { value: new Float32Array(3), type: 'vec3<f32>' },
    uRim: { value: new Float32Array(3), type: 'vec3<f32>' },
    uOpen: { value: 0, type: 'f32' },
    uCentre: vec2(),
    uHalf: vec2(),
    uScale: { value: 1, type: 'f32' },
    uCover: vec2(),
    uPush: { value: 1, type: 'f32' },
    uTurn: { value: 0, type: 'f32' },
  };
  const shader = Shader.from({ gl: { vertex: VERTEX, fragment: FRAGMENT }, resources: { window: uniforms, uWord: word.source, uPhoto: picture.source } as never });
  const mesh = new Mesh({ geometry, shader });
  mesh.cullable = false;
  const group = shader.resources.window;
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
      geometry.destroy();
      mesh.destroy();
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The words

/** The ink of a line of type at 100 px. */
function measureFor(font: AdFont): Measure {
  const ctx = textMeasureCtx();
  return text => {
    ctx.font = cssFont(displayFace(font), 100);
    const box = ctx.measureText(text);
    return { width: box.actualBoundingBoxLeft + box.actualBoundingBoxRight, height: box.actualBoundingBoxAscent + box.actualBoundingBoxDescent };
  };
}

/** The laid-out words as one picture: their letters, white on clear. */
function drawWords(layout: WindowLayout, font: AdFont): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(layout.width * SUPERSAMPLE) + MASK_PAD * 2;
  canvas.height = Math.ceil(layout.height * SUPERSAMPLE) + MASK_PAD * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable.');
  ctx.fillStyle = '#fff';
  for (const line of layout.lines) {
    ctx.font = cssFont(displayFace(font), line.size * SUPERSAMPLE);
    const box = ctx.measureText(line.text);
    ctx.fillText(line.text, MASK_PAD + line.x * SUPERSAMPLE + box.actualBoundingBoxLeft, MASK_PAD + line.y * SUPERSAMPLE + box.actualBoundingBoxAscent);
  }
  return Texture.from(canvas);
}

// ---------------------------------------------------------------------------------------------------------------
// The world

export type WindowInput = {
  ms: number;
  /** Every beat in the clip, in ms. */
  beatsMs: readonly number[];
  /** The first beat of each bar: the screen flips colour here, and the window punches hardest. */
  downbeatsMs?: readonly number[];
  /** The lyric words with their times. Empty means lyrics are off: the screen stays closed. */
  cues: readonly LyricCue[];
  /** The id of the palette the card starts on (see `WINDOW_PALETTES`); it flips on from there on every downbeat. */
  palette: string;
  /** The palette ids that read against the picture (see `legiblePalettes`): the screen never flips onto any other. Every palette when left out. */
  allowed?: readonly string[];
  font: AdFont;
  picture: Texture;
};

export type WindowWorld = {
  root: Container;
  update(input: WindowInput): void;
  destroy(): void;
};

type Words = { index: number; texture: Texture; centre: readonly [number, number]; turned: boolean };

/** The screen for one card. `seed` decides which of its flip colours the screen flips to, bar by bar. */
export function createWindowWorld(seed: number): WindowWorld {
  const root = new Container();
  let built: Pick<WindowInput, 'cues' | 'font'> | null = null;
  let groups: WordGroup[] = [];
  let words: Words | null = null;
  let view: { picture: Texture; word: Texture; screen: ReturnType<typeof screen> } | null = null;

  function dropWords() {
    words?.texture.destroy(true);
    words = null;
  }

  function dropView() {
    if (!view) return;
    root.removeChild(view.screen.mesh);
    view.screen.destroy();
    view = null;
  }

  return {
    root,
    update(input) {
      const { ms, font, picture } = input;
      const downbeats = input.downbeatsMs ?? [];
      // Another set of cues or another face of type is another set of words.
      if (!built || built.cues !== input.cues || built.font !== font) {
        dropWords();
        dropView();
        built = { cues: input.cues, font };
        groups = wordGroups(input.cues);
      }
      const index = groupAt(groups, ms);
      if (index < 0) {
        dropWords();
      } else if (words?.index !== index) {
        dropWords();
        const text = setCase(font, groups[index].text);
        const turned = turnedAt(seed, index);
        words = { index, texture: drawWords(layoutWindow(text, measureFor(font), turned), font), centre: WORD_CENTRE, turned };
      }
      // The picture, or the words' texture, is new: the screen is made again to point at it.
      if (view && (view.picture !== picture || view.word !== (words?.texture ?? Texture.EMPTY))) dropView();
      if (!view) {
        const word = words?.texture ?? Texture.EMPTY;
        view = { picture, word, screen: screen(picture, word) };
        root.addChild(view.screen.mesh);
      }

      const punch = punchAt(ms, input.beatsMs, downbeats);
      const palette = screenAt(seed, input.palette, ms, downbeats, input.allowed);
      view.screen.set({
        uScreen: hexToRgb(palette.screen),
        uRim: hexToRgb(palette.rim),
        uOpen: words ? 1 : 0,
        uCentre: words?.centre ?? WORD_CENTRE,
        uHalf: words ? [(words.texture.width / SUPERSAMPLE) / 2, (words.texture.height / SUPERSAMPLE) / 2] : [1, 1],
        uScale: windowScale(punch, index < 0 ? Infinity : ms - groups[index].startMs),
        uCover: coverSize(picture.width, picture.height),
        uPush: pictureScale(ms, punch),
        uTurn: words?.turned ? 1 : 0,
      });
    },
    destroy() {
      dropView();
      dropWords();
      root.destroy({ children: true });
    },
  };
}
