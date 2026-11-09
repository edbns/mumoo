import { CanvasSource, Texture } from 'pixi.js';

/**
 * A person's own video or GIF, as a picture that can be asked for any moment (which moment is the edit's
 * decision, see `pack-cuts.ts`). Found by seeking, so the shelf preview and the cloud render draw the same
 * frame. Each frame is copied onto a canvas, which is the texture.
 */
export type Motion = {
  texture: Texture;
  /** How long the video is. */
  durationMs: number;
  /** The video's picture at `ms` of the video is now in `texture`. */
  seek(ms: number): Promise<void>;
  destroy(): void;
};

export async function loadMotion(url: string): Promise<Motion> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Your video could not be loaded.');
  const link = URL.createObjectURL(await response.blob());
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

  return {
    texture,
    durationMs: Math.round(video.duration * 1000),
    async seek(ms) {
      const at = Math.min(Math.max(0, ms / 1000), Math.max(0, video.duration - 0.05));
      if (Math.abs(video.currentTime - at) > 0.0005 || video.readyState < 2) {
        await new Promise<void>(resolve => {
          video.onseeked = () => resolve();
          video.currentTime = at;
        });
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      source.update();
    },
    destroy() {
      texture.destroy(true);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(link);
    },
  };
}
