/**
 * Filter: the person's own photo through a live treatment that reacts to the beat. All four are MIT
 * pixi-filters / Pixi colour maths, so they run in the browser and in the cloud worker alike, and they
 * take their colours from the template's two-colour pair.
 */
import { ColorMatrixFilter, type Filter, type Sprite } from 'pixi.js';
import { AdvancedBloomFilter, DotFilter, RGBSplitFilter } from 'pixi-filters';
import { hexToRgb, luminance, type DustColors } from './dust-colors';

export const PHOTO_FILTERS = ['duotone', 'split', 'halftone', 'glow'] as const;
export type PhotoFilterId = (typeof PHOTO_FILTERS)[number];

export const PHOTO_FILTER_NAMES: Record<PhotoFilterId, string> = {
  duotone: 'Duotone',
  split: 'Split',
  halftone: 'Halftone',
  glow: 'Glow',
};

const LUMA = [0.2126, 0.7152, 0.0722];

/** A matrix that maps the picture's brightness onto a ramp from the darker of the two colours to the lighter. */
function duotoneMatrix(colors: DustColors, push: number): number[] {
  const [low, high] = luminance(colors.ground) <= luminance(colors.dust) ? [colors.ground, colors.dust] : [colors.dust, colors.ground];
  const ground = hexToRgb(low);
  const light = hexToRgb(high);
  const rows: number[] = [];
  for (let channel = 0; channel < 3; channel++) {
    const span = (light[channel] - ground[channel]) * push;
    rows.push(...LUMA.map(weight => weight * span), 0, ground[channel]);
  }
  return [...rows, 0, 0, 0, 1, 0];
}

export type PhotoFilters = {
  /** Treat `sprite` for this moment. */
  apply(sprite: Sprite, id: PhotoFilterId, beat: number, colors: DustColors): void;
  destroy(): void;
};

export function createPhotoFilters(): PhotoFilters {
  const duotone = new ColorMatrixFilter();
  const split = new RGBSplitFilter({ red: { x: 0, y: 0 }, green: { x: 0, y: 0 }, blue: { x: 0, y: 0 } });
  const halftone = new DotFilter({ scale: 1, angle: 5, grayscale: true });
  const glow = new AdvancedBloomFilter({ threshold: 0.65, bloomScale: 0.4, brightness: 1, blur: 6, quality: 4 });
  const all: Filter[] = [duotone, split, halftone, glow];

  return {
    apply(sprite, id, beat, colors) {
      if (id === 'duotone') {
        duotone.matrix = duotoneMatrix(colors, 0.9 + 0.25 * beat) as ColorMatrixFilter['matrix'];
        sprite.filters = [duotone];
      } else if (id === 'split') {
        // The colour channels jump apart on the hit and settle back between beats.
        const apart = 3 + 26 * beat;
        split.red = { x: -apart, y: apart * 0.3 };
        split.blue = { x: apart, y: -apart * 0.3 };
        sprite.filters = [split];
      } else if (id === 'halftone') {
        // Black-and-white dots, then coloured by the pair, so the halftone is in the template's colours.
        halftone.scale = 0.9 + 0.5 * beat;
        duotone.matrix = duotoneMatrix(colors, 1) as ColorMatrixFilter['matrix'];
        sprite.filters = [halftone, duotone];
      } else {
        glow.bloomScale = 0.4 + 1.2 * beat;
        sprite.filters = [glow];
      }
    },
    destroy() {
      for (const filter of all) filter.destroy();
    },
  };
}
