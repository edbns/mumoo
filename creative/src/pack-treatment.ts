/**
 * Video treatments — one creative finish over the Director's finished reel.
 * The reel texture is already cut, pushed-in and levelled (pack-reel.ts). This world draws that picture into
 * an off-screen texture, applies the treatment as a pass (shader or cropped sprites), then draws the lyrics
 * on top so they stay readable. Preview and cloud render share this code.
 */
import {
  Container, Filter, GlProgram, Graphics, Rectangle, RenderTexture, Sprite, Texture, UniformGroup,
  type Renderer,
} from 'pixi.js';
import { HEIGHT, WIDTH } from './composition';
import { analyzeTexture } from './pack-palette';
import type { PackSceneInput } from './pack-copy';
import { createTypeLayer, type TimedWord } from './pack-type';
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

const f = (n: number) => n.toFixed(4);

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

const FISHEYE = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uStrength;
void main(void) {
  vec2 uv = vTextureCoord - 0.5;
  float r = length(uv);
  float k = uStrength;
  float warped = 1.0 + k * r * r;
  vec2 sampleUv = uv / warped + 0.5;
  if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) {
    finalColor = vec4(0.0);
    return;
  }
  finalColor = texture(uTexture, sampleUv);
}
`;

const GRAIN = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform float uTime;
uniform float uAmount;
uniform float uWeave;
uniform float uHalation;
uniform float uEnergy;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
void main(void) {
  vec2 weave = vec2(sin(uTime * 1.7) * uWeave, cos(uTime * 1.3) * uWeave) * uInputSize.zw;
  vec4 colour = texture(uTexture, vTextureCoord + weave);
  float g = hash(gl_FragCoord.xy + fract(uTime) * 97.0);
  float amount = uAmount * (0.85 + 0.3 * uEnergy);
  colour.rgb += (g - 0.5) * amount;
  float bright = max(colour.r, max(colour.g, colour.b));
  colour.rgb += colour.rgb * bright * bright * uHalation * 0.35;
  finalColor = colour;
}
`;

const KALEIDO = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uSegments;
uniform float uBeat;
void main(void) {
  vec2 uv = vTextureCoord - 0.5;
  float angle = atan(uv.y, uv.x);
  float radius = length(uv) * (1.0 - 0.04 * uBeat);
  float slice = 6.2831853 / max(uSegments, 2.0);
  float a = mod(angle, slice);
  a = abs(a - slice * 0.5);
  vec2 sampleUv = vec2(cos(a), sin(a)) * radius + 0.5;
  sampleUv = clamp(sampleUv, 0.0, 1.0);
  finalColor = texture(uTexture, sampleUv);
}
`;

type Crop = { x: number; y: number; w: number; h: number; dx: number; dy: number; dw: number; dh: number };

/** Three vertical panels with gaps that can breathe on the beat. */
function triptychCrops(gap: number, beat: number, breathing: boolean): Crop[] {
  const breathe = breathing ? gap * (0.35 + 0.65 * beat) : gap;
  const panel = (WIDTH - 2 * breathe) / 3;
  const srcGap = (WIDTH * breathe) / Math.max(1, WIDTH - 2 * breathe);
  const srcW = (WIDTH - 2 * srcGap) / 3;
  return [0, 1, 2].map(i => ({
    x: i * (srcW + srcGap),
    y: 0,
    w: srcW,
    h: HEIGHT,
    dx: i * (panel + breathe),
    dy: 0,
    dw: panel,
    dh: HEIGHT,
  }));
}

const COLLAGE_LAYOUTS: Record<string, Crop[]> = {
  editorial: [
    { x: 0.05, y: 0.08, w: 0.55, h: 0.55, dx: 0.04, dy: 0.06, dw: 0.58, dh: 0.52 },
    { x: 0.4, y: 0.35, w: 0.5, h: 0.45, dx: 0.48, dy: 0.42, dw: 0.46, dh: 0.4 },
    { x: 0.15, y: 0.55, w: 0.4, h: 0.35, dx: 0.08, dy: 0.62, dw: 0.42, dh: 0.3 },
  ],
  scatter: [
    { x: 0.1, y: 0.05, w: 0.45, h: 0.4, dx: 0.06, dy: 0.04, dw: 0.5, dh: 0.38 },
    { x: 0.35, y: 0.3, w: 0.55, h: 0.4, dx: 0.42, dy: 0.28, dw: 0.52, dh: 0.36 },
    { x: 0.05, y: 0.5, w: 0.5, h: 0.4, dx: 0.1, dy: 0.58, dw: 0.48, dh: 0.34 },
    { x: 0.45, y: 0.6, w: 0.45, h: 0.35, dx: 0.5, dy: 0.7, dw: 0.42, dh: 0.24 },
  ],
  stack: [
    { x: 0.08, y: 0.05, w: 0.84, h: 0.4, dx: 0.06, dy: 0.04, dw: 0.88, dh: 0.36 },
    { x: 0.12, y: 0.3, w: 0.76, h: 0.4, dx: 0.1, dy: 0.32, dw: 0.8, dh: 0.34 },
    { x: 0.16, y: 0.55, w: 0.68, h: 0.4, dx: 0.14, dy: 0.6, dw: 0.72, dh: 0.32 },
  ],
  offset: [
    { x: 0.0, y: 0.1, w: 0.7, h: 0.7, dx: 0.02, dy: 0.08, dw: 0.68, dh: 0.62 },
    { x: 0.3, y: 0.2, w: 0.65, h: 0.65, dx: 0.35, dy: 0.28, dw: 0.6, dh: 0.55 },
  ],
};

function scaleCrops(layout: Crop[]): Crop[] {
  return layout.map(crop => ({
    x: crop.x * WIDTH,
    y: crop.y * HEIGHT,
    w: crop.w * WIDTH,
    h: crop.h * HEIGHT,
    dx: crop.dx * WIDTH,
    dy: crop.dy * HEIGHT,
    dw: crop.dw * WIDTH,
    dh: crop.dh * HEIGHT,
  }));
}

const BENTO_LAYOUTS: Record<string, Crop[]> = {
  'hero-left': [
    { x: 0.0, y: 0.0, w: 0.62, h: 1.0, dx: 0.0, dy: 0.0, dw: 0.6, dh: 1.0 },
    { x: 0.4, y: 0.0, w: 0.6, h: 0.48, dx: 0.62, dy: 0.0, dw: 0.38, dh: 0.48 },
    { x: 0.35, y: 0.5, w: 0.65, h: 0.5, dx: 0.62, dy: 0.5, dw: 0.38, dh: 0.5 },
  ],
  'hero-top': [
    { x: 0.0, y: 0.0, w: 1.0, h: 0.55, dx: 0.0, dy: 0.0, dw: 1.0, dh: 0.52 },
    { x: 0.0, y: 0.4, w: 0.5, h: 0.6, dx: 0.0, dy: 0.54, dw: 0.48, dh: 0.46 },
    { x: 0.5, y: 0.4, w: 0.5, h: 0.6, dx: 0.52, dy: 0.54, dw: 0.48, dh: 0.46 },
  ],
  mosaic: [
    { x: 0.0, y: 0.0, w: 0.5, h: 0.5, dx: 0.0, dy: 0.0, dw: 0.48, dh: 0.48 },
    { x: 0.5, y: 0.0, w: 0.5, h: 0.5, dx: 0.52, dy: 0.0, dw: 0.48, dh: 0.48 },
    { x: 0.0, y: 0.5, w: 0.5, h: 0.5, dx: 0.0, dy: 0.52, dw: 0.48, dh: 0.48 },
    { x: 0.5, y: 0.5, w: 0.5, h: 0.5, dx: 0.52, dy: 0.52, dw: 0.48, dh: 0.48 },
  ],
  strip: [
    { x: 0.0, y: 0.05, w: 1.0, h: 0.3, dx: 0.0, dy: 0.02, dw: 1.0, dh: 0.3 },
    { x: 0.0, y: 0.35, w: 1.0, h: 0.3, dx: 0.0, dy: 0.35, dw: 1.0, dh: 0.3 },
    { x: 0.0, y: 0.65, w: 1.0, h: 0.3, dx: 0.0, dy: 0.68, dw: 1.0, dh: 0.3 },
  ],
};

const FISHEYE_STRENGTH: Record<string, number> = { subtle: 0.35, medium: 0.7, strong: 1.15, extreme: 1.7 };
const TRIPTYCH_GAP: Record<string, number> = { narrow: 12, medium: 28, wide: 48, breathing: 28 };
const FRAME_INSET: Record<string, number> = { slim: 0.08, bold: 0.16, accent: 0.12, ink: 0.12 };
const KALEIDO_SEGMENTS: Record<string, number> = { four: 4, six: 6, eight: 8, twelve: 12 };
const GRAIN_LOOK: Record<string, { amount: number; weave: number; halation: number }> = {
  fine: { amount: 0.06, weave: 0.4, halation: 0.05 },
  classic: { amount: 0.1, weave: 0.8, halation: 0.12 },
  heavy: { amount: 0.16, weave: 1.2, halation: 0.08 },
  halation: { amount: 0.08, weave: 0.6, halation: 0.35 },
};

/** How many Director cuts ahead the second exposure looks (0 = same frame). */
export const DOUBLE_CUT_AHEAD: Record<string, number> = {
  blend: 0,
  screen: 0,
  'offset-cut': 1,
  'offset-far': 2,
};

export function createTreatmentWorld(): TreatmentWorld {
  const root = new Container();
  const stage = new Container();
  const backdrop = new Graphics();
  const panelLayer = new Container();
  const treated = new Sprite();
  treated.anchor.set(0.5);
  treated.position.set(WIDTH / 2, HEIGHT / 2);
  const scrim = new Graphics();
  const type = createTypeLayer();
  root.addChild(backdrop, panelLayer, treated, scrim, type.root);

  let sourceRt: RenderTexture | null = null;
  let secondRt: RenderTexture | null = null;
  const panelSprites: Sprite[] = [];
  const cropTextures: Texture[] = [];

  const fisheye = makeFilter(FISHEYE, 'treatment-fisheye', { uStrength: 0.7 });
  const grain = makeFilter(GRAIN, 'treatment-grain', { uTime: 0, uAmount: 0.1, uWeave: 0.8, uHalation: 0.1, uEnergy: 0 });
  const kaleido = makeFilter(KALEIDO, 'treatment-kaleido', { uSegments: 6, uBeat: 0 });
  // Double exposure: two full-frame sprites over each other (blend modes stay reliable under software GL).
  const doubleBase = new Sprite();
  doubleBase.anchor.set(0.5);
  doubleBase.position.set(WIDTH / 2, HEIGHT / 2);
  const doubleOver = new Sprite();
  doubleOver.anchor.set(0.5);
  doubleOver.position.set(WIDTH / 2, HEIGHT / 2);
  const doubleLayer = new Container();
  doubleLayer.addChild(doubleBase, doubleOver);
  doubleLayer.visible = false;
  root.addChildAt(doubleLayer, 2);

  function ensureRt(which: 'source' | 'second') {
    const current = which === 'source' ? sourceRt : secondRt;
    if (current) return current;
    const next = RenderTexture.create({ width: WIDTH, height: HEIGHT, resolution: 1 });
    if (which === 'source') sourceRt = next;
    else secondRt = next;
    return next;
  }

  function clearPanels() {
    while (panelSprites.length) {
      const sprite = panelSprites.pop()!;
      panelLayer.removeChild(sprite);
      sprite.destroy();
    }
    while (cropTextures.length) cropTextures.pop()!.destroy(false);
  }

  function drawPanels(source: Texture, crops: Crop[], gapColor?: string) {
    clearPanels();
    if (gapColor) {
      backdrop.clear();
      backdrop.rect(0, 0, WIDTH, HEIGHT);
      backdrop.fill({ color: gapColor });
    }
    for (const crop of crops) {
      const frame = new Rectangle(
        Math.max(0, Math.round(crop.x)),
        Math.max(0, Math.round(crop.y)),
        Math.max(1, Math.round(crop.w)),
        Math.max(1, Math.round(crop.h)),
      );
      const piece = new Texture({ source: source.source, frame });
      cropTextures.push(piece);
      const sprite = new Sprite(piece);
      sprite.position.set(crop.dx, crop.dy);
      sprite.width = crop.dw;
      sprite.height = crop.dh;
      panelLayer.addChild(sprite);
      panelSprites.push(sprite);
    }
  }

  function paintDirected(texture: Texture, renderer: Renderer, into: RenderTexture) {
    const sprite = new Sprite(texture);
    sprite.width = WIDTH;
    sprite.height = HEIGHT;
    renderer.render({ container: sprite, target: into, clear: true });
    sprite.destroy();
  }

  return {
    root,
    update(input, renderer) {
      const kind = input.treatment;
      const variant = input.treatmentVariant;
      const texture = input.background;
      if (!kind || !variant || !texture) {
        treated.visible = false;
        panelLayer.visible = false;
        backdrop.clear();
        type.paint('minimal', {
          ms: 0, words: [], beat: 0, beatIndex: 0, energy: 0, seed: 0,
          ink: '#fff', accent: '#fff', shadow: '#000', font: 'Anton', fontSecondary: 'Anton',
        });
        return;
      }

      const palette = analyzeTexture(texture);
      const source = ensureRt('source');
      paintDirected(texture, renderer, source);

      treated.visible = false;
      treated.filters = [];
      doubleLayer.visible = false;
      panelLayer.visible = false;
      backdrop.clear();
      clearPanels();

      const beat = input.beat;
      const energy = input.energy;

      if (kind === 'triptych') {
        panelLayer.visible = true;
        const gap = TRIPTYCH_GAP[variant] ?? 28;
        drawPanels(source, triptychCrops(gap, beat, variant === 'breathing'), palette.accent);
      } else if (kind === 'collage') {
        panelLayer.visible = true;
        backdrop.rect(0, 0, WIDTH, HEIGHT);
        backdrop.fill({ color: palette.scrim.color });
        drawPanels(source, scaleCrops(COLLAGE_LAYOUTS[variant] ?? COLLAGE_LAYOUTS.editorial));
      } else if (kind === 'bento') {
        panelLayer.visible = true;
        backdrop.rect(0, 0, WIDTH, HEIGHT);
        backdrop.fill({ color: palette.accent });
        const gap = 8 * (1 + 0.25 * beat);
        const layout = scaleCrops(BENTO_LAYOUTS[variant] ?? BENTO_LAYOUTS['hero-left']).map(crop => ({
          ...crop,
          dx: crop.dx + (crop.dx > 0 ? gap * 0.5 : 0),
          dy: crop.dy + (crop.dy > 0 ? gap * 0.5 : 0),
          dw: crop.dw - gap * 0.5,
          dh: crop.dh - gap * 0.5,
        }));
        drawPanels(source, layout);
      } else if (kind === 'frame') {
        panelLayer.visible = true;
        const inset = FRAME_INSET[variant] ?? 0.12;
        const colour = variant === 'ink' ? palette.ink : variant === 'accent' ? palette.accent : palette.scrim.color;
        backdrop.rect(0, 0, WIDTH, HEIGHT);
        backdrop.fill({ color: colour });
        const left = WIDTH * inset;
        const top = HEIGHT * inset;
        const dw = WIDTH * (1 - 2 * inset);
        const dh = HEIGHT * (1 - 2 * inset);
        drawPanels(source, [{ x: 0, y: 0, w: WIDTH, h: HEIGHT, dx: left, dy: top, dw, dh }]);
      } else if (kind === 'fisheye') {
        treated.visible = true;
        treated.texture = source;
        treated.width = WIDTH;
        treated.height = HEIGHT;
        fisheye.set({ uStrength: (FISHEYE_STRENGTH[variant] ?? 0.7) * (1 + 0.08 * beat) });
        treated.filters = [fisheye.filter];
      } else if (kind === 'grain') {
        treated.visible = true;
        treated.texture = source;
        treated.width = WIDTH;
        treated.height = HEIGHT;
        const look = GRAIN_LOOK[variant] ?? GRAIN_LOOK.classic;
        grain.set({
          uTime: input.ms / 1000,
          uAmount: look.amount,
          uWeave: look.weave,
          uHalation: look.halation,
          uEnergy: energy,
        });
        treated.filters = [grain.filter];
      } else if (kind === 'kaleidoscope') {
        treated.visible = true;
        treated.texture = source;
        treated.width = WIDTH;
        treated.height = HEIGHT;
        kaleido.set({ uSegments: KALEIDO_SEGMENTS[variant] ?? 6, uBeat: beat });
        treated.filters = [kaleido.filter];
      } else if (kind === 'double') {
        doubleLayer.visible = true;
        const secondSource = input.treatmentSecond ?? texture;
        const second = ensureRt('second');
        paintDirected(secondSource, renderer, second);
        doubleBase.texture = source;
        doubleBase.width = WIDTH;
        doubleBase.height = HEIGHT;
        doubleOver.texture = second;
        doubleOver.width = WIDTH;
        doubleOver.height = HEIGHT;
        doubleOver.alpha = 0.4 + 0.15 * energy;
        doubleOver.blendMode = variant === 'screen' ? 'screen' : 'normal';
      }

      scrim.clear();
      if (input.lyrics && palette.scrim.alpha > 0 && (kind === 'fisheye' || kind === 'grain' || kind === 'kaleidoscope' || kind === 'double')) {
        scrim.rect(0, 0, WIDTH, HEIGHT);
        scrim.fill({ color: palette.scrim.color, alpha: palette.scrim.alpha * 0.7 });
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
      clearPanels();
      sourceRt?.destroy(true);
      secondRt?.destroy(true);
      fisheye.filter.destroy();
      grain.filter.destroy();
      kaleido.filter.destroy();
      type.destroy();
      root.destroy({ children: true });
    },
  };
}

/** Quiet unused helper for tests that assert the shader constants stay in range. */
export const treatmentShaderNotes = { fisheye: FISHEYE_STRENGTH, gap: TRIPTYCH_GAP, frame: FRAME_INSET, kaleido: KALEIDO_SEGMENTS, grain: GRAIN_LOOK, f };
