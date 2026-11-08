import type { AdFont } from './ad-fonts';
import { wrapScreenText } from './daily-screens';

export { entrance, impactFrame, impactSignals } from './lyric-impact-motion';

/** Fit uppercase display copy into a max width using an OFL display face. */
export function wrapFit(
  ctx: Pick<CanvasRenderingContext2D, 'font' | 'measureText'>,
  value: string,
  font: AdFont,
  startSize: number,
  maxWidth: number,
  maxLines: number,
) {
  let size = startSize;
  let lines: string[] = [];
  do {
    ctx.font = `400 ${size}px "${font}"`;
    lines = wrapScreenText(ctx, value, maxWidth);
    if (lines.length <= maxLines && lines.every(line => ctx.measureText(line).width <= maxWidth)) break;
    if (size <= 28) break;
    size = Math.max(28, size - 6);
  } while (true);
  return { lines, size };
}
