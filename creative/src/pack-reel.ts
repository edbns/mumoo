import { CanvasSource, Texture } from 'pixi.js';
import { HEIGHT, WIDTH, type ImpactMusic } from './composition';
import { fetchFresh } from './fetch-fresh';
import { loadMotion, motionLive, type Motion } from './pack-motion';
import { REFERENCE_H, REFERENCE_W, references } from './pack-palette';
import { clipMsAt, clipRateAt, planReel, segmentAt, type ReelAsset, type Segment, type Shot } from './pack-director';
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
  /** A link to a still of the clip. The shelf gives it (see `setReelPreview`); the cloud never does. */
  poster?: string;
  /** A link to the same clip, small (same frames at the same times): what the shelf streams when it has one. The cloud never does. */
  small?: string;
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
/** `streamedAt`: when a clip played from its link was read (the link stops working after a while). */
type Loaded = ({ kind: 'photo'; image: ImageBitmap } | { kind: 'clip'; motion: Motion; streamedAt?: number }) & Exposure;
/** A clip's poster, small, with how it is brightened when the clip itself has not been read. */
type Still = { image: ImageBitmap } & Required<Exposure>;

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
const MAX_KEPT = 16;
/** On the shelf fewer: a kept clip there is a video player of its own, and one card plays eight pictures at most. */
const MAX_KEPT_PREVIEW = 10;
/** The reel's own picture on the shelf, where a card is a few hundred pixels wide: a quarter of the pixels to copy and send to the GPU each frame. */
const PREVIEW_SCALE = 0.5;
const LOOK_AHEAD_MS = 2500;
/** How long before its cut a still video is got to the frame the cut opens on. */
const CUE_AHEAD_MS = 600;
/** A clip played from its link finds that frame over the network, so it is asked earlier. */
const STREAM_CUE_AHEAD_MS = 1500;
const kept = new Map<string, Promise<Loaded>>();
/** The kept pictures that are in, by key, for what must be asked without waiting. */
const arrived = new Map<string, Loaded>();
let prefetching = true;

/** The cloud renders one short chunk per page, so it fetches only what that chunk plays. */
export function setReelPrefetch(on: boolean) {
  prefetching = on;
}

async function fetched(url: string, what: string): Promise<Blob> {
  const response = await fetchFresh(url);
  if (!response?.ok) throw new Error(`${what} could not be loaded${response ? ` (${response.status})` : ''}. Reload the page.`);
  return response.blob();
}

/**
 * On the shelf, the files of photos and posters (never clips: these are small) are kept by their link without its signature:
 * the pictures of all the cards are fetched side by side before the cards are drawn one by one, and one read again is not fetched again.
 */
const MAX_FILES = 256;
const files = new Map<string, Promise<Blob>>();

function fileOf(url: string, what: string): Promise<Blob> {
  if (!preview) return fetched(url, what);
  const key = url.split('?')[0];
  const have = files.get(key);
  if (have) return have;
  const loading = fetched(url, what);
  loading.catch(() => { if (files.get(key) === loading) files.delete(key); });
  files.set(key, loading);
  if (files.size > MAX_FILES) files.delete(files.keys().next().value!);
  return loading;
}

async function bitmapOf(url: string, what: string): Promise<ImageBitmap> {
  const image = await createImageBitmap(await fileOf(url, what)).catch(() => null);
  if (!image) throw new Error(`${what} could not be read.`);
  return image;
}

/**
 * The shelf (`creatives-pack-studio.tsx`) turns this on; the cloud never does. A shelf of twenty cards plays a few
 * seconds each of some hundred long clips, far too much to download before a card is shown. So on the shelf:
 * a still card is drawn from each clip's poster, not the clip; a clip is read only when its card plays, from its link
 * (only the parts shown are downloaded), a few at a time; and until it is in, the card plays on over its poster.
 */
let preview = false;
export function setReelPreview(on: boolean) {
  preview = on;
}

/** The links of every picture as the shelf last gave them: links are renewed while pictures stay kept by `reelKey`. */
const links = new Map<string, ReelSource>();
export function noteLinks(sources: readonly ReelSource[]) {
  for (const source of sources) links.set(reelKey(source), source);
}
const linked = (source: ReelSource) => links.get(reelKey(source)) ?? source;

/** How each clip is brightened, by `reelKey`: read once from the clip, so one read again (after it was given back) is not sought twice. */
const MAX_EXPOSURES = 256;
const exposures = new Map<string, Required<Exposure>>();

/** Clips played from their links are read this many at a time; the ones of the card that plays (`wanted`) go first. */
const STREAMS_AT_ONCE = 3;
/** A link works for 15 minutes; a clip streamed from one older than this is read again from the link the shelf has now. */
const LINK_GOOD_MS = 10 * 60_000;
let streaming = 0;
let wanted = new Set<string>();
const waiting: { key: string; go: () => void }[] = [];

function turn(key: string): Promise<void> {
  if (streaming < STREAMS_AT_ONCE) {
    streaming += 1;
    return Promise.resolve();
  }
  return new Promise(resolve => waiting.push({ key, go: resolve }));
}

function turnOver() {
  const first = waiting.findIndex(item => wanted.has(item.key));
  const [next] = waiting.splice(Math.max(0, first), 1);
  if (next) next.go();
  else streaming -= 1;
}

async function read(source: ReelSource): Promise<Loaded> {
  const key = reelKey(source);
  if (source.kind === 'clip') {
    const streamed = preview;
    if (streamed) await turn(key);
    try {
      const link = linked(source);
      const motion = await loadMotion(streamed ? link.small ?? link.url : link.url, streamed);
      try {
        let exposure = exposures.get(key);
        if (!exposure) {
          await motion.seek(Math.min(PROBE_CLIP_MS, motion.durationMs * 0.3), 1, true);
          // A streamed clip whose frame never came is not judged by an empty picture: it is asked for again the next time it is needed.
          if (!motion.ready()) throw new Error('A video of the reel took too long to load. Reload the page.');
          const probed = motion.texture.source.resource as HTMLCanvasElement;
          const gain = exposureOf(probed);
          exposure = { gain, reference: referenceOf(probed, gain) };
          exposures.set(key, exposure);
          if (exposures.size > MAX_EXPOSURES) exposures.delete(exposures.keys().next().value!);
        }
        return { kind: 'clip', motion, ...(streamed ? { streamedAt: Date.now() } : {}), ...exposure };
      } catch (cause) {
        motion.destroy();
        throw cause;
      }
    } finally {
      if (streamed) turnOver();
    }
  }
  const image = await bitmapOf(linked(source).url, 'A picture of the reel');
  const gain = exposureOf(image);
  const reference = referenceOf(image, gain);
  return { kind: 'photo', image, gain, reference };
}

/** Posters read into pictures, for the cards being drawn and the card that plays; their files stay in `files`. */
const MAX_STILLS = 16;
const STILL_W = 540;
const stills = new Map<string, Promise<Still>>();

/** A clip's poster, read once and kept small (a card on the shelf is a few hundred pixels wide). */
function stillOf(source: ReelSource): Promise<Still> {
  const key = reelKey(source);
  const have = stills.get(key);
  if (have) {
    stills.delete(key);
    stills.set(key, have);
    return have;
  }
  const loading = (async () => {
    const full = await bitmapOf(linked(source).poster ?? '', 'A picture of the reel');
    const image = full.width > STILL_W
      ? await createImageBitmap(full, { resizeWidth: STILL_W, resizeHeight: Math.round((full.height * STILL_W) / full.width), resizeQuality: 'medium' })
      : full;
    if (image !== full) full.close();
    const gain = exposureOf(image);
    return { image, gain, reference: referenceOf(image, gain) };
  })();
  loading.catch(() => { if (stills.get(key) === loading) stills.delete(key); });
  stills.set(key, loading);
  while (stills.size > MAX_STILLS) {
    const [oldest] = stills.keys();
    const gone = stills.get(oldest)!;
    stills.delete(oldest);
    void gone.then(still => still.image.close(), () => undefined);
  }
  return loading;
}

const loadedNow = (source: ReelSource) => arrived.get(reelKey(source));

function release(loaded: Loaded) {
  for (const [key, value] of arrived) if (value === loaded) arrived.delete(key);
  if (loaded.kind === 'photo') loaded.image.close();
  else loaded.motion.destroy();
}

function keep(source: ReelSource): Promise<Loaded> {
  const key = reelKey(source);
  const have = kept.get(key);
  const old = arrived.get(key);
  if (have && old?.kind === 'clip' && old.streamedAt && Date.now() - old.streamedAt > LINK_GOOD_MS) {
    kept.delete(key);
    release(old);
  } else if (have) {
    kept.delete(key);
    kept.set(key, have);
    return have;
  }
  const loading = read(source);
  loading.then(loaded => { if (kept.get(key) === loading) arrived.set(key, loaded); }, () => { if (kept.get(key) === loading) kept.delete(key); });
  kept.set(key, loading);
  while (kept.size > (preview ? MAX_KEPT_PREVIEW : MAX_KEPT)) {
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
  for (const loading of stills.values()) void loading.then(still => still.image.close(), () => undefined);
  stills.clear();
  files.clear();
  exposures.clear();
  links.clear();
}

/**
 * Reads every picture of the reel that is about to play, in the order it opens on them, ahead of the clips of any card played before.
 * Settles when all are in (or failed: the card says so when it draws).
 */
export async function preloadReel(sources: readonly ReelSource[]): Promise<void> {
  noteLinks(sources);
  wanted = new Set(sources.map(reelKey));
  // On the shelf every clip's poster first (small, side by side): a cut to a clip that is not in yet shows it at once.
  if (preview) for (const source of sources) if (source.kind === 'clip' && source.poster) void stillOf(source).catch(() => undefined);
  await Promise.all(sources.map(source => keep(source).catch(() => undefined)));
}

/** The pictures a card opens on, read before it plays: then it starts on moving pictures, not on posters. */
const HEAD_START = 3;
const HEAD_START_MOST_MS = 4000;

/**
 * Like `preloadReel`, but settles once the first pictures the reel opens on are in (or after a few seconds at most, or when
 * `stillWanted` says the card is no longer the one to play): the card then starts. The rest go on being read.
 */
export async function readyToPlay(sources: readonly ReelSource[], stillWanted: () => boolean): Promise<void> {
  void preloadReel(sources);
  const first = sources.slice(0, HEAD_START).map(source => keep(source).catch(() => undefined));
  let waited: ReturnType<typeof setTimeout> | undefined;
  let polled: ReturnType<typeof setInterval> | undefined;
  await Promise.race([
    Promise.all(first),
    new Promise<void>((resolve) => { waited = setTimeout(resolve, HEAD_START_MOST_MS); }),
    new Promise<void>((resolve) => { polled = setInterval(() => { if (!stillWanted()) resolve(); }, 100); }),
  ]);
  clearTimeout(waited);
  clearInterval(polled);
}

const assetsOf = (sources: readonly ReelSource[]): ReelAsset[] =>
  sources.map(item => (item.kind === 'photo' ? { kind: 'photo' } : { kind: 'clip', shots: item.shots ?? [[0, 6000]] }));

/**
 * Fetches, side by side, the files a still card of each of these reels is drawn from: the one picture (two in a dissolve) on at `ms` of its
 * edit. The cards are drawn one after another, and none then waits on the network. Never fails: a card says what it could not read when it is drawn.
 */
export async function warmStills(cards: readonly { sources: readonly ReelSource[]; ms: number; music: ImpactMusic | null; seed: number; durationMs: number; preset?: { rhythm: PresetRhythm; dissolveMs: number } }[]): Promise<void> {
  await Promise.all(cards.flatMap((card) => {
    noteLinks(card.sources);
    const segments = planReel(assetsOf(card.sources), card.music, card.seed, card.durationMs, card.preset?.rhythm);
    const segment = segmentAt(segments, card.ms);
    if (!segment) return [];
    const at = segments.indexOf(segment);
    const fading = card.preset?.dissolveMs && at > 0 && card.ms - segment.atMs < card.preset.dissolveMs ? [segments[at - 1]] : [];
    return [segment, ...fading].map((piece) => {
      const source = card.sources[piece.asset];
      const url = source.kind === 'photo' ? source.url : source.poster;
      return url ? fileOf(url, 'A picture of the reel').catch(() => undefined) : undefined;
    });
  }));
}

export async function loadReel(sources: readonly ReelSource[]): Promise<Reel> {
  if (sources.length < 1) throw new Error('A reel needs at least one picture.');
  const scale = preview ? PREVIEW_SCALE : 1;
  const surface = () => {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH * scale;
    canvas.height = HEIGHT * scale;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable.');
    // Everything is drawn in the frame's own measures, whatever the canvas holds.
    context.scale(scale, scale);
    return { canvas, context };
  };
  const picture = surface();
  const pictureSource = new CanvasSource({ resource: picture.canvas, resolution: scale });
  const texture = new Texture({ source: pictureSource });
  const assets = assetsOf(sources);

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

  /** One piece of the edit as it looks at `ms` of the song, drawn at `alpha` over what is there. Answers how the picture drawn is brightened. */
  async function draw(segment: Segment, ms: number, alpha: number): Promise<Exposure> {
    const source = linked(sources[segment.asset]);
    if (preview && source.kind === 'clip' && source.poster) {
      // On the shelf a clip is read only for the card that plays, and the card does not wait for it: until its first frame is in, its poster is shown.
      const live = motionLive();
      if (live) void keep(source).catch(() => undefined);
      const clip = live ? loadedNow(source) : undefined;
      if (clip?.kind === 'clip') {
        await clip.motion.seek(clipMsAt(segment, ms), clipRateAt(segment, ms));
        if (clip.motion.ready()) {
          cover(clip.motion.texture.source.resource as HTMLCanvasElement, 1, clip.gain ?? 1, alpha);
          return clip;
        }
      }
      const still = await stillOf(source).catch(() => null);
      if (still) {
        const exposure = exposures.get(reelKey(source)) ?? still;
        cover(still.image, 1, exposure.gain, alpha);
        return exposure;
      }
    }
    const loaded = await keep(source);
    if (loaded.kind === 'photo') {
      const length = Math.max(1, segment.endMs - segment.atMs);
      const along = Math.min(1, Math.max(0, (ms - segment.atMs) / length));
      const [from, to] = segment.zoom;
      cover(loaded.image, from + (to - from) * along, loaded.gain ?? 1, alpha);
    } else {
      await loaded.motion.seek(clipMsAt(segment, ms), clipRateAt(segment, ms));
      cover(loaded.motion.texture.source.resource as HTMLCanvasElement, 1, loaded.gain ?? 1, alpha);
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
      // The next cut's clip, when it is another video sitting still, is got to its first frame now, so the cut does not wait on a seek.
      const next = segments[at + 1];
      if (next && next.asset !== segment.asset && next.atMs - ms < (preview ? STREAM_CUE_AHEAD_MS : CUE_AHEAD_MS)) {
        const ahead = loadedNow(sources[next.asset]);
        if (ahead?.kind === 'clip') ahead.motion.cue(clipMsAt(next, next.atMs));
      }
      if (seeks >= 2 && prefetching && (!preview || motionLive())) {
        for (const ahead of segments) if (ahead.atMs > ms && ahead.atMs < ms + LOOK_AHEAD_MS) void keep(sources[ahead.asset]).catch(() => undefined);
      }
    },
    cue() {},
    ready: () => true,
    destroy() {
      // The pictures stay kept for the next card; only this reel's own canvases go.
      texture.destroy(true);
    },
  };
}
