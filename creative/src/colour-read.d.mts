/** What a picture's colours say, as numbers the brain can compare. */
export interface ColourRead {
  /** Dominant colors, largest first. `share` sums to 1. */
  palette: { hex: string; share: number }[];
  /** 0 black … 1 white (perceived brightness). */
  lightness: number;
  /** 0 grey … 1 fully saturated (ignores near-black noise). */
  saturation: number;
  /** 0 flat … 1 stark light/dark split. */
  contrast: number;
  /** Dominant hue in degrees 0–359, or null when the picture is essentially black/white/grey. */
  hue: number | null;
  /** 0 cool (blues, greens, purples) … 1 warm (reds, oranges, yellows). 0.5 when there is no colour. */
  warmth: number;
}

export function describePixels(rgba: ArrayLike<number>): ColourRead | null;
export function shrinkPixels(rgba: ArrayLike<number>, width: number, height: number, size?: number): Uint8ClampedArray;
