import { cssFont, displayFace, type AdFont } from './ad-fonts';

/** Wrap text to a pixel width, breaking inside a word (by grapheme) only when a single word is too wide. */
export function wrapScreenText(ctx: Pick<CanvasRenderingContext2D, 'measureText'>, value: string, width: number): string[] {
  const lines: string[] = []; let current = '';
  for (const word of value.split(' ')) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= width) { current = next; continue; }
    if (current) { lines.push(current); current = ''; }
    const graphemes = typeof Intl.Segmenter === 'function'
      ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(word), segment => segment.segment)
      : [word];
    for (const character of graphemes) {
      if (current && ctx.measureText(current + character).width > width) { lines.push(current); current = ''; }
      current += character;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Fit display copy into a max width using one of the bundled display faces. */
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
    ctx.font = cssFont(displayFace(font), size);
    lines = wrapScreenText(ctx, value, maxWidth);
    if (lines.length <= maxLines && lines.every(line => ctx.measureText(line).width <= maxWidth)) break;
    if (size <= 28) break;
    size = Math.max(28, size - 6);
  } while (true);
  return { lines, size };
}
