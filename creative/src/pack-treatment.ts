/**
 * Video treatments — one creative finish over the Director's finished reel.
 * The reel texture is already cut, pushed-in and levelled (pack-reel.ts). This world draws that picture into
 * an off-screen texture, then finishes it: sliced into panels (Triptych, Bento, Collage, Colored Frame) or passed
 * through a shader (Fisheye, Film Grain, Kaleidoscope), or exposed twice (Double Exposure). The lyrics are drawn
 * on top so they stay readable. Preview and cloud render share this code.
 */
import {
  BlurFilter, Container, Filter, GlProgram, Graphics, Rectangle, RenderTexture, Sprite, Texture, UniformGroup,
  type Renderer,
} from 'pixi.js';
import { HEIGHT, WIDTH } from './composition';
import { analyzeTexture } from './pack-palette';
import type { PackSceneInput } from './pack-copy';
import { createTypeLayer, type TimedWord } from './pack-type';
import type { TreatmentId } from './treatment-deal';

export type TreatmentWorld = {
  root: Container;
  update(input: PackSceneInput, renderer: Renderer): void;
  destroy(): void;
};

const VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}
`;

/** Filter textures can be larger than the frame: `n` is 0..1 over the frame, `back(n)` the coordinate to sample. */
const FRAME_UV = `
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
vec2 frameMax() { return uOutputFrame.zw * uInputSize.zw; }
vec2 mirrored(vec2 n) { return 1.0 - abs(1.0 - mod(n, 2.0)); }
`;

function makeFilter(fragment: string, name: string, initial: Record<string, number>) {
  const group = new UniformGroup(Object.fromEntries(Object.entries(initial).map(([key, value]) => [key, { value, type: 'f32' as const }])));
  const filter = new Filter({
    glProgram: GlProgram.from({ vertex: VERTEX, fragment, name }),
    resources: { treatmentUniforms: group },
  });
  return {
    filter,
    set: (values: Record<string, number>) => { Object.assign(group.uniforms, values); },
  };
}

/**
 * A real lens: inside a circle (radius `uRadius`, a share of the frame's width) the picture bulges, magnified in the
 * middle and squeezed at the rim (tan mapping, `uBend` radians), with a dark rim; outside the circle is clear so the
 * backdrop shows. With a radius past the corners it is a full-bleed wide lens.
 */
const FISHEYE = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uBend;
uniform float uRadius;
uniform float uReach;
uniform float uAspect;
${FRAME_UV}
void main(void) {
  vec2 m = frameMax();
  vec2 n = vTextureCoord / m;
  vec2 p = (n - 0.5) * vec2(1.0, uAspect);
  float radius = 0.5 * uRadius;
  float rn = length(p) / radius;
  if (rn > 1.0) { finalColor = vec4(0.0); return; }
  float rs = tan(rn * uBend) / tan(uBend) * uReach;
  vec2 dir = rn > 0.0 ? p / length(p) : vec2(0.0);
  vec2 s = dir * rs / vec2(1.0, uAspect) + 0.5;
  vec4 colour = texture(uTexture, mirrored(s) * m);
  float rim = smoothstep(0.72, 1.0, rn);
  colour.rgb *= 1.0 - 0.75 * rim;
  float edge = 1.0 - smoothstep(0.985, 1.0, rn);
  finalColor = vec4(colour.rgb, 1.0) * edge;
}
`;

/** Film: grain the size of `uSize` pixels that moves every frame, lifted blacks, a warm cast, vignette, flicker, scratches and halation. */
const GRAIN = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uTime;
uniform float uAmount;
uniform float uSize;
uniform float uFlicker;
uniform float uScratch;
uniform float uHalation;
uniform float uEnergy;
uniform float uAspect;
${FRAME_UV}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(void) {
  vec2 m = frameMax();
  vec2 n = vTextureCoord / m;
  float frame = floor(uTime * 24.0);
  vec2 weave = vec2(hash(vec2(frame, 1.0)) - 0.5, hash(vec2(frame, 2.0)) - 0.5) * 0.0025 * (uAmount * 6.0);
  vec4 colour = texture(uTexture, (n + weave) * m);
  if (uHalation > 0.0) {
    vec3 glow = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398;
      vec2 o = vec2(cos(a), sin(a) / uAspect) * 0.012;
      vec3 c = texture(uTexture, clamp(n + o, 0.0, 1.0) * m).rgb;
      glow += max(c - 0.62, 0.0);
    }
    colour.rgb += glow / 8.0 * vec3(1.6, 0.45, 0.25) * uHalation * 3.0;
  }
  float luma = dot(colour.rgb, vec3(0.299, 0.587, 0.114));
  vec2 cell = floor(gl_FragCoord.xy / uSize);
  float g = hash(cell + frame * vec2(17.0, 31.0)) - 0.5;
  float mid = 1.0 - abs(luma - 0.5) * 1.2;
  colour.rgb += g * uAmount * (0.6 + 0.6 * mid) * (0.85 + 0.3 * uEnergy);
  colour.rgb = 0.06 + colour.rgb * 0.92;
  colour.rgb *= vec3(1.05, 1.0, 0.92);
  colour.rgb *= 1.0 + (hash(vec2(frame, 7.0)) - 0.5) * uFlicker;
  if (uScratch > 0.0) {
    float x = hash(vec2(frame, 11.0));
    float on = step(0.45, hash(vec2(frame, 13.0)));
    float line = on * (1.0 - smoothstep(0.0, 0.0012, abs(n.x - x)));
    colour.rgb = mix(colour.rgb, vec3(0.92), line * uScratch);
    float dust = step(0.9985, hash(floor(gl_FragCoord.xy / 3.0) + frame));
    colour.rgb = mix(colour.rgb, vec3(0.05), dust * uScratch);
  }
  vec2 v = (n - 0.5) * vec2(1.0, 0.75);
  colour.rgb *= 1.0 - smoothstep(0.25, 0.75, length(v)) * 0.55;
  finalColor = vec4(colour.rgb, 1.0);
}
`;

/** A true kaleidoscope: square-pixel mirrors around the centre, turning slowly, with mirrored edges (never smeared streaks). */
const KALEIDO = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uSegments;
uniform float uBeat;
uniform float uTime;
uniform float uAspect;
${FRAME_UV}
void main(void) {
  vec2 m = frameMax();
  vec2 n = vTextureCoord / m;
  vec2 p = (n - 0.5) * vec2(1.0, uAspect);
  float angle = atan(p.y, p.x) + uTime * 0.12;
  float radius = length(p) * (0.85 - 0.05 * uBeat);
  float slice = 6.2831853 / max(uSegments, 2.0);
  float a = mod(angle, slice);
  a = abs(a - slice * 0.5);
  vec2 q = vec2(cos(a), sin(a)) * radius;
  vec2 s = q / vec2(1.0, uAspect) + vec2(0.5, 0.42);
  finalColor = vec4(texture(uTexture, mirrored(s) * m).rgb, 1.0);
}
`;

/** A rectangle in shares of the frame. */
type Box = { x: number; y: number; w: number; h: number };

/** The biggest part of the frame with the shape of `w`×`h`, centred on (cx, cy) and `zoom` times closer, kept inside the frame. */
function coverCrop(w: number, h: number, cx = 0.5, cy = 0.5, zoom = 1): Rectangle {
  const aspect = w / h;
  let cw = WIDTH;
  let ch = WIDTH / aspect;
  if (ch > HEIGHT) { ch = HEIGHT; cw = HEIGHT * aspect; }
  cw /= zoom;
  ch /= zoom;
  const x = Math.min(WIDTH - cw, Math.max(0, cx * WIDTH - cw / 2));
  const y = Math.min(HEIGHT - ch, Math.max(0, cy * HEIGHT - ch / 2));
  return new Rectangle(Math.round(x), Math.round(y), Math.max(1, Math.round(cw)), Math.max(1, Math.round(ch)));
}

/** Where a slice of the frame (`from`, in shares) is shown, cut to the shape of the panel so nothing is stretched. */
function sliceCrop(from: Box, w: number, h: number): Rectangle {
  const cx = from.x + from.w / 2;
  const cy = from.y + from.h / 2;
  const aspect = w / h;
  let cw = from.w * WIDTH;
  let ch = cw / aspect;
  if (ch > from.h * HEIGHT) { ch = from.h * HEIGHT; cw = ch * aspect; }
  const x = Math.min(WIDTH - cw, Math.max(0, cx * WIDTH - cw / 2));
  const y = Math.min(HEIGHT - ch, Math.max(0, cy * HEIGHT - ch / 2));
  return new Rectangle(Math.round(x), Math.round(y), Math.max(1, Math.round(cw)), Math.max(1, Math.round(ch)));
}

type Look = {
  /** The colour behind the panels; 'blur' is the reel itself, soft and dark. */
  backdrop: string | 'blur';
  /** Drawn once per frame: positions may follow the beat. */
  tick?: (beat: number, ms: number) => void;
};

const BLACK = '#0b0b0c';
const PAPER = '#efe9de';

/** Triptych: the frame sliced into three panels, pulled apart with real gaps and margins around them. */
const TRIPTYCH: Record<string, { dir: 'cols' | 'rows'; margin: number; gap: number; stagger?: number; breathe?: boolean; backdrop: string }> = {
  narrow: { dir: 'cols', margin: 44, gap: 44, backdrop: BLACK },
  medium: { dir: 'rows', margin: 44, gap: 44, backdrop: PAPER },
  wide: { dir: 'cols', margin: 56, gap: 56, stagger: 0.12, backdrop: BLACK },
  breathing: { dir: 'cols', margin: 40, gap: 40, breathe: true, backdrop: BLACK },
};

/** Collage: parts of the frame (`from`, `zoom`) cut out like prints and laid out (`at`, centre and size in shares of the frame, `tilt` in degrees). */
type CollagePiece = { cx: number; cy: number; zoom: number; at: Box; tilt: number };
const COLLAGE: Record<string, { backdrop: string | 'blur'; border: number; bottom: number; shadow: number; pieces: CollagePiece[] }> = {
  editorial: {
    backdrop: PAPER, border: 14, bottom: 14, shadow: 0.28,
    pieces: [
      { cx: 0.5, cy: 0.35, zoom: 1.1, at: { x: 0.42, y: 0.27, w: 0.72, h: 0.4 }, tilt: -3 },
      { cx: 0.62, cy: 0.62, zoom: 1.8, at: { x: 0.66, y: 0.6, w: 0.5, h: 0.3 }, tilt: 4 },
      { cx: 0.4, cy: 0.45, zoom: 2.6, at: { x: 0.32, y: 0.8, w: 0.44, h: 0.22 }, tilt: -6 },
    ],
  },
  scatter: {
    backdrop: 'blur', border: 16, bottom: 56, shadow: 0.45,
    pieces: [
      { cx: 0.5, cy: 0.3, zoom: 1.4, at: { x: 0.3, y: 0.16, w: 0.46, h: 0.25 }, tilt: -8 },
      { cx: 0.7, cy: 0.5, zoom: 2.0, at: { x: 0.72, y: 0.27, w: 0.44, h: 0.24 }, tilt: 6 },
      { cx: 0.5, cy: 0.5, zoom: 1.0, at: { x: 0.4, y: 0.5, w: 0.52, h: 0.28 }, tilt: 3 },
      { cx: 0.3, cy: 0.7, zoom: 1.8, at: { x: 0.7, y: 0.68, w: 0.46, h: 0.25 }, tilt: -5 },
      { cx: 0.5, cy: 0.8, zoom: 2.4, at: { x: 0.34, y: 0.85, w: 0.48, h: 0.24 }, tilt: 7 },
    ],
  },
  stack: {
    backdrop: BLACK, border: 10, bottom: 10, shadow: 0.5,
    pieces: [
      { cx: 0.5, cy: 0.25, zoom: 1.2, at: { x: 0.5, y: 0.22, w: 0.86, h: 0.3 }, tilt: -2.5 },
      { cx: 0.5, cy: 0.5, zoom: 1.0, at: { x: 0.5, y: 0.5, w: 0.9, h: 0.32 }, tilt: 2 },
      { cx: 0.5, cy: 0.75, zoom: 1.6, at: { x: 0.5, y: 0.78, w: 0.84, h: 0.3 }, tilt: -1.5 },
    ],
  },
  offset: {
    backdrop: 'blur', border: 0, bottom: 0, shadow: 0.55,
    pieces: [
      { cx: 0.45, cy: 0.4, zoom: 1.0, at: { x: 0.4, y: 0.33, w: 0.7, h: 0.5 }, tilt: 0 },
      { cx: 0.6, cy: 0.6, zoom: 1.7, at: { x: 0.64, y: 0.66, w: 0.6, h: 0.4 }, tilt: 0 },
      { cx: 0.5, cy: 0.3, zoom: 3.0, at: { x: 0.24, y: 0.82, w: 0.32, h: 0.2 }, tilt: 0 },
    ],
  },
};

/** Bento: rounded tiles with gaps (`at`, in shares of the inner area), each a different part of the frame (`cx`, `cy`) at its own zoom. */
type BentoTile = { at: Box; cx: number; cy: number; zoom: number };
const BENTO: Record<string, BentoTile[]> = {
  'hero-left': [
    { at: { x: 0, y: 0, w: 0.6, h: 1 }, cx: 0.5, cy: 0.5, zoom: 1 },
    { at: { x: 0.6, y: 0, w: 0.4, h: 0.5 }, cx: 0.55, cy: 0.3, zoom: 2.2 },
    { at: { x: 0.6, y: 0.5, w: 0.4, h: 0.5 }, cx: 0.45, cy: 0.7, zoom: 2.2 },
  ],
  'hero-top': [
    { at: { x: 0, y: 0, w: 1, h: 0.56 }, cx: 0.5, cy: 0.42, zoom: 1 },
    { at: { x: 0, y: 0.56, w: 0.5, h: 0.44 }, cx: 0.35, cy: 0.55, zoom: 2.4 },
    { at: { x: 0.5, y: 0.56, w: 0.5, h: 0.44 }, cx: 0.65, cy: 0.7, zoom: 2.4 },
  ],
  mosaic: [
    { at: { x: 0, y: 0, w: 1, h: 0.38 }, cx: 0.5, cy: 0.35, zoom: 1.1 },
    { at: { x: 0, y: 0.38, w: 0.5, h: 0.3 }, cx: 0.3, cy: 0.5, zoom: 2.6 },
    { at: { x: 0.5, y: 0.38, w: 0.5, h: 0.62 }, cx: 0.6, cy: 0.6, zoom: 1.5 },
    { at: { x: 0, y: 0.68, w: 0.5, h: 0.32 }, cx: 0.45, cy: 0.8, zoom: 2.8 },
  ],
  strip: [
    { at: { x: 0, y: 0, w: 1, h: 0.34 }, cx: 0.5, cy: 0.3, zoom: 1.2 },
    { at: { x: 0, y: 0.34, w: 1, h: 0.33 }, cx: 0.5, cy: 0.5, zoom: 1.9 },
    { at: { x: 0, y: 0.67, w: 1, h: 0.33 }, cx: 0.5, cy: 0.7, zoom: 1.4 },
  ],
};
const BENTO_MARGIN = 32;
const BENTO_GAP = 22;
const BENTO_RADIUS = 30;

/** Colored Frame: the whole picture inset in a matte; the inset in shares of the frame. */
const FRAME_INSET: Record<string, number> = { slim: 0.06, bold: 0.13, accent: 0.09, ink: 0.09 };

/** Fisheye: a full-bleed wide lens, then round lenses that bulge more. */
const LENS: Record<string, { bend: number; radius: number; reach: number }> = {
  subtle: { bend: 1.05, radius: 2.1, reach: 1.02 },
  medium: { bend: 1.0, radius: 0.98, reach: 0.62 },
  strong: { bend: 1.22, radius: 0.98, reach: 0.72 },
  extreme: { bend: 1.38, radius: 0.84, reach: 0.8 },
};
const KALEIDO_SEGMENTS: Record<string, number> = { four: 4, six: 6, eight: 8, twelve: 12 };
const GRAIN_LOOK: Record<string, { amount: number; size: number; flicker: number; scratch: number; halation: number }> = {
  fine: { amount: 0.12, size: 1.5, flicker: 0.03, scratch: 0, halation: 0 },
  classic: { amount: 0.2, size: 2, flicker: 0.06, scratch: 0, halation: 0.15 },
  heavy: { amount: 0.32, size: 3, flicker: 0.1, scratch: 1, halation: 0 },
  halation: { amount: 0.16, size: 2, flicker: 0.05, scratch: 0, halation: 0.9 },
};

/** How many Director cuts ahead the second exposure looks (0 = the same moment, flipped and closer). */
export const DOUBLE_CUT_AHEAD: Record<string, number> = {
  blend: 0,
  screen: 0,
  'offset-cut': 1,
  'offset-far': 2,
};
const DOUBLE_LOOK: Record<string, { zoom: number; flip: boolean; alpha: number; screen: boolean; dim: number }> = {
  blend: { zoom: 1.35, flip: true, alpha: 0.5, screen: false, dim: 0xffffff },
  screen: { zoom: 1.6, flip: true, alpha: 0.95, screen: true, dim: 0x9a9a9a },
  'offset-cut': { zoom: 1.1, flip: false, alpha: 0.9, screen: true, dim: 0xa8a8a8 },
  'offset-far': { zoom: 1.25, flip: true, alpha: 0.9, screen: true, dim: 0xa8a8a8 },
};

export function createTreatmentWorld(): TreatmentWorld {
  const root = new Container();
  const backdrop = new Graphics();
  const blurred = new Sprite();
  blurred.width = WIDTH;
  blurred.height = HEIGHT;
  blurred.alpha = 0.55;
  const panels = new Container();
  const treated = new Sprite();
  const scrim = new Graphics();
  const type = createTypeLayer();
  root.addChild(backdrop, blurred, panels, treated, scrim, type.root);

  let sourceRt: RenderTexture | null = null;
  let secondRt: RenderTexture | null = null;
  let smallRt: RenderTexture | null = null;
  const softly = new BlurFilter({ strength: 4, quality: 2 });
  let built: { key: string; look: Look; textures: Texture[] } | null = null;

  const fisheye = makeFilter(FISHEYE, 'treatment-fisheye', { uBend: 1, uRadius: 1, uReach: 0.7, uAspect: HEIGHT / WIDTH });
  const grain = makeFilter(GRAIN, 'treatment-grain', { uTime: 0, uAmount: 0.2, uSize: 2, uFlicker: 0, uScratch: 0, uHalation: 0, uEnergy: 0, uAspect: HEIGHT / WIDTH });
  const kaleido = makeFilter(KALEIDO, 'treatment-kaleido', { uSegments: 6, uBeat: 0, uTime: 0, uAspect: HEIGHT / WIDTH });
  const doubleBase = new Sprite();
  const doubleOver = new Sprite();
  doubleOver.anchor.set(0.5);
  const doubleLayer = new Container();
  doubleLayer.addChild(doubleBase, doubleOver);
  root.addChildAt(doubleLayer, 3);

  function rt(current: RenderTexture | null, w = WIDTH, h = HEIGHT) {
    return current ?? RenderTexture.create({ width: w, height: h, resolution: 1 });
  }

  function paint(texture: Texture, renderer: Renderer, into: RenderTexture, filters: Filter[] = []) {
    const sprite = new Sprite(texture);
    sprite.width = into.width;
    sprite.height = into.height;
    sprite.filters = filters;
    renderer.render({ container: sprite, target: into, clear: true });
    sprite.destroy();
  }

  function clearBuilt() {
    if (!built) return;
    for (const child of panels.removeChildren()) child.destroy({ children: true });
    for (const texture of built.textures) texture.destroy(false);
    built = null;
  }

  /** One part of the picture as a sprite of `w`×`h`; its texture is kept to be freed when the look changes. */
  function piece(source: RenderTexture, frame: Rectangle, w: number, h: number, textures: Texture[]) {
    const texture = new Texture({ source: source.source, frame });
    textures.push(texture);
    const sprite = new Sprite(texture);
    sprite.width = w;
    sprite.height = h;
    return sprite;
  }

  function buildTriptych(variant: string, source: RenderTexture, textures: Texture[]): Look {
    const spec = TRIPTYCH[variant] ?? TRIPTYCH.narrow;
    const sprites = [0, 1, 2].map(() => new Sprite());
    for (const sprite of sprites) panels.addChild(sprite);
    const place = (gap: number) => {
      const cols = spec.dir === 'cols';
      const along = (cols ? WIDTH : HEIGHT) - 2 * spec.margin - 2 * gap;
      const size = along / 3;
      const across = (cols ? HEIGHT : WIDTH) - 2 * spec.margin;
      const length = spec.stagger ? across * (1 - spec.stagger) : across;
      sprites.forEach((old, index) => {
        const from: Box = cols ? { x: index / 3, y: 0, w: 1 / 3, h: 1 } : { x: 0, y: index / 3, w: 1, h: 1 / 3 };
        const w = cols ? size : length;
        const h = cols ? length : size;
        const offset = spec.stagger ? (across - length) * [0, 0.5, 1][index] : 0;
        const next = piece(source, sliceCrop(from, w, h), w, h, textures);
        next.position.set(
          cols ? spec.margin + index * (size + gap) : spec.margin + offset,
          cols ? spec.margin + offset : spec.margin + index * (size + gap),
        );
        panels.addChildAt(next, panels.getChildIndex(old));
        panels.removeChild(old);
        old.destroy();
        sprites[index] = next;
      });
    };
    place(spec.gap);
    return {
      backdrop: spec.backdrop,
      tick: spec.breathe ? beat => {
        for (const texture of textures.splice(0)) texture.destroy(false);
        place(spec.gap * (0.5 + 1.6 * beat));
      } : undefined,
    };
  }

  function buildCollage(variant: string, source: RenderTexture, textures: Texture[]): Look {
    const spec = COLLAGE[variant] ?? COLLAGE.editorial;
    const holders = spec.pieces.map(card => {
      const w = card.at.w * WIDTH;
      const h = card.at.h * HEIGHT;
      const holder = new Container();
      const shadow = new Graphics();
      shadow.rect(-w / 2 - spec.border + 14, -h / 2 - spec.border + 22, w + 2 * spec.border, h + spec.border + spec.bottom);
      shadow.fill({ color: 0x000000, alpha: spec.shadow });
      holder.addChild(shadow);
      if (spec.border > 0) {
        const paper = new Graphics();
        paper.rect(-w / 2 - spec.border, -h / 2 - spec.border, w + 2 * spec.border, h + spec.border + spec.bottom);
        paper.fill({ color: 0xfbfaf6 });
        holder.addChild(paper);
      }
      const sprite = piece(source, coverCrop(w, h, card.cx, card.cy, card.zoom), w, h, textures);
      sprite.position.set(-w / 2, -h / 2);
      holder.addChild(sprite);
      holder.position.set(card.at.x * WIDTH, card.at.y * HEIGHT);
      holder.rotation = (card.tilt * Math.PI) / 180;
      panels.addChild(holder);
      return holder;
    });
    return {
      backdrop: spec.backdrop,
      tick: beat => holders.forEach((holder, index) => holder.scale.set(1 + 0.018 * beat * (index % 2 ? -1 : 1) + 0.009)),
    };
  }

  function buildBento(variant: string, source: RenderTexture, textures: Texture[]): Look {
    const tiles = BENTO[variant] ?? BENTO['hero-left'];
    const innerW = WIDTH - 2 * BENTO_MARGIN;
    const innerH = HEIGHT - 2 * BENTO_MARGIN;
    const half = BENTO_GAP / 2;
    const sprites = tiles.map(tile => {
      const left = tile.at.x > 0 ? half : 0;
      const right = tile.at.x + tile.at.w < 0.999 ? half : 0;
      const top = tile.at.y > 0 ? half : 0;
      const bottom = tile.at.y + tile.at.h < 0.999 ? half : 0;
      const x = BENTO_MARGIN + tile.at.x * innerW + left;
      const y = BENTO_MARGIN + tile.at.y * innerH + top;
      const w = tile.at.w * innerW - left - right;
      const h = tile.at.h * innerH - top - bottom;
      const sprite = piece(source, coverCrop(w, h, tile.cx, tile.cy, tile.zoom), w, h, textures);
      sprite.position.set(x, y);
      const mask = new Graphics();
      mask.roundRect(x, y, w, h, BENTO_RADIUS);
      mask.fill({ color: 0xffffff });
      sprite.mask = mask;
      panels.addChild(mask, sprite);
      return sprite;
    });
    return { backdrop: BLACK, tick: beat => { sprites[0].alpha = 0.92 + 0.08 * beat; } };
  }

  function buildFrame(variant: string, source: RenderTexture, textures: Texture[], palette: { ink: string; accent: string; scrim: { color: string } }): Look {
    const inset = FRAME_INSET[variant] ?? 0.09;
    const left = WIDTH * inset;
    const top = left;
    const w = WIDTH - 2 * left;
    const h = HEIGHT - 2 * top - (variant === 'bold' ? WIDTH * 0.12 : 0);
    const sprite = piece(source, coverCrop(w, h), w, h, textures);
    sprite.position.set(left, top);
    panels.addChild(sprite);
    const colour = variant === 'ink' ? palette.ink : variant === 'accent' ? palette.accent : variant === 'bold' ? PAPER : BLACK;
    return { backdrop: colour };
  }

  function build(kind: TreatmentId, variant: string, source: RenderTexture, palette: { ink: string; accent: string; scrim: { color: string } }) {
    const key = `${kind}:${variant}:${kind === 'frame' ? `${palette.ink}${palette.accent}` : ''}`;
    if (built?.key === key) return built.look;
    clearBuilt();
    const textures: Texture[] = [];
    const look = kind === 'triptych' ? buildTriptych(variant, source, textures)
      : kind === 'collage' ? buildCollage(variant, source, textures)
        : kind === 'bento' ? buildBento(variant, source, textures)
          : kind === 'frame' ? buildFrame(variant, source, textures, palette)
            : { backdrop: BLACK };
    built = { key, look, textures };
    return look;
  }

  function hideAll() {
    treated.visible = false;
    treated.filters = [];
    doubleLayer.visible = false;
    panels.visible = false;
    blurred.visible = false;
    backdrop.clear();
  }

  return {
    root,
    update(input, renderer) {
      const kind = input.treatment;
      const variant = input.treatmentVariant;
      const texture = input.background;
      hideAll();
      if (!kind || !variant || !texture) {
        clearBuilt();
        scrim.clear();
        type.paint('minimal', {
          ms: 0, words: [], beat: 0, beatIndex: 0, energy: 0, seed: 0,
          ink: '#fff', accent: '#fff', shadow: '#000', font: 'Anton', fontSecondary: 'Anton',
        });
        return;
      }

      const palette = analyzeTexture(texture);
      sourceRt = rt(sourceRt);
      paint(texture, renderer, sourceRt);
      const beat = input.beat;
      const energy = input.energy;
      const sliced = kind === 'triptych' || kind === 'collage' || kind === 'bento' || kind === 'frame';

      if (sliced) {
        const look = build(kind, variant, sourceRt, palette);
        look.tick?.(beat, input.ms);
        panels.visible = true;
        backdrop.rect(0, 0, WIDTH, HEIGHT);
        backdrop.fill({ color: look.backdrop === 'blur' ? BLACK : look.backdrop });
        if (look.backdrop === 'blur') {
          smallRt = rt(smallRt, Math.round(WIDTH / 6), Math.round(HEIGHT / 6));
          paint(sourceRt, renderer, smallRt, [softly]);
          blurred.texture = smallRt;
          blurred.width = WIDTH;
          blurred.height = HEIGHT;
          blurred.visible = true;
        }
      } else {
        clearBuilt();
        backdrop.rect(0, 0, WIDTH, HEIGHT);
        backdrop.fill({ color: BLACK });
      }

      if (kind === 'fisheye') {
        const lens = LENS[variant] ?? LENS.medium;
        treated.visible = true;
        treated.texture = sourceRt;
        treated.width = WIDTH;
        treated.height = HEIGHT;
        fisheye.set({ uBend: lens.bend * (1 + 0.03 * beat), uRadius: lens.radius, uReach: lens.reach });
        treated.filters = [fisheye.filter];
      } else if (kind === 'grain') {
        const look = GRAIN_LOOK[variant] ?? GRAIN_LOOK.classic;
        treated.visible = true;
        treated.texture = sourceRt;
        treated.width = WIDTH;
        treated.height = HEIGHT;
        grain.set({
          uTime: input.ms / 1000, uAmount: look.amount, uSize: look.size, uFlicker: look.flicker,
          uScratch: look.scratch, uHalation: look.halation, uEnergy: energy,
        });
        treated.filters = [grain.filter];
      } else if (kind === 'kaleidoscope') {
        treated.visible = true;
        treated.texture = sourceRt;
        treated.width = WIDTH;
        treated.height = HEIGHT;
        kaleido.set({ uSegments: KALEIDO_SEGMENTS[variant] ?? 6, uBeat: beat, uTime: input.ms / 1000 });
        treated.filters = [kaleido.filter];
      } else if (kind === 'double') {
        const look = DOUBLE_LOOK[variant] ?? DOUBLE_LOOK.blend;
        doubleLayer.visible = true;
        let over: Texture = sourceRt;
        if (input.treatmentSecond) {
          secondRt = rt(secondRt);
          paint(input.treatmentSecond, renderer, secondRt);
          over = secondRt;
        }
        doubleBase.texture = sourceRt;
        doubleBase.width = WIDTH;
        doubleBase.height = HEIGHT;
        doubleBase.tint = look.dim;
        doubleOver.texture = over;
        const zoom = look.zoom * (1 + 0.02 * beat);
        doubleOver.width = WIDTH * zoom;
        doubleOver.height = HEIGHT * zoom;
        if (look.flip) doubleOver.scale.x *= -1;
        doubleOver.position.set(WIDTH / 2, HEIGHT * 0.46);
        doubleOver.alpha = look.alpha;
        doubleOver.blendMode = look.screen ? 'screen' : 'normal';
      }

      scrim.clear();
      if (input.lyrics && palette.scrim.alpha > 0 && (kind === 'grain' || kind === 'double')) {
        scrim.rect(0, 0, WIDTH, HEIGHT);
        scrim.fill({ color: palette.scrim.color, alpha: palette.scrim.alpha * 0.6 });
      }

      const style = input.typeStyle ?? 'minimal';
      const words: TimedWord[] = !input.lyrics || !input.phrase ? [] : input.words.length
        ? [...input.words]
        : [{ text: input.phrase, startMs: 0, endMs: 600 }];
      type.paint(style, {
        ms: input.ms,
        words,
        beat: input.beat,
        beatIndex: input.beatIndex,
        energy: input.energy,
        seed: input.layout.seed,
        ink: palette.ink,
        accent: palette.accent,
        shadow: palette.ink.toLowerCase() === '#f7f4ee' ? '#000000' : '#ffffff',
        font: input.font,
        fontSecondary: input.fontSecondary,
      });
    },
    destroy() {
      clearBuilt();
      sourceRt?.destroy(true);
      secondRt?.destroy(true);
      smallRt?.destroy(true);
      softly.destroy();
      fisheye.filter.destroy();
      grain.filter.destroy();
      kaleido.filter.destroy();
      type.destroy();
      root.destroy({ children: true });
    },
  };
}
