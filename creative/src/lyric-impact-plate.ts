import { HEIGHT, WIDTH } from './composition';
import type { DrawContext } from './lyric-impact-motion';

/** Baked original world plate — generated offline once, composited at preview/export. */
export const HERO_DEPTH_PLATE_URL = '/lyric-worlds/hero-depth.mp4';

type PlateState = {
  video: HTMLVideoElement;
  ready: Promise<void>;
  lastSeekMs: number;
  buffer: HTMLCanvasElement;
};

const plates = new Map<string, PlateState>();

function loadPlate(url: string): PlateState {
  const existing = plates.get(url);
  if (existing) return existing;
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.loop = true;
  video.src = url;
  const buffer = document.createElement('canvas');
  buffer.width = WIDTH;
  buffer.height = HEIGHT;
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('World plate timed out.')), 20000);
    video.onloadeddata = () => { clearTimeout(timer); resolve(); };
    video.onerror = () => { clearTimeout(timer); reject(new Error('World plate failed to load.')); };
    video.load();
  });
  const state = { video, ready, lastSeekMs: -1, buffer };
  plates.set(url, state);
  return state;
}

export async function preloadImpactPlates(urls: readonly string[] = [HERO_DEPTH_PLATE_URL]) {
  await Promise.all(urls.map(url => loadPlate(url).ready));
}

async function seekPlate(state: PlateState, ms: number) {
  const { video } = state;
  const durationMs = Math.max(100, (video.duration || 15) * 1000 - 40);
  const target = ((ms % durationMs) + durationMs) % durationMs;
  const seconds = target / 1000;
  if (Math.abs(state.lastSeekMs - target) < 20 && Math.abs(video.currentTime - seconds) < 0.05) return;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      state.lastSeekMs = target;
      resolve();
    };
    const timer = setTimeout(() => reject(new Error('World plate seek timed out.')), 5000);
    video.onseeked = finish;
    video.onerror = () => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error('World plate seek failed.')); } };
    video.currentTime = seconds;
    if (Math.abs(video.currentTime - seconds) < 0.002) finish();
  });
}

function paintGrade(ctx: CanvasRenderingContext2D, draw: DrawContext) {
  const vig = ctx.createRadialGradient(WIDTH / 2, HEIGHT * 0.42, 140, WIDTH / 2, HEIGHT / 2, 1100);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(0.65, 'rgba(2,6,23,0.12)');
  vig.addColorStop(1, 'rgba(2,6,23,0.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = `rgba(125,211,252,${0.04 + draw.reaction.energy * 0.05})`;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

/** Seek plate and stamp a graded frame into an offscreen buffer for sync compositing. */
export async function prepareHeroDepthPlate(draw: DrawContext) {
  const state = loadPlate(HERO_DEPTH_PLATE_URL);
  await state.ready;
  await seekPlate(state, draw.ms);
  const ctx = state.buffer.getContext('2d');
  if (!ctx || !state.video.videoWidth) throw new Error('World plate is unavailable.');
  const beat = draw.reaction.beat;
  const energy = draw.reaction.energy;
  const t = draw.ms / 1000;
  const zoom = 1.06 + energy * 0.035 + beat * 0.012 + Math.sin(t * 0.15) * 0.008;
  const panX = Math.sin(t * 0.11) * 18 + beat * 4;
  const panY = Math.cos(t * 0.09) * 14 + energy * 6;
  const scale = Math.max(WIDTH / state.video.videoWidth, HEIGHT / state.video.videoHeight) * zoom;
  const w = state.video.videoWidth * scale;
  const h = state.video.videoHeight * scale;
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.drawImage(state.video, (WIDTH - w) / 2 + panX, (HEIGHT - h) / 2 + panY, w, h);
  paintGrade(ctx, draw);
  return state.buffer;
}

export function blitPreparedPlate(ctx: CanvasRenderingContext2D, plate: CanvasImageSource) {
  ctx.drawImage(plate, 0, 0, WIDTH, HEIGHT);
}

export function paintHeroDepthForeground(draw: DrawContext) {
  const { ctx, reaction } = draw;
  const edge = 0.45 + reaction.beat * 0.15;
  ctx.fillStyle = `rgba(2,6,23,${edge})`;
  ctx.fillRect(0, 0, WIDTH, 56);
  ctx.fillRect(0, HEIGHT - 56, WIDTH, 56);
  ctx.globalAlpha = 0.08 + reaction.beat * 0.06;
  const streak = ctx.createLinearGradient(0, HEIGHT * 0.35, WIDTH, HEIGHT * 0.4);
  streak.addColorStop(0, 'rgba(125,211,252,0)');
  streak.addColorStop(0.5, 'rgba(186,230,253,0.8)');
  streak.addColorStop(1, 'rgba(125,211,252,0)');
  ctx.fillStyle = streak;
  ctx.fillRect(0, HEIGHT * 0.36, WIDTH, 3);
  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 24; i++) {
    const x = ((i * 97 + draw.frame * 13) % WIDTH);
    const y = ((i * 53 + draw.frame * 29) % HEIGHT);
    ctx.fillStyle = i % 2 ? '#fff' : '#000';
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;
}
