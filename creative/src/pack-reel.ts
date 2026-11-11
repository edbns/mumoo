import { CanvasSource, Texture } from 'pixi.js';
import { HEIGHT, WIDTH, type ImpactMusic } from './composition';
import { loadMotion, type Motion } from './pack-motion';
import { clipMsAt, planReel, segmentAt, type ReelAsset, type Segment, type Shot } from './pack-director';

/**
 * A reel is a few pictures, clips and GIFs edited together by the Director (`pack-director.ts`) and drawn as one
 * picture that can be asked for any moment of the song. It is a `Motion` to the renderer: asking for `ms` puts that
 * moment of the edit onto its canvas, so the shelf preview and the cloud render draw the same frame.
 */
export type ReelSource = {
  /** The library item, for the cart and the cloud (which swaps the link for a fresh one it makes itself). */
  id: string;
  kind: 'photo' | 'clip';
  /** A link to the photo, or to the prepared clip. */
  url: string;
  /** A clip's shots, in ms of the clip. */
  shots?: readonly Shot[];
};

export type Reel = Motion & {
  /** Edits the reel to this music (once per music and seed). Call before `seek`; the milliseconds of `seek` are then those of the song. */
  direct(music: ImpactMusic | null, seed: number, durationMs: number): void;
};

type Loaded = { kind: 'photo'; image: ImageBitmap } | { kind: 'clip'; motion: Motion };

/**
 * Pictures already read, kept by library id: one card after another on the shelf draws from the same few, and each
 * is fetched once. A card draws only the pieces it plays; the rest are fetched in the background in the browser.
 */
const MAX_KEPT = 12;
const kept = new Map<string, Promise<Loaded>>();
let prefetching = true;

/** The cloud renders one short chunk per page, so it fetches only what that chunk plays. */
export function setReelPrefetch(on: boolean) {
  prefetching = on;
}

async function read(source: ReelSource): Promise<Loaded> {
  if (source.kind === 'clip') return { kind: 'clip', motion: await loadMotion(source.url) };
  const response = await fetch(source.url, { cache: 'no-store' }).catch(() => null);
  if (!response?.ok) throw new Error(`A picture of the reel could not be loaded${response ? ` (${response.status})` : ''}. Reload the page.`);
  const image = await createImageBitmap(await response.blob()).catch(() => null);
  if (!image) throw new Error('A picture of the reel could not be read.');
  return { kind: 'photo', image };
}

function release(loaded: Loaded) {
  if (loaded.kind === 'photo') loaded.image.close();
  else loaded.motion.destroy();
}

function keep(source: ReelSource): Promise<Loaded> {
  const have = kept.get(source.id);
  if (have) {
    kept.delete(source.id);
    kept.set(source.id, have);
    return have;
  }
  const loading = read(source);
  loading.catch(() => { if (kept.get(source.id) === loading) kept.delete(source.id); });
  kept.set(source.id, loading);
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
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable.');
  const source = new CanvasSource({ resource: canvas });
  const texture = new Texture({ source });
  const assets: ReelAsset[] = sources.map(item => (item.kind === 'photo' ? { kind: 'photo' } : { kind: 'clip', shots: item.shots ?? [[0, 6000]] }));

  let segments: Segment[] = [];
  let plannedFor = '';
  let warmed = false;

  /** Draws `picture` over the whole canvas the way a poster fills a frame, scaled up by `zoom` about the middle. */
  function cover(picture: CanvasImageSource & { width: number; height: number }, zoom: number) {
    const scale = Math.max(WIDTH / picture.width, HEIGHT / picture.height) * zoom;
    const width = picture.width * scale;
    const height = picture.height * scale;
    context!.fillStyle = '#000';
    context!.fillRect(0, 0, WIDTH, HEIGHT);
    context!.drawImage(picture, (WIDTH - width) / 2, (HEIGHT - height) / 2, width, height);
  }

  return {
    texture,
    durationMs: 15_000,
    direct(music, seed, durationMs) {
      const key = `${seed}|${durationMs}|${music?.beatsMs.length ?? 0}|${music?.energy.length ?? 0}|${assets.length}`;
      if (key === plannedFor) return;
      segments = planReel(assets, music ? { beatsMs: music.beatsMs, downbeatsMs: music.downbeatsMs, energy: music.energy } : null, seed, durationMs);
      plannedFor = key;
    },
    async seek(ms) {
      const segment = segmentAt(segments, ms);
      if (!segment) throw new Error('The reel has nothing to play.');
      const item = sources[segment.asset];
      const loaded = await keep(item);
      if (loaded.kind === 'photo') {
        const length = Math.max(1, segment.endMs - segment.atMs);
        const along = Math.min(1, Math.max(0, (ms - segment.atMs) / length));
        const [from, to] = segment.zoom;
        cover(loaded.image, from + (to - from) * along);
      } else {
        await loaded.motion.seek(clipMsAt(segment, ms));
        const frame = loaded.motion.texture.source.resource as HTMLCanvasElement;
        cover(frame, 1);
      }
      source.update();
      // The rest of the reel is fetched while this card is looked at, so playing it does not stall on a first sight of a clip.
      if (!warmed && prefetching) {
        warmed = true;
        for (const other of sources) void keep(other).catch(() => undefined);
      }
    },
    destroy() {
      // The pictures stay kept for the next card; only this reel's own canvas goes.
      texture.destroy(true);
    },
  };
}
