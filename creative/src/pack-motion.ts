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
   */
  seek(ms: number, rate?: number): Promise<void>;
  /** While live, gets the video to `ms` ahead of time (a cut to it is coming), without drawing or waiting. */
  cue(ms: number): void;
  destroy(): void;
};

const SEEK_TIMEOUT_MS = 1500;
/** While a card plays live, its video plays by itself and is only moved when it is this far from the moment asked for. */
const LIVE_DRIFT_S = 0.2;
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

/** A video's file, fetched. */
export async function motionFile(url: string): Promise<Blob> {
  const response = await fetchFresh(url);
  if (!response?.ok) throw new Error(`Your video could not be loaded${response ? ` (${response.status})` : ''}. Reload the page, or go back to our photography.`);
  return response.blob();
}

/** `from`: the video's link, or its file already fetched. */
export async function loadMotion(from: string | Blob): Promise<Motion> {
  const link = URL.createObjectURL(typeof from === 'string' ? await motionFile(from) : from);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = link;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error('Your video could not be read.'));
  });
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable.');
  const source = new CanvasSource({ resource: canvas });
  const texture = new Texture({ source });
  let idle = 0;
  const moveTo = (at: number) => new Promise<void>(resolve => {
    // A seek the browser never reports done would stop the card for good; after a moment it goes on with the frame it has.
    const timer = setTimeout(resolve, SEEK_TIMEOUT_MS);
    video.onseeked = () => { clearTimeout(timer); resolve(); };
    video.currentTime = at;
  });

  return {
    texture,
    durationMs: Math.round(video.duration * 1000),
    async seek(ms, rate = 1) {
      const at = Math.min(Math.max(0, ms / 1000), Math.max(0, video.duration - 0.05));
      clearTimeout(idle);
      if (live) {
        if (video.playbackRate !== rate) video.playbackRate = rate;
        if (Math.abs(video.currentTime - at) > LIVE_DRIFT_S || video.readyState < 2) await moveTo(at);
        if (video.paused) void video.play().catch(() => undefined);
        idle = window.setTimeout(() => video.pause(), LIVE_IDLE_MS);
      } else {
        if (!video.paused) video.pause();
        if (Math.abs(video.currentTime - at) > 0.0005 || video.readyState < 2) await moveTo(at);
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      source.update();
    },
    cue(ms) {
      if (!live || !video.paused || video.seeking) return;
      const at = Math.min(Math.max(0, ms / 1000), Math.max(0, video.duration - 0.05));
      if (Math.abs(video.currentTime - at) > LIVE_DRIFT_S) video.currentTime = at;
    },
    destroy() {
      clearTimeout(idle);
      video.pause();
      texture.destroy(true);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(link);
    },
  };
}
