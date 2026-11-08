/**
 * Creatives Pack renderer — Pixi WebGL designs into an offscreen canvas,
 * then blits into card/export canvases (2D). Never attaches WebGL to every card
 * (that froze the page with multiple contexts).
 *
 * Looks (Shaders.com recipes) are baked OFFLINE by the Look Lab into static JPEGs;
 * this file only loads them as textures. No WebGPU / Shaders in the browser.
 */
import { Application, Assets, Rectangle, Texture } from 'pixi.js';
import { HEIGHT, WIDTH, type ImpactMusic, type LyricCue } from './composition';
import type { AdFont, AdLayout, AdPalette, PackMotion } from './ad-fonts';
import type { AdPunchStyle } from './ad-punch';
import { activePackCopy, packMeta, packReaction, packWordEnter } from './pack-copy';
import { createPackScene } from './pack-scenes';
import { bankBackgroundUrl, lookPlateUrl } from './pack-looks';
import type { TypeStyleId } from './pack-type';

/** Shelf card / live preview size (9× fewer pixels than the 1080×1920 export frame). */
export const PREVIEW_WIDTH = 360;
export const PREVIEW_HEIGHT = 640;

/** Bases that composite the cleared still under their graphic world. */
const PHOTO_BASES = new Set(['pulse', 'paper-cutout', 'riso', 'noir', 'oil', 'hold']);

export type PackRendererOpts = {
  style: AdPunchStyle;
  font: AdFont;
  fontSecondary: AdFont;
  palette: AdPalette;
  layout: AdLayout;
  motion?: PackMotion;
  cues: readonly LyricCue[];
  music: ImpactMusic | null;
  fallbackText: string;
  /** Cleared still URL (`/punch-plates/…`) — shared across photo treatments. */
  plateUrl?: string;
  /** Look Bank card: baked Shaders Pro background id + lyric type style. */
  bankId?: string;
  typeStyle?: TypeStyleId;
};

export type PackRenderer = {
  canvas: HTMLCanvasElement;
  setOpts(opts: PackRendererOpts): void;
  render(frame: number): Promise<void>;
  /** Snapshot current frame to a 2D-friendly canvas (safe blit source). `resolution` < 1 reads back fewer pixels. */
  extractCanvas(resolution?: number): CanvasImageSource;
  destroy(): void;
};

let shared: PackRenderer | null = null;

export async function createPackRenderer(
  canvas: HTMLCanvasElement,
  opts: PackRendererOpts,
): Promise<PackRenderer> {
  const app = new Application();
  let initialized = false;
  let scene: ReturnType<typeof createPackScene> | null = null;
  let current = opts;
  let plateTexture: Texture | null = null;
  let plateUrlLoaded = '';
  let lookTexture: Texture | null = null;
  let lookUrlLoaded = '';
  let bankTexture: Texture | null = null;
  let bankUrlLoaded = '';

  const dispose = () => {
    scene?.destroy();
    scene = null;
    plateTexture = null;
    plateUrlLoaded = '';
    lookTexture = null;
    lookUrlLoaded = '';
    bankTexture = null;
    bankUrlLoaded = '';
    if (initialized) app.destroy(false, { children: true });
    initialized = false;
  };

  async function ensurePlateTexture(url: string | undefined) {
    if (!url) {
      plateTexture = null;
      plateUrlLoaded = '';
      return;
    }
    if (url === plateUrlLoaded && plateTexture) return;
    plateUrlLoaded = url;
    try {
      plateTexture = await Assets.load(url) as Texture;
    } catch {
      plateTexture = null;
    }
  }

  try {
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    await app.init({
      canvas,
      width: WIDTH,
      height: HEIGHT,
      preference: 'webgl',
      autoStart: false,
      sharedTicker: false,
      antialias: true,
      background: '#000000',
      resolution: 1,
    });
    initialized = true;
    app.ticker.stop();

    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) throw new Error('WebGL is unavailable for creatives.');

    scene = createPackScene();
    app.stage.addChild(scene.root);

    return {
      canvas,
      setOpts(next: PackRendererOpts) {
        current = next;
      },
      async render(frame: number) {
        if (!scene) throw new Error('Pack renderer was destroyed.');
        if (gl.isContextLost()) throw new Error('The WebGL context was lost. Reload and try again.');
        const meta = packMeta(current.style);
        if (PHOTO_BASES.has(meta.base)) await ensurePlateTexture(current.plateUrl);
        else await ensurePlateTexture(undefined);

        let lookTex: Texture | null = null;
        if (meta.base === 'noir' && current.plateUrl) {
          // Static JPEG baked by the Look Lab. Missing → Noir shows its "temporarily unavailable" card.
          const url = lookPlateUrl('noir-mono', current.plateUrl);
          if (url !== lookUrlLoaded || !lookTexture) {
            lookUrlLoaded = url;
            try {
              lookTexture = await Assets.load(url) as Texture;
            } catch {
              lookTexture = null;
            }
          }
          lookTex = lookTexture;
        }

        let bankTex: Texture | null = null;
        if (meta.base === 'bank' && current.bankId) {
          const url = bankBackgroundUrl(current.bankId);
          if (url !== bankUrlLoaded || !bankTexture) {
            bankUrlLoaded = url;
            try {
              bankTexture = await Assets.load(url) as Texture;
            } catch {
              bankTexture = null;
            }
          }
          bankTex = bankTexture;
        }

        const { ms, beat, energy } = packReaction(current.music, frame);
        const copy = activePackCopy(current.cues, frame, current.fallbackText || 'NOW');
        const wordEnter = packWordEnter(ms, copy.wordStartMs, Boolean(copy.word));
        scene.update({
          base: meta.base,
          prop: meta.prop,
          style: current.style,
          motion: current.motion,
          beat,
          energy,
          frame,
          palette: current.palette,
          layout: current.layout,
          font: current.font,
          fontSecondary: current.fontSecondary,
          phrase: copy.phrase,
          word: copy.word,
          wordEnter,
          plateTexture: PHOTO_BASES.has(meta.base) ? plateTexture : null,
          plateUrl: current.plateUrl,
          lookPlateTexture: lookTex,
          ms,
          phraseStartMs: copy.phraseStartMs,
          words: copy.words,
          bankTexture: bankTex,
          typeStyle: current.typeStyle,
        });
        app.render();
      },
      extractCanvas(resolution = 1) {
        return app.renderer.extract.canvas({ target: app.stage, frame: new Rectangle(0, 0, WIDTH, HEIGHT), resolution }) as unknown as CanvasImageSource;
      },
      destroy: dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

/** One shared WebGL surface for the whole pack UI. */
export async function getSharedPackRenderer(opts: PackRendererOpts): Promise<PackRenderer> {
  if (shared) {
    shared.setOpts(opts);
    return shared;
  }
  const offscreen = document.createElement('canvas');
  offscreen.width = WIDTH;
  offscreen.height = HEIGHT;
  shared = await createPackRenderer(offscreen, opts);
  return shared;
}

export function destroySharedPackRenderer() {
  shared?.destroy();
  shared = null;
}

/** Render with shared WebGL, blit into a 2D target canvas (cards / export). */
export async function blitPackFrame(
  target: HTMLCanvasElement,
  opts: PackRendererOpts,
  frame: number,
) {
  const renderer = await getSharedPackRenderer(opts);
  await renderer.render(frame);
  const ctx = target.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D blit is unavailable.');
  // Read back only as many pixels as the target needs (previews: 360×640, not 1080×1920).
  const resolution = Math.min(1, target.width / WIDTH);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, target.width, target.height);
  // extract.canvas — reliable WebGL → 2D copy (raw GL canvas often blits blank).
  ctx.drawImage(renderer.extractCanvas(resolution), 0, 0, target.width, target.height);
}
