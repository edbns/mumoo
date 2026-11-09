/**
 * Window — a blank, flat, single-colour screen with a giant heavy lyric word cut out of it: the word is a window,
 * and the picture behind shows through the letters. The edges are crisp, with a thin darker rim and a hard shadow
 * inside the top left of every letter, so the word reads as a hole cut in thick card. On every beat the window
 * punches and the picture behind pushes in; on a downbeat the screen flips to another of its palette's colours. New
 * words pop in.
 * When the picture has a person cut out of it, the person stands in front of the screen and of the word.
 * The picture is any Pixi texture: a photo, one of the baked Shaders stills, or the texture of a video (`Motion` in `pack-motion.ts`), which the
 * caller has already moved to the right moment. Every frame is a pure function of the clock, the beat times and the
 * lyric cues, so the shelf preview and the cloud render draw the same picture.
 */
import { Container, Geometry, Mesh, Shader, Texture } from 'pixi.js';
import { HEIGHT, WIDTH, type LyricCue } from './composition';
import { cssFont, displayFace, setCase, type AdFont } from './ad-fonts';
import { hexToRgb } from './dust-colors';
import { textMeasureCtx } from './pack-text';
import {
  SAFE_BOX, WORD_CENTRE, coverSize, groupAt, layoutWords, legiblePalettes, personStage, personWords, pictureScale, punchAt, screenAt, windowScale, wordGroups,
  type Measure, type WindowLayout, type WordGroup,
} from './window-look';

/** The picture behind the window, and when it has one, the mask of the person who stands in front of it (the red channel is 1 on the person). */
export type WindowPicture = { texture: Texture; cutout?: Texture };

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

/** The window and everything seen through it, in one pass: the screen, the rim, the picture in the letters, the person in front. */
const fragment = (withPerson: boolean) => `#version 300 es
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
uniform float uDrop;
uniform sampler2D uWord;
uniform sampler2D uPhoto;
${withPerson ? 'uniform sampler2D uPerson;' : ''}
out vec4 finalColor;

/** How much of the word is under this spot of the frame. */
float word(vec2 frame) {
  vec2 at = (frame - uCentre) / uScale / (uHalf * 2.0) + 0.5;
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
${
  withPerson
    ? `  vec2 own = photoAt(vFrame - vec2(0.0, uDrop), 1.0);
  float person = smoothstep(0.35, 0.85, texture(uPerson, own).r) * step(0.0, own.y) * step(own.y, 1.0);
  colour = mix(colour, texture(uPhoto, own).rgb, person);`
    : ''
}
  finalColor = vec4(colour, 1.0);
}
`;

type Values = Record<string, number | readonly number[]>;

/** The whole frame as one quad, with its uniforms set by name. */
function screen(picture: WindowPicture, word: Texture) {
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
    uDrop: { value: 0, type: 'f32' },
  };
  const resources: Record<string, unknown> = { window: uniforms, uWord: word.source, uPhoto: picture.texture.source };
  if (picture.cutout) resources.uPerson = picture.cutout.source;
  const shader = Shader.from({ gl: { vertex: VERTEX, fragment: fragment(Boolean(picture.cutout)) }, resources: resources as never });
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

/** How coarsely a picture is read, in px of the frame to a pixel: finely for the top of the person's head, coarsely for the picture's colours. */
const HEAD_CELL = 6;
const COLOUR_CELL = 24;

/** The pixels of `source` as the frame shows it, `scale` times bigger than it covers the frame, from `top` down for `rows` rows of the frame, one pixel to every `cell` px of the frame. */
function readFrame(source: Texture, scale: number, top: number, rows: number, cell: number): ImageData {
  const [coverWidth, coverHeight] = coverSize(source.width, source.height);
  const [width, height] = [coverWidth * scale, coverHeight * scale];
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(WIDTH / cell);
  canvas.height = Math.ceil(rows / cell);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is unavailable.');
  ctx.drawImage(source.source.resource as CanvasImageSource, (WIDTH - width) / 2 / cell, (HEIGHT / 2 - height / 2 - top) / cell, width / cell, height / cell);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** How far down the frame the top of the person's head is, in px: the first row where the cut-out's mask is mostly the person. */
function headTop(cutout: Texture): number {
  const { data, width, height } = readFrame(cutout, 1, 0, HEIGHT, HEAD_CELL);
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) if (data[(row * width + column) * 4] > 127) return row * HEAD_CELL;
  }
  throw new Error('The cut-out has nobody in it.');
}

/**
 * Colours sampled from the part of the picture that shows through the letters, as `legiblePalettes` wants them:
 * the safe area as the picture is first seen (shown bigger with a person in front), less the part her head will hide.
 */
export function pictureColours(picture: WindowPicture): string[] {
  const stage = picture.cutout ? personStage(headTop(picture.cutout)) : null;
  const top = SAFE_BOX.y;
  const rows = stage ? stage.headAt - top : SAFE_BOX.height;
  const { data } = readFrame(picture.texture, pictureScale(0, 0, Boolean(stage)), top, rows, COLOUR_CELL);
  const hex = (at: number) => `#${[0, 1, 2].map(channel => data[at + channel].toString(16).padStart(2, '0')).join('')}`;
  return Array.from({ length: data.length / 4 }, (_, pixel) => hex(pixel * 4));
}

/** A cut-out has a person in it when the mask is clear of her at the edges: she covers at least this much of the frame, and no more than this much (more is a mask of the whole picture). */
const PERSON_SHARE = { least: 0.08, most: 0.7 } as const;

/** Whether the cut-out's mask has a clear person in it, so that she can stand in front of the word. */
export function personStands(cutout: Texture): boolean {
  const { data } = readFrame(cutout, 1, 0, HEIGHT, HEAD_CELL);
  let covered = 0;
  for (let at = 0; at < data.length; at += 4) if (data[at] > 127) covered++;
  const share = covered / (data.length / 4);
  return share >= PERSON_SHARE.least && share <= PERSON_SHARE.most;
}

/** What is known of a picture before cards are dealt from it: the screens that read against it as it is, and, when a person stands in it, with her in front. */
export type WindowReading = { plain: string[]; person: string[] | null };

export function readWindowPicture(texture: Texture, cutout?: Texture): WindowReading {
  const plain = legiblePalettes(pictureColours({ texture }));
  if (!plain.length) throw new Error('No screen colour reads clearly against this picture. Try another one.');
  const person = cutout && personStands(cutout) ? legiblePalettes(pictureColours({ texture, cutout })) : [];
  return { plain, person: person.length ? person : null };
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
  picture: WindowPicture;
};

export type WindowWorld = {
  root: Container;
  update(input: WindowInput): void;
  destroy(): void;
};

type Words = { index: number; texture: Texture; centre: readonly [number, number] };

/** The screen for one card. `seed` decides which of its flip colours the screen flips to, bar by bar. */
export function createWindowWorld(seed: number): WindowWorld {
  const root = new Container();
  let built: Pick<WindowInput, 'cues' | 'font'> | null = null;
  let groups: WordGroup[] = [];
  let words: Words | null = null;
  let stage: { cutout: Texture; drop: number; headAt: number } | null = null;
  let view: { picture: WindowPicture; word: Texture; screen: ReturnType<typeof screen> } | null = null;

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
      // Where the person stands, read once per cut-out; the words are laid out to suit.
      if (!picture.cutout) stage = null;
      else if (stage?.cutout !== picture.cutout) stage = { cutout: picture.cutout, ...personStage(headTop(picture.cutout)) };
      if (index < 0) {
        dropWords();
      } else if (words?.index !== index) {
        dropWords();
        const text = setCase(font, groups[index].text);
        const { layout, centre } = stage ? personWords(text, measureFor(font), stage.headAt) : { layout: layoutWords(text, measureFor(font)), centre: WORD_CENTRE };
        words = { index, texture: drawWords(layout, font), centre };
      }
      // The picture, or the words' texture, is new: the screen is made again to point at it.
      if (view && (view.picture.texture !== picture.texture || view.picture.cutout !== picture.cutout || view.word !== (words?.texture ?? Texture.EMPTY))) dropView();
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
        uDrop: stage?.drop ?? 0,
        uHalf: words ? [(words.texture.width / SUPERSAMPLE) / 2, (words.texture.height / SUPERSAMPLE) / 2] : [1, 1],
        uScale: windowScale(punch, index < 0 ? Infinity : ms - groups[index].startMs),
        uCover: coverSize(picture.texture.width, picture.texture.height),
        uPush: pictureScale(ms, punch, Boolean(picture.cutout)),
      });
    },
    destroy() {
      dropView();
      dropWords();
      root.destroy({ children: true });
    },
  };
}
