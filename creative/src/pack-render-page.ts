/**
 * Cloud frame renderer — runs ONLY inside the Modal headless browser (and local tests).
 * Same Pixi worlds, same fonts, same baked looks as the shelf preview, so the MP4
 * matches what the user picked. Deterministic: frame N depends only on the opts.
 */
import { DURATION_MS, FPS, HEIGHT, WIDTH } from './composition';
import type { AdPunchStyle } from './ad-punch';
import { createPackRenderer, type PackRenderer, type PackRendererOpts } from './pack-renderer';

const FRAMES = Math.round((DURATION_MS / 1000) * FPS);
/** Dust grains, Riso dot screens, Spray grains and the Window's one full-frame shader are soft or drawn by shader already: edge smoothing only costs time here (6× under software GL). */
const SMOOTH_ALREADY: readonly AdPunchStyle[] = ['dust', 'riso', 'spray', 'window'];
let renderer: PackRenderer | null = null;

type PackFramePage = {
  prepare(opts: PackRendererOpts): Promise<{ frames: number; fps: number; width: number; height: number }>;
  frame(index: number, direct?: boolean): Promise<string>;
};

const api: PackFramePage = {
  async prepare(opts) {
    renderer?.destroy();
    // A fresh canvas per prepare(): a destroyed Pixi app leaves its GL context on the old element.
    document.getElementById('c')?.remove();
    const canvas = document.createElement('canvas');
    canvas.id = 'c';
    document.body.appendChild(canvas);
    renderer = await createPackRenderer(canvas, opts, !SMOOTH_ALREADY.includes(opts.style));
    // Warm every texture/look before the first captured frame.
    await renderer.render(0);
    return { frames: FRAMES, fps: FPS, width: WIDTH, height: HEIGHT };
  },
  async frame(index, direct = true) {
    if (!renderer) throw new Error('Call prepare() first.');
    if (!Number.isInteger(index) || index < 0 || index >= FRAMES) throw new Error('Invalid frame index.');
    await renderer.render(index);
    // Direct: encode the GL canvas in the same task it was drawn in (no readback copy).
    const out = (direct ? renderer.canvas : renderer.extractCanvas(1)) as HTMLCanvasElement;
    if (out.width !== WIDTH || out.height !== HEIGHT) throw new Error('Unexpected frame size.');
    return out.toDataURL('image/jpeg', 0.95).split(',', 2)[1];
  },
};

Object.assign(window, { mumooPack: api });
