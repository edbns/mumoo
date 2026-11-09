/**
 * Look Lab page logic — runs ONLY inside the offline bake (scripts/bake-looks.mjs).
 * Exposes window.bakeLook(lookId) → JPEG data URL.
 */
import { createShader, isWebGPUSupported } from 'shaders/js';
import { lookRecipe, type LookId } from './recipes';

const W = 1080;
const H = 1920;

function frames(n: number): Promise<void> {
  return new Promise(resolve => {
    let left = n;
    const step = () => (--left <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function looksPainted(ctx: CanvasRenderingContext2D, minSpread: number): boolean {
  // A painted background is never flat: sample a coarse grid and require tonal spread.
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
  return max - min > minSpread;
}

async function bakeLook(lookId: LookId, settleMs = 1800, minSpread = 6): Promise<string> {
  if (!isWebGPUSupported()) throw new Error('WebGPU is not available in this browser.');
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px`;
  document.body.appendChild(canvas);

  let ready: () => void = () => undefined;
  let failed: (e: Error) => void = () => undefined;
  const readyPromise = new Promise<void>((resolve, reject) => { ready = resolve; failed = reject; });

  const recipe = lookRecipe(lookId);
  const shader = await createShader(canvas, recipe.preset, {
    ...recipe.options,
    observeElement: false,
    disableTelemetry: true,
    onReady: () => ready(),
    onError: reason => failed(new Error(`Shader error: ${reason}`)),
  });

  try {
    shader.resize(W, H);
    await Promise.race([readyPromise, sleep(20_000).then(() => { throw new Error('Shader never became ready.'); })]);

    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const ctx = out.getContext('2d', { alpha: false, willReadFrequently: true });
    if (!ctx) throw new Error('2D canvas unavailable.');

    // Animated presets (smoke, flow) need a moment to develop before the still is taken.
    await sleep(settleMs);
    // A WebGPU canvas texture is only readable during the frame it was presented in,
    // so read inside a rAF callback (after the shader's own render for that frame).
    for (let attempt = 0; attempt < 24; attempt++) {
      await frames(3);
      await new Promise<void>(resolve => {
        requestAnimationFrame(() => {
          ctx.drawImage(canvas, 0, 0, W, H);
          resolve();
        });
      });
      if (looksPainted(ctx, minSpread)) {
        shader.pause();
        return out.toDataURL('image/jpeg', 0.92);
      }
    }
    throw new Error(
      `Shader canvas stayed blank (failure=${shader.getFailureReason()}, canvas=${canvas.width}x${canvas.height}, hidden=${document.hidden}).`,
    );
  } finally {
    shader.pause();
    shader.destroy();
    canvas.remove();
  }
}

declare global {
  interface Window {
    bakeLook: typeof bakeLook;
    __labReady: boolean;
  }
}

window.bakeLook = bakeLook;
window.__labReady = true;
