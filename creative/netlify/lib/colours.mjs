import jpeg from 'jpeg-js';
import { describePixels, shrinkPixels } from '../../src/colour-read.mjs';

/** A photo larger than this many megapixels is not decoded (our library photos are 1080×1920, about 2). */
const MOST_MEGAPIXELS = 40;

/**
 * What a JPEG's colours are (`describePixels`: palette, lightness, saturation, contrast, hue, warmth), read from a 48×48 average of it
 * like a song's cover. Null when it cannot be decoded.
 */
export function jpegColours(bytes) {
  try {
    const { width, height, data } = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: MOST_MEGAPIXELS });
    return describePixels(shrinkPixels(data, width, height));
  } catch {
    return null;
  }
}
