import {
  FPS, FRAMES, HEIGHT, WIDTH, isDomDailyScreen,
  type DailyScreenVariant, type LyricCue,
} from './composition';

export const SCREEN_DESIGNS: readonly { id: DailyScreenVariant; name: string; renderer: 'canvas' | 'dom' }[] = [
  { id: 'messages', name: 'Messages', renderer: 'canvas' },
  { id: 'whatsapp', name: 'WhatsApp', renderer: 'canvas' },
  { id: 'telegram', name: 'Telegram', renderer: 'canvas' },
  { id: 'messenger', name: 'Messenger', renderer: 'canvas' },
  { id: 'instagram', name: 'Instagram', renderer: 'canvas' },
  { id: 'dating', name: 'Dating match', renderer: 'dom' },
  { id: 'ride', name: 'Ride', renderer: 'dom' },
  { id: 'food', name: 'Food delivery', renderer: 'dom' },
];

export const CANVAS_SCREEN_DESIGNS = SCREEN_DESIGNS.filter(design => design.renderer === 'canvas');
export const DOM_SCREEN_DESIGNS = SCREEN_DESIGNS.filter(design => design.renderer === 'dom');
const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function formatScreenClock(capturedAtMs: number, frame: number) {
  const date = new Date(capturedAtMs + Math.floor(frame * 1000 / FPS));
  const hours = date.getHours();
  return { time: `${hours % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')}`,
    suffix: hours >= 12 ? 'PM' : 'AM',
    date: DATE_FORMAT.format(date) };
}

// These are fictional visual details, not readings from the creator's device.
export function screenDeviceStatus(capturedAtMs: number, deviceSeed?: number, variant: DailyScreenVariant = 'messages') {
  if (deviceSeed === undefined) {
    const minute = Math.floor(capturedAtMs / 60000);
    return { batteryPercent: 12, network: minute % 2 === 0 ? 'wifi' : '4G', signalBars: 2 + Math.abs(minute % 3), dynamicIsland: true };
  }
  const index = SCREEN_DESIGNS.findIndex(design => design.id === variant);
  const batteries = [8, 12, 19, 27, 38, 51, 64, 76, 88, 97];
  const networks = ['wifi', '4G', 'none', 'wifi'] as const;
  const network = networks[(deviceSeed + index) % networks.length];
  return { batteryPercent: batteries[(deviceSeed + index) % batteries.length], network,
    signalBars: network === 'none' ? 0 : 1 + ((deviceSeed + index * 3) % 4),
    dynamicIsland: (deviceSeed + index) % 2 === 0 };
}
export function formatChatTime(capturedAtMs: number, frame: number) {
  return `${formatScreenClock(capturedAtMs, frame).time} ✓`;
}
export function chatBubbleWidth(lyricWidth: number, timestampWidth: number) {
  return Math.max(125, timestampWidth + 32, Math.min(760, lyricWidth + 60));
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

export function layoutScreenLines(ctx: Pick<CanvasRenderingContext2D, 'measureText'>, lines: readonly ScreenLine[], extraHeight = 0, startY = 485) {
  const items = lines.map(line => {
    const wrapped = wrapScreenText(ctx, line.text, 670);
    return { line, wrapped, height: wrapped.length * 63 + 35 + extraHeight, y: 0 };
  });
  // Keep the newest lines visible and reserve space for the entrance motion.
  while (items.length > 1 && items.reduce((sum, item) => sum + item.height + 24, startY) - 24 > 1536) items.shift();
  let y = startY;
  for (const item of items) { item.y = y; y += item.height + 24; }
  return items;
}

function stroke(ctx: CanvasRenderingContext2D, color: string, width: number, draw: () => void) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); draw(); ctx.stroke();
}

function drawDeviceStatus(ctx: CanvasRenderingContext2D, capturedAtMs: number, frame: number, timeX: number, timeY: number, variant: DailyScreenVariant, deviceSeed?: number) {
  const status = screenDeviceStatus(capturedAtMs, deviceSeed, variant);
  if (status.dynamicIsland) rounded(ctx, 445, 18, 190, 36, 18, '#080808');
  text(ctx, formatScreenClock(capturedAtMs, frame).time, timeX, timeY, '600 34px "Inter Variable"', '#111');
  if (status.network !== 'none') for (let i = 0; i < 4; i++) rounded(ctx, 804 + 11 * i, timeY + 9 - 5 * i, 7, 9 + 5 * i, 2, i < status.signalBars ? '#111' : '#c5c5c5');
  if (status.network === 'wifi') {
    stroke(ctx, '#111', 4, () => { ctx.arc(884, timeY + 15, 18, -2.36, -.78); ctx.moveTo(877, timeY + 8); ctx.arc(884, timeY + 15, 10, -2.36, -.78); });
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(884, timeY + 15, 3, 0, Math.PI * 2); ctx.fill();
  } else text(ctx, status.network === 'none' ? 'No Service' : '4G', status.network === 'none' ? 805 : 867, timeY + 3, '700 20px "Inter Variable"', '#111');
  stroke(ctx, '#111', 3, () => ctx.roundRect(930, timeY - 13, 65, 28, 6));
  rounded(ctx, 997, timeY - 5, 4, 12, 2, '#111');
  rounded(ctx, 933, timeY - 10, 59, 22, 4, '#fff');
  rounded(ctx, 933, timeY - 10, Math.max(4, 59 * status.batteryPercent / 100), 22, 3, status.batteryPercent <= 20 ? '#e84640' : '#36a95b');
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

// A neutral fictional contact preserves the shape of the reference without
// reproducing its personal photograph or identifying name.
function messengerLock(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#050505'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(x - r * .24, y, r * .48, r * .35, 2); ctx.fill();
  stroke(ctx, '#fff', Math.max(2, r * .1), () => { ctx.arc(x, y, r * .17, Math.PI, 0); ctx.moveTo(x-r*.17,y);ctx.lineTo(x-r*.17,y-r*.12);ctx.moveTo(x+r*.17,y);ctx.lineTo(x+r*.17,y-r*.12); });
}

function drawMessenger(ctx: CanvasRenderingContext2D, cues: readonly LyricCue[], frame: number, capturedAtMs: number, deviceSeed?: number) {
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawDeviceStatus(ctx, capturedAtMs, frame, 68, 72, 'messenger', deviceSeed);
  arrow(ctx, 65, 179, '#050505'); avatar(ctx, 185, 179, 47); messengerLock(ctx, 219, 210, 13);
  rounded(ctx, 260, 168, 150, 24, 4, '#25262b');
  avatar(ctx, 540, 375, 132); messengerLock(ctx, 637, 472, 35);
  rounded(ctx, 435, 531, 210, 35, 5, '#25262b');
  text(ctx, 'Secret conversation', 540, 613, '400 37px "Inter Variable"', '#050505', 'center');
  text(ctx, 'Encrypted end to end across all your active', 540, 672, '400 34px "Inter Variable"', '#858585', 'center');
  text(ctx, 'mobile devices', 540, 716, '400 34px "Inter Variable"', '#858585', 'center');
  const visible = dailyScreenFrame(cues, frame).lines;
  ctx.font = '400 42px "Inter Variable"';
  const items = visible.map(line => { const wrapped=wrapScreenText(ctx,line.text,650); return {line,wrapped,height:wrapped.length*54+30}; });
  while (items.length > 1 && items.reduce((n,item)=>n+item.height+18,0)>760) items.shift();
  let y=790;
  for (const item of items) {
    ctx.font = '400 42px "Inter Variable"'; const width=Math.min(720,Math.max(110,...item.wrapped.map(part=>ctx.measureText(part).width+54)));
    const x=WIDTH-70-width; const offset=(1-Math.min(1,Math.max(0,(frame-item.line.startFrame+1)/5)))*12;
    rounded(ctx,x,y+offset,width,item.height,32,'#1683ff');
    item.wrapped.forEach((part,i)=>text(ctx,part,x+27,y+offset+39+i*54,'400 42px "Inter Variable"','#fff'));
    y+=item.height+18;
  }
  ctx.fillStyle='#fff';ctx.fillRect(0,1580,WIDTH,190);
  cameraIcon(ctx,42,1640,'#050505');pictureIcon(ctx,170,1640,'#050505');
  ctx.fillStyle='#050505';ctx.beginPath();ctx.arc(328,1662,27,0,Math.PI*2);ctx.fill();
  for(let i=0;i<5;i++) rounded(ctx,311+i*7,1652-Math.abs(2-i)*3,3,20+Math.abs(2-i)*6,2,'#fff');
  rounded(ctx,414,1618,500,88,44,'#f4f4f4');
  ctx.fillStyle='#c7cbcd';ctx.beginPath();ctx.arc(462,1662,29,0,Math.PI*2);ctx.fill();
  stroke(ctx,'#fff',4,()=>{ctx.arc(462,1662,19,.2,5.1);ctx.moveTo(451,1649);ctx.lineTo(464,1662);});
  text(ctx,'Aa',530,1662,'400 38px "Inter Variable"','#828282');
  ctx.fillStyle='#050505';ctx.beginPath();ctx.arc(861,1662,27,0,Math.PI*2);ctx.fill(); smileIcon(ctx,839,1640,'#fff');
  // Original vector hand silhouette rather than a platform logo.
  ctx.fillStyle='#050505';ctx.beginPath();ctx.moveTo(982,1684);ctx.lineTo(982,1654);ctx.quadraticCurveTo(990,1648,994,1630);ctx.quadraticCurveTo(998,1618,1004,1625);ctx.lineTo(1004,1644);ctx.lineTo(1020,1644);ctx.quadraticCurveTo(1028,1644,1025,1655);ctx.lineTo(1019,1680);ctx.quadraticCurveTo(1017,1685,1010,1685);ctx.closePath();ctx.fill();
  rounded(ctx,390,1795,300,10,5,'#050505');
}

const wallpaperTiles = new Map<boolean, HTMLCanvasElement>();
function wallpaper(ctx: CanvasRenderingContext2D, telegram: boolean) {
  let tile = wallpaperTiles.get(telegram);
  if (!tile) {
    tile = document.createElement('canvas'); tile.width = 480; tile.height = 480;
    const p = tile.getContext('2d'); if (!p) return;
    p.strokeStyle = telegram ? '#6f9f6c' : '#d8cbb7'; p.lineWidth = 3; p.globalAlpha = .27;
    p.beginPath(); p.roundRect(28, 30, 52, 40, 13); p.moveTo(43, 70); p.lineTo(38, 79); p.lineTo(54, 70);
    p.moveTo(157, 46); p.lineTo(167, 24); p.lineTo(177, 46); p.lineTo(198, 55); p.lineTo(177, 63); p.lineTo(167, 85); p.lineTo(157, 63); p.lineTo(135, 55); p.closePath();
    p.moveTo(55, 161); p.arc(54, 161, 23, 0, Math.PI * 2); p.moveTo(155, 166); p.quadraticCurveTo(180, 129, 202, 166); p.quadraticCurveTo(181, 190, 155, 166); p.stroke();
    p.beginPath();p.roundRect(290,35,76,52,12);p.moveTo(305,46);p.lineTo(345,46);p.moveTo(340,118);p.arc(340,118,19,0,Math.PI*2);
    p.moveTo(228,250);p.bezierCurveTo(250,210,285,215,294,248);p.bezierCurveTo(299,275,274,290,248,290);p.closePath();
    p.moveTo(60,310);p.bezierCurveTo(40,278,8,303,60,345);p.bezierCurveTo(112,303,80,278,60,310);
    p.moveTo(350,326);p.lineTo(388,286);p.lineTo(412,310);p.lineTo(374,350);p.closePath();
    p.moveTo(180,390);p.arc(180,390,30,0,Math.PI*2);p.moveTo(165,390);p.lineTo(195,390);p.moveTo(180,375);p.lineTo(180,405);
    p.moveTo(288,405);p.quadraticCurveTo(310,370,332,405);p.quadraticCurveTo(310,430,288,405);p.stroke();
    wallpaperTiles.set(telegram, tile);
  }
  const pattern = ctx.createPattern(tile, 'repeat'); if (pattern) { ctx.fillStyle = pattern; ctx.fillRect(0, 305, WIDTH, 1280); }
}

/** Original vector interfaces for the five messaging designs. */
export function drawDailyScreen(canvas: HTMLCanvasElement, cues: readonly LyricCue[], frame: number,
  options: { variant: DailyScreenVariant; capturedAtMs: number; deviceSeed?: number } = { variant: 'messages', capturedAtMs: 0 }) {
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas is unavailable.');
  const { variant, capturedAtMs } = options;
  if (isDomDailyScreen(variant)) throw new Error('Use paintDailyScreen for React Daily Screens designs.');
  if (options.variant === 'messenger') { drawMessenger(ctx, cues, frame, capturedAtMs, options.deviceSeed); return; }
  const chat = variant === 'whatsapp' || variant === 'telegram';
  const background = variant === 'whatsapp' ? '#efeae2' : variant === 'telegram' ? '#b7d5a4' : '#ffffff';
  const accent = variant === 'messages' ? '#087ff5' : variant === 'telegram' ? '#1685e6' : '#17191d';
  const bubble = variant === 'whatsapp' ? '#d9fdd3' : variant === 'telegram' ? '#e2ffc7' : variant === 'instagram' ? '#5965f2' : variant === 'messenger' ? '#1683ff' : '#1684f8';
  const bubbleText = chat ? '#17191b' : '#ffffff';
  ctx.clearRect(0, 0, WIDTH, HEIGHT); ctx.fillStyle = background; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  if (chat) wallpaper(ctx, variant === 'telegram');
  ctx.fillStyle = variant === 'whatsapp' ? '#f6f4f0' : variant === 'telegram' ? '#f1f5ef' : '#ffffff'; ctx.fillRect(0, 0, WIDTH, variant === 'messages' ? 334 : 295);
  drawDeviceStatus(ctx, capturedAtMs, frame, 130, 100, variant, options.deviceSeed);
  arrow(ctx, 76, 235, accent);
  if (variant === 'messages') {
    avatar(ctx, 540, 225, 50); rounded(ctx, 495, 288, 90, 17, 4, '#3f424a'); videoIcon(ctx, 908, 218, accent);
  } else if (variant === 'whatsapp') {
    avatar(ctx, 175, 228, 43); rounded(ctx, 244, 208, 160, 23, 5, '#25262b');
    phoneIcon(ctx, 839, 203, accent); videoIcon(ctx, 926, 207, accent);
  } else if (variant === 'telegram') {
    rounded(ctx, 435, 207, 210, 25, 4, '#25262b');
    text(ctx, 'last seen recently', 540, 260, '400 27px "Inter Variable"', '#8a9097', 'center');
    avatar(ctx, 990, 225, 43);
  } else {
    avatar(ctx, 175, 228, 43); rounded(ctx, 244, 205, 160, 21, 5, '#25262b');
    if (variant === 'instagram') { ctx.fillStyle = '#61cf56'; ctx.beginPath(); ctx.arc(205, 257, 10, 0, Math.PI * 2); ctx.fill(); text(ctx, 'Business chat', 245, 260, '400 25px "Inter Variable"', '#8a9097'); }
    if (variant !== 'messenger') { phoneIcon(ctx, 839, 203, accent); videoIcon(ctx, 926, 207, accent); }
  }
  ctx.fillStyle = '#e6e6e8'; ctx.fillRect(0, variant === 'messages' ? 334 : 295, WIDTH, 1);
  const initialClock = formatScreenClock(capturedAtMs, 0);
  const dateLabel = `${initialClock.date} · ${initialClock.time} ${initialClock.suffix}`;
  if (chat) { rounded(ctx, 355, 356, 370, 47, 20, variant === 'telegram' ? '#d8e8d4' : '#ffffff'); text(ctx, variant === 'whatsapp' ? 'Today' : dateLabel, WIDTH / 2, 380, '500 24px "Inter Variable"', '#69726a', 'center'); }
  else {
    if (variant === 'messages') text(ctx, 'iMessage', WIDTH / 2, 368, '500 25px "Inter Variable"', '#92949c', 'center');
    text(ctx, dateLabel, WIDTH / 2, 399, '500 24px "Inter Variable"', '#92949c', 'center');
  }
  if (variant === 'whatsapp') {
    rounded(ctx, 152, 430, 776, 120, 18, '#fff1d8');
    text(ctx, 'Messages and calls are end-to-end encrypted.', 540, 465, '400 25px "Inter Variable"', '#262321', 'center');
    text(ctx, 'Only people in this chat can read or share them.', 540, 505, '400 25px "Inter Variable"', '#262321', 'center');
  }
  const { lines } = dailyScreenFrame(cues, frame);
  ctx.font = '400 48px "Inter Variable"';
  for (const { line, wrapped, height: h, y } of layoutScreenLines(ctx, lines, chat ? 25 : 0, variant === 'whatsapp' ? 590 : 485)) {
    const messageTime = formatChatTime(capturedAtMs, line.startFrame);
    ctx.font = '400 48px "Inter Variable"';
    const lyricWidth = Math.max(...wrapped.map(part => ctx.measureText(part).width));
    ctx.font = '400 20px "Inter Variable"';
    const timestampWidth = chat ? ctx.measureText(messageTime).width : 0;
    const w = chatBubbleWidth(lyricWidth, timestampWidth);
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
