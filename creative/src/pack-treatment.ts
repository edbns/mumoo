/**
 * Video treatments — one creative finish over the Director's finished reel.
 * The reel texture is already cut, pushed-in and levelled (pack-reel.ts). This world draws that picture into
 * an off-screen texture, then finishes it: sliced into panels (Triptych, Bento, Collage, Colored Frame) or passed
 * through a shader (Fisheye, Film Grain), or exposed twice (Double Exposure). The lyrics are drawn on top so they
 * stay readable, except under Fisheye, where they sit in the black below the lens and pass behind it, and Colored
 * Frame, where they sit on the solid colour above and below the video. Preview and cloud render share this code.
 */
import {
  BlurFilter, Container, Filter, GlProgram, Graphics, Rectangle, RenderTexture, Sprite, Texture, UniformGroup,
  type Renderer,
} from 'pixi.js';
import { HEIGHT, WIDTH } from './composition';
import { analyzeTexture } from './pack-palette';
import type { PackSceneInput } from './pack-copy';
import { createTypeLayer, type TimedWord, type TypeFrame } from './pack-type';
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
 * black shows.
 */
const FISHEYE = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uBend;
uniform float uRadius;
uniform float uReach;
uniform float uAspect;
uniform float uCentreY;
${FRAME_UV}
void main(void) {
  vec2 m = frameMax();
  vec2 n = vTextureCoord / m;
  vec2 p = (n - vec2(0.5, uCentreY)) * vec2(1.0, uAspect);
  float radius = 0.5 * uRadius;
  float rn = length(p) / radius;
  if (rn > 1.0) { finalColor = vec4(0.0); return; }
  float rs = tan(rn * uBend) / tan(uBend) * uReach;
  vec2 dir = rn > 0.0 ? p / length(p) : vec2(0.0);
  vec2 s = dir * rs / vec2(1.0, uAspect) + vec2(0.5, 0.45);
  vec4 colour = texture(uTexture, mirrored(s) * m);
  float rim = smoothstep(0.72, 1.0, rn);
  colour.rgb *= 1.0 - 0.75 * rim;
  float edge = 1.0 - smoothstep(0.985, 1.0, rn);
  finalColor = vec4(colour.rgb, 1.0) * edge;
}
`;

/** Old film: a little grain the size of `uSize` pixels, faded warm colour (`uSepia`), lifted blacks (`uFade`), vignette, flicker, scratches and halation. */
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
uniform float uSepia;
uniform float uFade;
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
  vec3 sepia = vec3(luma) * vec3(1.07, 0.95, 0.78);
  colour.rgb = mix(colour.rgb, sepia, uSepia);
  colour.rgb = uFade + colour.rgb * (1.0 - uFade * 1.4);
  colour.rgb *= vec3(1.05, 1.0, 0.9);
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
};

const BLACK = '#0b0b0c';
const LIGHT = '#f7f4ee';
/** Whether a colour reads on black. */
const light = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.5;
};
const PAPER = '#efe9de';

/** Triptych: the frame split into three upright panels, pulled apart with a clear black gap and the same margin around them. */
const TRIPTYCH_GAP: Record<string, number> = { narrow: 32, medium: 48, wide: 72, breathing: 60 };

/** Collage: three parts of the frame (`cx`, `cy`, `zoom`) cut out, with no border, and laid out (`at`, centre and size in shares of the frame, `tilt` in degrees). */
type CollagePiece = { cx: number; cy: number; zoom: number; at: Box; tilt: number };
const COLLAGE: Record<string, { backdrop: string | 'blur'; shadow: number; pieces: CollagePiece[] }> = {
  editorial: {
    backdrop: PAPER, shadow: 0.25,
    pieces: [
      { cx: 0.5, cy: 0.35, zoom: 1.1, at: { x: 0.42, y: 0.27, w: 0.72, h: 0.4 }, tilt: -3 },
      { cx: 0.62, cy: 0.62, zoom: 1.8, at: { x: 0.66, y: 0.6, w: 0.5, h: 0.3 }, tilt: 4 },
      { cx: 0.4, cy: 0.45, zoom: 2.6, at: { x: 0.32, y: 0.8, w: 0.44, h: 0.22 }, tilt: -6 },
    ],
  },
  scatter: {
    backdrop: 'blur', shadow: 0.45,
    pieces: [
      { cx: 0.5, cy: 0.3, zoom: 1.4, at: { x: 0.34, y: 0.2, w: 0.56, h: 0.3 }, tilt: -7 },
      { cx: 0.5, cy: 0.5, zoom: 1.0, at: { x: 0.64, y: 0.5, w: 0.58, h: 0.32 }, tilt: 5 },
      { cx: 0.4, cy: 0.75, zoom: 2.2, at: { x: 0.36, y: 0.8, w: 0.54, h: 0.28 }, tilt: -4 },
    ],
  },
  stack: {
    backdrop: BLACK, shadow: 0.5,
    pieces: [
      { cx: 0.5, cy: 0.25, zoom: 1.2, at: { x: 0.5, y: 0.22, w: 0.86, h: 0.3 }, tilt: -2.5 },
      { cx: 0.5, cy: 0.5, zoom: 1.0, at: { x: 0.5, y: 0.5, w: 0.9, h: 0.32 }, tilt: 2 },
      { cx: 0.5, cy: 0.75, zoom: 1.6, at: { x: 0.5, y: 0.78, w: 0.84, h: 0.3 }, tilt: -1.5 },
    ],
  },
  offset: {
    backdrop: 'blur', shadow: 0.55,
    pieces: [
      { cx: 0.45, cy: 0.4, zoom: 1.0, at: { x: 0.4, y: 0.33, w: 0.7, h: 0.5 }, tilt: 0 },
      { cx: 0.6, cy: 0.6, zoom: 1.7, at: { x: 0.64, y: 0.66, w: 0.6, h: 0.4 }, tilt: 0 },
      { cx: 0.5, cy: 0.3, zoom: 3.0, at: { x: 0.24, y: 0.84, w: 0.32, h: 0.2 }, tilt: 0 },
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

/**
 * Colored Frame: the whole picture, smaller and the same shape as the card, centred on black or white, its corners rounded and edged
 * in a thin line of the other colour. `scale` is its size against the card.
 */
const FRAME_LOOK: Record<string, { matte: string; edge: string; scale: number }> = {
  slim: { matte: '#000000', edge: '#ffffff', scale: 0.55 },
  bold: { matte: '#ffffff', edge: '#000000', scale: 0.55 },
  accent: { matte: '#000000', edge: '#ffffff', scale: 0.62 },
  ink: { matte: '#ffffff', edge: '#000000', scale: 0.62 },
};
/** Colored Frame's lyrics stay on the solid colour, in the bands above and below the video: this far from the frame's sides and from the band's edges. */
const BAND_SIDE = 60;
const BAND_PAD = 40;
const FRAME_RADIUS = 36;
const FRAME_EDGE = 4;

/** Fisheye: one round lens in the black, centred across and a little above the middle; the variants bulge more. */
const LENS_RADIUS = 0.86;
const LENS_CY = 0.42;
const LENS: Record<string, { bend: number; reach: number }> = {
  subtle: { bend: 0.85, reach: 0.6 },
  medium: { bend: 1.05, reach: 0.64 },
  strong: { bend: 1.22, reach: 0.72 },
  extreme: { bend: 1.38, reach: 0.8 },
};
/** Under Fisheye the lyrics are made smaller and moved into the black below the lens (`LYRICS_AT`, a share of the height). */
const LYRICS_SCALE = 0.7;
const LYRICS_AT = 0.82;
const GRAIN_LOOK: Record<string, { amount: number; size: number; flicker: number; scratch: number; halation: number; sepia: number; fade: number }> = {
  fine: { amount: 0.05, size: 1.5, flicker: 0.02, scratch: 0, halation: 0, sepia: 0.25, fade: 0.1 },
  classic: { amount: 0.07, size: 2, flicker: 0.04, scratch: 0, halation: 0.2, sepia: 0.35, fade: 0.08 },
  heavy: { amount: 0.09, size: 2, flicker: 0.06, scratch: 0.4, halation: 0, sepia: 0.5, fade: 0.1 },
  halation: { amount: 0.06, size: 2, flicker: 0.03, scratch: 0, halation: 0.6, sepia: 0.3, fade: 0.08 },
};

/** Double Exposure: the same moment exposed twice, the second turned, moved or brought closer; still, so nothing flickers. */
const DOUBLE_LOOK: Record<string, { zoom: number; flip: boolean; shift: number; y: number; alpha: number; screen: boolean; dim: number }> = {
  blend: { zoom: 1.35, flip: true, shift: 0, y: 0.46, alpha: 0.45, screen: false, dim: 0xffffff },
  screen: { zoom: 1.6, flip: true, shift: 0, y: 0.44, alpha: 0.75, screen: true, dim: 0x808080 },
  'offset-cut': { zoom: 1.3, flip: false, shift: 0.1, y: 0.5, alpha: 0.8, screen: true, dim: 0x9a9a9a },
  'offset-far': { zoom: 2.1, flip: false, shift: 0, y: 0.62, alpha: 0.75, screen: true, dim: 0x8c8c8c },
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
  /** Colored Frame's second line of lyrics, in the band below the video (`type` takes the band above). */
  const below = createTypeLayer();
  root.addChild(backdrop, blurred, panels, treated, scrim, type.root, below.root);

  let sourceRt: RenderTexture | null = null;
  let smallRt: RenderTexture | null = null;
  const softly = new BlurFilter({ strength: 4, quality: 2 });
  let built: { key: string; look: Look; textures: Texture[] } | null = null;

  const fisheye = makeFilter(FISHEYE, 'treatment-fisheye', { uBend: 1, uRadius: LENS_RADIUS, uReach: 0.7, uAspect: HEIGHT / WIDTH, uCentreY: LENS_CY });
  const grain = makeFilter(GRAIN, 'treatment-grain', { uTime: 0, uAmount: 0.2, uSize: 2, uFlicker: 0, uScratch: 0, uHalation: 0, uSepia: 0, uFade: 0, uEnergy: 0, uAspect: HEIGHT / WIDTH });
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
    const gap = TRIPTYCH_GAP[variant] ?? 48;
    const w = (WIDTH - 4 * gap) / 3;
    const h = HEIGHT - 2 * gap;
    for (const index of [0, 1, 2]) {
      const sprite = piece(source, sliceCrop({ x: index / 3, y: 0, w: 1 / 3, h: 1 }, w, h), w, h, textures);
      sprite.position.set(gap + index * (w + gap), gap);
      panels.addChild(sprite);
    }
    return { backdrop: BLACK };
  }

  function buildCollage(variant: string, source: RenderTexture, textures: Texture[]): Look {
    const spec = COLLAGE[variant] ?? COLLAGE.editorial;
    for (const card of spec.pieces) {
      const w = card.at.w * WIDTH;
      const h = card.at.h * HEIGHT;
      const holder = new Container();
      const shadow = new Graphics();
      shadow.rect(-w / 2 + 14, -h / 2 + 22, w, h);
      shadow.fill({ color: 0x000000, alpha: spec.shadow });
      const sprite = piece(source, coverCrop(w, h, card.cx, card.cy, card.zoom), w, h, textures);
      sprite.position.set(-w / 2, -h / 2);
      holder.addChild(shadow, sprite);
      holder.position.set(card.at.x * WIDTH, card.at.y * HEIGHT);
      holder.rotation = (card.tilt * Math.PI) / 180;
      panels.addChild(holder);
    }
    return { backdrop: spec.backdrop };
  }

  function buildBento(variant: string, source: RenderTexture, textures: Texture[]): Look {
    const tiles = BENTO[variant] ?? BENTO['hero-left'];
    const innerW = WIDTH - 2 * BENTO_MARGIN;
    const innerH = HEIGHT - 2 * BENTO_MARGIN;
    const half = BENTO_GAP / 2;
    for (const tile of tiles) {
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
    }
    return { backdrop: BLACK };
  }

  function buildFrame(variant: string, source: RenderTexture, textures: Texture[]): Look {
    const look = FRAME_LOOK[variant] ?? FRAME_LOOK.slim;
    const w = Math.round(WIDTH * look.scale);
    const h = Math.round(HEIGHT * look.scale);
    const x = Math.round((WIDTH - w) / 2);
    const y = Math.round((HEIGHT - h) / 2);
    const edge = new Graphics();
    edge.roundRect(x - FRAME_EDGE, y - FRAME_EDGE, w + 2 * FRAME_EDGE, h + 2 * FRAME_EDGE, FRAME_RADIUS + FRAME_EDGE);
    edge.fill({ color: look.edge });
    const sprite = piece(source, coverCrop(w, h), w, h, textures);
    sprite.position.set(x, y);
    const mask = new Graphics();
    mask.roundRect(x, y, w, h, FRAME_RADIUS);
    mask.fill({ color: 0xffffff });
    sprite.mask = mask;
    panels.addChild(edge, mask, sprite);
    return { backdrop: look.matte };
  }

  function build(kind: TreatmentId, variant: string, source: RenderTexture) {
    const key = `${kind}:${variant}`;
    if (built?.key === key) return built.look;
    clearBuilt();
    const textures: Texture[] = [];
    const look = kind === 'triptych' ? buildTriptych(variant, source, textures)
      : kind === 'collage' ? buildCollage(variant, source, textures)
        : kind === 'bento' ? buildBento(variant, source, textures)
          : kind === 'frame' ? buildFrame(variant, source, textures)
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
        const none: TypeFrame = {
          ms: 0, words: [], beat: 0, beatIndex: 0, energy: 0, seed: 0,
          ink: '#fff', accent: '#fff', shadow: '#000', font: 'Anton', fontSecondary: 'Anton',
        };
        type.paint('minimal', none);
        below.paint('minimal', none);
        return;
      }

      const palette = analyzeTexture(texture);
      sourceRt = rt(sourceRt);
      paint(texture, renderer, sourceRt);
      const energy = input.energy;
      const sliced = kind === 'triptych' || kind === 'collage' || kind === 'bento' || kind === 'frame';

      if (sliced) {
        const look = build(kind, variant, sourceRt);
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

      // The lens covers the lyrics; everywhere else they are over the picture.
      root.setChildIndex(treated, kind === 'fisheye' ? root.children.length - 1 : root.getChildIndex(panels) + 1);
      type.root.pivot.set(kind === 'fisheye' ? WIDTH / 2 : 0, kind === 'fisheye' ? HEIGHT * 0.58 : 0);
      type.root.position.set(kind === 'fisheye' ? WIDTH / 2 : 0, kind === 'fisheye' ? HEIGHT * LYRICS_AT : 0);
      type.root.scale.set(kind === 'fisheye' ? LYRICS_SCALE : 1);

      if (kind === 'fisheye') {
        const lens = LENS[variant] ?? LENS.medium;
        treated.visible = true;
        treated.texture = sourceRt;
        treated.width = WIDTH;
        treated.height = HEIGHT;
        fisheye.set({ uBend: lens.bend, uReach: lens.reach });
        treated.filters = [fisheye.filter];
      } else if (kind === 'grain') {
        const look = GRAIN_LOOK[variant] ?? GRAIN_LOOK.classic;
        treated.visible = true;
        treated.texture = sourceRt;
        treated.width = WIDTH;
        treated.height = HEIGHT;
        grain.set({
          uTime: input.ms / 1000, uAmount: look.amount, uSize: look.size, uFlicker: look.flicker,
          uScratch: look.scratch, uHalation: look.halation, uSepia: look.sepia, uFade: look.fade, uEnergy: energy,
        });
        treated.filters = [grain.filter];
      } else if (kind === 'double') {
        const look = DOUBLE_LOOK[variant] ?? DOUBLE_LOOK.blend;
        doubleLayer.visible = true;
        doubleBase.texture = sourceRt;
        doubleBase.width = WIDTH;
        doubleBase.height = HEIGHT;
        doubleBase.tint = look.dim;
        doubleOver.texture = sourceRt;
        doubleOver.width = WIDTH * look.zoom;
        doubleOver.height = HEIGHT * look.zoom;
        if (look.flip) doubleOver.scale.x *= -1;
        doubleOver.position.set(WIDTH * (0.5 + look.shift), HEIGHT * look.y);
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
      const frame = { ms: input.ms, beat: input.beat, beatIndex: input.beatIndex, energy: input.energy, seed: input.layout.seed, font: input.font, fontSecondary: input.fontSecondary };

      if (kind === 'frame') {
        // The phrase is shared out over the two bands of solid colour: its first half above the video, the rest below; never over the video.
        const look = FRAME_LOOK[variant] ?? FRAME_LOOK.slim;
        const dark = look.matte === '#000000';
        const colours = { ink: dark ? LIGHT : BLACK, accent: dark ? LIGHT : BLACK, shadow: dark ? '#000000' : '#ffffff' };
        const half = Math.ceil(words.length / 2);
        const band = (HEIGHT * (1 - look.scale)) / 2 - FRAME_EDGE;
        for (const [layer, part, middle] of [[type, words.slice(0, half), band / 2], [below, words.slice(half), HEIGHT - band / 2]] as const) {
          layer.root.pivot.set(0, 0);
          layer.root.position.set(0, 0);
          layer.root.scale.set(1);
          layer.paint(style, { ...frame, ...colours, words: part });
          const bounds = layer.root.getLocalBounds();
          if (!part.length || bounds.width <= 0 || bounds.height <= 0) continue;
          const fit = Math.min(1, (WIDTH - BAND_SIDE * 2) / bounds.width, (band - BAND_PAD * 2) / bounds.height);
          layer.root.pivot.set(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
          layer.root.position.set(WIDTH / 2, middle);
          layer.root.scale.set(fit);
        }
        return;
      }

      below.root.pivot.set(0, 0);
      below.root.position.set(0, 0);
      below.root.scale.set(1);
      below.paint(style, { ...frame, words: [], ink: LIGHT, accent: LIGHT, shadow: '#000000' });
      const onBlack = kind === 'fisheye';
      type.paint(style, {
        ...frame,
        words,
        ink: onBlack ? LIGHT : palette.ink,
        accent: onBlack ? (light(palette.accent) ? palette.accent : LIGHT) : palette.accent,
        shadow: onBlack || palette.ink.toLowerCase() === LIGHT ? '#000000' : '#ffffff',
      });
    },
    destroy() {
      clearBuilt();
      sourceRt?.destroy(true);
      smallRt?.destroy(true);
      softly.destroy();
      fisheye.filter.destroy();
      grain.filter.destroy();
      type.destroy();
      below.destroy();
      root.destroy({ children: true });
    },
  };
}
