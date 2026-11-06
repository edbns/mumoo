import { HEIGHT, WIDTH, type DomDailyScreenVariant, type LyricCue } from './composition';
import {
  dailyScreenFrame,
  formatScreenClock,
  screenDeviceStatus,
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

function redact(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  rounded(ctx, x, y, w, h, Math.min(8, h / 2), '#1d1e22');
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
  const clock = formatScreenClock(options.capturedAtMs, frame);
  const status = screenDeviceStatus(options.capturedAtMs, options.deviceSeed, options.variant);
  const ink = light ? '#ffffff' : '#1b1c20';
  text(ctx, clock.time, 130, 100, `600 34px "Inter Variable"`, ink);
  if (status.dynamicIsland) rounded(ctx, 420, 28, 240, 68, 34, '#0b0b0d');
  let x = 980;
  rounded(ctx, x - 54, 87, 54, 26, 5, 'transparent');
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x - 54, 87, 54, 26, 5);
  ctx.stroke();
  ctx.fillStyle = '#34c759';
  ctx.fillRect(x - 50, 91, Math.max(4, (54 - 8) * status.batteryPercent / 100), 18);
  x -= 78;
  if (status.network !== 'none') {
    text(ctx, status.network.toUpperCase(), x, 100, `600 18px "Inter Variable"`, ink, 'right');
    x -= 58;
  }
  for (let bar = 0; bar < 4; bar++) {
    ctx.fillStyle = bar < status.signalBars ? ink : (light ? 'rgba(255,255,255,0.25)' : 'rgba(27,28,32,0.22)');
    ctx.fillRect(x - 36 + bar * 9, 108 - (7 + bar * 4), 6, 7 + bar * 4);
  }
}

function entrance(frame: number, startFrame: number) {
  return Math.min(1, Math.max(0, (frame - startFrame + 1) / 5));
}

function drawDating(ctx: CanvasRenderingContext2D, cues: readonly LyricCue[], frame: number, options: Options) {
  const bumble = ((options.deviceSeed ?? 0) % 2) === 1;
  const accent = bumble ? '#ffc629' : '#fe3c72';
  const accentDeep = bumble ? '#111111' : '#ff7854';
  const lines = dailyScreenFrame(cues, frame).lines;
  const matchBeat = Math.min(1, frame / 48);

  ctx.fillStyle = '#0c0c0f';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawStatus(ctx, options, frame, true);

  // Full-bleed card stack (Tinder/Bumble-like curiosity hook).
  rounded(ctx, 70, 180, 940, 1180, 42, '#1a1b22');
  const photo = ctx.createLinearGradient(70, 180, 1010, 1360);
  photo.addColorStop(0, bumble ? '#3a3420' : '#4a1830');
  photo.addColorStop(0.45, bumble ? '#c9a227' : '#fe3c72');
  photo.addColorStop(1, bumble ? '#111111' : '#1a0a14');
  ctx.fillStyle = photo;
  ctx.beginPath();
  ctx.roundRect(70, 180, 940, 1180, 42);
  ctx.fill();

  // Soft vignette without html2canvas-fragile shadows.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(70, 980, 940, 380);

  avatar(ctx, 360, 520, 118, '#f2f2f4', '#9aa1b0');
  avatar(ctx, 720, 520, 118, '#efe6d8', '#b08978');
  rounded(ctx, 500, 470, 80, 80, 40, accent);
  text(ctx, '♥', 540, 512, `700 42px "Inter Variable"`, bumble ? '#111' : '#fff', 'center');

  const titleAlpha = 0.55 + matchBeat * 0.45;
  ctx.globalAlpha = titleAlpha;
  text(ctx, "IT'S A MATCH!", WIDTH / 2, 760, `800 72px "Inter Variable"`, '#ffffff', 'center');
  ctx.globalAlpha = 1;
  text(ctx, bumble ? 'You both liked each other' : 'You and someone new liked each other', WIDTH / 2, 830, `500 28px "Inter Variable"`, 'rgba(255,255,255,0.82)', 'center');
  redact(ctx, 390, 870, 140, 28);
  text(ctx, '&', 560, 884, `600 28px "Inter Variable"`, '#fff', 'center');
  redact(ctx, 590, 870, 140, 28);

  // Lyric chat sheet — large, high in frame so cues stay readable.
  rounded(ctx, 0, 1180, WIDTH, 740, 0, '#ffffff');
  rounded(ctx, 0, 1180, WIDTH, 740, 48, '#ffffff');
  text(ctx, 'Say something that stands out', WIDTH / 2, 1240, `600 26px "Inter Variable"`, '#6b7280', 'center');

  let y = 1300;
  ctx.font = '500 44px "Inter Variable"';
  for (const line of lines) {
    const wrapped = wrapScreenText(ctx, line.text, 720);
    const h = wrapped.length * 54 + 36;
    const t = entrance(frame, line.startFrame);
    const w = Math.min(780, Math.max(160, ...wrapped.map(part => ctx.measureText(part).width)) + 56);
    const x = WIDTH - 70 - w;
    ctx.globalAlpha = 0.4 + t * 0.6;
    rounded(ctx, x, y + (1 - t) * 14, w, h, 28, accent);
    wrapped.forEach((part, i) => text(ctx, part, x + 28, y + (1 - t) * 14 + 40 + i * 54, `500 44px "Inter Variable"`, bumble ? '#111' : '#fff'));
    ctx.globalAlpha = 1;
    y += h + 18;
    if (y > 1680) break;
  }

  rounded(ctx, 70, 1740, 940, 88, 44, '#f3f4f6');
  text(ctx, 'Send a message', 110, 1784, `500 32px "Inter Variable"`, '#9ca3af');
  rounded(ctx, 880, 1754, 100, 60, 30, accent);
  text(ctx, '→', 930, 1786, `700 34px "Inter Variable"`, bumble ? '#111' : '#fff', 'center');
  rounded(ctx, 390, 1875, 300, 10, 5, '#141416');
  void accentDeep;
}

function drawRide(ctx: CanvasRenderingContext2D, cues: readonly LyricCue[], frame: number, options: Options) {
  const lines = dailyScreenFrame(cues, frame).lines;
  const progress = Math.min(1, frame / 449);
  const eta = Math.max(1, Math.round(7 - progress * 5));

  // Uber-like dark map plane.
  ctx.fillStyle = '#0e1116';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawStatus(ctx, options, frame, true);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  for (let x = 40; x < WIDTH; x += 90) {
    ctx.beginPath(); ctx.moveTo(x, 120); ctx.lineTo(x, 980); ctx.stroke();
  }
  for (let y = 140; y < 980; y += 90) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke();
  }
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(180, 820);
  ctx.quadraticCurveTo(420, 420, 860, 300);
  ctx.stroke();
  rounded(ctx, 150, 790, 54, 54, 27, '#ffffff');
  text(ctx, 'A', 177, 818, `700 24px "Inter Variable"`, '#111', 'center');
  const carX = 220 + progress * 560;
  const carY = 760 - progress * 380;
  rounded(ctx, carX, carY, 70, 70, 35, '#000000');
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(carX, carY, 70, 70, 35);
  ctx.stroke();
  text(ctx, '●', carX + 35, carY + 36, `700 28px "Inter Variable"`, '#fff', 'center');

  // Large bottom sheet — lyrics live here, fully visible.
  rounded(ctx, 0, 860, WIDTH, 1060, 0, '#ffffff');
  rounded(ctx, 0, 860, WIDTH, 1060, 40, '#ffffff');
  rounded(ctx, 490, 878, 100, 8, 4, '#d4d4d8');
  text(ctx, `${eta} min away`, 70, 940, `800 64px "Inter Variable"`, '#111');
  text(ctx, 'Meet at the pin · Comfort', 70, 1005, `500 28px "Inter Variable"`, '#6b7280');

  rounded(ctx, 70, 1060, 940, 150, 28, '#f4f4f5');
  avatar(ctx, 150, 1135, 42, '#d7dbe6', '#7f8798');
  redact(ctx, 220, 1105, 220, 28);
  text(ctx, '4.97 · 312 trips', 220, 1160, `500 24px "Inter Variable"`, '#6b7280');
  redact(ctx, 720, 1110, 210, 36);
  text(ctx, 'Black SUV', 825, 1170, `600 24px "Inter Variable"`, '#111', 'center');

  text(ctx, 'Message', 70, 1280, `700 30px "Inter Variable"`, '#111');
  let y = 1330;
  ctx.font = '500 46px "Inter Variable"';
  for (const line of lines) {
    const wrapped = wrapScreenText(ctx, line.text, 820);
    const h = wrapped.length * 56 + 40;
    const t = entrance(frame, line.startFrame);
    ctx.globalAlpha = 0.45 + t * 0.55;
    rounded(ctx, 70, y + (1 - t) * 12, WIDTH - 140, h, 28, '#111111');
    wrapped.forEach((part, i) => text(ctx, part, 100, y + (1 - t) * 12 + 42 + i * 56, `500 46px "Inter Variable"`, '#ffffff'));
    ctx.globalAlpha = 1;
    y += h + 20;
    if (y > 1760) break;
  }
  rounded(ctx, 70, 1785, 940, 80, 40, '#f4f4f5');
  text(ctx, 'Send a message…', 110, 1825, `500 30px "Inter Variable"`, '#9ca3af');
  rounded(ctx, 390, 1890, 300, 10, 5, '#141416');
}

function drawFood(ctx: CanvasRenderingContext2D, cues: readonly LyricCue[], frame: number, options: Options) {
  const lines = dailyScreenFrame(cues, frame).lines;
  const progress = Math.min(1, frame / 449);
  const stage = progress < 0.25 ? 0 : progress < 0.55 ? 1 : progress < 0.82 ? 2 : 3;
  const eta = Math.max(2, Math.round(22 - progress * 18));
  const steps = ['Order confirmed', 'Preparing', 'On the way', 'Nearby'];

  ctx.fillStyle = '#fff7f0';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawStatus(ctx, options, frame, false);

  // Solid card — no shadows (html2canvas banding).
  rounded(ctx, 48, 150, 984, 280, 34, '#ffffff');
  text(ctx, 'FOOD DELIVERY', 84, 200, `700 22px "Inter Variable"`, '#d35400');
  redact(ctx, 84, 230, 420, 36);
  text(ctx, 'Order · #4821', 84, 300, `500 26px "Inter Variable"`, '#7a6558');
  text(ctx, 'Estimated arrival', 84, 360, `500 24px "Inter Variable"`, '#7a6558');
  text(ctx, `${eta} min`, 980, 360, `800 58px "Inter Variable"`, '#d35400', 'right');

  let y = 480;
  steps.forEach((label, index) => {
    const on = index <= stage;
    ctx.fillStyle = on ? '#d35400' : '#e8d7c8';
    ctx.beginPath();
    ctx.arc(84, y, 14, 0, Math.PI * 2);
    ctx.fill();
    if (index < steps.length - 1) {
      ctx.fillStyle = index < stage ? '#d35400' : '#e8d7c8';
      ctx.fillRect(82, y + 16, 4, 70);
    }
    text(ctx, label, 130, y, `700 32px "Inter Variable"`, '#1b1c20');
    text(ctx, index === stage ? 'In progress' : index < stage ? 'Done' : 'Up next', 130, y + 34, `500 22px "Inter Variable"`, '#7a6558');
    y += 96;
  });

  y = 900;
  for (const line of lines) {
    const wrapped = wrapScreenText(ctx, line.text, 860);
    const h = wrapped.length * 52 + 70;
    const t = entrance(frame, line.startFrame);
    ctx.globalAlpha = 0.5 + t * 0.5;
    rounded(ctx, 48, y + (1 - t) * 10, 984, h, 28, '#ffffff');
    text(ctx, 'UPDATE', 84, y + (1 - t) * 10 + 34, `700 22px "Inter Variable"`, '#d35400');
    wrapped.forEach((part, i) => text(ctx, part, 84, y + (1 - t) * 10 + 78 + i * 52, `500 36px "Inter Variable"`, '#1b1c20'));
    ctx.globalAlpha = 1;
    y += h + 18;
    if (y > 1500) break;
  }

  rounded(ctx, 48, 1640, 984, 160, 30, '#1f1712');
  avatar(ctx, 140, 1720, 38, '#6d5848', '#3a2d24');
  redact(ctx, 210, 1685, 260, 28);
  text(ctx, 'Electric bike', 210, 1735, `500 24px "Inter Variable"`, '#d7c4b4');
  text(ctx, 'On route', 940, 1720, `700 28px "Inter Variable"`, '#ffb080', 'right');
  rounded(ctx, 390, 1865, 300, 10, 5, '#141416');
}

/** Fast, solid-color Canvas export matching the React preview layouts. */
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
