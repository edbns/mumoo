import type { AdFont } from './ad-fonts';
import { wrapFit } from './ad-punch-fit';

/** Shared 2D context used only for text metrics — never the design surface. */
let measureCtx: CanvasRenderingContext2D | null = null;

export function textMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx) {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Text metrics are unavailable.');
    measureCtx = ctx;
  }
  return measureCtx;
}

export function fitPackLines(
  value: string,
  font: AdFont,
  startSize: number,
  maxWidth: number,
  maxLines: number,
) {
  return wrapFit(textMeasureCtx(), value, font, startSize, maxWidth, maxLines);
}
