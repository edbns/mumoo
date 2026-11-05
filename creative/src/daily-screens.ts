import { FPS, FRAMES, HEIGHT, WIDTH, type DailyScreenVariant, type LyricCue } from './composition';

export const SCREEN_DESIGNS: readonly { id: DailyScreenVariant; name: string }[] = [
  { id: 'messages', name: 'Messages' }, { id: 'whatsapp', name: 'WhatsApp' },
  { id: 'telegram', name: 'Telegram' }, { id: 'messenger', name: 'Messenger' },
  { id: 'instagram', name: 'Instagram' },
];
const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function formatScreenClock(capturedAtMs: number, frame: number) {
  const date = new Date(capturedAtMs + Math.floor(frame * 1000 / FPS));
  const hours = date.getHours();
  return { time: `${hours % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')}`,
    suffix: hours >= 12 ? 'PM' : 'AM',
    date: DATE_FORMAT.format(date) };
}

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

export function layoutScreenLines(ctx: Pick<CanvasRenderingContext2D, 'measureText'>, lines: readonly ScreenLine[], extraHeight = 0) {
  const items = lines.map(line => {
    const wrapped = wrapScreenText(ctx, line.text, 670);
    return { line, wrapped, height: wrapped.length * 63 + 35 + extraHeight, y: 0 };
  });
  // Keep the newest lines visible and reserve space for the entrance motion.
  while (items.length > 1 && items.reduce((sum, item) => sum + item.height + 24, 485) - 24 > 1536) items.shift();
  let y = 485;
  for (const item of items) { item.y = y; y += item.height + 24; }
  return items;
}

function stroke(ctx: CanvasRenderingContext2D, color: string, width: number, draw: () => void) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); draw(); ctx.stroke();
}

function avatar(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.fillStyle = '#a4aab4'; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, radius - 1, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#e9ebef'; ctx.beginPath(); ctx.arc(x, y - radius * .23, radius * .33, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x, y + radius * .75, radius * .65, radius * .56, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  stroke(ctx, color, 6, () => { ctx.moveTo(x + 18, y - 23); ctx.lineTo(x - 2, y); ctx.lineTo(x + 18, y + 23); });
}

function videoIcon(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  stroke(ctx, color, 5, () => { ctx.roundRect(x, y, 45, 33, 7); ctx.moveTo(x + 45, y + 10); ctx.lineTo(x + 61, y + 2); ctx.lineTo(x + 61, y + 31); ctx.lineTo(x + 45, y + 23); });
}

function phoneIcon(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  stroke(ctx, color, 6, () => { ctx.moveTo(x + 7, y); ctx.bezierCurveTo(x - 2, y + 8, x + 3, y + 23, x + 14, y + 34); ctx.bezierCurveTo(x + 27, y + 47, x + 43, y + 50, x + 49, y + 40); ctx.lineTo(x + 37, y + 30); ctx.lineTo(x + 29, y + 35); ctx.lineTo(x + 14, y + 20); ctx.lineTo(x + 18, y + 12); ctx.closePath(); });
}

function cameraIcon(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  stroke(ctx, color, 5, () => { ctx.roundRect(x, y + 6, 47, 35, 7); ctx.moveTo(x + 9, y + 6); ctx.lineTo(x + 15, y); ctx.lineTo(x + 30, y); ctx.lineTo(x + 36, y + 6); ctx.moveTo(x + 34, y + 23); ctx.arc(x + 23, y + 23, 10, 0, Math.PI * 2); });
}

function microphoneIcon(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  stroke(ctx, color, 5, () => { ctx.roundRect(x + 11, y, 18, 32, 9); ctx.moveTo(x + 3, y + 20); ctx.arc(x + 20, y + 20, 17, 0, Math.PI); ctx.moveTo(x + 20, y + 38); ctx.lineTo(x + 20, y + 48); ctx.moveTo(x + 11, y + 48); ctx.lineTo(x + 29, y + 48); });
}

function pictureIcon(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  stroke(ctx, color, 5, () => { ctx.roundRect(x, y, 48, 42, 7); ctx.moveTo(x + 5, y + 34); ctx.lineTo(x + 19, y + 20); ctx.lineTo(x + 29, y + 30); ctx.lineTo(x + 36, y + 23); ctx.lineTo(x + 44, y + 32); ctx.moveTo(x + 34, y + 11); ctx.arc(x + 32, y + 11, 2, 0, Math.PI * 2); });
}

function smileIcon(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  stroke(ctx, color, 4, () => { ctx.arc(x + 22, y + 22, 21, 0, Math.PI * 2); ctx.moveTo(x + 12, y + 27); ctx.quadraticCurveTo(x + 22, y + 38, x + 32, y + 27); });
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x + 15, y + 17, 2.5, 0, Math.PI * 2); ctx.arc(x + 29, y + 17, 2.5, 0, Math.PI * 2); ctx.fill();
}

function paperclipIcon(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  stroke(ctx, color, 5, () => { ctx.moveTo(x + 33, y + 7); ctx.lineTo(x + 10, y + 30); ctx.quadraticCurveTo(x + 1, y + 40, x + 10, y + 48); ctx.quadraticCurveTo(x + 18, y + 56, x + 28, y + 46); ctx.lineTo(x + 49, y + 25); ctx.quadraticCurveTo(x + 57, y + 17, x + 49, y + 9); ctx.quadraticCurveTo(x + 42, y + 3, x + 35, y + 10); ctx.lineTo(x + 17, y + 28); ctx.quadraticCurveTo(x + 13, y + 33, x + 17, y + 37); ctx.quadraticCurveTo(x + 21, y + 41, x + 26, y + 36); ctx.lineTo(x + 40, y + 22); });
}

const wallpaperTiles = new Map<boolean, HTMLCanvasElement>();
function wallpaper(ctx: CanvasRenderingContext2D, telegram: boolean) {
  let tile = wallpaperTiles.get(telegram);
  if (!tile) {
    tile = document.createElement('canvas'); tile.width = 240; tile.height = 240;
    const p = tile.getContext('2d'); if (!p) return;
    p.strokeStyle = telegram ? '#6f9f6c' : '#d8cbb7'; p.lineWidth = 3; p.globalAlpha = .27;
    p.beginPath(); p.roundRect(28, 30, 52, 40, 13); p.moveTo(43, 70); p.lineTo(38, 79); p.lineTo(54, 70);
    p.moveTo(157, 46); p.lineTo(167, 24); p.lineTo(177, 46); p.lineTo(198, 55); p.lineTo(177, 63); p.lineTo(167, 85); p.lineTo(157, 63); p.lineTo(135, 55); p.closePath();
    p.moveTo(55, 161); p.arc(54, 161, 23, 0, Math.PI * 2); p.moveTo(155, 166); p.quadraticCurveTo(180, 129, 202, 166); p.quadraticCurveTo(181, 190, 155, 166); p.stroke();
    wallpaperTiles.set(telegram, tile);
  }
  const pattern = ctx.createPattern(tile, 'repeat'); if (pattern) { ctx.fillStyle = pattern; ctx.fillRect(0, 305, WIDTH, 1280); }
}

/** Original vector interfaces, sharing one deterministic preview/export renderer. */
export function drawDailyScreen(canvas: HTMLCanvasElement, cues: readonly LyricCue[], frame: number,
  options: { variant: DailyScreenVariant; capturedAtMs: number } = { variant: 'messages', capturedAtMs: 0 }) {
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas is unavailable.');
  const { variant, capturedAtMs } = options, clock = formatScreenClock(capturedAtMs, frame);
  const chat = variant === 'whatsapp' || variant === 'telegram';
  const background = variant === 'whatsapp' ? '#efeae2' : variant === 'telegram' ? '#b7d5a4' : '#ffffff';
  const accent = variant === 'messages' ? '#087ff5' : variant === 'telegram' ? '#1685e6' : '#17191d';
  const bubble = variant === 'whatsapp' ? '#d9fdd3' : variant === 'telegram' ? '#e2ffc7' : variant === 'instagram' ? '#5965f2' : variant === 'messenger' ? '#1683ff' : '#1684f8';
  const bubbleText = chat ? '#17191b' : '#ffffff';
  ctx.clearRect(0, 0, WIDTH, HEIGHT); ctx.fillStyle = background; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  if (chat) wallpaper(ctx, variant === 'telegram');
  ctx.fillStyle = variant === 'whatsapp' ? '#f6f4f0' : variant === 'telegram' ? '#f1f5ef' : '#ffffff'; ctx.fillRect(0, 0, WIDTH, variant === 'messages' ? 334 : 295);
  text(ctx, clock.time, 130, 100, '600 34px "Inter Variable"', '#111111');
  for (let i = 0; i < 4; i++) rounded(ctx, 810 + 12 * i, 116 - 6 * i, 8, 10 + 6 * i, 3, '#111111');
  stroke(ctx, '#111111', 4, () => { ctx.arc(892, 119, 18, 3.9, 5.52); ctx.moveTo(883, 121); ctx.arc(892, 121, 10, 3.9, 5.52); });
  rounded(ctx, 925, 98, 47, 25, 7, '#161616'); rounded(ctx, 929, 102, 34, 17, 4, '#ffffff'); rounded(ctx, 974, 106, 3, 9, 1, '#161616');
  arrow(ctx, 76, 235, accent);
  if (variant === 'messages') {
    avatar(ctx, 540, 225, 50); rounded(ctx, 495, 288, 90, 17, 4, '#3f424a'); videoIcon(ctx, 908, 218, accent);
  } else {
    avatar(ctx, 175, 228, 43); rounded(ctx, 244, 205, 160, 21, 5, '#25262b');
    if (variant === 'instagram' || variant === 'telegram') { ctx.fillStyle = '#61cf56'; ctx.beginPath(); ctx.arc(205, 257, 10, 0, Math.PI * 2); ctx.fill(); }
    if (variant === 'telegram') text(ctx, 'last seen recently', 245, 252, '400 24px "Inter Variable"', '#8a9097');
    if (variant !== 'messenger') { phoneIcon(ctx, 839, 203, accent); videoIcon(ctx, 926, 207, accent); }
  }
  ctx.fillStyle = '#e6e6e8'; ctx.fillRect(0, variant === 'messages' ? 334 : 295, WIDTH, 1);
  const initialClock = formatScreenClock(capturedAtMs, 0);
  const dateLabel = `${initialClock.date} · ${initialClock.time} ${initialClock.suffix}`;
  if (chat) { rounded(ctx, 355, 356, 370, 47, 20, variant === 'telegram' ? '#d8e8d4' : '#ffffff'); text(ctx, dateLabel, WIDTH / 2, 380, '500 24px "Inter Variable"', '#69726a', 'center'); }
  else text(ctx, dateLabel, WIDTH / 2, 399, '500 24px "Inter Variable"', '#92949c', 'center');
  const { lines } = dailyScreenFrame(cues, frame);
  ctx.font = '400 48px "Inter Variable"';
  for (const { line, wrapped, height: h, y } of layoutScreenLines(ctx, lines, chat ? 25 : 0)) {
    const messageClock = formatScreenClock(capturedAtMs, line.startFrame);
    const messageTime = `${messageClock.time} ${messageClock.suffix} ✓✓`;
    ctx.font = '400 48px "Inter Variable"';
    const lyricWidth = Math.max(...wrapped.map(part => ctx.measureText(part).width));
    ctx.font = '400 20px "Inter Variable"';
    const timestampWidth = chat ? ctx.measureText(messageTime).width + 32 : 0;
    const w = Math.max(125, timestampWidth, Math.min(760, lyricWidth + (chat ? 95 : 60)));
    const offset = (1 - Math.min(1, Math.max(0, (frame - line.startFrame + 1) / 5))) * 14;
    const x = WIDTH - 98 - w;
    rounded(ctx, x, y + offset, w, h, variant === 'messages' ? 35 : 27, bubble);
    ctx.fillStyle = bubble; ctx.beginPath(); ctx.moveTo(x + w - 18, y + offset + h - 22); ctx.quadraticCurveTo(x + w + 2, y + offset + h + 2, x + w + 14, y + offset + h); ctx.lineTo(x + w - 20, y + offset + h); ctx.fill();
    for (let i = 0; i < wrapped.length; i++) text(ctx, wrapped[i], x + 30, y + offset + 49 + 63 * i, '400 48px "Inter Variable"', bubbleText);
    if (chat) text(ctx, messageTime, x + w - 16, y + offset + h - 17, '400 20px "Inter Variable"', '#73906f', 'right');
  }
  const panel = variant === 'whatsapp' ? '#f6f4f0' : variant === 'telegram' ? '#edf3ee' : '#ffffff';
  ctx.fillStyle = panel; ctx.fillRect(0, 1580, WIDTH, 190);
  if (variant === 'instagram') {
    rounded(ctx, 50, 1623, 980, 84, 42, '#f1f2f4');
    ctx.fillStyle = '#3c86ed'; ctx.beginPath(); ctx.arc(100, 1665, 34, 0, Math.PI * 2); ctx.fill(); cameraIcon(ctx, 77, 1645, '#ffffff');
    text(ctx, 'Message...', 157, 1665, '400 34px "Inter Variable"', '#858992');
    microphoneIcon(ctx, 752, 1640, '#17191d'); pictureIcon(ctx, 834, 1644, '#17191d'); smileIcon(ctx, 921, 1644, '#17191d');
  } else if (variant === 'messenger') {
    cameraIcon(ctx, 65, 1644, '#17191d'); pictureIcon(ctx, 156, 1644, '#17191d'); microphoneIcon(ctx, 255, 1640, '#17191d');
    rounded(ctx, 327, 1623, 555, 84, 42, '#f1f2f4'); text(ctx, 'Aa', 360, 1665, '400 36px "Inter Variable"', '#8d9098');
    smileIcon(ctx, 819, 1644, '#17191d'); text(ctx, '♥', 948, 1665, '500 47px "Inter Variable"', '#17191d', 'center');
  } else if (variant === 'telegram') {
    paperclipIcon(ctx, 58, 1640, '#7e8990'); rounded(ctx, 135, 1623, 735, 84, 42, '#ffffff');
    text(ctx, 'Message', 165, 1665, '400 34px "Inter Variable"', '#a5a6ac'); smileIcon(ctx, 800, 1643, '#929ca1'); cameraIcon(ctx, 916, 1644, '#7e8990');
  } else if (variant === 'whatsapp') {
    text(ctx, '+', 92, 1665, '300 70px "Inter Variable"', '#17191d', 'center'); rounded(ctx, 150, 1623, 650, 84, 42, '#ffffff');
    stroke(ctx, '#e1e1e5', 2, () => ctx.roundRect(150, 1623, 650, 84, 42)); text(ctx, 'Message', 182, 1665, '400 34px "Inter Variable"', '#a5a6ac');
    smileIcon(ctx, 735, 1643, '#555b5c'); cameraIcon(ctx, 832, 1644, '#17191d'); microphoneIcon(ctx, 925, 1640, '#17191d');
  } else {
    ctx.fillStyle = '#e9e9eb'; ctx.beginPath(); ctx.arc(92, 1665, 40, 0, Math.PI * 2); ctx.fill(); text(ctx, '+', 92, 1665, '300 58px "Inter Variable"', '#858992', 'center');
    rounded(ctx, 150, 1623, 780, 84, 42, '#ffffff'); stroke(ctx, '#e1e1e5', 2, () => ctx.roundRect(150, 1623, 780, 84, 42));
    text(ctx, 'iMessage', 182, 1665, '400 34px "Inter Variable"', '#a5a6ac'); microphoneIcon(ctx, 864, 1640, '#a5a6ac');
  }
  rounded(ctx, 390, 1795, 300, 10, 5, '#141416');
}
