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

function appIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, colors: [string, string], glyph: string) {
  const g = ctx.createLinearGradient(x, y, x + size, y + size);
  g.addColorStop(0, colors[0]);
  g.addColorStop(1, colors[1]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, size * 0.22);
  ctx.fill();
  text(ctx, glyph, x + size / 2, y + size / 2, `700 ${Math.floor(size * 0.42)}px "Inter Variable"`, '#fff', 'center');
}

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
 * iOS Lock Screen + Notification Center — dark frosted banners, rose clock,
 * flashlight/camera controls. No real app logos or personal names.
 */
function drawLockScreen(ctx: CanvasRenderingContext2D, cues: readonly LyricCue[], frame: number, options: Options) {
  const clock = formatScreenClock(options.capturedAtMs, frame);
  const date = new Date(options.capturedAtMs + Math.floor(frame * 1000 / 30));
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
  const dayNum = date.getDate();
  const rose = '#e8b4b8';

  // Soft blurred photo backdrop (abstract, not a real photo)
  const wallpaper = ctx.createRadialGradient(540, 900, 80, 540, 700, 1100);
  wallpaper.addColorStop(0, '#5a6d8c');
  wallpaper.addColorStop(0.35, '#2a3548');
  wallpaper.addColorStop(0.7, '#1a2230');
  wallpaper.addColorStop(1, '#0c1018');
  ctx.fillStyle = wallpaper;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = 'rgba(120,140,170,0.18)';
  ctx.beginPath(); ctx.ellipse(300, 1100, 420, 520, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(80,90,110,0.22)';
  ctx.beginPath(); ctx.ellipse(820, 1280, 380, 480, 0.2, 0, Math.PI * 2); ctx.fill();

  status(ctx, options, frame, true);

  // Date + weather row (rose, like the reference)
  text(ctx, `${weekday} ${dayNum}  ☁︎  77°`, WIDTH / 2, 250, `500 36px "Inter Variable"`, rose, 'center');
  // Large lock-screen clock
  text(ctx, clock.time, WIDTH / 2, 430, `200 200px "Inter Variable"`, rose, 'center');

  const lines = dailyScreenFrame(cues, frame).lines;
  const cards = lines.map((line, index) => {
    ctx.font = '600 30px "Inter Variable"';
    const wrapped = wrapScreenText(ctx, line.text, 760);
    return {
      line,
      wrapped,
      height: 56 + wrapped.length * 36 + 28,
      ago: index === lines.length - 1 ? 'now' : `${4 + index * 9}m ago`,
      kind: index % 3,
    };
  });

  // Keep newest notifications; stack from top under the clock like Notification Center
  const fitted = [...cards];
  while (fitted.length > 1) {
    const total = fitted.reduce((sum, item) => sum + item.height + 14, -14);
    if (620 + total <= 1580) break;
    fitted.shift();
  }

  let y = 620;
  const icons: Array<{ colors: [string, string]; glyph: string; label: string }> = [
    { colors: ['#f58529', '#dd2a7b'], glyph: '◎', label: 'Photos' },
    { colors: ['#0084ff', '#00c6ff'], glyph: '💬', label: 'Chat' },
    { colors: ['#34c759', '#30d158'], glyph: 'A', label: 'Messages' },
  ];

  fitted.forEach((card, index) => {
    if (index === Math.min(2, fitted.length - 1) && fitted.length > 2) {
      text(ctx, 'Notification Center', 70, y + 10, `700 28px "Inter Variable"`, '#fff');
      rounded(ctx, 980, y - 10, 44, 44, 22, 'rgba(255,255,255,0.22)');
      text(ctx, '✕', 1002, y + 12, `600 22px "Inter Variable"`, '#fff', 'center');
      y += 56;
    }

    // Dark glass banner (reference: translucent charcoal, not white frost)
    rounded(ctx, 40, y, 1000, card.height, 28, 'rgba(40,42,48,0.72)');
    const icon = icons[card.kind % icons.length];
    appIcon(ctx, 64, y + 22, 56, icon.colors, icon.glyph);
    // Title row: redacted app/contact + relative time
    if (card.kind === 2) {
      rounded(ctx, 140, y + 26, 52, 52, 26, '#6b7280');
      text(ctx, 'A', 166, y + 52, `700 24px "Inter Variable"`, '#fff', 'center');
      rounded(ctx, 172, y + 58, 22, 22, 11, '#34c759');
    }
    redact(ctx, card.kind === 2 ? 210 : 140, y + 32, 210, 26, 'rgba(255,255,255,0.28)');
    text(ctx, card.ago, 1008, y + 44, `500 24px "Inter Variable"`, 'rgba(255,255,255,0.55)', 'right');
    card.wrapped.forEach((part, i) => {
      text(ctx, part, 140, y + 78 + i * 36, `500 28px "Inter Variable"`, 'rgba(255,255,255,0.92)');
    });
    y += card.height + 14;
  });

  // Flashlight + camera (lock screen controls)
  rounded(ctx, 70, 1680, 110, 110, 55, 'rgba(255,255,255,0.18)');
  // flashlight glyph
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(125, 1710);
  ctx.lineTo(125, 1748);
  ctx.stroke();
  rounded(ctx, 112, 1748, 26, 18, 4, '#fff');
  rounded(ctx, 900, 1680, 110, 110, 55, 'rgba(255,255,255,0.18)');
  // camera glyph
  ctx.strokeStyle = '#fff';
  ctx.beginPath();
  ctx.roundRect(928, 1718, 54, 40, 8);
  ctx.moveTo(940, 1718);
  ctx.lineTo(948, 1706);
  ctx.lineTo(972, 1706);
  ctx.lineTo(980, 1718);
  ctx.moveTo(955, 1738);
  ctx.arc(955, 1738, 10, 0, Math.PI * 2);
  ctx.stroke();

  rounded(ctx, 390, 1865, 300, 10, 5, 'rgba(255,255,255,0.85)');
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
