import { FPS, FRAMES, HEIGHT, WIDTH, type LyricCue } from './composition';

type ScreenLine = { text: string; startFrame: number; active: boolean };
// Cues in the final fractional frame are shown on the last available frame.
const firstFrame = (ms: number) => Math.min(FRAMES - 1, Math.ceil(ms * FPS / 1000));

// Each displayed character comes from an approved cue. Punctuation and gaps
// establish a new message; no words, names or conversation are invented.
export function dailyScreenFrame(cues: readonly LyricCue[], frame: number): { lines: ScreenLine[] } {
  const lines: ScreenLine[] = [];
  let current = ''; let startFrame = 0; let previous: LyricCue | undefined;
  for (const cue of cues) {
    if (firstFrame(cue.startMs) > frame) break;
    const startsLine = !previous || cue.startMs - previous.endMs > 450 || /[.!?。！？]$/u.test(previous.text) || [...`${current} ${cue.text}`].length > 32;
    if (startsLine) {
      if (current) lines.push({ text: current, startFrame, active: false });
      current = cue.text; startFrame = firstFrame(cue.startMs);
    } else current += ` ${cue.text}`;
    previous = cue;
  }
  if (current) lines.push({ text: current, startFrame, active: true });
  return { lines: lines.slice(-4) };
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'left') {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(value, x, y);
}

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

export function layoutScreenLines(ctx: Pick<CanvasRenderingContext2D, 'measureText'>, lines: readonly ScreenLine[]) {
  const items = lines.map(line => {
    const wrapped = wrapScreenText(ctx, line.text, 670);
    return { line, wrapped, height: wrapped.length * 63 + 35, y: 0 };
  });
  // Keep the newest lines visible and reserve space for the entrance motion.
  while (items.length > 1 && items.reduce((sum, item) => sum + item.height + 24, 485) - 24 > 1536) items.shift();
  let y = 485;
  for (const item of items) { item.y = y; y += item.height + 24; }
  return items;
}

/** Draw a neutral, original messaging surface. Preview and export call this
 * exact frame function; the source screenshots are not included as assets. */
export function drawDailyScreen(canvas: HTMLCanvasElement, cues: readonly LyricCue[], frame: number) {
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas is unavailable.');
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#fbfaf9'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  // Fixed safe area keeps all interface elements clear of platform overlays.
  text(ctx, '9:41', 135, 130, '600 36px "Inter Variable"', '#1c2028');
  rounded(ctx, 800, 114, 18, 26, 5, '#1c2028');
  rounded(ctx, 826, 104, 18, 36, 5, '#1c2028');
  rounded(ctx, 852, 94, 18, 46, 5, '#1c2028');
  rounded(ctx, 895, 104, 58, 32, 9, '#1c2028');
  rounded(ctx, 901, 110, 43, 20, 4, '#fbfaf9');
  text(ctx, '‹', 132, 240, '300 78px "Inter Variable"', '#416fc8');
  ctx.fillStyle = '#e7e9ef'; ctx.beginPath(); ctx.arc(WIDTH / 2, 219, 47, 0, Math.PI * 2); ctx.fill();
  text(ctx, '♪', WIDTH / 2, 220, '500 42px "Inter Variable"', '#6c7384', 'center');
  text(ctx, 'Lyrics', WIDTH / 2, 295, '600 34px "Inter Variable"', '#242833', 'center');
  ctx.fillStyle = '#e5e5e8'; ctx.fillRect(0, 335, WIDTH, 2);
  text(ctx, 'NOW PLAYING', WIDTH / 2, 405, '600 22px "Inter Variable"', '#979ba4', 'center');
  const { lines } = dailyScreenFrame(cues, frame);
  ctx.font = '400 48px "Inter Variable"';
  for (const { line, wrapped, height: h, y } of layoutScreenLines(ctx, lines)) {
    const w = Math.max(125, Math.min(760, Math.max(...wrapped.map(part => ctx.measureText(part).width)) + 60));
    const enter = Math.min(1, Math.max(0, (frame - line.startFrame + 1) / 5));
    const offset = (1 - enter) * 14;
    rounded(ctx, WIDTH - 115 - w, y + offset, w, h, 35, '#3d71cf');
    for (let i = 0; i < wrapped.length; i++) text(ctx, wrapped[i], WIDTH - 85 - w, y + offset + 49 + 63 * i, '400 48px "Inter Variable"', '#ffffff');
  }
  // The input bar is visual framing, not an invented message or interaction.
  rounded(ctx, 106, 1620, 868, 90, 45, '#ffffff');
  ctx.strokeStyle = '#dfdfe5'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(106, 1620, 868, 90, 45); ctx.stroke();
  text(ctx, 'Lyrics', 147, 1665, '400 31px "Inter Variable"', '#9b9da6');
  ctx.fillStyle = '#252a35'; ctx.beginPath(); ctx.arc(916, 1665, 17, 0, Math.PI * 2); ctx.fill();
  rounded(ctx, 398, 1792, 284, 9, 5, '#1f222a');
}
