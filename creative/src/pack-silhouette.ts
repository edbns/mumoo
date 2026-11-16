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
import { FIGURE_SCALE, headTop } from './silhouette';
import { SAFE_BOX, coverSize, paletteOf, pictureScale, punchAt } from './window-look';

/** The lyrics keep this far from the frame's sides and from the head below them, in px. */
const LYRICS_SIDE = 70;
const LYRICS_CLEAR = 50;
/** A short line grows up to this much to fill the room. */
const LYRICS_GROW = 2;
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

/** The screen, and the picture wherever the figure is. The figure stands on the frame's bottom edge, in the middle, `FIGURE_SCALE` of the frame's size. */
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
  vec2 at = (vFrame - vec2(frame.x * 0.5, frame.y)) / (frame * ${FIGURE_SCALE.toFixed(3)}) + vec2(0.5, 1.0);
  float inside = at.x < 0.0 || at.x > 1.0 || at.y < 0.0 || at.y > 1.0 ? 0.0 : texture(uFigure, at).r;
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
  /** The id of the screen colour (`WINDOW_PALETTES`): red, black or off-white. */
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
      const ink = input.palette === 'black' ? LIGHT_INK : DARK_INK;
      type.root.pivot.set(0, 0);
      type.root.position.set(0, 0);
      type.root.scale.set(1);
      type.paint(input.typeStyle, {
        ms: input.ms, words: [...input.words], beat: input.beat, beatIndex: input.beatIndex, energy: input.energy, seed: input.seed,
        ink, accent: ink, shadow: ink === DARK_INK ? '#ffffff' : '#000000', font: input.font, fontSecondary: input.font,
      });
      const bounds = type.root.getLocalBounds();
      if (!input.words.length || bounds.width <= 0 || bounds.height <= 0) return;
      const top = SAFE_BOX.y;
      const room = headTop(input.shape) - LYRICS_CLEAR - top;
      const fit = Math.min(LYRICS_GROW, (WIDTH - LYRICS_SIDE * 2) / bounds.width, room / bounds.height);
      type.root.pivot.set(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      type.root.position.set(WIDTH / 2, top + room / 2);
      type.root.scale.set(fit);
    },
    destroy() {
      dropView();
      type.destroy();
      root.destroy({ children: true });
    },
  };
}
