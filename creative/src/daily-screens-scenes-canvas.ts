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

function lyricBlocks(ctx: CanvasRenderingContext2D, cues: readonly LyricCue[], frame: number, maxWidth: number, lineHeight: number, pad: number) {
  ctx.font = `600 ${lineHeight - 10}px "Inter Variable"`;
  return dailyScreenFrame(cues, frame).lines.map(line => {
    const wrapped = wrapScreenText(ctx, line.text, maxWidth);
    return { line, wrapped, height: wrapped.length * lineHeight + pad };
  });
}

type Brand = 'instagram' | 'x' | 'facebook' | 'google' | 'whatsapp';

function drawBrandIcon(ctx: CanvasRenderingContext2D, brand: Brand, x: number, y: number, size: number) {
  const r = size * 0.22;
  if (brand === 'instagram') {
    const g = ctx.createLinearGradient(x, y + size, x + size, y);
    g.addColorStop(0, '#feda75');
    g.addColorStop(0.25, '#fa7e1e');
    g.addColorStop(0.5, '#d62976');
    g.addColorStop(0.75, '#962fbf');
    g.addColorStop(1, '#4f5bd5');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, r);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = size * 0.08;
    ctx.beginPath();
    ctx.roundRect(x + size * 0.18, y + size * 0.18, size * 0.64, size * 0.64, size * 0.16);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + size * 0.5, y + size * 0.5, size * 0.18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x + size * 0.72, y + size * 0.28, size * 0.06, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (brand === 'x') {
    rounded(ctx, x, y, size, size, r, '#000000');
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    const s = size;
    ctx.moveTo(x + s * 0.22, y + s * 0.22);
    ctx.lineTo(x + s * 0.48, y + s * 0.48);
    ctx.lineTo(x + s * 0.22, y + s * 0.78);
    ctx.lineTo(x + s * 0.34, y + s * 0.78);
    ctx.lineTo(x + s * 0.52, y + s * 0.55);
    ctx.lineTo(x + s * 0.78, y + s * 0.78);
    ctx.lineTo(x + s * 0.78, y + s * 0.64);
    ctx.lineTo(x + s * 0.58, y + s * 0.42);
    ctx.lineTo(x + s * 0.78, y + s * 0.22);
    ctx.lineTo(x + s * 0.66, y + s * 0.22);
    ctx.lineTo(x + s * 0.5, y + s * 0.38);
    ctx.lineTo(x + s * 0.34, y + s * 0.22);
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (brand === 'facebook') {
    rounded(ctx, x, y, size, size, r, '#1877f2');
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${Math.floor(size * 0.72)}px "Inter Variable"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('f', x + size * 0.55, y + size * 0.52);
    return;
  }
  if (brand === 'google') {
    rounded(ctx, x, y, size, size, r, '#fff');
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, r);
    ctx.stroke();
    const cx = x + size / 2;
    const cy = y + size / 2;
    const rad = size * 0.28;
    const arcs: Array<[string, number, number]> = [
      ['#4285f4', -0.4, 1.2],
      ['#34a853', 1.2, 2.3],
      ['#fbbc05', 2.3, 3.5],
      ['#ea4335', 3.5, 5.2],
    ];
    ctx.lineWidth = size * 0.12;
    ctx.lineCap = 'butt';
    for (const [color, a0, a1] of arcs) {
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, a0, a1);
      ctx.stroke();
    }
    ctx.fillStyle = '#4285f4';
    ctx.fillRect(cx, cy - size * 0.06, size * 0.32, size * 0.12);
    return;
  }
  // WhatsApp
  rounded(ctx, x, y, size, size, r, '#25d366');
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x + size * 0.5, y + size * 0.46, size * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#25d366';
  ctx.beginPath();
  ctx.moveTo(x + size * 0.32, y + size * 0.78);
  ctx.quadraticCurveTo(x + size * 0.38, y + size * 0.62, x + size * 0.5, y + size * 0.66);
  ctx.quadraticCurveTo(x + size * 0.42, y + size * 0.74, x + size * 0.32, y + size * 0.78);
  ctx.fill();
  ctx.strokeStyle = '#25d366';
  ctx.lineWidth = size * 0.07;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x + size * 0.5, y + size * 0.46, size * 0.14, 0.3, 5.2);
  ctx.stroke();
}

const LOCK_BRANDS: Array<{ brand: Brand; name: string; hooks: string[] }> = [
  { brand: 'instagram', name: 'Instagram', hooks: ['Replied to your story:', 'Mentioned you:', 'New comment:'] },
  { brand: 'whatsapp', name: 'WhatsApp', hooks: ['New message:', '2 new messages:', 'Voice note:'] },
  { brand: 'x', name: 'X', hooks: ['New post from someone you follow:', 'Mentioned you:', 'Trending with you:'] },
  { brand: 'facebook', name: 'Facebook', hooks: ['Commented on your post:', 'Tagged you:', 'Memory:'] },
  { brand: 'google', name: 'Google', hooks: ['Security alert:', 'New sign-in:', 'Important:'] },
];

function money(amount: number) {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/** Chase/Revolut-inspired alert dashboard — seeded fantasy balances, no bank logos. */
function drawBanking(ctx: CanvasRenderingContext2D, cues: readonly LyricCue[], frame: number, options: Options) {
  const seed = options.deviceSeed ?? 0;
  // Weighted tiers so most runs feel rich; some hit $1M / $2M dream balances.
  const tier = seed % 10;
  const balance = tier >= 9 ? 2_000_000 + (seed % 97) * 1234.56
    : tier >= 7 ? 1_000_000 + (seed % 83) * 2345.67
      : tier >= 5 ? 100_000 + (seed % 900) * 87.32
        : tier >= 3 ? 12_000 + (seed % 700) * 12.48
          : 1_240 + (seed % 8000) / 100;
  const up = seed % 3 !== 1;
  const delta = (tier >= 7 ? 4_200 + (seed % 8000)
    : tier >= 5 ? 820 + (seed % 2400)
      : 48 + (seed % 900) / 10) * (up ? 1 : -1);
  const alerts = [
    { tone: 'warn' as const, title: 'Fraud Warning', body: 'Did you authorize this purchase?' },
    { tone: 'warn' as const, title: 'Unusual activity', body: 'Confirm this card payment.' },
    { tone: 'good' as const, title: 'Deposit received', body: 'Your balance just went up.' },
    { tone: 'good' as const, title: 'Payday landed', body: 'Direct deposit is available now.' },
    { tone: 'warn' as const, title: 'Large transfer', body: 'Was this wire request from you?' },
    { tone: 'good' as const, title: 'Cashback unlocked', body: 'Rewards hit your account today.' },
    { tone: 'good' as const, title: 'Interest paid', body: 'Monthly yield was added.' },
    { tone: 'warn' as const, title: 'Login alert', body: 'New sign-in from another device.' },
  ];
  const alert = alerts[seed % alerts.length];
  const alertFill = alert.tone === 'good' ? '#14532d' : '#7f1d1d';
  const alertTitle = alert.tone === 'good' ? '#bbf7d0' : '#fecaca';
  const alertMeta = alert.tone === 'good' ? '#86efac' : '#fca5a5';

  ctx.fillStyle = '#0b0f1a';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  status(ctx, options, frame, true);
  text(ctx, 'Accounts', 70, 190, `700 40px "Inter Variable"`, '#fff');
  rounded(ctx, 48, 240, 984, 300, 32, '#151b2d');
  text(ctx, 'Available balance', 84, 300, `500 24px "Inter Variable"`, '#94a3b8');
  text(ctx, money(balance), 84, 390, balance >= 1_000_000 ? `800 64px "Inter Variable"` : `800 72px "Inter Variable"`, '#fff');
  text(ctx, `${up ? '+' : ''}${money(delta)} today`, 84, 470, `700 28px "Inter Variable"`, up ? '#4ade80' : '#f87171');
  rounded(ctx, 700, 440, 280, 56, 28, up ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)');
  text(ctx, up ? '▲ In' : '▼ Out', 840, 468, `700 26px "Inter Variable"`, up ? '#4ade80' : '#f87171', 'center');

  rounded(ctx, 48, 580, 984, 220, 28, alertFill);
  text(ctx, alert.title, 84, 640, `800 36px "Inter Variable"`, alertTitle);
  text(ctx, alert.body, 84, 700, `700 32px "Inter Variable"`, '#fff');
  text(ctx, `Card ··${String(1000 + (seed % 9000)).slice(-4)} · ${up ? 'credit' : 'checking'}`, 84, 760, `500 24px "Inter Variable"`, alertMeta);

  text(ctx, 'Recent activity', 70, 880, `700 30px "Inter Variable"`, '#fff');
  const items = lyricBlocks(ctx, cues, frame, 820, 46, 48);
  for (const { wrapped, height, y } of placeNewest(items, 920, 1780, 16)) {
    rounded(ctx, 48, y, 984, height, 24, '#151b2d');
    rounded(ctx, 84, y + height / 2 - 28, 56, 56, 28, up ? '#14532d' : '#7f1d1d');
    text(ctx, up ? '+' : '−', 112, y + height / 2, `700 28px "Inter Variable"`, up ? '#4ade80' : '#f87171', 'center');
    wrapped.forEach((part, i) => text(ctx, part, 170, y + 40 + i * 46, `600 34px "Inter Variable"`, '#fff'));
  }
  rounded(ctx, 390, 1865, 300, 10, 5, '#141416');
}

/** Trending / autocomplete search. */
function drawSearch(ctx: CanvasRenderingContext2D, cues: readonly LyricCue[], frame: number, options: Options) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  status(ctx, options, frame);
  rounded(ctx, 48, 170, 820, 88, 44, '#f4f4f5');
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
  rounded(ctx, 390, 1865, 300, 10, 5, '#141416');
}

/**
 * iOS Lock Screen + Notification Center — matches real lock-screen density:
 * rose clock/date, dark glass banners, brand icons, Notification Center split,
 * flashlight/camera. Brand marks are drawn vectors for realism/curiosity.
 */
function drawLockScreen(ctx: CanvasRenderingContext2D, cues: readonly LyricCue[], frame: number, options: Options) {
  const clock = formatScreenClock(options.capturedAtMs, frame);
  const date = new Date(options.capturedAtMs + Math.floor(frame * 1000 / 30));
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
  const dayNum = date.getDate();
  const rose = '#f0c4c4';
  const seed = options.deviceSeed ?? 0;

  // Blurred lifestyle wallpaper (abstract bodies/shapes, not a real photo)
  const wallpaper = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  wallpaper.addColorStop(0, '#1c2433');
  wallpaper.addColorStop(0.4, '#3a465c');
  wallpaper.addColorStop(0.75, '#1a1f2b');
  wallpaper.addColorStop(1, '#0a0c12');
  ctx.fillStyle = wallpaper;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = 'rgba(160,170,190,0.16)';
  ctx.beginPath(); ctx.ellipse(280, 1180, 460, 560, -0.35, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(90,100,120,0.28)';
  ctx.beginPath(); ctx.ellipse(780, 1320, 420, 520, 0.25, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Carrier-style status (light on dark wallpaper)
  status(ctx, options, frame, true);

  // Date + weather (rose, lock-screen style)
  text(ctx, `${weekday} ${dayNum}`, WIDTH / 2 - 70, 248, `500 34px "Inter Variable"`, rose, 'center');
  ctx.fillStyle = rose;
  ctx.beginPath();
  ctx.arc(WIDTH / 2 + 48, 242, 10, Math.PI * 1.15, Math.PI * 1.95);
  ctx.strokeStyle = rose;
  ctx.lineWidth = 3;
  ctx.stroke();
  text(ctx, '77°', WIDTH / 2 + 110, 248, `500 34px "Inter Variable"`, rose, 'left');
  // Giant soft clock
  text(ctx, clock.time, WIDTH / 2, 430, `100 210px "Inter Variable"`, rose, 'center');

  const lines = dailyScreenFrame(cues, frame).lines;
  const cards = lines.map((line, index) => {
    const brand = LOCK_BRANDS[(seed + index) % LOCK_BRANDS.length];
    const hook = brand.hooks[(seed + index * 3) % brand.hooks.length];
    const body = `${hook} ${line.text}`;
    ctx.font = '500 30px "Inter Variable"';
    const wrapped = wrapScreenText(ctx, body, 740);
    const shown = wrapped.slice(0, 2);
    return {
      line,
      brand,
      wrapped: shown,
      height: 108 + Math.max(0, shown.length - 1) * 34,
      ago: index === lines.length - 1 ? 'now' : `${3 + ((seed + index * 7) % 50)}m ago`,
    };
  });

  // Prefer newest; leave room for controls
  const fitted = [...cards];
  while (fitted.length > 1) {
    const header = fitted.length > 2 ? 56 : 0;
    const total = fitted.reduce((sum, item) => sum + item.height + 12, -12) + header;
    if (600 + total <= 1560) break;
    fitted.shift();
  }

  let y = 600;
  fitted.forEach((card, index) => {
    // Split into Lock stack vs Notification Center like the reference
    if (index === Math.min(2, Math.max(1, fitted.length - 2)) && fitted.length > 2) {
      text(ctx, 'Notification Center', 56, y + 18, `700 30px "Inter Variable"`, '#fff');
      rounded(ctx, 980, y - 4, 48, 48, 24, 'rgba(120,120,128,0.55)');
      text(ctx, '✕', 1004, y + 20, `600 24px "Inter Variable"`, '#fff', 'center');
      y += 64;
    }

    // Dark frosted glass banner
    rounded(ctx, 36, y, 1008, card.height, 30, 'rgba(55,55,60,0.78)');
    // Inner highlight edge for glass depth
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(36, y, 1008, card.height, 30);
    ctx.stroke();

    drawBrandIcon(ctx, card.brand.brand, 60, y + 24, 60);
    ctx.font = '700 28px "Inter Variable"';
    const nameWidth = ctx.measureText(card.brand.name).width;
    text(ctx, card.brand.name, 144, y + 42, `700 28px "Inter Variable"`, '#fff');
    // Curiosity: redacted “who” chip next to app name (no real people)
    redact(ctx, 144 + nameWidth + 18, y + 28, 150, 28, 'rgba(255,255,255,0.22)');
    text(ctx, card.ago, 1012, y + 42, `500 24px "Inter Variable"`, 'rgba(255,255,255,0.55)', 'right');
    card.wrapped.forEach((part, i) => {
      text(ctx, part, 144, y + 82 + i * 34, `500 30px "Inter Variable"`, 'rgba(255,255,255,0.92)');
    });
    y += card.height + 12;
  });

  // Do Not Disturb pill (reference)
  rounded(ctx, 340, 1610, 400, 64, 32, 'rgba(40,40,45,0.7)');
  text(ctx, '☾  Do Not Disturb', WIDTH / 2, 1642, `600 26px "Inter Variable"`, 'rgba(255,255,255,0.9)', 'center');

  // Flashlight + camera
  rounded(ctx, 70, 1710, 110, 110, 55, 'rgba(255,255,255,0.2)');
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(125, 1740);
  ctx.lineTo(125, 1778);
  ctx.stroke();
  rounded(ctx, 112, 1778, 26, 18, 4, '#fff');
  rounded(ctx, 900, 1710, 110, 110, 55, 'rgba(255,255,255,0.2)');
  ctx.strokeStyle = '#fff';
  ctx.beginPath();
  ctx.roundRect(928, 1748, 54, 40, 8);
  ctx.moveTo(940, 1748);
  ctx.lineTo(948, 1736);
  ctx.lineTo(972, 1736);
  ctx.lineTo(980, 1748);
  ctx.moveTo(955, 1768);
  ctx.arc(955, 1768, 10, 0, Math.PI * 2);
  ctx.stroke();

  rounded(ctx, 390, 1865, 300, 10, 5, 'rgba(255,255,255,0.9)');
}

/**
 * iOS Phone → Recents → Missed (dark). Bold red primary rows, blue info,
 * bottom tab bar. Contact names stay redacted; lyrics fill the red title line.
 */
function drawMissedCall(ctx: CanvasRenderingContext2D, cues: readonly LyricCue[], frame: number, options: Options) {
  const clock = formatScreenClock(options.capturedAtMs, frame);
  const date = new Date(options.capturedAtMs + Math.floor(frame * 1000 / 30));
  const dayLabel = date.toLocaleDateString('en-US', { weekday: 'long' });
  const blue = '#0a84ff';
  const missed = '#ff453a';

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  // Compact light status on black (time left already in status chrome)
  status(ctx, options, frame, true);

  // Segmented All | Missed
  rounded(ctx, 340, 160, 400, 64, 12, '#1c1c1e');
  rounded(ctx, 538, 166, 194, 52, 9, '#636366');
  text(ctx, 'All', 440, 192, `600 28px "Inter Variable"`, '#fff', 'center');
  text(ctx, 'Missed', 635, 192, `700 28px "Inter Variable"`, '#fff', 'center');
  text(ctx, 'Edit', 996, 192, `400 30px "Inter Variable"`, blue, 'right');

  const lines = dailyScreenFrame(cues, frame).lines;
  const rowH = 118;
  const startY = 280;
  const maxRows = Math.floor((1580 - startY) / rowH);
  const visible = lines.slice(-Math.max(1, maxRows));

  visible.forEach((line, index) => {
    const y = startY + index * rowH;
    // Divider under each row (from text column to trailing edge)
    ctx.fillStyle = '#2c2c2e';
    ctx.fillRect(48, y + rowH - 2, 984, 2);

    ctx.font = '700 36px "Inter Variable"';
    const title = line.text.length > 28 ? `${line.text.slice(0, 27)}…` : line.text;
    text(ctx, title, 48, y + 42, `700 36px "Inter Variable"`, missed);
    text(ctx, 'unknown', 48, y + 82, `400 26px "Inter Variable"`, '#8e8e93');
    text(ctx, index === 0 ? dayLabel : clock.time, 900, y + 42, `400 28px "Inter Variable"`, '#8e8e93', 'right');
    // Info button
    ctx.strokeStyle = blue;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(1000, y + 58, 18, 0, Math.PI * 2);
    ctx.stroke();
    text(ctx, 'ⓘ', 1000, y + 58, `600 26px "Inter Variable"`, blue, 'center');
  });

  // Tab bar
  rounded(ctx, 0, 1680, WIDTH, 240, 0, 'rgba(28,28,30,0.96)');
  ctx.fillStyle = '#2c2c2e';
  ctx.fillRect(0, 1680, WIDTH, 1);
  const tabs = [
    { x: 108, label: 'Favorites', glyph: '☆', on: false },
    { x: 324, label: 'Recents', glyph: '◷', on: true },
    { x: 540, label: 'Contacts', glyph: '☺', on: false },
    { x: 756, label: 'Keypad', glyph: '▦', on: false },
    { x: 972, label: 'Voicemail', glyph: '▤', on: false },
  ];
  for (const tab of tabs) {
    const color = tab.on ? blue : '#8e8e93';
    text(ctx, tab.glyph, tab.x, 1745, `500 40px "Inter Variable"`, color, 'center');
    text(ctx, tab.label, tab.x, 1805, `500 22px "Inter Variable"`, color, 'center');
  }
  rounded(ctx, 390, 1865, 300, 10, 5, '#636366');
}

const DRAWERS: Record<SceneDailyScreenVariant, (ctx: CanvasRenderingContext2D, cues: readonly LyricCue[], frame: number, options: Options) => void> = {
  'banking-alert': drawBanking,
  'lock-screen': drawLockScreen,
  'missed-call': drawMissedCall,
  'search-screen': drawSearch,
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
