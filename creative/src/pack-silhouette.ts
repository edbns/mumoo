/**
 * Silhouette — a flat red, black or white screen with the still figure of a person cut out of it: the song's video
 * plays inside the figure (on red, in black and white, like a poster), and the lyrics sit on the solid colour above the
 * head. On every beat the picture inside pushes in. Every frame is a pure function of the clock and the beat times, so
 * the shelf preview and the cloud render draw the same picture.
 */
import { Container, Geometry, Mesh, Shader, Texture } from 'pixi.js';
import { HEIGHT, WIDTH } from './composition';
import type { AdFont } from './ad-fonts';
import { hexToRgb } from './dust-colors';
import { createTypeLayer, type TimedWord, type TypeStyleId } from './pack-type';
import { headTop } from './silhouette';
import { SAFE_BOX, coverSize, paletteOf, pictureScale, punchAt } from './window-look';

/** The lyrics keep this far from the frame's sides and from the head below them, in px. */
const LYRICS_SIDE = 70;
const LYRICS_CLEAR = 50;
/** A short line grows up to this much to fill the room. */
const LYRICS_GROW = 2;
/** Room kept for a style that swells on the beat. */
const LYRICS_SWELL = 0.92;
const DARK_INK = '#0a0a0b';
const LIGHT_INK = '#f7f4ee';

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

/** The screen, and the picture wherever the figure is. The figure's mask is the size of the frame. */
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vFrame;
uniform vec3 uScreen;
uniform vec2 uCover;
uniform float uPush;
uniform float uMono;
uniform sampler2D uFigure;
uniform sampler2D uPhoto;
out vec4 finalColor;

void main() {
  vec2 frame = vec2(${WIDTH}.0, ${HEIGHT}.0);
  float inside = texture(uFigure, vFrame / frame).r;
  vec3 seen = texture(uPhoto, (vFrame - frame * 0.5) / (uCover * uPush) + 0.5).rgb;
  // On red the picture is black and white, pushed hard, like a screen print.
  float grey = dot(seen, vec3(0.2126, 0.7152, 0.0722));
  seen = mix(seen, vec3(smoothstep(0.08, 0.85, grey)), uMono);
  finalColor = vec4(mix(uScreen, seen, inside), 1.0);
}
`;

function screen(picture: Texture, figure: Texture) {
  const geometry = new Geometry({
    attributes: { aPosition: { buffer: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), format: 'float32x2', stride: 8, offset: 0 } },
    indexBuffer: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
  const uniforms = {
    uScreen: { value: new Float32Array(3), type: 'vec3<f32>' },
    uCover: { value: new Float32Array(2), type: 'vec2<f32>' },
    uPush: { value: 1, type: 'f32' },
    uMono: { value: 0, type: 'f32' },
  };
  const shader = Shader.from({ gl: { vertex: VERTEX, fragment: FRAGMENT }, resources: { silhouette: uniforms, uFigure: figure.source, uPhoto: picture.source } as never });
  const mesh = new Mesh({ geometry, shader });
  mesh.cullable = false;
  const group = shader.resources.silhouette;
  return {
    mesh,
    set(screenHex: string, cover: readonly number[], push: number, mono: number) {
      (group.uniforms.uScreen as Float32Array).set(hexToRgb(screenHex));
      (group.uniforms.uCover as Float32Array).set(cover);
      group.uniforms.uPush = push;
      group.uniforms.uMono = mono;
      group.update();
    },
    destroy() {
      geometry.destroy();
      mesh.destroy();
    },
  };
}

export type SilhouetteInput = {
  ms: number;
  beatsMs: readonly number[];
  downbeatsMs: readonly number[];
  beat: number;
  beatIndex: number;
  energy: number;
  seed: number;
  /** The id of the screen colour (`WINDOW_PALETTES`): red, black, off-white or plum. */
  palette: string;
  /** The figure (`SILHOUETTES` id) and its mask. */
  shape: string;
  figure: Texture;
  picture: Texture;
  /** The lyric words now on screen (none when lyrics are off), and the phrase they belong to. */
  words: readonly TimedWord[];
  typeStyle: TypeStyleId;
  font: AdFont;
};

export type SilhouetteWorld = { root: Container; update(input: SilhouetteInput): void; destroy(): void };

export function createSilhouetteWorld(): SilhouetteWorld {
  const root = new Container();
  const type = createTypeLayer();
  // Measures each phrase, off screen, so a style that moves its letters is drawn at one size the whole phrase.
  const ruler = createTypeLayer();
  let measured: { key: string; x: number; y: number; width: number; height: number } | null = null;
  let view: { picture: Texture; figure: Texture; screen: ReturnType<typeof screen> } | null = null;

  function dropView() {
    if (!view) return;
    root.removeChild(view.screen.mesh);
    view.screen.destroy();
    view = null;
  }

  return {
    root,
    update(input) {
      if (view && (view.picture !== input.picture || view.figure !== input.figure)) dropView();
      if (!view) {
        view = { picture: input.picture, figure: input.figure, screen: screen(input.picture, input.figure) };
        root.addChildAt(view.screen.mesh, 0);
      }
      if (!type.root.parent) root.addChild(type.root);
      const punch = punchAt(input.ms, input.beatsMs, input.downbeatsMs);
      view.screen.set(paletteOf(input.palette).screen, coverSize(input.picture.width, input.picture.height), pictureScale(input.ms, punch), input.palette === 'red' ? 1 : 0);

      // The lyrics fill the solid colour above the head: as big as that room allows, never over the figure.
      const ink = input.palette === 'black' || input.palette === 'plum' ? LIGHT_INK : DARK_INK;
      const frame = {
        words: [...input.words], beatIndex: input.beatIndex, seed: input.seed,
        ink, accent: ink, shadow: ink === DARK_INK ? '#ffffff' : '#000000', font: input.font, fontSecondary: input.font,
      };
      type.paint(input.typeStyle, { ...frame, ms: input.ms, beat: input.beat, energy: input.energy });
      if (!input.words.length) return;
      // The phrase's size depends only on the phrase (never on which frame it was first seen in): the cloud draws a video in pieces.
      const key = `${input.typeStyle}|${input.font}|${input.words.map(word => `${word.text}@${word.startMs}`).join(' ')}`;
      if (measured?.key !== key) {
        const ends = input.words.map(word => word.endMs);
        let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
        for (const ms of [...input.words.map(word => (word.startMs + word.endMs) / 2), ...ends, Math.max(...ends) + 600]) {
          ruler.paint(input.typeStyle, { ...frame, ms, beat: 0, energy: 0 });
          const box = ruler.root.getLocalBounds();
          if (box.width <= 0 || box.height <= 0) continue;
          [x0, y0, x1, y1] = [Math.min(x0, box.x), Math.min(y0, box.y), Math.max(x1, box.x + box.width), Math.max(y1, box.y + box.height)];
        }
        measured = x1 > x0 ? { key, x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
      }
      if (!measured) return;
      const top = SAFE_BOX.y;
      const room = headTop(input.shape) - LYRICS_CLEAR - top;
      const fit = LYRICS_SWELL * Math.min(LYRICS_GROW, (WIDTH - LYRICS_SIDE * 2) / measured.width, room / measured.height);
      type.root.pivot.set(measured.x + measured.width / 2, measured.y + measured.height / 2);
      type.root.position.set(WIDTH / 2, top + room / 2);
      type.root.scale.set(fit);
    },
    destroy() {
      dropView();
      type.destroy();
      ruler.destroy();
      root.destroy({ children: true });
    },
  };
}
