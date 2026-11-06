import { HEIGHT, WIDTH, type LyricCue, type SceneDailyScreenVariant } from './composition';
import {
  dailyScreenFrame,
  drawDeviceStatus,
  formatScreenClock,
  wrapScreenText,
} from './daily-screens';

type Options = { variant: SceneDailyScreenVariant; capturedAtMs: number; deviceSeed?: number };

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  font: string,
  color: string,
  align: CanvasTextAlign = 'left',
) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(value, x, y);
}

function redact(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill = '#1d1e22') {
  rounded(ctx, x, y, w, h, Math.min(8, h / 2), fill);
}

function avatar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, top = '#d9dde8', bottom = '#8f96a8') {
  const gradient = ctx.createLinearGradient(x, y - r, x, y + r);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function status(ctx: CanvasRenderingContext2D, options: Options, frame: number, light = false) {
  drawDeviceStatus(ctx, options.capturedAtMs, frame, 130, 100, options.variant, options.deviceSeed, light ? '#ffffff' : '#1b1c20');
}

function placeNewest(
  items: { line: { text: string; startFrame: number }; wrapped: string[]; height: number }[],
  startY: number,
  maxBottom: number,
  gap: number,
) {
  const fitted = [...items];
  while (fitted.length > 1) {
    const total = fitted.reduce((sum, item) => sum + item.height + gap, -gap);
    if (startY + total <= maxBottom) break;
    fitted.shift();
  }
  const total = fitted.reduce((sum, item) => sum + item.height + gap, -gap);
  let y = Math.max(startY, maxBottom - Math.max(0, total));
  return fitted.map(item => {
    const placed = { ...item, y };
    y += item.height + gap;
    return placed;
  });
}

function seedCode(seed: number, prefix: string, width = 8) {
  return `${prefix}${(Math.abs(seed) % 10 ** width).toString().padStart(width, '0')}`;
}

function stamp(capturedAtMs: number, frame: number, offsetMin: number) {
  const date = new Date(capturedAtMs + Math.floor(frame * 1000 / 30) - offsetMin * 60000);
  const h = date.getHours();
  return `${h % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function home(ctx: CanvasRenderingContext2D, y = 1865) {
  rounded(ctx, 390, y, 300, 10, 5, '#141416');
}

function lyricBlocks(ctx: CanvasRenderingContext2D, cues: readonly LyricCue[], frame: number, maxWidth: number, lineHeight: number, pad: number) {
  ctx.font = `600 ${lineHeight - 10}px "Inter Variable"`;
  return dailyScreenFrame(cues, frame).lines.map(line => {
    const wrapped = wrapScreenText(ctx, line.text, maxWidth);
    return { line, wrapped, height: wrapped.length * lineHeight + pad };
  });
}

/** FedEx/Amazon-style tracking — no carrier logos. */
function drawPackage(ctx: CanvasRenderingContext2D, cues: readonly LyricCue[], frame: number, options: Options) {
  const seed = options.deviceSeed ?? 0;
  const tracking = seedCode(seed + 17, '1Z');
  ctx.fillStyle = '#f4f4f5';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  status(ctx, options, frame);
  text(ctx, 'Tracking', 70, 180, `700 42px "Inter Variable"`, '#111');
  text(ctx, tracking, 70, 230, `500 26px "Inter Variable"`, '#71717a');
  rounded(ctx, 48, 280, 984, 220, 28, '#111111');
  text(ctx, 'Package delivered', 84, 350, `800 44px "Inter Variable"`, '#fff');
  text(ctx, 'at front door', 84, 410, `700 36px "Inter Variable"`, '#a3e635');
  text(ctx, stamp(options.capturedAtMs, frame, 0), 84, 460, `500 24px "Inter Variable"`, '#a1a1aa');

  rounded(ctx, 48, 540, 984, 420, 28, '#ffffff');
  // Mini map plane
  ctx.fillStyle = '#e8edf2';
  ctx.fillRect(80, 570, 920, 240);
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 2;
  for (let x = 80; x < 1000; x += 60) { ctx.beginPath(); ctx.moveTo(x, 570); ctx.lineTo(x, 810); ctx.stroke(); }
  for (let y = 570; y < 810; y += 60) { ctx.beginPath(); ctx.moveTo(80, y); ctx.lineTo(1000, y); ctx.stroke(); }
  ctx.strokeStyle = '#111'; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(140, 760); ctx.quadraticCurveTo(480, 620, 900, 640); ctx.stroke();
  rounded(ctx, 860, 610, 54, 54, 27, '#16a34a');
  text(ctx, '✓', 887, 638, `700 28px "Inter Variable"`, '#fff', 'center');
  text(ctx, 'Checkpoint timeline', 84, 860, `700 28px "Inter Variable"`, '#111');
  text(ctx, 'Front door · photo on file', 84, 910, `500 24px "Inter Variable"`, '#52525b');

  const checkpoints = [
    { label: 'Delivered', min: 0 },
    { label: 'Out for delivery', min: 95 },
    { label: 'At local facility', min: 420 },
    { label: 'In transit', min: 1400 },
  ];
  let y = 980;
  checkpoints.forEach((point, index) => {
    rounded(ctx, 70, y, 28, 28, 14, index === 0 ? '#16a34a' : '#d4d4d8');
    if (index < checkpoints.length - 1) {
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(82, y + 28, 4, 70);
    }
    text(ctx, point.label, 120, y + 14, `700 28px "Inter Variable"`, '#111');
    text(ctx, stamp(options.capturedAtMs, frame, point.min), 120, y + 48, `500 22px "Inter Variable"`, '#71717a');
    y += 90;
  });

  const items = lyricBlocks(ctx, cues, frame, 860, 48, 36);
  for (const { wrapped, height, y: ly } of placeNewest(items, 1380, 1780, 14)) {
    rounded(ctx, 48, ly, 984, height, 24, '#ffffff');
    wrapped.forEach((part, i) => text(ctx, part, 84, ly + 40 + i * 48, `700 36px "Inter Variable"`, '#111'));
  }
  home(ctx);
}

/** Chase/Revolut-inspired alert dashboard — no bank logos. */
function drawBanking(ctx: CanvasRenderingContext2D, cues: readonly LyricCue[], frame: number, options: Options) {
  const seed = options.deviceSeed ?? 0;
  const up = seed % 2 === 0;
  const balance = (1200 + (seed % 8000) / 100).toFixed(2);
  const delta = ((80 + (seed % 400) / 10) * (up ? 1 : -1)).toFixed(2);
  ctx.fillStyle = '#0b0f1a';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  status(ctx, options, frame, true);
  text(ctx, 'Accounts', 70, 190, `700 40px "Inter Variable"`, '#fff');
  rounded(ctx, 48, 240, 984, 280, 32, '#151b2d');
  text(ctx, 'Available balance', 84, 300, `500 24px "Inter Variable"`, '#94a3b8');
  text(ctx, `$${balance}`, 84, 370, `800 72px "Inter Variable"`, '#fff');
  text(ctx, `${up ? '+' : '-'}$${Math.abs(Number(delta)).toFixed(2)} today`, 84, 450, `700 28px "Inter Variable"`, up ? '#4ade80' : '#f87171');
  rounded(ctx, 700, 420, 280, 56, 28, up ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)');
  text(ctx, up ? '▲ In' : '▼ Out', 840, 448, `700 26px "Inter Variable"`, up ? '#4ade80' : '#f87171', 'center');

  rounded(ctx, 48, 560, 984, 220, 28, '#7f1d1d');
  text(ctx, 'Fraud Warning', 84, 620, `800 36px "Inter Variable"`, '#fecaca');
  text(ctx, 'Did you authorize this?', 84, 680, `700 32px "Inter Variable"`, '#fff');
  text(ctx, `Card ··${String(1000 + (seed % 9000)).slice(-4)} · ${stamp(options.capturedAtMs, frame, 12)}`, 84, 740, `500 24px "Inter Variable"`, '#fca5a5');

  text(ctx, 'Recent activity', 70, 860, `700 30px "Inter Variable"`, '#fff');
  const items = lyricBlocks(ctx, cues, frame, 820, 46, 48);
  for (const { wrapped, height, y } of placeNewest(items, 900, 1780, 16)) {
    rounded(ctx, 48, y, 984, height, 24, '#151b2d');
    rounded(ctx, 84, y + height / 2 - 28, 56, 56, 28, up ? '#14532d' : '#7f1d1d');
    text(ctx, up ? '+' : '−', 112, y + height / 2, `700 28px "Inter Variable"`, up ? '#4ade80' : '#f87171', 'center');
    wrapped.forEach((part, i) => text(ctx, part, 170, y + 40 + i * 46, `600 34px "Inter Variable"`, '#fff'));
  }
  home(ctx);
}

/** Shopify-style order receipt — no platform logos. */
function drawOrder(ctx: CanvasRenderingContext2D, cues: readonly LyricCue[], frame: number, options: Options) {
  const seed = options.deviceSeed ?? 0;
  const orderId = seedCode(seed + 9, '#', 6);
  const progress = Math.min(1, frame / 449);
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  status(ctx, options, frame);
  text(ctx, 'Order confirmed', 70, 190, `800 44px "Inter Variable"`, '#111');
  text(ctx, `Order ${orderId}`, 70, 245, `500 26px "Inter Variable"`, '#71717a');
  rounded(ctx, 48, 290, 984, 120, 24, '#ffffff');
  text(ctx, 'Shipping status', 84, 330, `600 24px "Inter Variable"`, '#71717a');
  rounded(ctx, 84, 360, 912, 16, 8, '#e5e7eb');
  rounded(ctx, 84, 360, Math.max(40, 912 * (0.25 + progress * 0.6)), 16, 8, '#111');
  text(ctx, progress > 0.7 ? 'Out for delivery' : progress > 0.35 ? 'Shipped' : 'Processing', 84, 400, `700 26px "Inter Variable"`, '#111');

  rounded(ctx, 48, 450, 984, 420, 28, '#ffffff');
  text(ctx, 'Receipt', 84, 510, `700 30px "Inter Variable"`, '#111');
  [['Subtotal', '$48.00'], ['Shipping', '$0.00'], ['Tax', '$3.84'], ['Total', '$51.84']].forEach(([label, value], i) => {
    const y = 570 + i * 70;
    text(ctx, label, 84, y, i === 3 ? `800 32px "Inter Variable"` : `500 28px "Inter Variable"`, '#111');
    text(ctx, value, 996, y, i === 3 ? `800 32px "Inter Variable"` : `600 28px "Inter Variable"`, '#111', 'right');
    if (i < 3) { ctx.fillStyle = '#f4f4f5'; ctx.fillRect(84, y + 28, 912, 2); }
  });

  const items = lyricBlocks(ctx, cues, frame, 860, 48, 40);
  for (const { wrapped, height, y } of placeNewest(items, 920, 1780, 14)) {
    rounded(ctx, 48, y, 984, height, 24, '#ffffff');
    redact(ctx, 84, y + 24, 72, 72, '#e5e7eb');
    wrapped.forEach((part, i) => text(ctx, part, 180, y + 44 + i * 48, `700 34px "Inter Variable"`, '#111'));
  }
  home(ctx);
}

/** iOS lock screen with frost notification cards. */
function drawLockScreen(ctx: CanvasRenderingContext2D, cues: readonly LyricCue[], frame: number, options: Options) {
  const clock = formatScreenClock(options.capturedAtMs, frame);
  const wallpaper = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  wallpaper.addColorStop(0, '#1e3a5f');
  wallpaper.addColorStop(0.45, '#7c3aed');
  wallpaper.addColorStop(1, '#fb7185');
  ctx.fillStyle = wallpaper;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  // Soft photo-like orbs
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath(); ctx.arc(220, 520, 180, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(860, 420, 220, 0, Math.PI * 2); ctx.fill();
  status(ctx, options, frame, true);
  text(ctx, clock.date, WIDTH / 2, 280, `600 34px "Inter Variable"`, '#fff', 'center');
  text(ctx, clock.time, WIDTH / 2, 430, `200 160px "Inter Variable"`, '#fff', 'center');
  text(ctx, clock.suffix, WIDTH / 2, 540, `500 28px "Inter Variable"`, 'rgba(255,255,255,0.85)', 'center');

  const items = lyricBlocks(ctx, cues, frame, 820, 44, 70);
  for (const { wrapped, height, y } of placeNewest(items, 700, 1700, 18)) {
    // Frosted glass stand-in: translucent white card
    rounded(ctx, 48, y, 984, height, 28, 'rgba(255,255,255,0.72)');
    rounded(ctx, 84, y + 28, 48, 48, 12, 'rgba(15,23,42,0.35)');
    text(ctx, 'now', 996, y + 36, `600 22px "Inter Variable"`, 'rgba(15,23,42,0.55)', 'right');
    wrapped.forEach((part, i) => text(ctx, part, 152, y + 52 + i * 44, `700 32px "Inter Variable"`, '#0f172a'));
  }
  home(ctx, 1840);
}

/** System call log with missed calls in red — contact names redacted. */
function drawMissedCall(ctx: CanvasRenderingContext2D, cues: readonly LyricCue[], frame: number, options: Options) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  status(ctx, options, frame);
  text(ctx, 'Recents', 70, 190, `800 48px "Inter Variable"`, '#111');
  ['All', 'Missed'].forEach((tab, i) => {
    const x = 70 + i * 200;
    text(ctx, tab, x, 270, `700 28px "Inter Variable"`, i === 1 ? '#ef4444' : '#71717a');
    if (i === 1) rounded(ctx, x, 290, 90, 6, 3, '#ef4444');
  });
  const items = lyricBlocks(ctx, cues, frame, 620, 40, 70);
  for (const { wrapped, height, y } of placeNewest(items, 340, 1780, 8)) {
    ctx.fillStyle = '#f4f4f5';
    ctx.fillRect(0, y + height - 2, WIDTH, 2);
    // Phone icon
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(90, y + 36);
    ctx.bezierCurveTo(70, y + 50, 78, y + 78, 100, y + 96);
    ctx.bezierCurveTo(122, y + 112, 150, y + 118, 162, y + 100);
    ctx.stroke();
    redact(ctx, 200, y + 24, 220, 32, '#fecaca');
    text(ctx, 'mobile', 440, y + 40, `500 24px "Inter Variable"`, '#ef4444');
    text(ctx, stamp(options.capturedAtMs, frame, Math.floor((1800 - y) / 40)), 996, y + 40, `500 24px "Inter Variable"`, '#a1a1aa', 'right');
    wrapped.forEach((part, i) => text(ctx, part, 200, y + 84 + i * 40, `600 30px "Inter Variable"`, '#52525b'));
  }
  home(ctx);
}

/** TikTok/IG nested comments. */
function drawComments(ctx: CanvasRenderingContext2D, cues: readonly LyricCue[], frame: number, options: Options) {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  status(ctx, options, frame, true);
  text(ctx, 'Comments', WIDTH / 2, 190, `700 36px "Inter Variable"`, '#fff', 'center');
  const lines = dailyScreenFrame(cues, frame).lines;
  ctx.font = '600 34px "Inter Variable"';
  const items = lines.map((line, index) => {
    const nested = index % 3 === 2;
    const wrapped = wrapScreenText(ctx, line.text, nested ? 680 : 760);
    return { line, wrapped, height: wrapped.length * 42 + 86, nested };
  });
  const fitted = [...items];
  while (fitted.length > 1) {
    const total = fitted.reduce((sum, item) => sum + item.height + 18, -18);
    if (260 + total <= 1680) break;
    fitted.shift();
  }
  let y = 250;
  for (const item of fitted) {
    const indent = item.nested ? 120 : 48;
    avatar(ctx, indent + 36, y + 40, 32, '#334155', '#1e293b');
    redact(ctx, indent + 90, y + 18, 160, 26, '#334155');
    item.wrapped.forEach((part, i) => text(ctx, part, indent + 90, y + 70 + i * 42, `500 32px "Inter Variable"`, '#fff'));
    text(ctx, '♡', 1000, y + 50, `500 34px "Inter Variable"`, '#94a3b8', 'center');
    text(ctx, String(12 + (item.line.startFrame % 40)), 1000, y + 90, `500 20px "Inter Variable"`, '#64748b', 'center');
    y += item.height + 18;
  }
  rounded(ctx, 48, 1740, 984, 88, 44, '#1e293b');
  text(ctx, 'Add comment…', 100, 1784, `500 28px "Inter Variable"`, '#94a3b8');
  home(ctx);
}

/** Trending / autocomplete search. */
function drawSearch(ctx: CanvasRenderingContext2D, cues: readonly LyricCue[], frame: number, options: Options) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  status(ctx, options, frame);
  rounded(ctx, 48, 170, 984, 88, 44, '#f4f4f5');
  // Search loop
  ctx.strokeStyle = '#71717a';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(110, 214, 18, 0, Math.PI * 2);
  ctx.moveTo(124, 228);
  ctx.lineTo(142, 246);
  ctx.stroke();
  const active = dailyScreenFrame(cues, frame).lines.at(-1)?.text ?? 'Search';
  text(ctx, active.slice(0, 28), 170, 214, `600 32px "Inter Variable"`, '#111');
  text(ctx, 'Cancel', 996, 214, `600 28px "Inter Variable"`, '#2563eb', 'right');
  text(ctx, 'Trending', 70, 320, `800 34px "Inter Variable"`, '#111');
  const items = lyricBlocks(ctx, cues, frame, 820, 44, 36);
  for (const { wrapped, height, y } of placeNewest(items, 360, 1780, 12)) {
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(100, y + 36, 16, 0, Math.PI * 2);
    ctx.moveTo(112, y + 48);
    ctx.lineTo(128, y + 64);
    ctx.stroke();
    wrapped.forEach((part, i) => text(ctx, part, 160, y + 40 + i * 44, `600 34px "Inter Variable"`, '#111'));
    text(ctx, '↗', 996, y + 40, `600 28px "Inter Variable"`, '#a1a1aa', 'right');
    ctx.fillStyle = '#f4f4f5';
    ctx.fillRect(48, y + height - 4, 984, 2);
  }
  home(ctx);
}

/** Social activity feed. */
function drawNotifications(ctx: CanvasRenderingContext2D, cues: readonly LyricCue[], frame: number, options: Options) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  status(ctx, options, frame);
  text(ctx, 'Notifications', 70, 190, `800 44px "Inter Variable"`, '#111');
  ['All', 'Follows', 'Mentions'].forEach((tab, i) => {
    const x = 70 + i * 220;
    rounded(ctx, x, 240, 190, 64, 32, i === 0 ? '#111' : '#f4f4f5');
    text(ctx, tab, x + 95, 272, `700 26px "Inter Variable"`, i === 0 ? '#fff' : '#52525b', 'center');
  });
  const actions = ['Follow', 'Like', 'Reply'];
  const items = lyricBlocks(ctx, cues, frame, 560, 40, 56);
  for (const { wrapped, height, y } of placeNewest(items, 340, 1780, 10)) {
    avatar(ctx, 100, y + height / 2, 40);
    wrapped.forEach((part, i) => text(ctx, part, 170, y + 36 + i * 40, `600 30px "Inter Variable"`, '#111'));
    const action = actions[Math.floor(y / 97) % actions.length];
    rounded(ctx, 820, y + height / 2 - 32, 200, 64, 32, action === 'Follow' ? '#111' : '#f4f4f5');
    text(ctx, action, 920, y + height / 2, `700 26px "Inter Variable"`, action === 'Follow' ? '#fff' : '#111', 'center');
  }
  home(ctx);
}

/** Story thumbnail + reply composer. */
function drawStoryReply(ctx: CanvasRenderingContext2D, cues: readonly LyricCue[], frame: number, options: Options) {
  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, '#0f172a');
  bg.addColorStop(1, '#9d174d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  status(ctx, options, frame, true);
  rounded(ctx, 90, 220, 900, 1200, 40, 'rgba(255,255,255,0.08)');
  avatar(ctx, 540, 700, 160, '#fce7f3', '#db2777');
  redact(ctx, 390, 920, 300, 36, 'rgba(0,0,0,0.45)');
  text(ctx, 'Replied to your story:', WIDTH / 2, 1320, `700 30px "Inter Variable"`, 'rgba(255,255,255,0.85)', 'center');
  const items = lyricBlocks(ctx, cues, frame, 820, 46, 40);
  for (const { wrapped, height, y } of placeNewest(items, 1380, 1720, 12)) {
    rounded(ctx, 70, y, 940, height, 28, 'rgba(255,255,255,0.92)');
    wrapped.forEach((part, i) => text(ctx, part, WIDTH / 2, y + 42 + i * 46, `700 34px "Inter Variable"`, '#111', 'center'));
  }
  rounded(ctx, 70, 1760, 780, 84, 42, 'rgba(255,255,255,0.2)');
  text(ctx, 'Send message…', 110, 1802, `500 28px "Inter Variable"`, 'rgba(255,255,255,0.75)');
  rounded(ctx, 880, 1768, 70, 70, 35, '#fff');
  text(ctx, '↑', 915, 1805, `700 28px "Inter Variable"`, '#111', 'center');
  home(ctx);
}

/** Full social post layout. */
function drawSocialPost(ctx: CanvasRenderingContext2D, cues: readonly LyricCue[], frame: number, options: Options) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  status(ctx, options, frame);
  avatar(ctx, 100, 210, 40);
  redact(ctx, 170, 190, 220, 28);
  text(ctx, '· 2h', 420, 204, `500 24px "Inter Variable"`, '#a1a1aa');
  text(ctx, '•••', 996, 204, `700 28px "Inter Variable"`, '#111', 'right');
  // Media container
  const media = ctx.createLinearGradient(0, 280, WIDTH, 1100);
  media.addColorStop(0, '#e2e8f0');
  media.addColorStop(1, '#94a3b8');
  ctx.fillStyle = media;
  ctx.fillRect(0, 280, WIDTH, 820);
  avatar(ctx, 540, 690, 90, '#f8fafc', '#64748b');
  text(ctx, '♡    💬    ➤', 70, 1160, `500 40px "Inter Variable"`, '#111');
  text(ctx, 'Bookmark', 996, 1160, `600 26px "Inter Variable"`, '#111', 'right');
  text(ctx, `${1200 + ((options.deviceSeed ?? 0) % 800)} likes`, 70, 1220, `700 28px "Inter Variable"`, '#111');
  const items = lyricBlocks(ctx, cues, frame, 900, 42, 28);
  for (const { wrapped, y } of placeNewest(items, 1260, 1680, 10)) {
    redact(ctx, 70, y + 8, 140, 24, '#e5e7eb');
    wrapped.forEach((part, i) => text(ctx, part, 230, y + 22 + i * 42, `500 30px "Inter Variable"`, '#111'));
  }
  rounded(ctx, 48, 1720, 984, 88, 44, '#f4f4f5');
  text(ctx, 'Add a comment…', 100, 1764, `500 28px "Inter Variable"`, '#a1a1aa');
  home(ctx);
}

const DRAWERS: Record<SceneDailyScreenVariant, (ctx: CanvasRenderingContext2D, cues: readonly LyricCue[], frame: number, options: Options) => void> = {
  'package-tracking': drawPackage,
  'banking-alert': drawBanking,
  'order-update': drawOrder,
  'lock-screen': drawLockScreen,
  'missed-call': drawMissedCall,
  'comment-thread': drawComments,
  'search-screen': drawSearch,
  'notification-feed': drawNotifications,
  'story-reply': drawStoryReply,
  'social-post': drawSocialPost,
};

export function drawSceneDailyScreen(
  canvas: HTMLCanvasElement,
  cues: readonly LyricCue[],
  frame: number,
  options: Options,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable.');
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  DRAWERS[options.variant](ctx, cues, frame, options);
}
