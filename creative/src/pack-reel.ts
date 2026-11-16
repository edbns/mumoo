import { CanvasSource, Texture } from 'pixi.js';
import { HEIGHT, WIDTH, type ImpactMusic } from './composition';
import { fetchFresh } from './fetch-fresh';
import { loadMotion, type Motion } from './pack-motion';
import { REFERENCE_H, REFERENCE_W, references } from './pack-palette';
import { clipMsAt, planReel, segmentAt, type ReelAsset, type Segment, type Shot } from './pack-director';
import type { PresetRhythm } from './edit-presets';

/**
 * A reel is a few pictures, clips and GIFs edited together by the Director (`pack-director.ts`) and drawn as one
 * picture that can be asked for any moment of the song. It is a `Motion` to the renderer: asking for `ms` puts that
 * moment of the edit onto its canvas, so the shelf preview and the cloud render draw the same frame.
 */
export type ReelSource = {
  /** The library item, for the cart and the cloud. The cloud's links carry no id (the worker takes none), so a picture is told apart by its link too (`reelKey`). */
  id?: string;
  kind: 'photo' | 'clip';
  /** A link to the photo, or to the prepared clip. */
  url: string;
  /** A clip's shots, in ms of the clip. */
  shots?: readonly Shot[];
};

/** What tells one picture of a reel from another: its library id, or (in the cloud) its link without the signature that changes every time. */
export const reelKey = (source: ReelSource) => source.id ?? source.url.split('?')[0];

export type Reel = Motion & {
  /**
   * Edits the reel to this music (once per music, seed and preset). Call before `seek`; the milliseconds of `seek` are then those of the song.
   * An edit preset (`edit-presets.ts`) cuts to its own rhythm, and a preset that dissolves draws the two pictures over each other for `dissolveMs`.
   */
  direct(music: ImpactMusic | null, seed: number, durationMs: number, preset?: { rhythm: PresetRhythm; dissolveMs: number }): void;
  /** When each cut of the edit falls, in ms of the song (the first piece's start, 0, is not a cut). */
  cutsMs(): number[];
};

/** How much to brighten (or dim) a picture so a dark one is not lost to the looks and a blown-out one is not burnt. */
type Exposure = {
  gain?: number;
  /** A small copy of the picture as it is shown, which the palette and the look's range are read from (`references`). */
  reference?: HTMLCanvasElement;
};
type Loaded = ({ kind: 'photo'; image: ImageBitmap } | { kind: 'clip'; motion: Motion }) & Exposure;

/** The average light every picture is brought to, and how far it may be pushed either way. */
const TARGET_LIGHT = 0.4;
const MIN_GAIN = 0.45;
const MAX_GAIN = 2.5;
const PROBE_W = 24;
const PROBE_H = 42;
/** Where in a clip its light is read: the same moment every time, so the preview and every cloud chunk agree. */
const PROBE_CLIP_MS = 1200;

/** How much a picture is brightened: from its average light, read once (on a few hundred pixels, so it costs nothing). */
function exposureOf(shown: CanvasImageSource): number {
  const probe = document.createElement('canvas');
  probe.width = PROBE_W;
  probe.height = PROBE_H;
  const context = probe.getContext('2d', { willReadFrequently: true });
  if (!context) return 1;
  context.drawImage(shown, 0, 0, PROBE_W, PROBE_H);
  const data = context.getImageData(0, 0, PROBE_W, PROBE_H).data;
  let light = 0;
  for (let i = 0; i < data.length; i += 4) light += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
  const mean = light / (PROBE_W * PROBE_H);
  return Math.min(MAX_GAIN, Math.max(MIN_GAIN, TARGET_LIGHT / Math.max(0.05, mean)));
}

/** The picture as it is shown (brightened), small, for the palette to read: the same for a picture whenever it plays. */
function referenceOf(shown: CanvasImageSource & { width: number; height: number }, gain: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = REFERENCE_W;
  canvas.height = REFERENCE_H;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return canvas;
  const scale = Math.max(REFERENCE_W / shown.width, REFERENCE_H / shown.height);
  const width = shown.width * scale;
  const height = shown.height * scale;
  context.fillStyle = '#000';
  context.fillRect(0, 0, REFERENCE_W, REFERENCE_H);
  context.filter = Math.abs(gain - 1) < 0.02 ? 'none' : `brightness(${gain.toFixed(3)})`;
  context.drawImage(shown, (REFERENCE_W - width) / 2, (REFERENCE_H - height) / 2, width, height);
  return canvas;
}

/**
 * Pictures already read, kept by `reelKey`: one card after another on the shelf draws from the same few, and each
 * is fetched once. A card draws only the pieces it plays; the rest are fetched in the background in the browser.
 */
const MAX_KEPT = 12;
const LOOK_AHEAD_MS = 2500;
const kept = new Map<string, Promise<Loaded>>();
let prefetching = true;

/** The cloud renders one short chunk per page, so it fetches only what that chunk plays. */
export function setReelPrefetch(on: boolean) {
  prefetching = on;
}

async function bitmapOf(url: string, what: string): Promise<ImageBitmap> {
  const response = await fetchFresh(url);
  if (!response?.ok) throw new Error(`${what} could not be loaded${response ? ` (${response.status})` : ''}. Reload the page.`);
  const image = await createImageBitmap(await response.blob()).catch(() => null);
  if (!image) throw new Error(`${what} could not be read.`);
  return image;
}

async function read(source: ReelSource): Promise<Loaded> {
  if (source.kind === 'clip') return { kind: 'clip', motion: await loadMotion(source.url) };
  const image = await bitmapOf(source.url, 'A picture of the reel');
  const gain = exposureOf(image);
  const reference = referenceOf(image, gain);
  return { kind: 'photo', image, gain, reference };
}

function release(loaded: Loaded) {
  if (loaded.kind === 'photo') loaded.image.close();
  else loaded.motion.destroy();
}

function keep(source: ReelSource): Promise<Loaded> {
  const key = reelKey(source);
  const have = kept.get(key);
  if (have) {
    kept.delete(key);
    kept.set(key, have);
    return have;
  }
  const loading = read(source);
  loading.catch(() => { if (kept.get(key) === loading) kept.delete(key); });
  kept.set(key, loading);
  while (kept.size > MAX_KEPT) {
    const [oldest] = kept.keys();
    const gone = kept.get(oldest)!;
    kept.delete(oldest);
    void gone.then(release, () => undefined);
  }
  return loading;
}

/** Gives every kept picture back (the page is closing, or the renderer was rebuilt). */
export function clearReelPictures() {
  for (const loading of kept.values()) void loading.then(release, () => undefined);
  kept.clear();
}

export async function loadReel(sources: readonly ReelSource[]): Promise<Reel> {
  if (sources.length < 1) throw new Error('A reel needs at least one picture.');
  const surface = () => {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable.');
    return { canvas, context };
  };
  const picture = surface();
  const pictureSource = new CanvasSource({ resource: picture.canvas });
  const texture = new Texture({ source: pictureSource });
  const assets: ReelAsset[] = sources.map(item => (item.kind === 'photo' ? { kind: 'photo' } : { kind: 'clip', shots: item.shots ?? [[0, 6000]] }));

  let segments: Segment[] = [];
  let plannedFor = '';
  let dissolveMs = 0;
  let seeks = 0;

  /**
   * Draws `shown` over the whole canvas the way a poster fills a frame, scaled up by `zoom` about the middle.
   * With `alpha` below 1 it is laid over what is already drawn (the picture it dissolves from).
   */
  function cover(shown: CanvasImageSource & { width: number; height: number }, zoom: number, gain: number, alpha = 1) {
    const scale = Math.max(WIDTH / shown.width, HEIGHT / shown.height) * zoom;
    const width = shown.width * scale;
    const height = shown.height * scale;
    const left = (WIDTH - width) / 2;
    const top = (HEIGHT - height) / 2;
    const filter = Math.abs(gain - 1) < 0.02 ? 'none' : `brightness(${gain.toFixed(3)})`;
    if (alpha >= 1) {
      picture.context.fillStyle = '#000';
      picture.context.fillRect(0, 0, WIDTH, HEIGHT);
    }
    picture.context.globalAlpha = alpha;
    picture.context.filter = filter;
    picture.context.drawImage(shown, left, top, width, height);
    picture.context.filter = 'none';
    picture.context.globalAlpha = 1;
  }

  /** One piece of the edit as it looks at `ms` of the song, drawn at `alpha` over what is there. */
  async function draw(segment: Segment, ms: number, alpha: number): Promise<Loaded> {
    const loaded = await keep(sources[segment.asset]);
    if (loaded.kind === 'photo') {
      const length = Math.max(1, segment.endMs - segment.atMs);
      const along = Math.min(1, Math.max(0, (ms - segment.atMs) / length));
      const [from, to] = segment.zoom;
      cover(loaded.image, from + (to - from) * along, loaded.gain ?? 1, alpha);
    } else {
      if (loaded.gain === undefined) {
        await loaded.motion.seek(Math.min(PROBE_CLIP_MS, loaded.motion.durationMs * 0.3));
        const probed = loaded.motion.texture.source.resource as HTMLCanvasElement;
        loaded.gain = exposureOf(probed);
        loaded.reference = referenceOf(probed, loaded.gain);
      }
      await loaded.motion.seek(clipMsAt(segment, ms));
      cover(loaded.motion.texture.source.resource as HTMLCanvasElement, 1, loaded.gain, alpha);
    }
    return loaded;
  }

  return {
    texture,
    durationMs: 15_000,
    direct(music, seed, durationMs, preset) {
      const key = `${seed}|${durationMs}|${music?.beatsMs.length ?? 0}|${music?.energy.length ?? 0}|${music?.accentsMs?.join(',') ?? ''}|${music?.pace ?? ''}|${assets.length}|${preset ? JSON.stringify(preset) : ''}|${music?.snaresMs?.length ?? 0}|${music?.hatsMs?.length ?? 0}|${music?.dropsMs?.join(',') ?? ''}`;
      if (key === plannedFor) return;
      segments = planReel(assets, music, seed, durationMs, preset?.rhythm);
      dissolveMs = preset?.dissolveMs ?? 0;
      plannedFor = key;
    },
    cutsMs: () => segments.slice(1).map(segment => segment.atMs),
    async seek(ms) {
      const segment = segmentAt(segments, ms);
      if (!segment) throw new Error('The reel has nothing to play.');
      const at = segments.indexOf(segment);
      const fading = dissolveMs > 0 && at > 0 && ms - segment.atMs < dissolveMs ? segments[at - 1] : null;
      // A dissolve draws the picture it leaves first, then this one over it, more of it each frame.
      if (fading) await draw(fading, ms, 1);
      const loaded = await draw(segment, ms, fading ? Math.max(0, (ms - segment.atMs) / dissolveMs) : 1);
      const reference = loaded.reference;
      if (reference) references.set(texture, { key: reelKey(sources[segment.asset]), canvas: reference });
      pictureSource.update();
      // Playing the reel (a poster is one look, playing is many): the pictures the next couple of seconds need are fetched ahead, so a first sight of a clip does not stall it.
      seeks += 1;
      if (seeks >= 2 && prefetching) {
        for (const ahead of segments) if (ahead.atMs > ms && ahead.atMs < ms + LOOK_AHEAD_MS) void keep(sources[ahead.asset]).catch(() => undefined);
      }
    },
    destroy() {
      // The pictures stay kept for the next card; only this reel's own canvases go.
      texture.destroy(true);
    },
  };
}
