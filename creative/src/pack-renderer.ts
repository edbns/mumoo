/**
 * Creatives Pack renderer — Pixi WebGL designs into an offscreen canvas,
 * then blits into card/export canvases (2D). Never attaches WebGL to every card
 * (that froze the page with multiple contexts).
 *
 * Looks (Shaders.com recipes) are baked OFFLINE by the Look Lab into static JPEGs;
 * this file only loads them as textures. No WebGPU / Shaders in the browser.
 * A person's own picture (Dust, Our photography) is loaded from `photoUrl`: a link in the browser, a page the worker serves in the cloud.
 */
import { Application, Assets, ColorMatrixFilter, Rectangle, Texture, type WebGLRenderer } from 'pixi.js';
import { DURATION_MS, HEIGHT, WIDTH, type ImpactMusic, type LyricCue } from './composition';
import { ensureFonts, type AdFont, type AdLayout } from './ad-fonts';
import type { AdPunchStyle } from './ad-punch';
import { activePackCopy, packReaction, packWordEnter } from './pack-copy';
import { createPackScene } from './pack-scenes';
import { isLiveLook, type LiveLookId } from './live-look-deal';
import { isDepth } from './live-look-ramp';
import { bankBackgroundUrl, photoEffectUrl } from './pack-looks';
import { typeFamilies, type TypeStyleId } from './pack-type';
import { calmBeat, gradeMatrix, type MoodGrade } from './mood-grade';
import type { DustColors } from './dust-colors';
import { dustWordAt, sampleDust, type DustPoints } from './pack-dust';
import { loadMotion, type Motion } from './pack-motion';
import { clearReelPictures, loadReel, reelKey, type Reel, type ReelSource } from './pack-reel';
import { planCuts, sourceMsAt, type Cut, type Shot } from './pack-cuts';
import { plateCutoutUrl, plateUrl } from './punch-plates';
import { risoInkSetById } from './riso-look';
import { prepareRisoFrame, prepareRisoPhoto, type RisoPhoto } from './riso-photo';
import { sprayPaletteById } from './spray-look';
import { WINDOW_PALETTE_IDS } from './window-look';
import type { WindowMode } from './window-deal';
import type { WindowPicture } from './pack-window';
import type { DoodlePaper } from './doodle-cast';
import type { DoodleMood } from './doodle-parts';

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
  /** Dust, Riso and Window: an approved photo (and its cut-out), found the same way in the browser and in the cloud. */
  plateId?: string;
  /** Our photography and Window: one baked effect on our approved photo, found the same way. */
  effectId?: string;
  /** Or the person's own picture, which replaces ours. Dust: a photo with its cut-out mask. Riso: a photo with its cut-out, or a clip printed whole-frame. Our photography: a photo, or a clip drawn plain. Window: a photo with its cut-out (used only when the card has her in front), or a clip drawn plain. */
  photoUrl?: string;
  cutoutUrl?: string;
  motionUrl?: string;
  /** A clip's shots (start and end, in ms of the clip) and which arrangement of them this card plays. */
  motionShots?: readonly Shot[];
  /**
   * The Director's reel: several of our library's pictures and clips edited together to the music (`pack-director.ts`), instead of one picture.
   * Our photography, its live looks and Riso (whole-frame) draw it; it replaces `plateId`, `effectId` and the picture or clip of one.
   */
  reel?: readonly ReelSource[];
  cutSeed?: number;
  /** Look Bank card: baked Shaders Pro background id + lyric type style. */
  bankId?: string;
  typeStyle?: TypeStyleId;
  /** Our photography: a live look drawn on the person's own or our library picture (not on a baked effect, which is already a look). */
  look?: LiveLookId;
  /** What the lyrics do to colour and beat hits; absent = untouched. */
  grade?: MoodGrade;
  /** False when lyrics are switched off: nothing is written on the picture. Default true. */
  lyrics?: boolean;
  /** Dust: the two colours of the template. */
  colors?: DustColors;
  /** Riso: the id of the card's ink set (riso-look.ts). Spray: the id of its wall and paints (spray-look.ts). */
  inkSet?: string;
  sprayPalette?: string;
  /** Window: what is seen through the word (`windowMode`), the screen colour the card opens on, and the colours it may flip to. */
  windowMode?: WindowMode;
  windowPalette?: string;
  windowAllowed?: readonly string[];
  /** Doodle: who sings (`doodle-cast.ts`), the paper it is drawn on, and the mood of the song's words. */
  doodleId?: string;
  doodlePaper?: DoodlePaper;
  doodleMood?: DoodleMood;
};

/** The font families a card draws with, so each is fetched (from this site) the first time a card needs it, not before. */
function familiesFor(opts: PackRendererOpts): string[] {
  if (opts.style === 'dust' || opts.style === 'riso' || opts.style === 'spray' || opts.style === 'window' || opts.style === 'doodle') return [opts.font];
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

/** What a card without music or lyrics holds. One array, so a world that compares by identity does not take it for new input every frame. */
const NOTHING: readonly never[] = [];

/**
 * Reads a picture into a texture. It is fetched fresh, never from the browser's cache: a signed link that
 * was once shown in an <img> sits in the cache without CORS headers, and reusing it here would fail.
 */
export async function loadTexture(url: string, what: string): Promise<Texture> {
  const response = await fetch(url, { cache: 'no-store' }).catch(() => null);
  if (!response?.ok) throw new Error(`${what} could not be loaded${response ? ` (${response.status})` : ''}. Reload the page, or go back to our photography.`);
  const bitmap = await createImageBitmap(await response.blob()).catch(() => null);
  if (!bitmap) throw new Error(`${what} could not be read as a picture.`);
  return Texture.from(bitmap);
}

/**
 * Where a Window card's picture comes from: its mode says which of our pictures (an approved photo for `person` and `plain`,
 * an effect for `effect`, a background for `bank`), or `person` and `plain` can be the person's own photo or clip. Exactly one.
 * Anything else is a mistake in the card, and is not drawn around.
 */
function checkWindow(opts: PackRendererOpts): WindowMode {
  const { windowMode: mode, windowPalette: palette, windowAllowed: allowed } = opts;
  if (!mode || !palette || !allowed) throw new Error('Window needs a kind of picture, a screen colour and the colours it may flip to.');
  if (![palette, ...allowed].every(id => WINDOW_PALETTE_IDS.includes(id))) throw new Error('Window has no such screen colour.');
  const ours = { person: opts.plateId, plain: opts.plateId, effect: opts.effectId, bank: opts.bankId }[mode];
  const named = [opts.plateId, opts.effectId, opts.bankId].filter(Boolean).length;
  const own = Boolean(opts.photoUrl || opts.motionUrl);
  const fromOurs = Boolean(ours) && named === 1 && !own;
  const fromOwn = (mode === 'person' || mode === 'plain') && named === 0 && own;
  if (fromOurs === fromOwn) throw new Error(`A Window card with ${mode} needs exactly one picture of the right kind.`);
  if (mode === 'person' && opts.motionUrl) throw new Error('A person can only stand in front of a photo, not a video.');
  return mode;
}

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
  let stillTexture: Texture | null = null;
  let stillUrlLoaded = '';
  let cutoutTexture: Texture | null = null;
  let cutoutUrlLoaded = '';
  let motion: Motion | null = null;
  let reel: Reel | null = null;
  let motionUrlLoaded = '';
  let cuts: Cut[] = [];
  let cutsKey = '';
  let dustPoints: DustPoints | null = null;
  let dustKey = '';
  let risoPhoto: RisoPhoto | null = null;
  let risoKey = '';
  let contextLost = false;
  let gl: WebGL2RenderingContext | WebGLRenderingContext | null = null;

  const dispose = () => {
    scene?.destroy();
    scene = null;
    photoTexture = null;
    photoUrlLoaded = '';
    stillTexture = null;
    stillUrlLoaded = '';
    cutoutTexture = null;
    cutoutUrlLoaded = '';
    motion?.destroy();
    motion = null;
    reel = null;
    motionUrlLoaded = '';
    clearReelPictures();
    cutsKey = '';
    dustPoints = null;
    dustKey = '';
    risoPhoto = null;
    risoKey = '';
    if (initialized) {
      try { app.destroy(false, { children: true }); } catch { /* a lost surface cannot be torn down cleanly */ }
    }
    // Give the GPU surface back now: a replacement for a lost surface must not pile up next to it.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    gl = null;
    initialized = false;
  };

  /**
   * Reads the person's picture (still, cut-out, clip) once per link; one that cannot be read is an error, never a stand-in.
   * A picture that is replaced is given back to the GPU at once: the shelf draws one card after another, and Window
   * brings her cut-out in and out with every card.
   */
  async function ensurePicture(photoUrl: string | undefined, cutoutUrl: string | undefined, motionUrl: string | undefined, sources?: readonly ReelSource[]) {
    if (photoUrl !== photoUrlLoaded || (photoUrl && !photoTexture)) {
      photoUrlLoaded = '';
      photoTexture?.destroy(true);
      photoTexture = null;
      if (photoUrl) photoTexture = await loadTexture(photoUrl, 'The photo');
      photoUrlLoaded = photoUrl ?? '';
    }
    if (cutoutUrl !== (cutoutUrlLoaded || undefined) || (cutoutUrl && !cutoutTexture)) {
      cutoutUrlLoaded = '';
      cutoutTexture?.destroy(true);
      cutoutTexture = null;
      if (cutoutUrl) cutoutTexture = await loadTexture(cutoutUrl, 'The photo’s cut-out');
      cutoutUrlLoaded = cutoutUrl ?? '';
    }
    const motionKey = sources?.length ? `reel:${sources.map(reelKey).join(',')}` : motionUrl;
    if (motionKey !== (motionUrlLoaded || undefined)) {
      motion?.destroy();
      motion = null;
      reel = null;
      motionUrlLoaded = '';
      if (sources?.length) {
        reel = await loadReel(sources);
        motion = reel;
      } else if (motionUrl) motion = await loadMotion(motionUrl);
      motionUrlLoaded = motionKey ?? '';
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
        // Our photography draws one baked effect, or (replacing it) the person's own picture, never both.
        const reelled = Boolean(current.reel?.length);
        if (reelled && (!(style === 'filter' || style === 'riso') || current.effectId || current.plateId || current.photoUrl || current.motionUrl || current.cutoutUrl)) throw new Error('A reel is drawn by Our photography or Riso, alone, not with another picture.');
        if (style === 'filter' && current.effectId && (current.photoUrl || current.motionUrl)) throw new Error('Our photography draws an effect or the person’s own picture, not both.');
        const ownBackdrop = style === 'filter' && !current.effectId;
        if (style === 'filter' && current.plateId && (current.effectId || current.photoUrl || current.motionUrl)) throw new Error('Our photography draws one picture: our photo, an effect, or the person’s own.');
        if (current.look && (!isLiveLook(current.look) || style !== 'filter' || current.effectId)) throw new Error('A live look is drawn only on a picture of Our photography, not on a baked effect.');
        const windowMode = style === 'window' ? checkWindow(current) : null;
        const windowOwn = windowMode === 'person' || windowMode === 'plain';
        if (style === 'riso' && !current.inkSet) throw new Error('Riso needs an ink set.');
        if (style === 'spray' && !current.sprayPalette) throw new Error('Spray needs a wall and paints.');
        if (style === 'doodle' && !(current.doodleId && current.doodlePaper && current.doodleMood)) throw new Error('Doodle needs a singer, a paper and a mood.');
        // Window brings her cut-out only for a card with her in front; a plain card of the same photo does not read it.
        // Depth live looks need the cut-out as a near layer (same media path as Dust / Riso photos).
        // Riso on a clip is whole-frame: no cut-out.
        const depthLook = Boolean(current.look && isDepth(current.look));
        const risoMotion = style === 'riso' && Boolean(current.motionUrl || reelled);
        const cutOut = style === 'dust' || (style === 'riso' && !risoMotion) || windowMode === 'person' || (ownBackdrop && depthLook);
        const ownPicture = cutOut || ownBackdrop || windowOwn || risoMotion;
        // Our photography can also draw our approved photo itself (with a live look on it).
        const photoUrl = (cutOut || windowOwn || style === 'filter') && current.plateId ? plateUrl(current.plateId) : current.photoUrl;
        const cutoutUrl = cutOut ? (current.plateId ? plateCutoutUrl(current.plateId) : current.cutoutUrl) : undefined;
        if (ownPicture) await ensurePicture(photoUrl, cutoutUrl, current.motionUrl, current.reel);
        else await ensurePicture(undefined, undefined, undefined);

        // A baked still: a Look Bank background, a photography effect, or a Window's effect or background. One that cannot be loaded shows the downtime message (a Window card has none: it throws).
        const stillUrl = (style === 'bank' || windowMode === 'bank') && current.bankId ? bankBackgroundUrl(current.bankId)
          : (style === 'filter' || windowMode === 'effect') && current.effectId ? photoEffectUrl(current.effectId)
          : null;
        let still: Texture | null = null;
        if (stillUrl) {
          if (stillUrl !== stillUrlLoaded || !stillTexture) {
            // The still of the card before is given back: Window deals a different one to every card, and each is a full-frame picture.
            if (stillTexture) await Assets.unload(stillUrlLoaded);
            stillUrlLoaded = stillUrl;
            try {
              stillTexture = await Assets.load(stillUrl) as Texture;
            } catch {
              stillTexture = null;
            }
          }
          still = stillTexture;
        }

        const reaction = packReaction(current.music, frame);
        const { ms, energy, beatIndex, beatGapMs } = reaction;
        // A video or GIF shows the clip's frame for this moment.
        if (motion) {
          if (reel) {
            // The Director's edit of several pictures, to this music; `seek` takes the moment of the song.
            reel.direct(current.music, current.cutSeed ?? 0, DURATION_MS);
            await motion.seek(ms);
          } else if (current.look) {
            // A card with a live look plays its video straight through, as one piece (looping if it is shorter than the clip), not cut up.
            cuts = [];
            cutsKey = '';
            await motion.seek(ms % Math.max(1, motion.durationMs));
          } else {
            // The edit: pieces of the clip, cut on the beat, differently for each card.
            const key = `${motionUrlLoaded}|${current.cutSeed ?? 0}|${JSON.stringify(current.motionShots ?? null)}|${current.music?.beatsMs.length ?? 0}|${current.music?.energy.length ?? 0}|${current.music?.accentsMs?.join(',') ?? ''}|${current.music?.pace ?? ''}`;
            if (key !== cutsKey) {
              cuts = planCuts(current.motionShots ?? [[0, motion.durationMs]], current.music?.beatsMs ?? [], current.cutSeed ?? 0, DURATION_MS, current.music);
              cutsKey = key;
            }
            await motion.seek(cuts.length ? sourceMsAt(cuts, ms) : ms);
          }
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
        // Riso photo: read into one light-and-silhouette map once. Riso clip: refresh a whole-frame lightness map each frame.
        if (style === 'riso') {
          if (risoMotion) {
            const frame = motion?.texture.source.resource as (CanvasImageSource & { width: number; height: number }) | undefined;
            if (!frame) throw new Error('Riso needs a video or GIF.');
            const key = `${motionUrlLoaded}|motion`;
            if (risoKey !== key || !risoPhoto) {
              risoPhoto = prepareRisoFrame(frame);
              risoKey = key;
            } else {
              prepareRisoFrame(frame, risoPhoto);
            }
          } else {
            const picture = photoTexture?.source.resource as (CanvasImageSource & { width: number; height: number }) | undefined;
            const mask = cutoutTexture?.source.resource as (CanvasImageSource & { width: number; height: number }) | undefined;
            if (!picture || !mask) throw new Error('Riso needs a photo and its cut-out.');
            const key = `${photoUrl}|${cutoutUrl}`;
            if (risoKey !== key || !risoPhoto) {
              risoPhoto = prepareRisoPhoto(picture, mask);
              risoKey = key;
            }
          }
        }
        if (ownBackdrop && !photoTexture && !motion) throw new Error('Our photography needs an effect or a picture.');
        if (depthLook && !cutoutTexture && !reel?.subject) throw new Error('Depth needs a photo and its cut-out.');
        // Window: the picture behind the word is the clip's frame, the photo, or the baked still; her cut-out stands in front when the card says so.
        let windowPicture: WindowPicture | undefined;
        if (windowMode) {
          const texture = motion?.texture ?? photoTexture ?? still;
          if (!texture) throw new Error('The picture for this Window could not be loaded. Reload the page.');
          if (windowMode === 'person' && !cutoutTexture) throw new Error('Window needs her cut-out to stand her in front.');
          windowPicture = { texture, ...(windowMode === 'person' && cutoutTexture ? { cutout: cutoutTexture } : {}) };
        }

        const beat = calmBeat(reaction.beat, current.grade);
        if (current.grade) {
          gradeFilter.matrix = gradeMatrix(current.grade) as ColorMatrixFilter['matrix'];
          scene.root.filters = [gradeFilter];
        } else scene.root.filters = [];
        const copy = activePackCopy(current.cues, frame);
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
          background: ownBackdrop ? (motion?.texture ?? photoTexture) : still,
          cutout: depthLook ? cutoutTexture : null,
          subject: depthLook ? reel?.subject ?? null : null,
          colors: current.colors,
          typeStyle: current.typeStyle,
          look: current.look,
          lyrics: current.lyrics !== false,
          dustPoints: style === 'dust' ? dustPoints : null,
          beatsMs: current.music?.beatsMs ?? NOTHING,
          downbeatsMs: current.music?.downbeatsMs ?? NOTHING,
          dustWord: current.lyrics !== false ? dustWordAt(current.cues, ms) : null,
          cues: current.lyrics !== false ? current.cues : NOTHING,
          seed: current.layout.seed,
          inks: style === 'riso' && current.inkSet ? risoInkSetById(current.inkSet).inks : undefined,
          risoPhoto: style === 'riso' ? risoPhoto : null,
          palette: style === 'spray' && current.sprayPalette ? sprayPaletteById(current.sprayPalette) : undefined,
          windowPicture,
          windowPalette: current.windowPalette,
          windowAllowed: current.windowAllowed,
          doodle: style === 'doodle' ? { id: current.doodleId!, paper: current.doodlePaper!, mood: current.doodleMood! } : undefined,
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
