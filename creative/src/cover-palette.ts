import type { SongCover } from './audio-format';
import { describePixels, type ColourRead } from './colour-read.mjs';

export { describePixels };

/**
 * What a cover says about a song's look, as numbers the brain can match against pictures (read like every library picture, `colour-read.mjs`).
 * Only these numbers leave this module: the picture itself is never stored or uploaded.
 */
export type CoverRead = ColourRead;

const SIZE = 48;

/** Decode the embedded picture and read it. Null if the browser cannot decode it. */
export async function describeCover(cover: SongCover | null): Promise<CoverRead | null> {
  if (!cover) return null;
  try {
    const bitmap = await createImageBitmap(new Blob([cover.data as BlobPart], { type: cover.mime }));
    try {
      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0, SIZE, SIZE);
      return describePixels(ctx.getImageData(0, 0, SIZE, SIZE).data);
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}
