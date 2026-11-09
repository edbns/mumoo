/**
 * Photo Lab page logic — runs ONLY inside the offline bake (scripts/bake-photo-effects.mjs).
 * The bake script drives it in two steps so a real mouse can move over the canvas in between:
 *   await window.photoLab.start(slug, variantSuffix)   // mounts the shader on our photo
 *   ...bake script moves the mouse / waits...
 *   await window.photoLab.capture()                    // 1080x1920 JPEG data URL, then tears down
 */
import { createShader, isWebGPUSupported } from 'shaders/js';
import { buildConfig, presetOf, presetSlugs, recipeOf, SWEEPS, type Patch, type Sweep } from './photo-effects/recipes';

const W = 1080;
const H = 1920;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const frames = (n: number) =>
  new Promise<void>(resolve => {
    let left = n;
    const step = () => (--left <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });

type Live = { canvas: HTMLCanvasElement; shader: Awaited<ReturnType<typeof createShader>> };
let live: Live | null = null;

export type Plan = {
  slug: string;
  suffix: string;
  title: string;
  collection: string;
  presetId: string;
  label: string;
  sweep: Sweep;
  path: [number, number][];
  settleMs: number;
  mood: string;
  skip?: string;
};

function plans(): Plan[] {
  const list: Plan[] = [];
  for (const slug of presetSlugs()) {
    const preset = presetOf(slug);
    const recipe = recipeOf(slug);
    const base = {
      slug,
      title: preset.title,
      collection: preset.collection,
      presetId: preset.presetId,
      mood: recipe.mood ?? '',
      skip: recipe.skip,
    };
    list.push({ ...base, suffix: '', label: '', sweep: recipe.sweep ?? 'zigzag', path: SWEEPS[recipe.sweep ?? 'zigzag'], settleMs: recipe.settleMs ?? 2200 });
    for (const variant of recipe.variants ?? []) {
      const sweep = variant.sweep ?? recipe.sweep ?? 'zigzag';
      list.push({ ...base, suffix: variant.suffix, label: variant.label, sweep, path: SWEEPS[sweep], settleMs: variant.settleMs ?? recipe.settleMs ?? 2200 });
    }
  }
  return list;
}

function patchesFor(slug: string, suffix: string): Patch[] {
  const recipe = recipeOf(slug);
  const variant = recipe.variants?.find(v => v.suffix === suffix);
  return [...(recipe.patches ?? []), ...(variant?.patches ?? [])];
}

function spread(ctx: CanvasRenderingContext2D): { min: number; max: number } {
  let min = 255;
  let max = 0;
  for (let gy = 1; gy < 8; gy++) {
    for (let gx = 1; gx < 6; gx++) {
      const d = ctx.getImageData(Math.floor((gx / 6) * W), Math.floor((gy / 8) * H), 1, 1).data;
      const l = (d[0] + d[1] + d[2]) / 3;
      min = Math.min(min, l);
      max = Math.max(max, l);
    }
  }
  return { min, max };
}

async function stop(): Promise<void> {
  if (!live) return;
  try {
    live.shader.pause();
    live.shader.destroy();
  } finally {
    live.canvas.remove();
    live = null;
  }
}

async function start(slug: string, suffix = ''): Promise<void> {
  if (!isWebGPUSupported()) throw new Error('WebGPU is not available in this browser.');
  await stop();
  const { config, options } = buildConfig(slug, patchesFor(slug, suffix));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  // Shown at 360x640 CSS px; the page runs at deviceScaleFactor 3 so the buffer is a true 1080x1920.
  canvas.style.cssText = 'position:fixed;left:0;top:0;width:360px;height:640px';
  document.body.appendChild(canvas);

  let ready: () => void = () => undefined;
  let failed: (e: Error) => void = () => undefined;
  const readyPromise = new Promise<void>((resolve, reject) => { ready = resolve; failed = reject; });
  const shader = await createShader(canvas, config, {
    ...options,
    observeElement: false,
    disableTelemetry: true,
    onReady: () => ready(),
    onError: reason => failed(new Error(`Shader error: ${reason}`)),
  });
  live = { canvas, shader };
  shader.resize(W, H);
  await Promise.race([readyPromise, sleep(25_000).then(() => { throw new Error('Shader never became ready.'); })]);
}

async function capture(): Promise<string> {
  if (!live) throw new Error('No shader running.');
  const { canvas, shader } = live;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas unavailable.');
  try {
    for (let attempt = 0; attempt < 24; attempt++) {
      await frames(3);
      await new Promise<void>(resolve => {
        requestAnimationFrame(() => {
          ctx.drawImage(canvas, 0, 0, W, H);
          resolve();
        });
      });
      const { min, max } = spread(ctx);
      if (max - min > 6) {
        shader.pause();
        return out.toDataURL('image/jpeg', 0.9);
      }
    }
    throw new Error(`Shader canvas stayed blank (failure=${shader.getFailureReason()}).`);
  } finally {
    await stop();
  }
}

/** Renders a contact sheet from image URLs (data URLs) with labels. */
async function contactSheet(items: { src: string; label: string }[], cols = 6): Promise<string> {
  const cellW = 270;
  const cellH = 480;
  const labelH = 44;
  const rows = Math.ceil(items.length / cols);
  const sheet = document.createElement('canvas');
  sheet.width = cols * cellW;
  sheet.height = rows * (cellH + labelH);
  const ctx = sheet.getContext('2d')!;
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.font = '600 15px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  await Promise.all(items.map(async (item, i) => {
    const image = new Image();
    image.src = item.src;
    await image.decode();
    const x = (i % cols) * cellW;
    const y = Math.floor(i / cols) * (cellH + labelH);
    ctx.drawImage(image, x + 3, y + 3, cellW - 6, cellH - 6);
    ctx.fillStyle = '#fff';
    const [first, second] = item.label.split('\n');
    ctx.fillText(first, x + 8, y + cellH + 12);
    ctx.fillStyle = '#9ab';
    ctx.fillText(second ?? '', x + 8, y + cellH + 32);
  }));
  return sheet.toDataURL('image/jpeg', 0.85);
}

declare global {
  interface Window {
    photoLab: { plans: typeof plans; start: typeof start; capture: typeof capture; stop: typeof stop; contactSheet: typeof contactSheet };
    __photoLabReady: boolean;
  }
}

window.photoLab = { plans, start, capture, stop, contactSheet };
window.__photoLabReady = true;
