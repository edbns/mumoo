import { CanvasSource, Texture } from 'pixi.js';
import { fetchFresh } from './fetch-fresh';

/**
 * A person's own video or GIF, as a picture that can be asked for any moment (which moment is the edit's
 * decision, see `pack-cuts.ts`). Found by seeking, so the shelf preview and the cloud render draw the same
 * frame. Each frame is copied onto a canvas, which is the texture.
 */
export type Motion = {
  texture: Texture;
  /** How long the video is. */
  durationMs: number;
  /**
   * The video's picture at `ms` of the video is now in `texture`. `rate`: how fast the edit plays the video here (a
   * velocity edit speeds it up and slows it down); while live the video is run at that speed, so it is not sought every frame.
   * `exact`: the very frame is found and waited for even while live (a clip's light is read from one frame, the same every time).
   */
  seek(ms: number, rate?: number, exact?: boolean): Promise<void>;
  /** While live, gets the video to `ms` ahead of time (a cut to it is coming), without drawing or waiting. */
  cue(ms: number): void;
  /** Whether `texture` holds a frame of the video yet (a streamed video has none until its first frame is in). */
  ready(): boolean;
  destroy(): void;
};

/** The cloud's software decoder can take over a second for one frame of a busy clip; a seek given up on draws the frame before it. */
const SEEK_TIMEOUT_MS = 4000;
/** A streamed video finds a frame over the network: when the exact frame is needed it is given this long. */
const STREAM_SEEK_TIMEOUT_MS = 8000;
/** How wide a streamed video's frames are kept. */
const STREAM_W = 540;
/** How long a streamed video may take to say what it is, before it is given up (and asked for again the next time it is needed). */
const STREAM_LOAD_TIMEOUT_MS = 20_000;
/** While a card plays live, its video plays by itself and is only moved when it is this far from the moment asked for. */
const LIVE_DRIFT_S = 0.2;
/** While live, a frame waits this long at most for its video to get to the moment asked for; then it goes on, and the video catches up. */
const LIVE_WAIT_MS = 120;
/** A live video that got to its moment this late (in seconds of video) is left that far behind, not moved again; later than this it is moved again. */
const LIVE_SLIP_MAX_S = 1;
/** A playing video nobody has asked for a frame for this long (another clip of the reel is on) is paused. */
const LIVE_IDLE_MS = 300;

let live = false;

/**
 * The shelf's live preview: videos play on their own and frames are taken as they come, so playback never waits on a
 * seek. Posters and the cloud render (off) find every frame exactly.
 */
export function setMotionLive(on: boolean) {
  live = on;
}

export const motionLive = () => live;

/** A video's file, fetched. */
async function motionFile(url: string): Promise<Blob> {
  const response = await fetchFresh(url);
  if (!response?.ok) throw new Error(`Your video could not be loaded${response ? ` (${response.status})` : ''}. Reload the page, or go back to our photography.`);
  return response.blob();
}

/**
 * `streamed`: the video is played from its link, so only the parts shown are downloaded (the shelf, where a card plays a
 * few seconds of each of many long clips). Otherwise the whole file is fetched first, and every frame is found exactly and at once.
 */
export async function loadMotion(url: string, streamed = false): Promise<Motion> {
  const link = streamed ? url : URL.createObjectURL(await motionFile(url));
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  // The frames are copied to a canvas, which storage must allow by name.
  if (streamed) video.crossOrigin = 'anonymous';
  // A streamed clip is the small copy (a few MB): the browser fetches ahead of what plays, so the card does not stall on the network.
  video.preload = 'auto';
  const close = () => {
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (!streamed) URL.revokeObjectURL(link);
  };
  video.src = link;
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = streamed ? window.setTimeout(() => reject(new Error('Your video took too long to load. Reload the page.')), STREAM_LOAD_TIMEOUT_MS) : 0;
      const loaded = () => { clearTimeout(timer); resolve(); };
      if (streamed) video.onloadedmetadata = loaded;
      else video.onloadeddata = loaded;
      video.onerror = () => { clearTimeout(timer); reject(new Error('Your video could not be read.')); };
    });
  } catch (cause) {
    close();
    throw cause;
  }
  const canvas = document.createElement('canvas');
  // A streamed video is only ever shown small (a card on the shelf).
  const shrink = streamed ? Math.min(1, STREAM_W / video.videoWidth) : 1;
  canvas.width = Math.round(video.videoWidth * shrink);
  canvas.height = Math.round(video.videoHeight * shrink);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable.');
  const source = new CanvasSource({ resource: canvas });
  const texture = new Texture({ source });
  let idle = 0;
  let drawn = false;
  let landed: (() => void) | null = null;
  /** A live move in flight: when it was asked for. Zero when there is none (or it was a cue, which nothing waits behind). */
  let chasingSince = 0;
  /** How far behind the edit (seconds of video, negative) the last live move left the video: kept, not chased. */
  let slip = 0;
  video.onseeked = () => {
    if (chasingSince) {
      const late = ((performance.now() - chasingSince) / 1000) * video.playbackRate;
      slip = late <= LIVE_SLIP_MAX_S ? -late : 0;
      chasingSince = 0;
    }
    landed?.();
    landed = null;
  };
  const moveTo = (at: number, wait: number) => new Promise<void>(resolve => {
    // A seek the browser never reports done would stop the card for good; after a moment it goes on with the frame it has.
    const timer = setTimeout(resolve, wait);
    landed = () => { clearTimeout(timer); resolve(); };
    video.currentTime = at;
  });
  const copy = () => {
    if (video.readyState < 2 || video.seeking) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    source.update();
    drawn = true;
  };

  return {
    texture,
    durationMs: Math.round(video.duration * 1000),
    async seek(ms, rate = 1, exact = false) {
      const at = Math.min(Math.max(0, ms / 1000), Math.max(0, video.duration - 0.05));
      clearTimeout(idle);
      if (live && !exact) {
        if (video.playbackRate !== rate) video.playbackRate = rate;
        // The video is moved only when it is somewhere else (a cut to another shot); one move at a time, and no frame waits long for it.
        if (!video.seeking && Math.abs(video.currentTime - at - slip) > LIVE_DRIFT_S) {
          slip = 0;
          chasingSince = performance.now();
          await moveTo(at, LIVE_WAIT_MS);
        }
        if (video.paused) void video.play().catch(() => undefined);
        idle = window.setTimeout(() => video.pause(), LIVE_IDLE_MS);
        copy();
        return;
      }
      slip = 0;
      chasingSince = 0;
      if (!video.paused) video.pause();
      if (video.seeking || Math.abs(video.currentTime - at) > 0.0005 || video.readyState < 2) await moveTo(at, streamed ? STREAM_SEEK_TIMEOUT_MS : SEEK_TIMEOUT_MS);
      if (streamed) copy();
      else {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        source.update();
        drawn = true;
      }
    },
    cue(ms) {
      if (!live || !video.paused || video.seeking) return;
      const at = Math.min(Math.max(0, ms / 1000), Math.max(0, video.duration - 0.05));
      if (Math.abs(video.currentTime - at) <= LIVE_DRIFT_S) return;
      slip = 0;
      chasingSince = 0;
      video.currentTime = at;
    },
    ready: () => drawn,
    destroy() {
      clearTimeout(idle);
      texture.destroy(true);
      close();
    },
  };
}
