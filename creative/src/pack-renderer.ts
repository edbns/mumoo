/**
 * Creatives Pack renderer — Pixi WebGL designs into an offscreen canvas,
 * then blits into card/export canvases (2D). Never attaches WebGL to every card
 * (that froze the page with multiple contexts).
 *
 * Looks (Shaders.com recipes) are baked OFFLINE by the Look Lab into static JPEGs;
 * this file only loads them as textures. No WebGPU / Shaders in the browser.
 * A person's own photo (Dust, Filter) is loaded from `photoUrl`: a link in the browser, a page the worker serves in the cloud.
 */
import { Application, Assets, ColorMatrixFilter, Rectangle, Texture, type WebGLRenderer } from 'pixi.js';
import { DURATION_MS, HEIGHT, WIDTH, type ImpactMusic, type LyricCue } from './composition';
import { ensureFonts, type AdFont, type AdLayout } from './ad-fonts';
import type { AdPunchStyle } from './ad-punch';
import { activePackCopy, packReaction, packWordEnter } from './pack-copy';
import { createPackScene } from './pack-scenes';
import { bankBackgroundUrl } from './pack-looks';
import type { PhotoFilterId } from './pack-filter';
import { typeFamilies, type TypeStyleId } from './pack-type';
import { calmBeat, gradeMatrix, type MoodGrade } from './mood-grade';
import type { DustColors } from './dust-colors';
import { dustWordAt, sampleDust, type DustPoints } from './pack-dust';
import { loadMotion, type Motion } from './pack-motion';
import { planCuts, sourceMsAt, type Cut, type Shot } from './pack-cuts';
import { plateCutoutUrl, plateUrl } from './punch-plates';

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
  /** An approved photo (and its cut-out, for Dust): found the same way in the browser and in the cloud. */
  plateId?: string;
  /** Or the person's own picture. Dust: a photo with its cut-out mask. A Filter: a photo, or a clip (a video or GIF). */
  photoUrl?: string;
  cutoutUrl?: string;
  motionUrl?: string;
  /** A clip's shots (start and end, in ms of the clip) and which arrangement of them this card plays. */
  motionShots?: readonly Shot[];
  cutSeed?: number;
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

/** The font families a card draws with, so each is fetched (from this site) the first time a card needs it, not before. */
function familiesFor(opts: PackRendererOpts): string[] {
  if (opts.style === 'dust') return [opts.font];
  if (opts.style === 'pulise') return [opts.font, opts.fontSecondary];
  return opts.typeStyle ? typeFamilies(opts.typeStyle, opts) : [];
}

export type PackRenderer = {
  canvas: HTMLCanvasElement;
  setOpts(opts: PackRendererOpts): void;
  render(frame: number): Promise<void>;
  /** Snapshot current frame to a 2D-friendly canvas (safe blit source). `resolution` < 1 reads back fewer pixels. */
  extractCanvas(resolution?: number): CanvasImageSource;
  /** The browser took the GPU surface away (a long idle, a sleeping laptop, a GPU reset). The renderer cannot draw any more. */
  lost(): boolean;
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
  let cutoutTexture: Texture | null = null;
  let cutoutUrlLoaded = '';
  let motion: Motion | null = null;
  let motionUrlLoaded = '';
  let cuts: Cut[] = [];
  let cutsKey = '';
  let dustPoints: DustPoints | null = null;
  let dustKey = '';
  let contextLost = false;
  let gl: WebGL2RenderingContext | WebGLRenderingContext | null = null;

  const dispose = () => {
    scene?.destroy();
    scene = null;
    photoTexture = null;
    photoUrlLoaded = '';
    bankTexture = null;
    bankUrlLoaded = '';
    cutoutTexture = null;
    cutoutUrlLoaded = '';
    motion?.destroy();
    motion = null;
    motionUrlLoaded = '';
    cutsKey = '';
    dustPoints = null;
    dustKey = '';
    if (initialized) {
      try { app.destroy(false, { children: true }); } catch { /* a lost surface cannot be torn down cleanly */ }
    }
    // Give the GPU surface back now: a replacement for a lost surface must not pile up next to it.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    gl = null;
    initialized = false;
  };

  /**
   * Reads a picture into a texture. It is fetched fresh, never from the browser's cache: a signed link that
   * was once shown in an <img> sits in the cache without CORS headers, and reusing it here would fail.
   */
  async function loadTexture(url: string, what: string): Promise<Texture> {
    const response = await fetch(url, { cache: 'no-store' }).catch(() => null);
    if (!response?.ok) throw new Error(`${what} could not be loaded${response ? ` (${response.status})` : ''}. Reload the page, or go back to our photography.`);
    const bitmap = await createImageBitmap(await response.blob()).catch(() => null);
    if (!bitmap) throw new Error(`${what} could not be read as a picture.`);
    return Texture.from(bitmap);
  }

  /** Reads the person's picture (still, cut-out, clip) once per link; one that cannot be read is an error, never a stand-in. */
  async function ensurePicture(photoUrl: string | undefined, cutoutUrl: string | undefined, motionUrl: string | undefined) {
    if (photoUrl !== photoUrlLoaded || (photoUrl && !photoTexture)) {
      photoUrlLoaded = '';
      photoTexture = null;
      if (photoUrl) photoTexture = await loadTexture(photoUrl, 'The photo');
      photoUrlLoaded = photoUrl ?? '';
    }
    if (cutoutUrl !== (cutoutUrlLoaded || undefined) || (cutoutUrl && !cutoutTexture)) {
      cutoutUrlLoaded = '';
      cutoutTexture = null;
      if (cutoutUrl) cutoutTexture = await loadTexture(cutoutUrl, 'The photo’s cut-out');
      cutoutUrlLoaded = cutoutUrl ?? '';
    }
    if (motionUrl !== (motionUrlLoaded || undefined)) {
      motion?.destroy();
      motion = null;
      motionUrlLoaded = '';
      if (motionUrl) motion = await loadMotion(motionUrl);
      motionUrlLoaded = motionUrl ?? '';
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

    // The surface Pixi itself drew on. Asking the canvas for one again can come back empty.
    const surface = (app.renderer as WebGLRenderer).gl;
    gl = surface;
    // Cancelling the event is what allows the browser to give the surface back; we make a fresh renderer instead of waiting for it.
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); contextLost = true; });

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
        if (contextLost || surface.isContextLost()) throw new Error('The WebGL context was lost.');
        const { style } = current;
        await ensureFonts(familiesFor(current));
        const ownPicture = style === 'dust' || style === 'filter';
        const photoUrl = current.plateId ? plateUrl(current.plateId) : current.photoUrl;
        const cutoutUrl = style === 'dust' ? (current.plateId ? plateCutoutUrl(current.plateId) : current.cutoutUrl) : undefined;
        if (ownPicture) await ensurePicture(photoUrl, cutoutUrl, current.motionUrl);
        else await ensurePicture(undefined, undefined, undefined);

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

        const reaction = packReaction(current.music, frame);
        const { ms, energy, beatIndex, beatGapMs } = reaction;
        // A video or GIF shows the clip's frame for this moment.
        if (motion) {
          // The edit: pieces of the clip, cut on the beat, differently for each card.
          const key = `${motionUrlLoaded}|${current.cutSeed ?? 0}|${JSON.stringify(current.motionShots ?? null)}|${current.music?.beatsMs.length ?? 0}`;
          if (key !== cutsKey) {
            cuts = planCuts(current.motionShots ?? [[0, motion.durationMs]], current.music?.beatsMs ?? [], current.cutSeed ?? 0, DURATION_MS);
            cutsKey = key;
          }
          await motion.seek(cuts.length ? sourceMsAt(cuts, ms) : ms);
        }

        // Dust: the picture is read into grains once, then every frame is a function of the clock.
        if (style === 'dust') {
          const picture = photoTexture?.source.resource as (CanvasImageSource & { width: number; height: number }) | undefined;
          const mask = cutoutTexture?.source.resource as (CanvasImageSource & { width: number; height: number }) | undefined;
          if (!picture || !mask) throw new Error('Dust needs a photo and its cut-out.');
          const key = `${photoUrl}|${cutoutUrl}`;
          if (dustKey !== key || !dustPoints) {
            dustPoints = sampleDust(picture, mask);
            dustKey = key;
          }
        }
        if (style === 'filter' && !photoTexture && !motion) throw new Error('Filter needs a picture.');

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
          background: style === 'filter' ? (motion?.texture ?? photoTexture) : bankTex,
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
      lost: () => contextLost || surface.isContextLost(),
      destroy: dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

/** One shared WebGL surface for the whole pack UI. If the browser took it away, a new one is made. */
async function sharedRenderer(opts: PackRendererOpts): Promise<PackRenderer> {
  if (shared?.lost()) destroySharedPackRenderer();
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

/**
 * Drawing goes one frame at a time through this queue. The renderer reads its options while it works, so two
 * cards drawn at once (a poster while another card plays) would each be drawn with the other's look.
 */
let queue: Promise<unknown> = Promise.resolve();

/** Render with shared WebGL, blit into a 2D target canvas (cards / export). */
export function blitPackFrame(target: HTMLCanvasElement, opts: PackRendererOpts, frame: number): Promise<void> {
  const drawn = queue.then(() => draw(target, opts, frame));
  queue = drawn.catch(() => undefined);
  return drawn;
}

async function draw(target: HTMLCanvasElement, opts: PackRendererOpts, frame: number) {
  let renderer = await sharedRenderer(opts);
  try {
    await renderer.render(frame);
  } catch (cause) {
    // The surface was lost while drawing: start again on a fresh one, once.
    if (!renderer.lost()) throw cause;
    renderer = await sharedRenderer(opts);
    await renderer.render(frame);
  }
  const ctx = target.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D blit is unavailable.');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.imageSmoothingQuality = 'high';
  // The frame is copied straight from the GPU surface, in the same task that drew it (later it would be blank).
  // Reading it back at a lower resolution instead put the picture of a filtered card into one corner on some GPUs.
  ctx.drawImage(renderer.canvas, 0, 0, target.width, target.height);
}
