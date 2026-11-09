/**
 * Creatives Pack renderer — Pixi WebGL designs into an offscreen canvas,
 * then blits into card/export canvases (2D). Never attaches WebGL to every card
 * (that froze the page with multiple contexts).
 *
 * Looks (Shaders.com recipes) are baked OFFLINE by the Look Lab into static JPEGs;
 * this file only loads them as textures. No WebGPU / Shaders in the browser.
 * A person's own photo (Dust, Filter) is loaded from `photoUrl`: a link in the browser, a page the worker serves in the cloud.
 */
import { Application, Assets, ColorMatrixFilter, Rectangle, Texture } from 'pixi.js';
import { HEIGHT, WIDTH, type ImpactMusic, type LyricCue } from './composition';
import type { AdFont, AdLayout } from './ad-fonts';
import type { AdPunchStyle } from './ad-punch';
import { activePackCopy, packReaction, packWordEnter } from './pack-copy';
import { createPackScene } from './pack-scenes';
import { bankBackgroundUrl } from './pack-looks';
import type { PhotoFilterId } from './pack-filter';
import type { TypeStyleId } from './pack-type';
import { calmBeat, gradeMatrix, type MoodGrade } from './mood-grade';
import type { DustColors } from './dust-colors';
import { dustWordAt, sampleDust, type DustPoints } from './pack-dust';

/** Shelf card / live preview size (9× fewer pixels than the 1080×1920 export frame). */
export const PREVIEW_WIDTH = 360;
export const PREVIEW_HEIGHT = 640;

export type PackRendererOpts = {
  style: AdPunchStyle;
  font: AdFont;
  fontSecondary: AdFont;
  layout: AdLayout;
  cues: readonly LyricCue[];
  music: ImpactMusic | null;
  fallbackText: string;
  /** The person's own photo, for Dust and Filter. */
  photoUrl?: string;
  /** Look Bank card: baked Shaders Pro background id + lyric type style. */
  bankId?: string;
  typeStyle?: TypeStyleId;
  /** What the lyrics do to colour and beat hits; absent = untouched. */
  grade?: MoodGrade;
  /** False when lyrics are switched off: nothing is written on the picture. Default true. */
  lyrics?: boolean;
  /** Dust and Filter: the two colours of the template. */
  colors?: DustColors;
  /** Filter: how the photo is treated. */
  filter?: PhotoFilterId;
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
  /** Edge smoothing on the whole surface. The cloud turns it off for Dust: its grains are already soft, and it costs 6× the time there. */
  antialias = true,
): Promise<PackRenderer> {
  const app = new Application();
  let initialized = false;
  let scene: ReturnType<typeof createPackScene> | null = null;
  let current = opts;
  let photoTexture: Texture | null = null;
  let photoUrlLoaded = '';
  let bankTexture: Texture | null = null;
  let bankUrlLoaded = '';
  let dustPoints: DustPoints | null = null;
  let dustUrl = '';

  const dispose = () => {
    scene?.destroy();
    scene = null;
    photoTexture = null;
    photoUrlLoaded = '';
    bankTexture = null;
    bankUrlLoaded = '';
    dustPoints = null;
    dustUrl = '';
    if (initialized) app.destroy(false, { children: true });
    initialized = false;
  };

  async function ensurePhotoTexture(url: string | undefined) {
    if (!url) {
      photoTexture = null;
      photoUrlLoaded = '';
      return;
    }
    if (url === photoUrlLoaded && photoTexture) return;
    photoUrlLoaded = url;
    try {
      photoTexture = await Assets.load({ src: url, parser: 'texture' }) as Texture;
    } catch {
      photoTexture = null;
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
      antialias,
      background: '#000000',
      resolution: 1,
    });
    initialized = true;
    app.ticker.stop();

    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) throw new Error('WebGL is unavailable for creatives.');

    scene = createPackScene();
    app.stage.addChild(scene.root);
    const gradeFilter = new ColorMatrixFilter();

    return {
      canvas,
      setOpts(next: PackRendererOpts) {
        current = next;
      },
      async render(frame: number) {
        if (!scene) throw new Error('Pack renderer was destroyed.');
        if (gl.isContextLost()) throw new Error('The WebGL context was lost. Reload and try again.');
        const { style } = current;
        const ownPhoto = style === 'dust' || style === 'filter';
        await ensurePhotoTexture(ownPhoto ? current.photoUrl : undefined);

        let bankTex: Texture | null = null;
        if (style === 'bank' && current.bankId) {
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

        // Dust: the photo is read into grains once per photo, then every frame is a function of the clock.
        if (style === 'dust') {
          const resource = photoTexture?.source.resource as (CanvasImageSource & { width: number; height: number }) | undefined;
          if (!resource || !current.photoUrl) throw new Error('Dust needs a photo.');
          if (dustUrl !== current.photoUrl || !dustPoints) {
            dustPoints = sampleDust(resource);
            dustUrl = current.photoUrl;
          }
        }
        if (style === 'filter' && !photoTexture) throw new Error('Filter needs a photo.');

        const reaction = packReaction(current.music, frame);
        const { ms, energy, beatIndex, beatGapMs } = reaction;
        const beat = calmBeat(reaction.beat, current.grade);
        if (current.grade) {
          gradeFilter.matrix = gradeMatrix(current.grade) as ColorMatrixFilter['matrix'];
          scene.root.filters = [gradeFilter];
        } else scene.root.filters = [];
        const copy = activePackCopy(current.cues, frame, current.fallbackText || 'NOW');
        const wordEnter = packWordEnter(ms, copy.wordStartMs, Boolean(copy.word));
        scene.update({
          style,
          beat,
          energy,
          beatIndex,
          beatGapMs,
          frame,
          layout: current.layout,
          font: current.font,
          fontSecondary: current.fontSecondary,
          phrase: copy.phrase,
          word: copy.word,
          wordEnter,
          ms,
          words: copy.words,
          background: style === 'filter' ? photoTexture : bankTex,
          filter: current.filter,
          colors: current.colors,
          typeStyle: current.typeStyle,
          lyrics: current.lyrics !== false,
          dustPoints: style === 'dust' ? dustPoints : null,
          beatsMs: current.music?.beatsMs ?? [],
          downbeatsMs: current.music?.downbeatsMs ?? [],
          dustWord: current.lyrics !== false ? dustWordAt(current.cues, ms) : null,
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
