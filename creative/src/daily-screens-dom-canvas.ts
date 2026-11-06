import { HEIGHT, WIDTH, type DomDailyScreenVariant, type LyricCue } from './composition';
import {
  dailyScreenFrame,
  drawDeviceStatus,
  wrapScreenText,
} from './daily-screens';

type Options = { variant: DomDailyScreenVariant; capturedAtMs: number; deviceSeed?: number };

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
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.arc(x - r * 0.22, y - r * 0.28, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
}

function drawStatus(ctx: CanvasRenderingContext2D, options: Options, frame: number, light = false) {
  drawDeviceStatus(ctx, options.capturedAtMs, frame, 130, 100, options.variant, options.deviceSeed, light ? '#ffffff' : '#1b1c20');
}

function entrance(frame: number, startFrame: number) {
  // Fully visible on the WhisperX start frame — no multi-frame fade lag.
  return Math.min(1, Math.max(0, frame - startFrame + 1));
}

/** Tinder / Bumble–inspired match moment (no logos). Gummble refs: Tinder/Bumble iOS. */
function drawDating(ctx: CanvasRenderingContext2D, cues: readonly LyricCue[], frame: number, options: Options) {
  const bumble = ((options.deviceSeed ?? 0) % 2) === 1;
  const accent = bumble ? '#ffc629' : '#fd267a';
  const inkOnAccent = bumble ? '#111111' : '#ffffff';
  const lines = dailyScreenFrame(cues, frame).lines;
  const pulse = Math.min(1, frame / 36);

  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  if (bumble) {
    bg.addColorStop(0, '#111111');
    bg.addColorStop(1, '#2a240f');
  } else {
    bg.addColorStop(0, '#1a0530');
    bg.addColorStop(0.55, '#fd267a');
    bg.addColorStop(1, '#ff6036');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawStatus(ctx, options, frame, true);

  // Overlapping match photos — classic "It's a Match" curiosity hook.
  avatar(ctx, 390, 520, 150, '#f3f4f6', '#9aa3b5');
  avatar(ctx, 690, 520, 150, '#f7e9de', '#b08978');
  rounded(ctx, 500, 470, 80, 80, 40, accent);
  text(ctx, '♥', 540, 512, `700 42px "Inter Variable"`, inkOnAccent, 'center');

  ctx.globalAlpha = 0.65 + pulse * 0.35;
  text(ctx, "IT'S A MATCH!", WIDTH / 2, 780, `800 78px "Inter Variable"`, '#ffffff', 'center');
  ctx.globalAlpha = 1;
  text(ctx, bumble ? 'You both liked each other' : 'You and someone new liked each other', WIDTH / 2, 860, `500 30px "Inter Variable"`, 'rgba(255,255,255,0.9)', 'center');
  redact(ctx, 360, 900, 160, 32, 'rgba(0,0,0,0.55)');
  text(ctx, '&', WIDTH / 2, 916, `700 28px "Inter Variable"`, '#fff', 'center');
  redact(ctx, 560, 900, 160, 32, 'rgba(0,0,0,0.55)');

  // White composer sheet — prompt, lyric bubbles, and CTA all fully inside.
  const sheetTop = 1080;
  const sheetHeight = 700;
  const sheetBottom = sheetTop + sheetHeight;
  const ctaTop = sheetBottom - 140;
  rounded(ctx, 70, sheetTop, 940, sheetHeight, 40, '#ffffff');
  text(ctx, 'Say something that stands out', WIDTH / 2, sheetTop + 55, `600 28px "Inter Variable"`, '#6b7280', 'center');

  let y = sheetTop + 110;
  ctx.font = '600 48px "Inter Variable"';
  for (const line of lines) {
    const wrapped = wrapScreenText(ctx, line.text, 760);
    const h = wrapped.length * 58 + 40;
    const t = entrance(frame, line.startFrame);
    const w = Math.min(820, Math.max(180, ...wrapped.map(part => ctx.measureText(part).width)) + 60);
    const x = (WIDTH - w) / 2;
    if (y + h > ctaTop - 24) break;
    ctx.globalAlpha = 0.45 + t * 0.55;
    rounded(ctx, x, y + (1 - t) * 16, w, h, 30, accent);
    wrapped.forEach((part, i) => text(ctx, part, WIDTH / 2, y + (1 - t) * 16 + 44 + i * 58, `600 48px "Inter Variable"`, inkOnAccent, 'center'));
    ctx.globalAlpha = 1;
    y += h + 22;
  }

  rounded(ctx, 120, ctaTop, 840, 100, 50, accent);
  text(ctx, 'Send Message', WIDTH / 2, ctaTop + 50, `700 36px "Inter Variable"`, inkOnAccent, 'center');
  rounded(ctx, 390, 1865, 300, 10, 5, '#141416');
}

/** Uber-inspired pickup + driver message (no logos). Gummble: Uber trips / message-driver. */
function drawRide(ctx: CanvasRenderingContext2D, cues: readonly LyricCue[], frame: number, options: Options) {
  const lines = dailyScreenFrame(cues, frame).lines;
  const progress = Math.min(1, frame / 449);
  const eta = Math.max(1, Math.round(5 - progress * 4));

  // Light city map plane (Uber trip sheet reference).
  ctx.fillStyle = '#e8edf2';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawStatus(ctx, options, frame, false);
  ctx.strokeStyle = 'rgba(40,60,80,0.12)';
  ctx.lineWidth = 3;
  for (let x = 0; x < WIDTH; x += 70) {
    ctx.beginPath(); ctx.moveTo(x, 120); ctx.lineTo(x, 900); ctx.stroke();
  }
  for (let y = 140; y < 900; y += 70) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke();
  }
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(160, 780);
  ctx.quadraticCurveTo(480, 420, 900, 280);
  ctx.stroke();
  rounded(ctx, 140, 750, 70, 70, 35, '#276ef1');
  text(ctx, 'P', 175, 786, `800 28px "Inter Variable"`, '#fff', 'center');
  const carX = 200 + progress * 620;
  const carY = 720 - progress * 360;
  rounded(ctx, carX, carY, 78, 46, 12, '#111111');
  text(ctx, `${Math.max(0.2, (1.2 - progress)).toFixed(1)} mi`, carX + 100, carY + 24, `700 22px "Inter Variable"`, '#111');

  // Large white sheet — lyrics as driver chat (high contrast, fully visible).
  rounded(ctx, 0, 820, WIDTH, 1100, 0, '#ffffff');
  rounded(ctx, 0, 820, WIDTH, 1100, 36, '#ffffff');
  text(ctx, `Pickup in ${eta} min`, 70, 900, `800 58px "Inter Variable"`, '#111');
  rounded(ctx, 70, 950, 940, 150, 24, '#f3f4f6');
  text(ctx, 'Meet at your pickup spot on', 100, 1000, `500 26px "Inter Variable"`, '#52525b');
  redact(ctx, 100, 1035, 360, 30);
  text(ctx, 'Same side of the street', 100, 1085, `500 24px "Inter Variable"`, '#71717a');

  rounded(ctx, 70, 1130, 940, 160, 28, '#fafafa');
  rounded(ctx, 100, 1160, 140, 100, 16, '#d4d4d8');
  text(ctx, 'SUV', 170, 1215, `700 28px "Inter Variable"`, '#111', 'center');
  redact(ctx, 270, 1175, 210, 34);
  text(ctx, 'Comfort', 270, 1240, `500 24px "Inter Variable"`, '#52525b');
  avatar(ctx, 900, 1210, 42);
  rounded(ctx, 870, 1175, 70, 28, 14, '#111');
  text(ctx, '4.98', 905, 1190, `700 18px "Inter Variable"`, '#fff', 'center');
  redact(ctx, 780, 1245, 180, 26);

  text(ctx, 'Message', 70, 1360, `700 30px "Inter Variable"`, '#111');
  let y = 1410;
  ctx.font = '600 46px "Inter Variable"';
  for (const line of lines) {
    const wrapped = wrapScreenText(ctx, line.text, 820);
    const h = wrapped.length * 56 + 44;
    const t = entrance(frame, line.startFrame);
    ctx.globalAlpha = 0.5 + t * 0.5;
    // Outgoing lyric bubble — Uber chat style, large.
    const w = Math.min(900, Math.max(200, ...wrapped.map(part => ctx.measureText(part).width)) + 56);
    const x = WIDTH - 70 - w;
    rounded(ctx, x, y + (1 - t) * 12, w, h, 28, '#111111');
    wrapped.forEach((part, i) => text(ctx, part, x + 28, y + (1 - t) * 12 + 42 + i * 56, `600 46px "Inter Variable"`, '#ffffff'));
    ctx.globalAlpha = 1;
    y += h + 18;
    if (y > 1720) break;
  }
  rounded(ctx, 70, 1760, 780, 84, 42, '#f4f4f5');
  text(ctx, 'Message…', 110, 1802, `500 30px "Inter Variable"`, '#9ca3af');
  rounded(ctx, 880, 1768, 70, 70, 35, '#111');
  text(ctx, '↑', 915, 1805, `700 28px "Inter Variable"`, '#fff', 'center');
  rounded(ctx, 390, 1888, 300, 10, 5, '#141416');
}

/** DoorDash-inspired tracking (no logos). Gummble: DoorDash on-the-way. */
function drawFood(ctx: CanvasRenderingContext2D, cues: readonly LyricCue[], frame: number, options: Options) {
  const lines = dailyScreenFrame(cues, frame).lines;
  const progress = Math.min(1, frame / 449);
  const stage = progress < 0.25 ? 0 : progress < 0.55 ? 1 : progress < 0.82 ? 2 : 3;
  const eta = Math.max(1, Math.round(18 - progress * 16));

  // Map top
  ctx.fillStyle = '#f0f2f5';
  ctx.fillRect(0, 0, WIDTH, 820);
  drawStatus(ctx, options, frame, false);
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 2;
  for (let x = 0; x < WIDTH; x += 64) {
    ctx.beginPath(); ctx.moveTo(x, 120); ctx.lineTo(x, 820); ctx.stroke();
  }
  for (let y = 140; y < 820; y += 64) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke();
  }
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 10;
  ctx.strokeRect(220, 260, 560, 360);
  rounded(ctx, 200, 240, 54, 54, 12, '#111');
  text(ctx, 'S', 227, 268, `700 24px "Inter Variable"`, '#fff', 'center');
  rounded(ctx, 760, 580, 54, 54, 12, '#111');
  text(ctx, 'H', 787, 608, `700 24px "Inter Variable"`, '#fff', 'center');
  const courierX = 260 + progress * 480;
  const courierY = 280 + progress * 280;
  rounded(ctx, courierX, courierY, 64, 64, 32, '#eb1700');
  text(ctx, '●', courierX + 32, courierY + 33, `700 28px "Inter Variable"`, '#fff', 'center');

  // Bottom sheet
  rounded(ctx, 0, 760, WIDTH, 1160, 0, '#ffffff');
  rounded(ctx, 0, 760, WIDTH, 1160, 36, '#ffffff');
  text(ctx, 'Heading to', 70, 840, `500 28px "Inter Variable"`, '#71717a');
  redact(ctx, 70, 870, 320, 36);
  text(ctx, eta <= 2 ? 'Arriving now' : `Arriving in ${eta} min`, 70, 950, `800 52px "Inter Variable"`, '#111');

  // Horizontal milestone rail
  const marks = [140, 380, 620, 860];
  ctx.fillStyle = '#e5e7eb';
  ctx.fillRect(140, 1010, 720, 8);
  ctx.fillStyle = '#111';
  ctx.fillRect(140, 1010, (marks[Math.min(stage, 3)] - 140), 8);
  marks.forEach((x, i) => {
    rounded(ctx, x - 18, 992, 36, 36, 18, i <= stage ? '#111' : '#e5e7eb');
  });

  // Lyric updates — solid white cards (no shadow banding)
  let y = 1100;
  for (const line of lines) {
    const wrapped = wrapScreenText(ctx, line.text, 860);
    const h = wrapped.length * 52 + 78;
    const t = entrance(frame, line.startFrame);
    ctx.globalAlpha = 0.55 + t * 0.45;
    rounded(ctx, 48, y + (1 - t) * 10, 984, h, 28, '#f7f7f8');
    text(ctx, 'UPDATE', 84, y + (1 - t) * 10 + 36, `700 22px "Inter Variable"`, '#eb1700');
    wrapped.forEach((part, i) => text(ctx, part, 84, y + (1 - t) * 10 + 82 + i * 52, `600 38px "Inter Variable"`, '#111'));
    ctx.globalAlpha = 1;
    y += h + 16;
    if (y > 1480) break;
  }

  rounded(ctx, 48, 1620, 984, 170, 28, '#111111');
  avatar(ctx, 140, 1705, 40, '#6d5848', '#3a2d24');
  text(ctx, 'Your courier', 210, 1675, `500 22px "Inter Variable"`, '#a1a1aa');
  redact(ctx, 210, 1705, 240, 28, '#f4f4f5');
  text(ctx, 'On the way', 940, 1705, `700 28px "Inter Variable"`, '#fb923c', 'right');
  rounded(ctx, 390, 1865, 300, 10, 5, '#141416');
}

/** Fast solid-color Canvas export matched to React preview + Gummble references. */
export function drawDomDailyScreen(
  canvas: HTMLCanvasElement,
  cues: readonly LyricCue[],
  frame: number,
  options: Options,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable.');
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  if (options.variant === 'dating') drawDating(ctx, cues, frame, options);
  else if (options.variant === 'ride') drawRide(ctx, cues, frame, options);
  else drawFood(ctx, cues, frame, options);
}
